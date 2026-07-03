// Geocodificación con Nominatim (OpenStreetMap): convierte texto de ubicación
// a coordenadas y viceversa. Gratis y sin API key. Sesgado a Perú (countrycodes=pe).
// Política de uso de Nominatim: bajo volumen y con Referer del navegador.

export interface GeoResult {
  lat: number;
  lng: number;
  label: string;
}

const BASE = "https://nominatim.openstreetmap.org";

// Texto → coordenadas. Devuelve null si no hay resultado (ej. "Online", "Remoto").
export async function geocode(query: string): Promise<GeoResult | null> {
  const q = query.trim();
  if (!q) return null;
  const url = new URL(`${BASE}/search`);
  url.searchParams.set("q", q);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "pe");
  url.searchParams.set("accept-language", "es");
  try {
    const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const r = data[0];
    const lat = Number(r.lat);
    const lng = Number(r.lon);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return { lat, lng, label: String(r.display_name ?? q) };
  } catch {
    return null;
  }
}

// Coordenadas → texto legible (para actualizar la ubicación al mover el pin).
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const url = new URL(`${BASE}/reverse`);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("accept-language", "es");
  url.searchParams.set("zoom", "16");
  try {
    const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const data = await res.json();
    const a = data?.address;
    if (!a) return data?.display_name ?? null;
    // Compone "Distrito, Provincia" a partir de la dirección de Nominatim.
    const parts = [
      a.suburb || a.neighbourhood || a.city_district || a.town || a.village || a.city,
      a.city || a.province || a.state,
    ].filter(Boolean);
    const uniq = [...new Set(parts)];
    return uniq.length ? uniq.join(", ") : (data.display_name ?? null);
  } catch {
    return null;
  }
}
