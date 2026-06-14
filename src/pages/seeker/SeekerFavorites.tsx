import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { ListingCard } from "@/components/ListingCard";
import { featuredListings } from "@/data/mockData";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";

const SeekerFavorites = () => {
  const [items, setItems] = useState(featuredListings);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const confirmDelete = () => {
    if (!pendingDelete) return;
    setItems((prev) => prev.filter((i) => i.id !== pendingDelete));
    toast({ title: "Eliminado", description: "El aviso se eliminó de tus favoritos." });
    setPendingDelete(null);
  };

  const pendingItem = items.find((i) => i.id === pendingDelete);

  return (
    <DashboardLayout role="buscador">
      <div className="space-y-5 md:space-y-6 animate-fade-in">
        {/* Título fuera de contenedor para mobile-first parity */}
        <div>
          <h2 className="text-xl md:text-2xl font-extrabold text-foreground tracking-tight uppercase">Mis favoritos</h2>
          <p className="text-sm text-muted-foreground mt-1">Avisos que has guardado para ver después.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-8">
          {items.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>

        {items.length === 0 && (
          <Card className="rounded-none">
            <CardContent className="p-10 text-center text-muted-foreground">
              No tienes favoritos guardados.
            </CardContent>
          </Card>
        )}
      </div>

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar de favoritos?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingItem ? `Se quitará "${pendingItem.title}" de tu lista. Esta acción no se puede deshacer.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default SeekerFavorites;
