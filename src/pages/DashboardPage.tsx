import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { advertiserStats, featuredListings } from "@/data/mockData";
import { ClipboardList, AlertTriangle, MessageSquare, Eye, TrendingUp, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const statCards = [
  { label: "Avisos activos", value: advertiserStats.activeListings, icon: ClipboardList, color: "text-secondary" },
  { label: "Por vencer", value: advertiserStats.expiringListings, icon: AlertTriangle, color: "text-warning" },
  { label: "Mensajes no leídos", value: advertiserStats.unreadMessages, icon: MessageSquare, color: "text-primary" },
  { label: "Vistas totales", value: advertiserStats.totalViews, icon: Eye, color: "text-success" },
  { label: "Postulaciones", value: advertiserStats.applicationsReceived, icon: Users, color: "text-secondary" },
];

const DashboardPage = () => {
  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">¡Hola, Juan!</h1>
            <p className="text-muted-foreground">Aquí tienes un resumen de tu actividad.</p>
          </div>
          <Link to="/dashboard/publicar">
            <Button variant="hero">Publicar aviso</Button>
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {statCards.map((stat) => (
            <Card key={stat.label}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`p-2 rounded-lg bg-muted ${stat.color}`}>
                  <stat.icon size={20} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{stat.value.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Recent listings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Avisos recientes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {featuredListings.slice(0, 4).map((listing) => (
                <div key={listing.id} className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted transition-colors">
                  <img src={listing.imageUrl} alt={listing.title} className="w-16 h-12 object-cover rounded" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{listing.title}</p>
                    <p className="text-xs text-muted-foreground">{listing.location} · {listing.date}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{listing.views} vistas</Badge>
                    <Badge className="bg-success text-success-foreground">Activo</Badge>
                  </div>
                  <div className="hidden md:flex gap-1">
                    <Button variant="ghost" size="sm">Editar</Button>
                    <Button variant="ghost" size="sm">Pausar</Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Messages preview */}
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
      </div>
    </DashboardLayout>
  );
};

export default DashboardPage;
