import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, AlertTriangle, MessageSquare, Eye, Users, TrendingUp, BarChart3, PlusCircle, ArrowRight, Wallet, Flame, Star, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ListingRow } from "@/components/ListingRow";
import { LoadingState } from "@/components/LoadingState";
import { Link, useNavigate } from "react-router-dom";
import { useSession } from "@/hooks/useSession";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { fetchMyListings, type MyListing } from "@/lib/listings";
import { fetchAdvertiserStats, type AdvertiserStatsData } from "@/lib/stats";
import { fetchConversations, type Conversation } from "@/lib/messaging";
import { fetchApplicationsForOwner, STATUS_LABEL, type OwnerApplication } from "@/lib/applications";
import { loadInvoices, formatSoles } from "@/lib/pricing";

const ROW_STATUS = (s: MyListing["status"]): "Activo" | "Pausado" | "Vencido" =>
  s === "active" ? "Activo" : s === "paused" ? "Pausado" : "Vencido";

const timeAgo = (iso: string | null) => {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "ahora";
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)}h`;
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
};

const AdvertiserDashboard = () => {
  const session = useSession();
  const navigate = useNavigate();
  const unread = useUnreadMessages();

  const [listings, setListings] = useState<MyListing[]>([]);
  const [stats, setStats] = useState<AdvertiserStatsData | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [applications, setApplications] = useState<OwnerApplication[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchMyListings().then(setListings),
      fetchAdvertiserStats().then(setStats),
      fetchConversations().then(setConversations),
      fetchApplicationsForOwner().then(setApplications),
    ]).finally(() => setLoading(false));
  }, []);

  const activeCount = listings.filter((l) => l.status === "active").length;
  const expiringCount = listings.filter(
    (l) => l.status === "active" && l.expiresAt && new Date(l.expiresAt).getTime() - Date.now() < 7 * 86400000,
  ).length;

  const statCards = [
    { label: "Avisos activos", value: activeCount, icon: ClipboardList, accent: "bg-primary/10 text-primary" },
    { label: "Por vencer", value: expiringCount, icon: AlertTriangle, accent: "bg-warning/15 text-warning" },
    { label: "Mensajes", value: unread, icon: MessageSquare, accent: "bg-secondary/15 text-secondary" },
    { label: "Vistas totales", value: stats?.totals.views ?? 0, icon: Eye, accent: "bg-success/15 text-success" },
    { label: "Postulaciones", value: stats?.totals.applications ?? 0, icon: Users, accent: "bg-primary/10 text-primary" },
  ];

  const firstName = (session?.name || "").split(" ")[0] || "anunciante";

  // Saldo a partir de los comprobantes reales del usuario.
  const invoices = useMemo(() => loadInvoices(), []);
  const totalComprado = invoices.reduce((a, i) => a + (i.amount || 0), 0);
  const saldo = [
    { label: "Saldo total comprado", value: formatSoles(totalComprado), tone: "text-foreground" },
    { label: "Saldo consumido", value: formatSoles(totalComprado), tone: "text-muted-foreground" },
    { label: "Saldo restante", value: formatSoles(0), tone: "text-secondary" },
  ];
  const publishedPct = listings.length ? Math.round((activeCount / listings.length) * 100) : 0;

  if (loading) {
    return (
      <DashboardLayout role="anunciante">
        <LoadingState label="Cargando tu panel…" />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="anunciante">
      <div className="space-y-5 md:space-y-6 animate-fade-in">
        {/* Greeting banner */}
        <div className="relative overflow-hidden rounded-2xl gradient-hero text-primary-foreground p-5 md:p-7">
          <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-secondary/30 blur-3xl" />
          <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-widest text-secondary font-bold mb-1">Bienvenido</p>
              <h1 className="text-xl md:text-3xl font-extrabold">¡Hola, {firstName}!</h1>
              <p className="text-primary-foreground/70 text-sm md:text-base mt-1">
                Resumen de tu actividad como anunciante.
              </p>
            </div>
            <Button variant="hero" size="lg" className="gap-2 self-start sm:self-auto" onClick={() => navigate("/dashboard/anunciante/publicar")}>
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
              {saldo.map((s) => (
                <div key={s.label} className="border p-3 bg-muted/30">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{s.label}</p>
                  <p className={`text-xl font-extrabold mt-1 ${s.tone}`}>{s.value}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 border-t pt-3">
              <p className="text-sm">
                <span className="font-bold text-foreground">{activeCount} de {listings.length}</span>
                <span className="text-muted-foreground"> avisos publicados</span>
              </p>
              <div className="h-2 flex-1 bg-muted overflow-hidden">
                <div className="h-full bg-secondary" style={{ width: `${publishedPct}%` }} />
              </div>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Comprobantes emitidos</p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="gap-1.5 py-1.5 px-2.5 text-xs">
                  <Flame size={12} className="text-secondary" /> {invoices.length} comprobante{invoices.length === 1 ? "" : "s"}
                </Badge>
                <Badge variant="outline" className="gap-1.5 py-1.5 px-2.5 text-xs">
                  <Star size={12} className="text-secondary" /> {formatSoles(totalComprado)} en total
                </Badge>
                <Badge variant="outline" className="gap-1.5 py-1.5 px-2.5 text-xs">
                  <EyeOff size={12} className="text-secondary" /> {listings.length} avisos creados
                </Badge>
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
            {listings.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Aún no has publicado avisos.</p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
                {listings.slice(0, 4).map((listing) => (
                  <ListingRow key={listing.id} listing={listing} status={ROW_STATUS(listing.status)} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Messages & Applications */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Últimos mensajes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {conversations.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No tienes mensajes todavía.</p>
              ) : (
                conversations.slice(0, 3).map((c) => (
                  <Link
                    key={c.id}
                    to={`/dashboard/anunciante/mensajes?c=${c.id}`}
                    className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted transition-colors cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-accent-foreground text-sm font-bold flex-shrink-0">
                      {c.counterpart_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-foreground">{c.counterpart_name}</p>
                        <span className="text-xs text-muted-foreground">{timeAgo(c.last_message_at)}</span>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{c.last_message ?? "Sin mensajes"}</p>
                    </div>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Postulaciones recientes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {applications.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No has recibido postulaciones.</p>
              ) : (
                applications.slice(0, 3).map((app) => (
                  <div key={app.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors">
                    <div className="w-8 h-8 rounded-full bg-secondary/20 flex items-center justify-center text-secondary text-sm font-bold flex-shrink-0">
                      {app.applicant_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{app.applicant_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{app.listing_title}</p>
                    </div>
                    <Badge variant="outline" className="capitalize">{STATUS_LABEL[app.status]}</Badge>
                  </div>
                ))
              )}
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
            <Link to="/dashboard/anunciante/estadisticas" className="block">
              <div className="h-48 flex items-center justify-center bg-muted/50 rounded-lg border border-dashed border-border hover:border-secondary/40 transition-colors">
                <div className="text-center text-muted-foreground">
                  <TrendingUp size={40} className="mx-auto mb-2 text-secondary/40" />
                  <p className="text-sm font-medium">Ver estadísticas completas</p>
                  <p className="text-xs">Vistas, clics y contactos de los últimos 30 días</p>
                </div>
              </div>
            </Link>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default AdvertiserDashboard;
