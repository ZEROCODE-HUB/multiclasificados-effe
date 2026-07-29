// Fuente única de las categorías de la plataforma.
//
// El orden lo define el staff arrastrando las tarjetas en Panel → Configuración
// comercial → Categorías, y se guarda en `categories.sort_order`. Todo lo que
// liste categorías (inicio, navbar, filtros, publicar, mapa, reportes…) debe
// leerlas desde aquí para que ese orden se replique en toda la plataforma.
import {
  Home, Car, Briefcase, Smartphone, Package, Wrench, GraduationCap, Sparkles, Tag,
  ShoppingBag, Heart, Building2, Plane, PawPrint, Dumbbell, Music, Camera, Utensils,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

export interface PlatformCategory {
  id: string;
  name: string;
  icon: LucideIcon;
  // Si es false, el formulario de publicar oculta el campo "Condición".
  conditionEnabled: boolean;
  // Foto de portada que sube el staff (bucket category-images). null = usa el pool.
  imageUrl: string | null;
}

// Fotos de reserva de la portada: las MISMAS 8 que siembra la migración 0077,
// en el orden de FALLBACK_CATEGORIES. Se usan cuando una categoría no tiene
// imagen propia (típicamente las que crea el staff): la tarjeta rota por índice
// y así nunca cae a un degradado sólido.
export const CATEGORY_PHOTO_POOL: string[] = [
  "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&h=600&fit=crop&auto=format&q=70",
  "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&h=600&fit=crop&auto=format&q=70",
  "https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=800&h=600&fit=crop&auto=format&q=70",
  "https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&h=600&fit=crop&auto=format&q=70",
  "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=800&h=600&fit=crop&auto=format&q=70",
  "https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=800&h=600&fit=crop&auto=format&q=70",
  "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=800&h=600&fit=crop&auto=format&q=70",
  "https://images.unsplash.com/photo-1445205170230-053b83016050?w=800&h=600&fit=crop&auto=format&q=70",
];

/** Foto que debe pintar la tarjeta nº `index`: la suya, o una de reserva. */
export const categoryPhoto = (cat: Pick<PlatformCategory, "imageUrl">, index: number): string =>
  cat.imageUrl || CATEGORY_PHOTO_POOL[index % CATEGORY_PHOTO_POOL.length];

// El icono se guarda como texto en la BD; aquí se resuelve al componente.
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Home, Car, Briefcase, Smartphone, Package, Wrench, GraduationCap, Sparkles, Tag,
  ShoppingBag, Heart, Building2, Plane, PawPrint, Dumbbell, Music, Camera, Utensils,
};
export const CATEGORY_ICON_NAMES = Object.keys(CATEGORY_ICONS);
export const iconFor = (name: string): LucideIcon => CATEGORY_ICONS[name] ?? Tag;

// Se usa mientras llega la respuesta de la BD, y como red de seguridad si la
// consulta falla (APK sin conexión, modo demo sin sesión…).
export const FALLBACK_CATEGORIES: PlatformCategory[] = [
  { id: "inmuebles", name: "Inmuebles", icon: Home, conditionEnabled: true, imageUrl: CATEGORY_PHOTO_POOL[0] },
  { id: "vehiculos", name: "Vehículos", icon: Car, conditionEnabled: true, imageUrl: CATEGORY_PHOTO_POOL[1] },
  { id: "empleos", name: "Empleos", icon: Briefcase, conditionEnabled: false, imageUrl: CATEGORY_PHOTO_POOL[2] },
  { id: "tecnologia", name: "Tecnología", icon: Smartphone, conditionEnabled: true, imageUrl: CATEGORY_PHOTO_POOL[3] },
  { id: "productos", name: "Productos", icon: Package, conditionEnabled: true, imageUrl: CATEGORY_PHOTO_POOL[4] },
  { id: "servicios", name: "Servicios", icon: Wrench, conditionEnabled: false, imageUrl: CATEGORY_PHOTO_POOL[5] },
  { id: "educacion-finanzas", name: "Educación y Finanzas", icon: GraduationCap, conditionEnabled: true, imageUrl: CATEGORY_PHOTO_POOL[6] },
  { id: "salud-belleza-moda", name: "Salud, Belleza y Moda", icon: Sparkles, conditionEnabled: true, imageUrl: CATEGORY_PHOTO_POOL[7] },
];

// `image_url` va opcional a propósito: los snapshots guardados antes de que
// existiera la columna se siguen leyendo sin romper (quedan con imageUrl null,
// que la portada resuelve con el pool).
interface StoredCategory { id: string; name: string; icon: string; condition_enabled?: boolean; image_url?: string | null }
const STORAGE_KEY = "effe_categories";

let cache: PlatformCategory[] | null = null;
let loaded = false;
let inFlight: Promise<PlatformCategory[]> | null = null;
const listeners = new Set<() => void>();

const toPlatform = (rows: StoredCategory[]): PlatformCategory[] =>
  rows.map((r) => ({
    id: r.id, name: r.name, icon: iconFor(r.icon),
    conditionEnabled: r.condition_enabled !== false,
    imageUrl: r.image_url ?? null,
  }));

// El orden ya visto se guarda en el navegador para que el primer render tras
// recargar no parpadee con el orden por defecto antes de que responda la BD.
function readSnapshot(): PlatformCategory[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const rows = JSON.parse(raw) as StoredCategory[];
    if (!Array.isArray(rows) || !rows.length) return null;
    if (!rows.every((r) => r && typeof r.id === "string" && typeof r.name === "string")) return null;
    return toPlatform(rows);
  } catch {
    return null;
  }
}

function writeSnapshot(rows: StoredCategory[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  } catch {
    /* modo privado o cuota llena: el snapshot es opcional */
  }
}

/** Lectura síncrona: snapshot del navegador, o el set por defecto. */
export function getCategories(): PlatformCategory[] {
  if (!cache) cache = readSnapshot() ?? FALLBACK_CATEGORIES;
  return cache;
}

export function subscribeCategories(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => { listeners.delete(onChange); };
}

/** Trae las categorías activas de la BD, en el orden definido por el staff. */
export async function loadCategories(force = false): Promise<PlatformCategory[]> {
  if (loaded && !force) return getCategories();
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, icon, condition_enabled, image_url")
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as StoredCategory[];
      // Una tabla vacía casi siempre significa "no pude leerla", no "no hay
      // categorías": conservamos lo que ya teníamos antes que dejar la app sin filtros.
      if (rows.length) {
        cache = toPlatform(rows);
        loaded = true;
        writeSnapshot(rows);
        listeners.forEach((l) => l());
      }
    } catch {
      /* sin red o sin permisos: nos quedamos con el snapshot o el fallback */
    }
    inFlight = null;
    return getCategories();
  })();

  return inFlight;
}

/** Tras reordenar/crear/borrar en el panel: relee y notifica a toda la app. */
export function invalidateCategories(): Promise<PlatformCategory[]> {
  loaded = false;
  return loadCategories(true);
}

/** Solo para tests: vuelve al estado inicial. */
export function resetCategoriesCache() {
  cache = null;
  loaded = false;
  inFlight = null;
}
