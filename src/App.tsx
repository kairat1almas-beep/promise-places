import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Bell,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  Clock3,
  Flame,
  Heart,
  Home,
  MapPin,
  MessageCircleHeart,
  Plus,
  Share,
  Sparkles,
  Trash2,
  Users,
  UserRound,
  X,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { canCreateIcs, downloadIcsEvent } from "./utils/calendar";
import { isTwoGisConfigured, searchTwoGisPlaces, type PlaceSuggestion } from "./integrations/places";
import {
  getCurrentSession,
  isSupabaseConfigured,
  refreshSupabaseClient,
  signInWithEmail,
  signOut,
  supabase,
  type DbPromise,
} from "./integrations/supabase";
import { isWebPushConfigured, subscribeToPush } from "./integrations/webPush";
import { initializePublicConfig } from "./config/publicConfig";

type PromiseStatus = "promised" | "planned" | "done";
type Priority = "Высокий" | "Средний" | "Нежный";
type TabId = "home" | "calendar" | "add" | "stats" | "profile";

type PlacePromise = {
  id: number;
  name: string;
  area: string;
  promisedAt: string;
  plannedFor?: string;
  visitedAt?: string;
  priority: Priority;
  status: PromiseStatus;
  note: string;
  image: string;
  memory?: string;
  memoryPhotoUrl?: string;
  coupleId?: string;
};

type CoupleProfile = {
  id: string;
  displayName: string;
  inviteCode: string;
};

const STORAGE_KEY = "promise-places:v1";

const samplePromises: PlacePromise[] = [
  {
    id: 1,
    name: "Парк Горького",
    area: "Алматы, Центральный парк",
    promisedAt: "14 июня",
    plannedFor: "22 июня",
    priority: "Высокий",
    status: "planned",
    note: "Ты давно хотела просто погулять без спешки и телефонов.",
    image:
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&q=80&w=1100",
  },
  {
    id: 2,
    name: "Кофейня у театра",
    area: "Старый центр",
    promisedAt: "7 июня",
    priority: "Средний",
    status: "promised",
    note: "Зайти после работы, заказать чизкейк и обсудить летние планы.",
    image:
      "https://images.unsplash.com/photo-1445116572660-236099ec97a0?auto=format&fit=crop&q=80&w=1100",
  },
  {
    id: 3,
    name: "Набережная вечером",
    area: "Река, южный вход",
    promisedAt: "28 мая",
    visitedAt: "2 июня",
    priority: "Нежный",
    status: "done",
    note: "Маленькое обещание после ссоры: пройтись и спокойно поговорить.",
    memory: "Сидели на лавочке почти час. Было тихо и очень по-настоящему.",
    image:
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&q=80&w=1100",
  },
  {
    id: 4,
    name: "Выставка фотографии",
    area: "Галерея рядом с метро",
    promisedAt: "1 мая",
    plannedFor: "29 июня",
    priority: "Средний",
    status: "planned",
    note: "Сходить на новую экспозицию и выбрать любимый снимок друг для друга.",
    image:
      "https://images.unsplash.com/photo-1499364615650-ec38552f4f34?auto=format&fit=crop&q=80&w=1100",
  },
];

const statusLabels: Record<PromiseStatus, string> = {
  promised: "Нужно сходить",
  planned: "Запланировано",
  done: "Выполнено",
};

const tabs: Array<{ id: TabId; label: string; icon: typeof Home }> = [
  { id: "home", label: "Главная", icon: Home },
  { id: "calendar", label: "Календарь", icon: CalendarDays },
  { id: "add", label: "Добавить", icon: Plus },
  { id: "stats", label: "Индекс", icon: BarChart3 },
  { id: "profile", label: "PWA", icon: UserRound },
];

function loadPromises() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return samplePromises;
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : samplePromises;
  } catch {
    return samplePromises;
  }
}

function fromDbPromise(row: DbPromise): PlacePromise {
  return {
    id: row.id,
    name: row.name,
    area: row.area,
    promisedAt: row.promised_at,
    plannedFor: row.planned_for || undefined,
    visitedAt: row.visited_at || undefined,
    priority: row.priority,
    status: row.status,
    note: row.note,
    image: row.image,
    memory: row.memory || undefined,
    memoryPhotoUrl: row.memory_photo_url || undefined,
    coupleId: row.couple_id || undefined,
  };
}

