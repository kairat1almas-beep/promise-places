type CalendarEvent = {
  title: string;
  date: string;
  location: string;
  note: string;
};

function toIcsDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return date.replaceAll("-", "");
}

function escapeIcs(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

export function canCreateIcs(date?: string) {
  return Boolean(date && toIcsDate(date));
}

export function downloadIcsEvent(event: CalendarEvent) {
  const start = toIcsDate(event.date);
  if (!start) return false;

  const endDate = new Date(`${event.date}T00:00:00`);
  endDate.setDate(endDate.getDate() + 1);
  const end = endDate.toISOString().slice(0, 10).replaceAll("-", "");
  const uid = `${Date.now()}@promise-places.local`;
  const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Promise Places//PWA//RU",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${escapeIcs(event.title)}`,
    `LOCATION:${escapeIcs(event.location)}`,
    `DESCRIPTION:${escapeIcs(event.note)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${event.title.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase() || "promise-place"}.ics`;
  link.click();
  URL.revokeObjectURL(url);
  return true;
}

