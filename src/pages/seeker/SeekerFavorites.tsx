import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { ListingCard } from "@/components/ListingCard";
import { Link } from "react-router-dom";
import { type Listing } from "@/data/mockData";
import { fetchListingsByIds } from "@/lib/listings";
import { useFavorites } from "@/hooks/useFavorites";
import { useSession } from "@/hooks/useSession";

const SeekerFavorites = () => {
  const session = useSession();
  const { ids } = useFavorites();
  const [items, setItems] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  // Carga los avisos guardados reales del usuario (se actualiza al marcar/desmarcar).
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetchListingsByIds([...ids]).then((rows) => {
      if (mounted) {
        setItems(rows);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, [ids]);

  return (
    <DashboardLayout role="buscador">
      <div className="space-y-5 md:space-y-6 animate-fade-in">
        <div>
          <h2 className="text-xl md:text-2xl font-extrabold text-foreground tracking-tight uppercase">Mis favoritos</h2>
          <p className="text-sm text-muted-foreground mt-1">Avisos que has guardado para ver después.</p>
        </div>

        {items.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-8">
            {items.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}

        {items.length === 0 && !loading && (
          <Card className="rounded-none">
            <CardContent className="p-10 text-center text-muted-foreground">
              {!session ? (
                <>
                  Inicia sesión para ver tus favoritos.{" "}
                  <Link to="/auth" className="text-secondary font-semibold hover:underline">Ingresar</Link>
                </>
              ) : (
                <>
                  No tienes favoritos guardados.{" "}
                  <Link to="/buscar" className="text-secondary font-semibold hover:underline">Explora avisos</Link> y guárdalos con el corazón.
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default SeekerFavorites;