function toDbPromise(place: PlacePromise, userId: string, coupleId?: string | null): DbPromise {
  return {
    id: place.id,
    user_id: userId,
    couple_id: coupleId ?? place.coupleId ?? null,
    name: place.name,
    area: place.area,
    promised_at: place.promisedAt,
    planned_for: place.plannedFor || null,
    visited_at: place.visitedAt || null,
    priority: place.priority,
    status: place.status,
    note: place.note,
    image: place.image,
    memory: place.memory || null,
    memory_photo_url: place.memoryPhotoUrl || null,
  };
}

function getTodayLabel() {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(new Date());
}

function getPriorityClass(priority: Priority) {
  if (priority === "Высокий") return "priority high";
  if (priority === "Средний") return "priority medium";
  return "priority soft";
}

function App() {
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [promises, setPromises] = useState<PlacePromise[]>(loadPromises);
  const [selected, setSelected] = useState<PlacePromise | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftArea, setDraftArea] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [draftDate, setDraftDate] = useState("");
  const [draftPriority, setDraftPriority] = useState<Priority>("Средний");
  const [session, setSession] = useState<Session | null>(null);
  const [configReady, setConfigReady] = useState(false);
  const [syncState, setSyncState] = useState("Локально на устройстве");
  const [couple, setCouple] = useState<CoupleProfile | null>(null);
  const [coupleMessage, setCoupleMessage] = useState("");

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(promises));
  }, [promises]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    initializePublicConfig()
      .then(() => {
        refreshSupabaseClient();
      })
      .finally(() => {
        if (!cancelled) {
          setConfigReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("action") === "add") {
      setActiveTab("add");
    }
  }, []);

  useEffect(() => {
    if (!configReady) return;
    if (!supabase) return;

    getCurrentSession().then((currentSession) => {
      setSession(currentSession);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => subscription.unsubscribe();
  }, [configReady]);

  useEffect(() => {
    if (!configReady) return;
    if (!supabase || !session?.user.id) {
      setSyncState(isSupabaseConfigured() ? "Войдите для облачной синхронизации" : "Локально на устройстве");
      return;
    }

    let cancelled = false;
    setSyncState("Синхронизация...");

    loadCouple().then((activeCouple) => {
      let query = supabase.from("promises").select("*").order("created_at", { ascending: false });
      query = activeCouple ? query.eq("couple_id", activeCouple.id) : query.eq("user_id", session.user.id).is("couple_id", null);

      query.then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setSyncState("Supabase: нужна схема или доступ");
          return;
        }

        if (data && data.length > 0) {
          setPromises(data.map((row) => fromDbPromise(row as DbPromise)));
        } else {
          const seedRows = promises.map((place) => toDbPromise({ ...place, coupleId: activeCouple?.id }, session.user.id, activeCouple?.id));
          if (seedRows.length > 0) {
            supabase.from("promises").upsert(seedRows).then(() => undefined);
          }
        }

        setSyncState("Supabase подключен");
      });
    });

    return () => {
      cancelled = true;
    };
  }, [session?.user.id, configReady]);

  async function loadCouple() {
    if (!supabase || !session?.user.id) return null;

    const { data: membership } = await supabase
      .from("couple_memberships")
      .select("couple_id")
      .eq("user_id", session.user.id)
      .limit(1)
      .maybeSingle();

    if (!membership?.couple_id) {
      setCouple(null);
      return null;
    }

    const { data: coupleRow } = await supabase
      .from("couples")
      .select("id, display_name, invite_code")
      .eq("id", membership.couple_id)
      .maybeSingle();

    if (!coupleRow) {
      setCouple(null);
      return null;
    }

    const nextCouple = {
      id: coupleRow.id,
      displayName: coupleRow.display_name,
      inviteCode: coupleRow.invite_code,
    };
    setCouple(nextCouple);
    return nextCouple;
  }

  async function persistCloud(place: PlacePromise) {
    if (!supabase || !session?.user.id) return;
    await supabase.from("promises").upsert(toDbPromise(place, session.user.id, couple?.id));
  }

  async function createCouple() {
    if (!supabase || !session?.user.id) {
      setCoupleMessage("Сначала войдите в Supabase.");
      return;
    }

    setCoupleMessage("Создаем пару...");
    const { data: coupleRow, error: coupleError } = await supabase
      .from("couples")
      .insert({ created_by: session.user.id, display_name: "Наша пара" })
      .select("id, display_name, invite_code")
      .single();

    if (coupleError || !coupleRow) {
      setCoupleMessage(coupleError?.message || "Не удалось создать пару.");
      return;
    }

    const { error: membershipError } = await supabase.from("couple_memberships").insert({
      couple_id: coupleRow.id,
      user_id: session.user.id,
      role: "owner",
    });

    if (membershipError) {
      setCoupleMessage(membershipError.message);
      return;
    }

    const nextCouple = {
      id: coupleRow.id,
      displayName: coupleRow.display_name,
      inviteCode: coupleRow.invite_code,
    };
    setCouple(nextCouple);
    setCoupleMessage("Пара создана. Передайте invite-код партнеру.");

    const rows = promises.map((place) => toDbPromise({ ...place, coupleId: nextCouple.id }, session.user.id, nextCouple.id));
    if (rows.length > 0) {
      await supabase.from("promises").upsert(rows);
      setPromises((current) => current.map((place) => ({ ...place, coupleId: nextCouple.id })));
    }
  }

  async function joinCouple(inviteCode: string) {
    if (!supabase || !session?.user.id) {
      setCoupleMessage("Сначала войдите в Supabase.");
      return;
    }

    const normalized = inviteCode.trim().toUpperCase();
    if (!normalized) return;

    setCoupleMessage("Ищем пару...");
    const { data: coupleRow, error: coupleError } = await supabase
      .from("couples")
      .select("id, display_name, invite_code")
      .eq("invite_code", normalized)
      .maybeSingle();

    if (coupleError || !coupleRow) {
      setCoupleMessage("Код не найден.");
      return;
    }

    const { error: membershipError } = await supabase.from("couple_memberships").upsert({
      couple_id: coupleRow.id,
      user_id: session.user.id,
      role: "partner",
    });

    if (membershipError) {
      setCoupleMessage(membershipError.message);
      return;
    }

    const nextCouple = {
      id: coupleRow.id,
      displayName: coupleRow.display_name,
      inviteCode: coupleRow.invite_code,
    };
    setCouple(nextCouple);
    setCoupleMessage("Вы присоединились к паре.");
    const { data } = await supabase.from("promises").select("*").eq("couple_id", nextCouple.id).order("created_at", { ascending: false });
    if (data) setPromises(data.map((row) => fromDbPromise(row as DbPromise)));
  }

  const stats = useMemo(() => {
    const completed = promises.filter((place) => place.status === "done").length;
    const planned = promises.filter((place) => place.status === "planned").length;
    const index = promises.length ? Math.round((completed / promises.length) * 100) : 0;

    return {
      completed,
      planned,
      promised: promises.length - completed - planned,
      index,
      streak: completed ? Math.min(4, completed) : 0,
      avgDays: completed ? 9 : 0,
    };
  }, [promises]);

  function addPromise() {
    if (!draftName.trim()) return;

    const hasDate = Boolean(draftDate);
    const next: PlacePromise = {
      id: Date.now(),
      name: draftName.trim(),
      area: draftArea.trim() || "Новое место",
      promisedAt: getTodayLabel(),
      plannedFor: hasDate ? draftDate : undefined,
      priority: draftPriority,
      status: hasDate ? "planned" : "promised",
      note: draftNote.trim() || "Обещание добавлено сразу, пока оно еще звучит в голове.",
      coupleId: couple?.id,
      image:
        "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&q=80&w=1100",
    };

    setPromises((current) => [next, ...current]);
    setDraftName("");
    setDraftArea("");
    setDraftNote("");
    setDraftDate("");
    setDraftPriority("Средний");
    setActiveTab("home");
    persistCloud(next).then(() => undefined);
  }

  function updatePromise(placeId: number, patch: Partial<PlacePromise>) {
    let nextPlace: PlacePromise | null = null;
    setPromises((current) =>
      current.map((place) => {
        if (place.id !== placeId) return place;
        nextPlace = { ...place, ...patch };
        return nextPlace;
      })
    );
    setSelected((current) => (current && current.id === placeId ? { ...current, ...patch } : current));
    if (nextPlace) persistCloud(nextPlace).then(() => undefined);
  }

  function markDone(placeId: number) {
    updatePromise(placeId, {
      status: "done",
      visitedAt: getTodayLabel(),
      memory: "Обещание выполнено. Теперь это не пункт в списке, а общий день.",
    });
    setSelected(null);
  }

  function deletePromise(placeId: number) {
    setPromises((current) => current.filter((place) => place.id !== placeId));
    setSelected(null);
    if (supabase && session?.user.id) {
      supabase.from("promises").delete().eq("id", placeId).then(() => undefined);
    }
  }

  return (
    <main className="app-shell">
      <section className="phone-frame" aria-label="Promise Places">
        <div className="app-scroll">
          {selected ? (
            <PlaceDetails
              place={selected}
              onClose={() => setSelected(null)}
              onDelete={deletePromise}
              onDone={markDone}
              session={session}
              onUpdate={updatePromise}
            />
          ) : (
            <>
              {activeTab === "home" && (
                <HomeScreen
                  promises={promises}
                  syncState={syncState}
                  stats={stats}
                  onSelect={setSelected}
                  onAdd={() => setActiveTab("add")}
                />
              )}
              {activeTab === "calendar" && <CalendarScreen promises={promises} />}
              {activeTab === "add" && (
                <AddScreen
                  area={draftArea}
                  date={draftDate}
                  name={draftName}
                  note={draftNote}
                  priority={draftPriority}
                  onArea={setDraftArea}
                  onDate={setDraftDate}
                  onName={setDraftName}
                  onNote={setDraftNote}
                  onPriority={setDraftPriority}
                  onSave={addPromise}
                />
              )}
              {activeTab === "stats" && <StatsScreen stats={stats} promises={promises} />}
              {activeTab === "profile" && (
                <PwaScreen
                  couple={couple}
                  coupleMessage={coupleMessage}
                  onCreateCouple={createCouple}
                  onJoinCouple={joinCouple}
                  session={session}
                  syncState={syncState}
                />
              )}
            </>
          )}
        </div>

        {!selected && (
          <nav className="bottom-nav" aria-label="Основная навигация">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                className={activeTab === id ? "nav-button active" : "nav-button"}
                key={id}
                onClick={() => setActiveTab(id)}
                aria-label={label}
                title={label}
              >
                <Icon size={id === "add" ? 25 : 22} strokeWidth={id === "add" ? 2.8 : 2.2} />
              </button>
            ))}
          </nav>
        )}
      </section>
    </main>
  );
}

