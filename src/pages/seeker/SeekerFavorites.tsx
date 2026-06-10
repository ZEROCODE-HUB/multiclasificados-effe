import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { featuredListings } from "@/data/mockData";
import { Heart, MapPin, Trash2, MessageCircle } from "lucide-react";
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

  const handleContact = (title: string) => {
    toast({ title: "Contacto enviado", description: `Se envió tu solicitud sobre "${title}".` });
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    setItems((prev) => prev.filter((i) => i.id !== pendingDelete));
    toast({ title: "Eliminado", description: "El aviso se eliminó de tus favoritos." });
    setPendingDelete(null);
  };

  const pendingItem = items.find((i) => i.id === pendingDelete);

  return (
    <DashboardLayout role="buscador">
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Mis favoritos</h1>
          <p className="text-sm text-muted-foreground">Avisos que has guardado para ver después.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((listing) => (
            <Card key={listing.id} className="overflow-hidden hover:shadow-lg transition-shadow rounded-lg">
              <CardContent className="p-0">
                <div className="relative">
                  <img src={listing.imageUrl} alt={listing.title} className="w-full h-44 object-cover" />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 bg-card/90 hover:bg-card text-destructive shadow-sm"
                    onClick={() => setPendingDelete(listing.id)}
                    aria-label="Quitar de favoritos"
                  >
                    <Heart size={16} fill="currentColor" />
                  </Button>
                </div>
                <div className="p-4">
                  <h3 className="font-bold text-foreground truncate">{listing.title}</h3>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                    <MapPin size={12} /> {listing.location}
                  </p>
                  <p className="text-lg font-extrabold text-primary mt-2">
                    <span className="text-xs text-secondary font-bold mr-1">{listing.currency}</span>
                    {listing.price.toLocaleString()}
                  </p>
                  <div className="flex gap-2 mt-3">
                    <Button variant="hero" size="sm" className="flex-1 gap-1.5" onClick={() => handleContact(listing.title)}>
                      <MessageCircle size={14} /> Contactar
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="text-destructive border-destructive/30 hover:bg-destructive/10"
                      onClick={() => setPendingDelete(listing.id)}
                      aria-label="Eliminar"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {items.length === 0 && (
          <Card>
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
