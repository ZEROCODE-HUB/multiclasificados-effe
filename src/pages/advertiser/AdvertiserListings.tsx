import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { featuredListings } from "@/data/mockData";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ListingRow } from "@/components/ListingRow";
import { PlusCircle, ClipboardList, Eye, MessageSquare, TrendingUp, Search, SlidersHorizontal } from "lucide-react";
import { Link } from "react-router-dom";

const stats = [
  { label: "Avisos activos", value: 12, icon: ClipboardList, accent: "text-secondary" },
  { label: "Vistas totales (30d)", value: "8.4K", icon: Eye, accent: "text-primary" },
  { label: "Mensajes nuevos", value: 7, icon: MessageSquare, accent: "text-success" },
  { label: "Conversión", value: "4.2%", icon: TrendingUp, accent: "text-warning" },
];

const AdvertiserListings = () => (
  <DashboardLayout role="anunciante">
    <div className="space-y-6 animate-fade-in">
      {/* Premium header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-secondary">Gestión de avisos</p>
          <h1 className="text-2xl md:text-3xl font-extrabold text-foreground mt-1">Mis avisos publicados</h1>
          <p className="text-sm text-muted-foreground mt-1">Administra el rendimiento de cada anuncio en un solo lugar.</p>
        </div>
        <Link to="/dashboard/anunciante/publicar" className="self-start lg:self-auto">
          <Button variant="hero" className="gap-2 h-11 px-5">
            <PlusCircle size={16} /> Nuevo aviso
          </Button>
        </Link>
      </div>

      {/* Premium summary strip — desktop only */}
      <div className="hidden md:grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="bg-card border border-border p-4 flex items-center gap-3 hover:border-secondary/40 transition-colors">
            <div className={`w-10 h-10 flex items-center justify-center bg-muted ${s.accent}`}>
              <s.icon size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">{s.label}</p>
              <p className="text-xl font-extrabold text-foreground leading-tight">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      <Tabs defaultValue="activos">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="-mx-4 sm:mx-0 px-4 sm:px-0 overflow-x-auto scrollbar-hide">
            <TabsList className="w-max">
              <TabsTrigger value="activos">Activos (12)</TabsTrigger>
              <TabsTrigger value="pausados">Pausados (3)</TabsTrigger>
              <TabsTrigger value="vencidos">Vencidos (5)</TabsTrigger>
              <TabsTrigger value="borradores">Borradores (2)</TabsTrigger>
            </TabsList>
          </div>

          {/* Toolbar — desktop only */}
          <div className="hidden lg:flex items-center gap-2">
            <div className="flex items-center bg-muted/50 border border-border h-9 w-64">
              <Search size={14} className="ml-3 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar en mis avisos…"
                className="flex-1 bg-transparent px-2 text-xs outline-none"
              />
            </div>
            <Button variant="outline" size="sm" className="gap-1.5 h-9">
              <SlidersHorizontal size={14} /> Filtros
            </Button>
          </div>
        </div>

        <TabsContent value="activos" className="mt-4">
          {/* Premium list container */}
          <div className="bg-card border border-border">
            <div className="hidden lg:grid grid-cols-[1fr_120px_120px_140px] gap-4 px-5 py-2.5 border-b border-border bg-muted/30">
              <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-muted-foreground">Aviso</span>
              <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-muted-foreground">Vistas</span>
              <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-muted-foreground">Estado</span>
              <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-muted-foreground text-right">Acciones</span>
            </div>
            <div className="divide-y divide-border">
              {featuredListings.map((listing) => (
                <div key={listing.id} className="p-3 lg:p-4">
                  <ListingRow listing={listing} status="Activo" />
                </div>
              ))}
            </div>
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