function HomeScreen({
  promises,
  syncState,
  stats,
  onSelect,
  onAdd,
}: {
  promises: PlacePromise[];
  syncState: string;
  stats: { completed: number; planned: number; promised: number; index: number; streak: number; avgDays: number };
  onSelect: (place: PlacePromise) => void;
  onAdd: () => void;
}) {
  const urgent = promises.find((place) => place.status !== "done");

  return (
    <div className="screen">
      <header className="topbar">
        <div>
          <p className="eyebrow">Promise Places</p>
          <h1>Обещания, которые становятся встречами</h1>
        </div>
        <button className="round-action" onClick={onAdd} aria-label="Добавить место">
          <Plus size={23} />
        </button>
      </header>

      {urgent && (
        <button className="reminder-strip" onClick={() => onSelect(urgent)}>
          <MessageCircleHeart size={21} />
          <span>Ты обещал это место неделю назад</span>
          <Heart size={17} />
        </button>
      )}

      <div className="sync-strip">
        <span>{syncState}</span>
      </div>

      <section className="trust-panel">
        <div>
          <p className="panel-label">Индекс выполнения</p>
          <strong>{stats.index}%</strong>
          <span>
            {stats.completed} из {promises.length} обещаний выполнено
          </span>
        </div>
        <div className="meter" style={{ ["--value" as string]: `${stats.index * 3.6}deg` }}>
          <div>{stats.index}</div>
        </div>
      </section>

      <section className="status-row" aria-label="Статусы обещаний">
        <StatusPill label="Нужно" value={stats.promised} tone="warm" />
        <StatusPill label="В плане" value={stats.planned} tone="blue" />
        <StatusPill label="Готово" value={stats.completed} tone="green" />
      </section>

      <section className="place-list">
        <div className="section-heading">
          <h2>Список мест</h2>
          <span>обещано, запланировано, выполнено</span>
        </div>

        {promises.map((place) => (
          <button className="place-row" key={place.id} onClick={() => onSelect(place)}>
            <img src={place.image} alt="" />
            <div className="place-copy">
              <div>
                <h3>{place.name}</h3>
                <p>
                  <MapPin size={13} /> {place.area}
                </p>
              </div>
              <div className="place-meta">
                <span className={getPriorityClass(place.priority)}>
                  {place.priority === "Высокий" && <Flame size={12} />}
                  {place.priority}
                </span>
                <span>{statusLabels[place.status]}</span>
              </div>
            </div>
          </button>
        ))}
      </section>
    </div>
  );
}

