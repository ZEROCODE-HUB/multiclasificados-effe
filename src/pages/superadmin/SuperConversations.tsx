import { useEffect, useMemo, useState } from "react";
import { AdminLayout, AdminRole } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, AlertOctagon, ArrowLeft } from "lucide-react";
import { fetchReports, assignReport, resolveReport, type AdminReport } from "@/lib/admin";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";

// Mapa estado real (BD) -> etiqueta + color del diseño existente.
const statusMeta: Record<string, { label: string; color: string }> = {
  open:      { label: "Abierto",     color: "bg-destructive/15 text-destructive border-destructive/30" },
  reviewing: { label: "En revisión", color: "bg-warning/15 text-warning border-warning/30" },
  resolved:  { label: "Resuelto",    color: "bg-success/15 text-success border-success/30" },
};
const metaFor = (s: string) => statusMeta[s] ?? statusMeta.open;

const isUuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

const SuperConversations = ({ role = "superadmin" as AdminRole }: { role?: AdminRole }) => {
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [me, setMe] = useState<string | null>(null);

  const load = () => fetchReports().then(({ data }) => setReports(data));
  useEffect(() => {
    load();
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);

  const filtered = useMemo(
    () =>
      reports.filter((r) =>
        q === "" ||
        [r.reporter, r.reported, r.reason, r.listing_title].some((f) => (f ?? "").toLowerCase().includes(q.toLowerCase())),
      ),
    [reports, q],
  );
  const item = reports.find((r) => r.id === selected);

  const act = async (label: string, fn: () => Promise<void>) => {
    if (!item || !isUuid(item.id)) { toast({ title: label }); return; }
    try {
      await fn();
      toast({ title: label });
      await load();
    } catch (e: any) {
      toast({ title: "No se pudo completar", description: e?.message ?? "Error", variant: "destructive" });
    }
  };

  const markReviewing = () => act("Marcada en revisión", () => assignReport(item!.id, me ?? item!.reported_id ?? ""));
  const warnUser = () => act("Usuario advertido", () => resolveReport(item!.id, "warn", "Advertencia emitida por moderación"));
  const suspendUser = () => act("Cuenta suspendida", () => resolveReport(item!.id, "ban", item!.reason));

  return (
    <AdminLayout role={role} title="Conversaciones reportadas" breadcrumb={["Comunicaciones", "Conversaciones"]}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[calc(100vh-220px)] min-h-[500px]">
        <Card className={`lg:col-span-1 flex flex-col ${selected ? "hidden lg:flex" : "flex"}`}>
          <CardHeader className="space-y-2">
            <CardTitle className="text-base md:text-lg">Reclamos</CardTitle>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar..." className="pl-9 h-9" />
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto space-y-2">
            {filtered.map((r) => {
              const m = metaFor(r.status);
              return (
                <button
                  key={r.id}
                  onClick={() => setSelected(r.id)}
                  className={`w-full text-left p-3 border rounded-lg hover:bg-muted/50 transition ${selected === r.id ? "bg-muted border-secondary/40" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] font-mono text-muted-foreground">{r.id.slice(0, 8)}</p>
                      <p className="text-sm font-semibold truncate">{r.reporter ?? "Anónimo"} → {r.reported ?? "—"}</p>
                      <p className="text-xs text-muted-foreground truncate">{r.reason}</p>
                    </div>
                    <Badge variant="outline" className={m.color}>{m.label}</Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">{(r.created_at ?? "").slice(0, 10)}</p>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">No hay denuncias.</p>
            )}
          </CardContent>
        </Card>

        <Card className={`lg:col-span-2 flex flex-col ${selected ? "flex" : "hidden lg:flex"}`}>
          {item ? (
            <>
              <CardHeader className="border-b">
                <div className="flex items-center gap-3">
                  <Button size="icon" variant="ghost" className="lg:hidden" onClick={() => setSelected(null)}><ArrowLeft size={18} /></Button>
                  <div className="w-10 h-10 rounded-full bg-destructive/15 text-destructive flex items-center justify-center"><AlertOctagon size={18} /></div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{item.reporter ?? "Anónimo"} reportó a {item.reported ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{item.reason} · {(item.created_at ?? "").slice(0, 10)}</p>
                  </div>
                  <Badge variant="outline" className={metaFor(item.status).color}>{metaFor(item.status).label}</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto py-4 space-y-3 bg-muted/30">
                <div className="rounded-xl border bg-card p-4 space-y-2">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Detalle de la denuncia</p>
                  <p className="text-sm"><span className="text-muted-foreground">Tipo:</span> {item.target_type === "user" ? "Usuario" : "Aviso"}</p>
                  {item.listing_title && <p className="text-sm"><span className="text-muted-foreground">Aviso:</span> {item.listing_title}</p>}
                  <p className="text-sm"><span className="text-muted-foreground">Motivo:</span> {item.reason}</p>
                  {item.category && <p className="text-sm"><span className="text-muted-foreground">Categoría:</span> {item.category}</p>}
                  {item.assignee && <p className="text-sm"><span className="text-muted-foreground">Asignada a:</span> {item.assignee}</p>}
                  {item.action_taken && <p className="text-sm"><span className="text-muted-foreground">Acción tomada:</span> {item.action_taken}</p>}
                </div>
                <p className="text-[11px] text-muted-foreground text-center">
                  El historial completo de la conversación entre ambos usuarios se mostrará aquí.
                </p>
              </CardContent>
              <div className="border-t p-4 flex flex-col sm:flex-row gap-2">
                <Button variant="outline" className="flex-1" onClick={markReviewing}>Marcar en revisión</Button>
                <Button variant="outline" className="flex-1 text-warning" onClick={warnUser}>Advertir usuario</Button>
                <Button className="flex-1 bg-destructive hover:bg-destructive/90" onClick={suspendUser}>Suspender cuenta</Button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-center p-8">
              <div>
                <AlertOctagon size={40} className="mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium text-foreground">Selecciona un reclamo</p>
                <p className="text-xs text-muted-foreground">Podrás ver la conversación completa entre los usuarios.</p>
              </div>
            </div>
          )}
        </Card>
      </div>
    </AdminLayout>
  );
};

export default SuperConversations;
