// Fuente única de las categorías de la plataforma.
//
// El orden lo define el staff arrastrando las tarjetas en Panel → Configuración
// comercial → Categorías, y se guarda en `categories.sort_order`. Todo lo que
// liste categorías (inicio, navbar, filtros, publicar, mapa, reportes…) debe
// leerlas desde aquí para que ese orden se replique en toda la plataforma.
import {
  Home, Car, Briefcase, Smartphone, Package, Wrench, GraduationCap, Sparkles, Tag,
  ShoppingBag, Heart, Building2, Plane, PawPrint, Dumbbell, Music, Camera, Utensils,
  Tractor, Bike,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

export interface PlatformCategory {
  id: string;
  name: string;
  icon: LucideIcon;
  // Si es false, el formulario de publicar oculta el campo "Condición".
  conditionEnabled: boolean;
}

// El icono se guarda como texto en la BD; aquí se resuelve al componente.
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Home, Car, Briefcase, Smartphone, Package, Wrench, GraduationCap, Sparkles, Tag,
  ShoppingBag, Heart, Building2, Plane, PawPrint, Dumbbell, Music, Camera, Utensils,
  Tractor, Bike,
};
export const CATEGORY_ICON_NAMES = Object.keys(CATEGORY_ICONS);
export const iconFor = (name: string): LucideIcon => CATEGORY_ICONS[name] ?? Tag;

// Se usa mientras llega la respuesta de la BD, y como red de seguridad si la
// consulta falla (APK sin conexión, modo demo sin sesión…).
// Espeja el orden y los nombres reales de la BD (12 categorías).
export const FALLBACK_CATEGORIES: PlatformCategory[] = [
  { id: "empleos", name: "Empleos", icon: Briefcase, conditionEnabled: false },
  { id: "inmuebles", name: "Inmuebles", icon: Home, conditionEnabled: true },
  { id: "vehiculos", name: "Vehículos y Repuestos", icon: Car, conditionEnabled: true },
  { id: "maquinaria", name: "Equipos y Maquinaria Pesada, Industrial y Herramientas", icon: Tractor, conditionEnabled: true },
  { id: "motos", name: "Motos, bicicletas y Repuestos", icon: Bike, conditionEnabled: true },
  { id: "tecnologia", name: "Tecnología", icon: Smartphone, conditionEnabled: true },
  { id: "servicios", name: "Servicios", icon: Wrench, conditionEnabled: false },
  { id: "educacion-finanzas", name: "Insumos y Materias Primas", icon: Building2, conditionEnabled: true },
  { id: "productos", name: "Alimentos y Productos Terminados", icon: Package, conditionEnabled: true },
  { id: "salud-belleza-moda", name: "Salud, Belleza y Moda", icon: Sparkles, conditionEnabled: true },
  { id: "eventos", name: "Eventos, Entretenimiento y Equipos Deportivos", icon: Music, conditionEnabled: true },
  { id: "mascotas", name: "Mascotas", icon: PawPrint, conditionEnabled: true },
];

interface StoredCategory { id: string; name: string; icon: string; condition_enabled?: boolean }
const STORAGE_KEY = "effe_categories";

let cache: PlatformCategory[] | null = null;
let loaded = false;
let inFlight: Promise<PlatformCategory[]> | null = null;
const listeners = new Set<() => void>();

const toPlatform = (rows: StoredCategory[]): PlatformCategory[] =>
  rows.map((r) => ({ id: r.id, name: r.name, icon: iconFor(r.icon), conditionEnabled: r.condition_enabled !== false }));

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
        .select("id, name, icon, condition_enabled")
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
