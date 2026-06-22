import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { advertiserStats, featuredListings } from "@/data/mockData";
import { ClipboardList, AlertTriangle, MessageSquare, Eye, Users, TrendingUp, BarChart3, PlusCircle, ArrowRight, Wallet, Flame, Star, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ListingRow } from "@/components/ListingRow";
import { Link } from "react-router-dom";

const statCards = [
  { label: "Avisos activos", value: advertiserStats.activeListings, icon: ClipboardList, accent: "bg-primary/10 text-primary" },
  { label: "Por vencer", value: advertiserStats.expiringListings, icon: AlertTriangle, accent: "bg-warning/15 text-warning" },
  { label: "Mensajes", value: advertiserStats.unreadMessages, icon: MessageSquare, accent: "bg-secondary/15 text-secondary" },
  { label: "Vistas totales", value: advertiserStats.totalViews, icon: Eye, accent: "bg-success/15 text-success" },
  { label: "Postulaciones", value: advertiserStats.applicationsReceived, icon: Users, accent: "bg-primary/10 text-primary" },
];

const AdvertiserDashboard = () => {
  return (
    <DashboardLayout role="anunciante">
      <div className="space-y-5 md:space-y-6 animate-fade-in">
        {/* Greeting banner */}
        <div className="relative overflow-hidden rounded-2xl gradient-hero text-primary-foreground p-5 md:p-7">
          <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-secondary/30 blur-3xl" />
          <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-widest text-secondary font-bold mb-1">Bienvenido</p>
              <h1 className="text-xl md:text-3xl font-extrabold">¡Hola, Juan!</h1>
              <p className="text-primary-foreground/70 text-sm md:text-base mt-1">
                Resumen de tu actividad como anunciante.
              </p>
            </div>
            <Button variant="hero" size="lg" className="gap-2 self-start sm:self-auto">
              <PlusCircle size={18} /> Publicar aviso
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
          {statCards.map((stat) => (
            <Card key={stat.label} className="border-l-4 border-l-secondary/60 hover:border-l-secondary hover:shadow-md transition-all">
              <CardContent className="p-3 md:p-4 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${stat.accent}`}>
                  <stat.icon size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-xl md:text-2xl font-extrabold text-foreground leading-none">{stat.value.toLocaleString()}</p>
                  <p className="text-[11px] md:text-xs text-muted-foreground mt-1 truncate">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Mi saldo */}
        <Card className="border-2 border-secondary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base md:text-lg flex items-center gap-2">
              <Wallet size={18} className="text-secondary" /> Mi saldo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { label: "Saldo total comprado", value: "S/ 120.00", tone: "text-foreground" },
                { label: "Saldo consumido", value: "S/ 48.00", tone: "text-muted-foreground" },
                { label: "Saldo restante", value: "S/ 72.00", tone: "text-secondary" },
              ].map((s) => (
                <div key={s.label} className="border p-3 bg-muted/30">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{s.label}</p>
                  <p className={`text-xl font-extrabold mt-1 ${s.tone}`}>{s.value}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 border-t pt-3">
              <p className="text-sm">
                <span className="font-bold text-foreground">2 de 5</span>
                <span className="text-muted-foreground"> avisos publicados</span>
              </p>
              <div className="h-2 flex-1 bg-muted overflow-hidden">
                <div className="h-full bg-secondary" style={{ width: "40%" }} />
              </div>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Adicionales restantes</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { icon: Flame, label: "Urgente: 1 restante" },
                  { icon: Star, label: "Destacado: 2 restantes" },
                  { icon: EyeOff, label: "Confidencial: 2 restantes" },
                ].map((a) => (
                  <Badge key={a.label} variant="outline" className="gap-1.5 py-1.5 px-2.5 text-xs">
                    <a.icon size={12} className="text-secondary" /> {a.label}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent listings */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <CardTitle className="text-base md:text-lg flex items-center gap-2">
              <ClipboardList size={18} className="text-secondary" /> Mis avisos recientes
            </CardTitle>
            <Link to="/dashboard/anunciante/avisos">
              <Button variant="ghost" size="sm" className="text-secondary gap-1 text-xs">
                Ver todos <ArrowRight size={14} />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
              {featuredListings.slice(0, 4).map((listing) => (
                <ListingRow key={listing.id} listing={listing} status="Activo" />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Messages & Applications */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Últimos mensajes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { from: "María López", message: "Hola, ¿sigue disponible el departamento?", time: "Hace 2h" },
                { from: "Carlos Ruiz", message: "Me interesa el puesto de desarrollador.", time: "Hace 5h" },
                { from: "Ana Torres", message: "¿Puede enviar más fotos del vehículo?", time: "Ayer" },
              ].map((msg, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted transition-colors cursor-pointer">
                  <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-accent-foreground text-sm font-bold flex-shrink-0">
                    {msg.from.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-foreground">{msg.from}</p>
                      <span className="text-xs text-muted-foreground">{msg.time}</span>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{msg.message}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Postulaciones recientes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { name: "Pedro Gómez", listing: "Desarrollador Full Stack", status: "pendiente" },
                { name: "Laura Díaz", listing: "Servicio de Mudanzas", status: "revisado" },
                { name: "Roberto Silva", listing: "Curso de Marketing", status: "contactado" },
              ].map((app, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors">
                  <div className="w-8 h-8 rounded-full bg-secondary/20 flex items-center justify-center text-secondary text-sm font-bold flex-shrink-0">
                    {app.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{app.name}</p>
                    <p className="text-xs text-muted-foreground">{app.listing}</p>
                  </div>
                  <Badge variant="outline" className="capitalize">{app.status}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Performance chart placeholder */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 size={20} className="text-secondary" />
              Rendimiento de avisos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48 flex items-center justify-center bg-muted/50 rounded-lg border border-dashed border-border">
              <div className="text-center text-muted-foreground">
                <TrendingUp size={40} className="mx-auto mb-2 text-secondary/40" />
                <p className="text-sm font-medium">Gráfico de rendimiento</p>
                <p className="text-xs">Vistas, clics y contactos de los últimos 30 días</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default AdvertiserDashboard;
