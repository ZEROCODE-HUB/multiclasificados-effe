// Stubs de los hooks que ListingCard consulta al backend. El componente que se
// monta es el REAL (insignias, tooltip, badge de Verificado).
export const useSession = () => ({ supabase: true, role: "buscador", name: "Yo" });
export const useFavorites = () => ({ isFavorite: () => false, toggle: async () => true });
