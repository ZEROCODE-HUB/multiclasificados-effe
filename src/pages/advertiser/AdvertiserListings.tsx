import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { featuredListings } from "@/data/mockData";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const AdvertiserListings = () => (
  <DashboardLayout role="anunciante">
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Mis avisos</h1>
          <p className="text-muted-foreground">Gestiona todos tus avisos publicados.</p>
        </div>
        <Button variant="hero">Nuevo aviso</Button>
      </div>

      <Tabs defaultValue="activos">
        <TabsList>
          <TabsTrigger value="activos">Activos (12)</TabsTrigger>
          <TabsTrigger value="pausados">Pausados (3)</TabsTrigger>
          <TabsTrigger value="vencidos">Vencidos (5)</TabsTrigger>
          <TabsTrigger value="borradores">Borradores (2)</TabsTrigger>
        </TabsList>
        <TabsContent value="activos">
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {featuredListings.map((listing) => (
                  <div key={listing.id} className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors">
                    <img src={listing.imageUrl} alt={listing.title} className="w-20 h-14 object-cover rounded" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">{listing.title}</p>
                      <p className="text-xs text-muted-foreground">{listing.location} · Publicado: {listing.date}</p>
                    </div>
                    <div className="text-right hidden md:block">
                      <p className="font-bold text-foreground">{listing.currency} {listing.price.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">{listing.views} vistas</p>
                    </div>
                    <Badge className="bg-success text-success-foreground">Activo</Badge>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm">Editar</Button>
                      <Button variant="ghost" size="sm">Pausar</Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="pausados">
          <Card><CardContent className="p-8 text-center text-muted-foreground">3 avisos pausados</CardContent></Card>
        </TabsContent>
        <TabsContent value="vencidos">
          <Card><CardContent className="p-8 text-center text-muted-foreground">5 avisos vencidos</CardContent></Card>
        </TabsContent>
        <TabsContent value="borradores">
          <Card><CardContent className="p-8 text-center text-muted-foreground">2 borradores guardados</CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  </DashboardLayout>
);

export default AdvertiserListings;
