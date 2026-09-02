import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClipboardList, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import {
  fetchMyApplications,
  STATUS_LABEL,
  type MyApplication,
  type ApplicationStatus,
} from "@/lib/applications";
import { useFilaSenalada } from "@/hooks/useFilaSenalada";

// Mismos colores de estado que ve el anunciante, para que el candidato reconozca
// la etapa de un vistazo.
const statusColors: Record<ApplicationStatus, string> = {
  pending: "bg-warning text-warning-foreground",
  reviewed: "bg-primary text-primary-foreground",
  interview: "bg-secondary text-secondary-foreground",
  accepted: "bg-success text-success-foreground",
  rejected: "bg-destructive text-destructive-foreground",
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });

const SeekerApplications = () => {
  const [apps, setApps] = useState<MyApplication[]>([]);
  const [loading, setLoading] = useState(true);
  // Llegar desde la campana señalando la postulación que cambió de estado.
  //
  // Se señala por `listing_id` y no por el id de la postulación porque es lo
  // ÚNICO que trae esa notificación (comprobado en producción: el payload de
  // `application_status` lleva `listing_id` y `status`, nada más). Basta: no se
  // puede postular dos veces al mismo aviso, así que el aviso identifica la
  // postulación sin ambigüedad.
  const { senalado, filaRef, clasesDeResaltado } = useFilaSenalada("aviso", !loading);

  useEffect(() => {
    setLoading(true);
    fetchMyApplications().then((rows) => {
      setApps(rows);
      setLoading(false);
    });
  }, []);

  const count = (s: ApplicationStatus | "all") =>
    s === "all" ? apps.length : apps.filter((a) => a.status === s).length;

  const renderCard = (app: MyApplication) => (
    <Card
      key={app.id}
      ref={app.listing_id === senalado ? filaRef : undefined}
      className={`border-l-4 border-l-secondary/50 hover:shadow-md transition-shadow duration-500 ${clasesDeResaltado(app.listing_id)}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <p className="font-semibold text-foreground truncate">{app.listing_title}</p>
              <Badge className={statusColors[app.status] + " text-[10px]"}>{STATUS_LABEL[app.status]}</Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">Postulaste el {fmtDate(app.created_at)}</p>
          </div>
          <Button asChild variant="outline" size="sm" className="h-8 text-xs gap-1 shrink-0">
            <Link to={`/aviso/${app.listing_id}`}>
              <ExternalLink size={13} /> Ver aviso
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const empty = (msg: string) => (
    <Card className="rounded-none">
      <CardContent className="p-10 text-center text-muted-foreground">{msg}</CardContent>
    </Card>
  );

  // "En proceso" agrupa las etapas intermedias (recibida/en revisión/entrevista).
  const inProgress = apps.filter((a) => a.status === "pending" || a.status === "reviewed" || a.status === "interview");
  const TABS: { value: string; label: string; list: MyApplication[] }[] = [
    { value: "todas", label: `Todas (${count("all")})`, list: apps },
    { value: "proceso", label: `En proceso (${inProgress.length})`, list: inProgress },
    { value: "accepted", label: `Aceptadas (${count("accepted")})`, list: apps.filter((a) => a.status === "accepted") },
    { value: "rejected", label: `Rechazadas (${count("rejected")})`, list: apps.filter((a) => a.status === "rejected") },
  ];

  return (
    <DashboardLayout role="buscador">
      <div className="space-y-5 md:space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-foreground flex items-center gap-2">
            <ClipboardList size={24} className="text-primary" /> Mis postulaciones
          </h1>
          <p className="text-sm text-muted-foreground">
            A qué empleos postulaste y en qué etapa va cada uno. El anunciante actualiza el estado y tú recibes una notificación en cada cambio.
          </p>
        </div>

        <Tabs defaultValue="todas">
          <div className="-mx-4 sm:mx-0 px-4 sm:px-0 overflow-x-auto">
            <TabsList className="w-max">
              {TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
              ))}
            </TabsList>
          </div>

          {TABS.map((t) => (
            <TabsContent key={t.value} value={t.value} className="mt-4">
              <div className="space-y-3 md:space-y-4">
                {loading
                  ? empty("Cargando…")
                  : t.list.length === 0
                    ? empty(
                        t.value === "todas"
                          ? "Aún no has postulado a ningún empleo."
                          : "Sin postulaciones en este estado.",
                      )
                    : t.list.map(renderCard)}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default SeekerApplications;
