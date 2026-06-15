export type PlaceSuggestion = {
  id: string;
  name: string;
  address: string;
};

const twoGisKey = import.meta.env.VITE_2GIS_API_KEY as string | undefined;

export function isTwoGisConfigured() {
  return Boolean(twoGisKey);
}

export async function searchTwoGisPlaces(query: string): Promise<PlaceSuggestion[]> {
  if (!twoGisKey || query.trim().length < 3) return [];

  const url = new URL("https://catalog.api.2gis.com/3.0/items");
  url.searchParams.set("q", query.trim());
  url.searchParams.set("key", twoGisKey);
  url.searchParams.set("fields", "items.full_name,items.address_name,items.point");
  url.searchParams.set("page_size", "5");

  const response = await fetch(url);
  if (!response.ok) return [];

  const data = await response.json();
  const items = Array.isArray(data?.result?.items) ? data.result.items : [];

  return items.map((item: any) => ({
    id: String(item.id),
    name: item.name || item.full_name || "Место",
    address: item.address_name || item.full_name || "Адрес не найден",
  }));
}