function StatusPill({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={`status-pill ${tone}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function PlaceDetails({
  place,
  onClose,
  onDelete,
  onDone,
  session,
  onUpdate,
}: {
  place: PlacePromise;
  onClose: () => void;
  onDelete: (id: number) => void;
  onDone: (id: number) => void;
  session: Session | null;
  onUpdate: (id: number, patch: Partial<PlacePromise>) => void;
}) {
  const [planDate, setPlanDate] = useState(place.plannedFor || "");
  const [photoState, setPhotoState] = useState("");

  function savePlan() {
    if (!planDate.trim()) return;
    onUpdate(place.id, { plannedFor: planDate.trim(), status: "planned" });
  }

  async function uploadMemoryPhoto(file: File) {
    if (!supabase || !session?.user.id) {
      setPhotoState("Для Supabase Storage нужно войти в аккаунт.");
      return;
    }

    setPhotoState("Загружаем фото...");
    const extension = file.name.split(".").pop() || "jpg";
    const path = `${session.user.id}/${place.id}/${Date.now()}.${extension}`;
    const { error } = await supabase.storage.from("promise-photos").upload(path, file, {
      cacheControl: "3600",
      upsert: true,
    });

    if (error) {
      setPhotoState(error.message);
      return;
    }

    const { data } = supabase.storage.from("promise-photos").getPublicUrl(path);
    onUpdate(place.id, { image: data.publicUrl, memoryPhotoUrl: data.publicUrl });
    setPhotoState("Фото прикреплено и стало новой обложкой.");
  }

  return (
    <article className="detail-screen">
      <div className="detail-hero">
        <img src={place.image} alt="" />
        <button className="close-button" onClick={onClose} aria-label="Закрыть">
          <X size={20} />
        </button>
        <div className="detail-title">
          <span>{statusLabels[place.status]}</span>
          <h1>{place.name}</h1>
          <p>
            <MapPin size={15} /> {place.area}
          </p>
        </div>
      </div>

      <div className="detail-body">
        <section className="detail-dates">
          <div>
            <span>Дата обещания</span>
            <strong>{place.promisedAt}</strong>
          </div>
          <div>
            <span>{place.status === "done" ? "Дата посещения" : "План"}</span>
            <strong>{place.visitedAt || place.plannedFor || "Выбрать дату"}</strong>
          </div>
        </section>

        {place.status !== "done" && (
          <section className="plan-editor">
            <label>
              <span>Запланировать дату</span>
              <input
                value={planDate}
                onChange={(event) => setPlanDate(event.target.value)}
                placeholder="Например, 22 июня"
              />
            </label>
            <button onClick={savePlan}>Сохранить план</button>
          </section>
        )}

        <section className="note-block">
          <p>{place.note}</p>
        </section>

        <section className="timeline">
          <TimelineItem done label="Обещание добавлено" value={place.promisedAt} />
          <TimelineItem
            done={place.status === "planned" || place.status === "done"}
            label="Дата выбрана"
            value={place.plannedFor || "пока нет"}
          />
          <TimelineItem done={place.status === "done"} label="Место посещено" value={place.visitedAt || "впереди"} />
        </section>

        {place.memory && (
          <section className="memory">
            <Camera size={18} />
            <p>{place.memory}</p>
          </section>
        )}

        {place.status === "done" && (
          <section className="photo-uploader">
            {place.memoryPhotoUrl && <img src={place.memoryPhotoUrl} alt="Фото-воспоминание" />}
            <label>
              <Camera size={18} />
              <span>{place.memoryPhotoUrl ? "Заменить фото-воспоминание" : "Прикрепить одно фото-воспоминание"}</span>
              <input
                accept="image/*"
                type="file"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) uploadMemoryPhoto(file);
                }}
              />
            </label>
            {photoState && <p>{photoState}</p>}
          </section>
        )}

        {place.plannedFor && (
          <button
            className="calendar-export"
            disabled={!canCreateIcs(place.plannedFor)}
            onClick={() =>
              downloadIcsEvent({
                title: place.name,
                date: place.plannedFor || "",
                location: place.area,
                note: place.note,
              })
            }
          >
            <CalendarDays size={18} />
            Добавить в Apple Calendar (.ics)
          </button>
        )}

        <div className="detail-actions">
          {place.status !== "done" && (
            <button className="primary-action" onClick={() => onDone(place.id)}>
              <CheckCircle2 size={20} />
              Отметить выполненным
            </button>
          )}
          <button className="ghost-danger" onClick={() => onDelete(place.id)}>
            <Trash2 size={18} />
            Удалить обещание
          </button>
        </div>
      </div>
    </article>
  );
}

function TimelineItem({ done, label, value }: { done: boolean; label: string; value: string }) {
  return (
    <div className={done ? "timeline-item done" : "timeline-item"}>
      <span>{done ? <Check size={13} /> : <Clock3 size={13} />}</span>
      <div>
        <strong>{label}</strong>
        <p>{value}</p>
      </div>
    </div>
  );
}

function CalendarScreen({ promises }: { promises: PlacePromise[] }) {
  const planned = promises.filter((place) => place.status === "planned");

  return (
    <div className="screen">
      <header className="simple-header">
        <p className="eyebrow">Календарь</p>
        <h1>Ближайшие встречи</h1>
      </header>
      <section className="calendar-board">
        {planned.length === 0 && <p className="empty-text">Пока нет запланированных встреч.</p>}
        {planned.map((place) => (
          <div className="calendar-row" key={place.id}>
            <div className="date-chip">{place.plannedFor}</div>
            <div>
              <h3>{place.name}</h3>
              <p>{place.area}</p>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function AddScreen({
  area,
  date,
  name,
  note,
  priority,
  onArea,
  onDate,
  onName,
  onNote,
  onPriority,
  onSave,
}: {
  area: string;
  date: string;
  name: string;
  note: string;
  priority: Priority;
  onArea: (value: string) => void;
  onDate: (value: string) => void;
  onName: (value: string) => void;
  onNote: (value: string) => void;
  onPriority: (value: Priority) => void;
  onSave: () => void;
}) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [placeSearchState, setPlaceSearchState] = useState("");

  useEffect(() => {
    if (!isTwoGisConfigured() || name.trim().length < 3) {
      setSuggestions([]);
      return;
    }

    let cancelled = false;
    setPlaceSearchState("Ищем в 2GIS...");
    const timeout = window.setTimeout(() => {
      searchTwoGisPlaces(name).then((results) => {
        if (cancelled) return;
        setSuggestions(results);
        setPlaceSearchState(results.length ? "2GIS подсказки готовы" : "2GIS ничего не нашёл");
      });
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [name]);

  return (
    <div className="screen">
      <header className="simple-header">
        <p className="eyebrow">Новое обещание</p>
        <h1>Добавить место сразу, пока не забылось</h1>
      </header>
      <section className="form-stack">
        <label>
          <span>Место</span>
          <input value={name} onChange={(event) => onName(event.target.value)} placeholder="Например, Парк Горького" />
        </label>
        {(placeSearchState || !isTwoGisConfigured()) && (
          <p className="integration-hint">
            {isTwoGisConfigured() ? placeSearchState : "Добавьте VITE_2GIS_API_KEY, чтобы включить поиск мест через 2GIS."}
          </p>
        )}
        {suggestions.length > 0 && (
          <div className="suggestions-list">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.id}
                onClick={() => {
                  onName(suggestion.name);
                  onArea(suggestion.address);
                  setSuggestions([]);
                }}
              >
                <strong>{suggestion.name}</strong>
                <span>{suggestion.address}</span>
              </button>
            ))}
          </div>
        )}
        <label>
          <span>Где это</span>
          <input value={area} onChange={(event) => onArea(event.target.value)} placeholder="Район, адрес или город" />
        </label>
        <div className="form-grid">
          <label>
            <span>Плановая дата</span>
            <input type="date" value={date} onChange={(event) => onDate(event.target.value)} />
          </label>
          <label>
            <span>Приоритет</span>
            <select value={priority} onChange={(event) => onPriority(event.target.value as Priority)}>
              <option>Высокий</option>
              <option>Средний</option>
              <option>Нежный</option>
            </select>
          </label>
        </div>
        <label>
          <span>Комментарий</span>
          <textarea
            value={note}
            onChange={(event) => onNote(event.target.value)}
            placeholder="Ты давно хотела сюда..."
          />
        </label>
        <button className="upload-area" type="button">
          <Camera size={24} />
          <span>Фото добавим на следующем шаге</span>
        </button>
        <button className="primary-action" onClick={onSave} disabled={!name.trim()}>
          <Plus size={20} />
          Сохранить обещание
        </button>
      </section>
    </div>
  );
}

function StatsScreen({
  stats,
  promises,
}: {
  stats: { completed: number; planned: number; promised: number; index: number; streak: number; avgDays: number };
  promises: PlacePromise[];
}) {
  return (
    <div className="screen">
      <header className="simple-header">
        <p className="eyebrow">Индекс</p>
        <h1>Не про задачи. Про доверие.</h1>
      </header>
      <section className="score-hero">
        <Sparkles size={22} />
        <strong>{stats.index}%</strong>
        <span>выполнения обещаний</span>
      </section>
      <section className="metric-list">
        <Metric icon={<CheckCircle2 size={18} />} label="Выполнено" value={`${stats.completed} места`} />
        <Metric icon={<Clock3 size={18} />} label="Среднее время" value={`${stats.avgDays} дней`} />
        <Metric icon={<Flame size={18} />} label="Текущая серия" value={`${stats.streak} подряд`} />
        <Metric icon={<CalendarDays size={18} />} label="Всего в истории" value={`${promises.length} обещания`} />
      </section>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="metric-row">
      <span>{icon}</span>
      <p>{label}</p>
      <strong>{value}</strong>
    </div>
  );
}

function PwaScreen({
  couple,
  coupleMessage,
  onCreateCouple,
  onJoinCouple,
  session,
  syncState,
}: {
  couple: CoupleProfile | null;
  coupleMessage: string;
  onCreateCouple: () => void;
  onJoinCouple: (inviteCode: string) => void;
  session: Session | null;
  syncState: string;
}) {
  const [notificationState, setNotificationState] = useState(() =>
    "Notification" in window ? Notification.permission : "unsupported"
  );
  const [email, setEmail] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [pushMessage, setPushMessage] = useState("");

  async function handleSignIn() {
    if (!email.trim()) return;
    setAuthMessage("Отправляем magic link...");

    try {
      await signInWithEmail(email.trim());
      setAuthMessage("Письмо отправлено. Открой ссылку на этом устройстве.");
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "Не удалось отправить ссылку.");
    }
  }

  async function handleSignOut() {
    await signOut();
    setAuthMessage("Вы вышли из аккаунта.");
  }

  async function enableNotifications() {
    if (!("Notification" in window)) {
      setNotificationState("unsupported");
      return;
    }

    const result = await Notification.requestPermission();
    setNotificationState(result);

    if (result === "granted") {
      new Notification("Promise Places", {
        body: "Мягкие напоминания включены. На iPhone они работают после добавления PWA на экран Домой.",
        icon: "/icons/icon.svg",
      });
    }
  }

  async function enableWebPush() {
    setPushMessage("");

    try {
      const subscription = await subscribeToPush();

      if (supabase && session?.user.id) {
        await supabase.from("push_subscriptions").upsert({
          user_id: session.user.id,
          endpoint: subscription.endpoint,
          subscription: subscription.toJSON(),
        });
      }

      setPushMessage("Push-подписка создана и готова для серверных напоминаний.");
    } catch (error) {
      setPushMessage(error instanceof Error ? error.message : "Push пока недоступен.");
    }
  }

  return (
    <div className="screen">
      <header className="simple-header">
        <p className="eyebrow">iOS PWA</p>
        <h1>Установить на iPhone без Mac</h1>
      </header>

      <section className="pwa-panel auth-panel">
        <UserRound size={22} />
        <div>
          <h2>Supabase Auth</h2>
          <p>{session ? `Вход выполнен: ${session.user.email}` : "Войдите по email, чтобы синхронизировать обещания и фото."}</p>
          {!session ? (
            <div className="auth-form">
              <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="email@example.com" />
              <button className="secondary-action" onClick={handleSignIn}>
                Отправить ссылку
              </button>
            </div>
          ) : (
            <button className="secondary-action" onClick={handleSignOut}>
              Выйти
            </button>
          )}
          <span className="permission-state">
            {syncState}
            {authMessage ? ` · ${authMessage}` : ""}
          </span>
        </div>
      </section>

      <section className="pwa-panel auth-panel">
        <Users size={22} />
        <div>
          <h2>Пара</h2>
          {couple ? (
            <>
              <p>
                {couple.displayName}: invite-код <strong>{couple.inviteCode}</strong>
              </p>
              <button
                className="secondary-action"
                onClick={() => navigator.clipboard?.writeText(couple.inviteCode)}
              >
                Скопировать код
              </button>
            </>
          ) : (
            <>
              <p>Создайте пару или присоединитесь по invite-коду партнера.</p>
              <div className="auth-form">
                <button className="secondary-action" onClick={onCreateCouple} disabled={!session}>
                  Создать пару
                </button>
                <input
                  value={inviteCode}
                  onChange={(event) => setInviteCode(event.target.value)}
                  placeholder="Invite-код"
                />
                <button className="secondary-action" onClick={() => onJoinCouple(inviteCode)} disabled={!session}>
                  Присоединиться
                </button>
              </div>
            </>
          )}
          <span className="permission-state">{coupleMessage || (session ? "Пара нужна для общего списка." : "Сначала войдите.")}</span>
        </div>
      </section>

      <section className="pwa-panel">
        <Share size={22} />
        <div>
          <h2>Как добавить</h2>
          <ol>
            <li>Открой сайт в Safari на iPhone.</li>
            <li>Нажми “Поделиться”.</li>
            <li>Выбери “На экран Домой”.</li>
          </ol>
        </div>
      </section>

      <section className="pwa-panel">
        <Bell size={22} />
        <div>
          <h2>Напоминания</h2>
          <p>
            iOS разрешает уведомления только для установленной PWA. Кнопка ниже подготовит разрешение, когда Safari
            позволит его запросить.
          </p>
          <button className="secondary-action" onClick={enableNotifications}>
            Включить напоминания
          </button>
          <span className="permission-state">Статус: {notificationState}</span>
          <button className="secondary-action push-action" onClick={enableWebPush} disabled={!isWebPushConfigured()}>
            Создать Web Push подписку
          </button>
          <span className="permission-state">
            {isWebPushConfigured() ? pushMessage || "VAPID ключ найден." : "Добавьте VITE_WEB_PUSH_PUBLIC_KEY."}
          </span>
        </div>
      </section>

      <section className="profile-memory">
        <img
          src="https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?auto=format&fit=crop&q=80&w=1100"
          alt=""
        />
        <div>
          <Heart size={20} />
          <p>Данные сохраняются на устройстве и остаются после перезагрузки страницы.</p>
        </div>
      </section>
    </div>
  );
}

export default App;
