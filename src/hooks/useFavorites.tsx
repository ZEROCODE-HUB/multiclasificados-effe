import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { fetchFavoriteIds, toggleFavorite } from "@/lib/favorites";

interface FavoritesContextValue {
  ids: Set<string>;
  isFavorite: (id: string) => boolean;
  toggle: (id: string) => Promise<boolean | null>;
  reload: () => void;
}

const FavoritesContext = createContext<FavoritesContextValue>({
  ids: new Set(),
  isFavorite: () => false,
  toggle: async () => null,
  reload: () => {},
});

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<Set<string>>(new Set());

  const reload = useCallback(() => {
    fetchFavoriteIds().then(setIds);
  }, []);

  // Carga inicial y al cambiar la sesión (login/logout).
  useEffect(() => {
    reload();
    const { data: sub } = supabase.auth.onAuthStateChange(() => reload());
    return () => sub.subscription.unsubscribe();
  }, [reload]);

  const isFavorite = useCallback((id: string) => ids.has(id), [ids]);

  const toggle = useCallback(async (id: string) => {
    const res = await toggleFavorite(id);
    if (res === true) {
      setIds((prev) => new Set(prev).add(id));
    } else if (res === false) {
      setIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
    return res;
  }, []);

  return (
    <FavoritesContext.Provider value={{ ids, isFavorite, toggle, reload }}>
      {children}
    </FavoritesContext.Provider>
  );
}

// Excepción razonada a `only-export-components`: el proveedor y su hook en el
// mismo archivo son EL patrón de contexto de React, y separarlos solo para que
// la recarga en caliente sea más fina empeoraría la cohesión y tocaría los 11
// archivos que lo usan.
// eslint-disable-next-line react-refresh/only-export-components
export const useFavorites = () => useContext(FavoritesContext);
