import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { featuredListings } from "@/data/mockData";
import { Heart, MapPin, Trash2 } from "lucide-react";

const SeekerFavorites = () => (
  <DashboardLayout role="buscador">
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Mis favoritos</h1>
        <p className="text-muted-foreground">Avisos que has guardado para ver después.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {featuredListings.map((listing) => (
          <Card key={listing.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-0">
              <div className="relative">
                <img src={listing.imageUrl} alt={listing.title} className="w-full h-40 object-cover rounded-t-lg" />
                <Button variant="ghost" size="icon" className="absolute top-2 right-2 bg-card/80 hover:bg-card text-destructive">
                  <Heart size={16} fill="currentColor" />
                </Button>
              </div>
              <div className="p-4">
                <h3 className="font-bold text-foreground truncate">{listing.title}</h3>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><MapPin size={12} /> {listing.location}</p>
                <p className="text-lg font-bold text-secondary mt-2">{listing.currency} {listing.price.toLocaleString()}</p>
                <div className="flex gap-2 mt-3">
                  <Button variant="hero" size="sm" className="flex-1">Contactar</Button>
                  <Button variant="outline" size="icon" className="text-muted-foreground"><Trash2 size={14} /></Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  </DashboardLayout>
);

export default SeekerFavorites;
