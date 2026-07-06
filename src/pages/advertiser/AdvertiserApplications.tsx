import { useCallback, useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, X, Eye, Users, FileText } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  fetchApplicationsForOwner,
  updateApplicationStatus,
  getCvSignedUrl,
  STATUS_LABEL,
  type OwnerApplication,
  type ApplicationStatus,
} from "@/lib/applications";

const statusColors: Record<ApplicationStatus, string> = {
  pending: "bg-warning text-warning-foreground",
  reviewed: "bg-primary text-primary-foreground",
  interview: "bg-secondary text-secondary-foreground",
  accepted: "bg-success text-success-foreground",
  rejected: "bg-destructive text-destructive-foreground",
};

// Transiciones de seguimiento que puede aplicar el anunciante desde una tarjeta.
const ACTIONS: { status: ApplicationStatus; label: string; icon: typeof Eye; variant: "outline" | "hero" }[] = [
  { status: "reviewed", label: "En revisión", icon: Eye, variant: "outline" },
  { status: "interview", label: "En entrevista", icon: Users, variant: "outline" },
  { status: "accepted", label: "Aceptar", icon: Check, variant: "hero" },
];

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });

const AdvertiserApplications = () => {
  const [apps, setApps] = useState<OwnerApplication[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetchApplicationsForOwner().then((rows) => {
      setApps(rows);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (id: string, status: ApplicationStatus) => {
    try {
      await updateApplicationStatus(id, status);
      setApps((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
      toast({ title: `Postulación: ${STATUS_LABEL[status]}` });
    } catch {
      toast({ title: "No se pudo actualizar", variant: "destructive" });
    }
  };

  const openCv = async (cvUrl: string) => {
    const url = await getCvSignedUrl(cvUrl);
    if (url) window.open(url, "_blank", "noopener");
    else toast({ title: "No se pudo abrir el CV", variant: "destructive" });
  };

  const count = (s: ApplicationStatus | "all") =>
    s === "all" ? apps.length : apps.filter((a) => a.status === s).length;

  const renderCard = (app: OwnerApplication) => (
    <Card key={app.id} className="border-l-4 border-l-secondary/50 hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-full gradient-secondary flex items-center justify-center text-secondary-foreground font-bold flex-shrink-0 shadow-sm">
            {app.applicant_name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <p className="font-semibold text-foreground">{app.applicant_name}</p>
              <Badge className={statusColors[app.status] + " text-[10px]"}>{STATUS_LABEL[app.status]}</Badge>
            </div>
            <p className="text-xs text-secondary font-medium mb-2">Para: {app.listing_title}</p>
            {app.message && <p className="text-sm text-foreground/80 leading-relaxed">{app.message}</p>}

            {app.cv_url && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1 mt-2"
                onClick={() => openCv(app.cv_url!)}
              >
                <FileText size={13} /> Ver CV (PDF)
              </Button>
            )}

            <p className="text-[11px] text-muted-foreground mt-2">{fmtDate(app.created_at)}</p>

            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-dashed">
              {ACTIONS.filter((a) => a.status !== app.status).map(({ status, label, icon: Icon, variant }) => (
                <Button
                  key={status}
                  variant={variant}
                  size="sm"
                  className="h-8 text-xs gap-1"
                  onClick={() => setStatus(app.id, status)}
                >
                  <Icon size={13} /> {label}
                </Button>
              ))}
              {app.status !== "rejected" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1 text-destructive border-destructive/40 hover:bg-destructive/10"
                  onClick={() => setStatus(app.id, "rejected")}
                >
                  <X size={13} /> Rechazar
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const empty = (msg: string) => (
    <Card className="rounded-none">
      <CardContent className="p-10 text-center text-muted-foreground">{msg}</CardContent>
    </Card>
  );

  const TABS: { value: string; label: string; status?: ApplicationStatus }[] = [
    { value: "todas", label: `Todas (${count("all")})` },
    { value: "pending", label: `Recibidas (${count("pending")})`, status: "pending" },
    { value: "interview", label: `En entrevista (${count("interview")})`, status: "interview" },
    { value: "accepted", label: `Aceptadas (${count("accepted")})`, status: "accepted" },
    { value: "rejected", label: `Rechazadas (${count("rejected")})`, status: "rejected" },
  ];

  return (
    <DashboardLayout role="anunciante">
      <div className="space-y-5 md:space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-foreground">Postulaciones</h1>
          <p className="text-sm text-muted-foreground">
            Revisa los CV recibidos y actualiza en qué etapa va cada candidato.
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

          <TabsContent value="todas" className="mt-4">
            <div className="space-y-3 md:space-y-4">
              {loading ? empty("Cargando…") : apps.length === 0 ? empty("Aún no has recibido postulaciones.") : apps.map(renderCard)}
            </div>
          </TabsContent>

          {TABS.filter((t) => t.status).map((t) => {
            const list = apps.filter((a) => a.status === t.status);
            return (
              <TabsContent key={t.value} value={t.value} className="mt-4">
                <div className="space-y-3 md:space-y-4">
                  {list.length === 0 ? empty("Sin postulaciones en este estado.") : list.map(renderCard)}
                </div>
              </TabsContent>
            );
          })}
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default AdvertiserApplications;
