import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { featuredListings } from "@/data/mockData";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ListingRow } from "@/components/ListingRow";
import { PlusCircle } from "lucide-react";

const AdvertiserListings = () => (
  <DashboardLayout role="anunciante">
    <div className="space-y-5 md:space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-foreground">Mis avisos</h1>
          <p className="text-sm text-muted-foreground">Gestiona todos tus avisos publicados.</p>
        </div>
        <Button variant="hero" className="gap-2 self-start sm:self-auto">
          <PlusCircle size={16} /> Nuevo aviso
        </Button>
      </div>

      <Tabs defaultValue="activos">
        <div className="-mx-4 sm:mx-0 px-4 sm:px-0 overflow-x-auto scrollbar-hide">
          <TabsList className="w-max">
            <TabsTrigger value="activos">Activos (12)</TabsTrigger>
            <TabsTrigger value="pausados">Pausados (3)</TabsTrigger>
            <TabsTrigger value="vencidos">Vencidos (5)</TabsTrigger>
            <TabsTrigger value="borradores">Borradores (2)</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="activos" className="mt-4">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 md:gap-4">
            {featuredListings.map((listing) => (
              <ListingRow key={listing.id} listing={listing} status="Activo" />
            ))}
          </div>
        </TabsContent>
        <TabsContent value="pausados" className="mt-4">
          <Card><CardContent className="p-8 text-center text-muted-foreground">3 avisos pausados</CardContent></Card>
        </TabsContent>
        <TabsContent value="vencidos" className="mt-4">
          <Card><CardContent className="p-8 text-center text-muted-foreground">5 avisos vencidos</CardContent></Card>
        </TabsContent>
        <TabsContent value="borradores" className="mt-4">
          <Card><CardContent className="p-8 text-center text-muted-foreground">2 borradores guardados</CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  </DashboardLayout>
);

export default AdvertiserListings;
