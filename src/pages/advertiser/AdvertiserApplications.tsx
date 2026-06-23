import { useCallback, useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, X, Eye } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  fetchApplicationsForOwner,
  updateApplicationStatus,
  STATUS_LABEL,
  type OwnerApplication,
  type ApplicationStatus,
} from "@/lib/applications";

const statusColors: Record<ApplicationStatus, string> = {
  pending: "bg-warning text-warning-foreground",
  reviewed: "bg-primary text-primary-foreground",
  accepted: "bg-success text-success-foreground",
  rejected: "bg-destructive text-destructive-foreground",
};

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
      toast({ title: `Postulación ${STATUS_LABEL[status].toLowerCase()}` });
    } catch {
      toast({ title: "No se pudo actualizar", variant: "destructive" });
    }
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
            <p className="text-[11px] text-muted-foreground mt-2">{fmtDate(app.created_at)}</p>
            <div className="flex gap-2 mt-3 pt-3 border-t border-dashed">
              {app.status !== "reviewed" && app.status !== "accepted" && app.status !== "rejected" && (
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => setStatus(app.id, "reviewed")}>
                  <Eye size={13} /> En revisión
                </Button>
              )}
              {app.status !== "accepted" && (
                <Button variant="hero" size="sm" className="h-8 text-xs gap-1" onClick={() => setStatus(app.id, "accepted")}>
                  <Check size={13} /> Aceptar
                </Button>
              )}
              {app.status !== "rejected" && (
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1 text-destructive border-destructive/40 hover:bg-destructive/10" onClick={() => setStatus(app.id, "rejected")}>
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

  return (
    <DashboardLayout role="anunciante">
      <div className="space-y-5 md:space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-foreground">Postulaciones</h1>
          <p className="text-sm text-muted-foreground">Revisa y gestiona las postulaciones recibidas en tus avisos.</p>
        </div>

        <Tabs defaultValue="todas">
          <div className="-mx-4 sm:mx-0 px-4 sm:px-0 overflow-x-auto">
            <TabsList className="w-max">
              <TabsTrigger value="todas">Todas ({count("all")})</TabsTrigger>
              <TabsTrigger value="pending">Pendientes ({count("pending")})</TabsTrigger>
              <TabsTrigger value="accepted">Aceptadas ({count("accepted")})</TabsTrigger>
              <TabsTrigger value="rejected">Rechazadas ({count("rejected")})</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="todas" className="mt-4">
            <div className="space-y-3 md:space-y-4">
              {loading ? empty("Cargando…") : apps.length === 0 ? empty("Aún no has recibido postulaciones.") : apps.map(renderCard)}
            </div>
          </TabsContent>

          {(["pending", "accepted", "rejected"] as ApplicationStatus[]).map((status) => {
            const list = apps.filter((a) => a.status === status);
            return (
              <TabsContent key={status} value={status} className="mt-4">
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
