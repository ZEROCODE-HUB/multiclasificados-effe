import { useEffect, useSyncExternalStore } from "react";
import {
  getCategories, loadCategories, subscribeCategories, type PlatformCategory,
} from "@/lib/categories";

/**
 * Categorías activas en el orden que definió el staff (Panel → Configuración
 * comercial). Devuelve el orden conocido de inmediato y se actualiza sola
 * cuando responde la BD o cuando el panel guarda un orden nuevo.
 */
export function useCategories(): PlatformCategory[] {
  const categories = useSyncExternalStore(subscribeCategories, getCategories, getCategories);
  useEffect(() => { void loadCategories(); }, []);
  return categories;
}
