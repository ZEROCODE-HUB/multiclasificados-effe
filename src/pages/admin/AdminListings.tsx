import { useEffect, useMemo, useState } from "react";
import { AdminRole } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Search, Eye, ChevronLeft, ChevronRight, MapPin, Calendar, Tag, User, Ban, RotateCcw, Flag, CalendarClock } from "lucide-react";
import { AdminListingStatus } from "@/data/adminMockData";
import { toast } from "@/hooks/use-toast";
import { disableListing, loadDisabled } from "@/lib/pricing";
import { fetchAdminListings, setListingStatus, setListingPublishedAt, fetchReports, type AdminListingRow, type AdminReport } from "@/lib/admin";
import { usePermissions } from "@/hooks/usePermissions";
import { fetchListingImages } from "@/lib/listings";
import { ListingPreviewDialog } from "@/components/ListingPreviewDialog";

const statusColor: Record<AdminListingStatus, string> = {
  Pendiente: "bg-warning/15 text-warning border-warning/30",
  Activo: "bg-success/15 text-success border-success/30",
  Rechazado: "bg-destructive/15 text-destructive border-destructive/30",
  Destacado: "bg-secondary/15 text-secondary border-secondary/30",
  // "Vencido" = caducado por tiempo (distinto de "Deshabilitado" por moderación).
  Vencido: "bg-muted text-muted-foreground border-border",
};

// Estado de una denuncia (tabla `reports`): etiqueta y color para la pestaña "Reportados".
const REPORT_STATUS: Record<string, { label: string; cls: string }> = {
  open: { label: "Pendiente", cls: "bg-warning/15 text-warning border-warning/30" },
  reviewing: { label: "En revisión", cls: "bg-secondary/15 text-secondary border-secondary/30" },
  resolved: { label: "Resuelto", cls: "bg-success/15 text-success border-success/30" },
};

// Forma que consume el diseño (igual que el mock original), derivada del dato real.
interface Listing {
  id: string; title: string; advertiser: string; category: string;
  status: AdminListingStatus; date: string; price: string;
  publishedAt: string | null; expiresAt: string | null;
}

const isUuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

// Estado real (BD) + featured -> etiqueta del diseño.
// "expired" (caducado por tiempo) tiene su propia etiqueta "Vencido", y gana
// sobre "Destacado": un aviso vencido ya no está activo aunque siga marcado.
const toDisplayStatus = (r: AdminListingRow): AdminListingStatus =>
  r.status === "expired" ? "Vencido"
  : r.status === "rejected" || r.status === "paused" ? "Rechazado"
  : r.featured ? "Destacado"
  : r.status === "pending" ? "Pendiente"
  : "Activo";

const mapRow = (r: AdminListingRow): Listing => ({
  id: r.id, title: r.title, advertiser: r.advertiser ?? "Anunciante",
  category: r.category_id, status: toDisplayStatus(r),
  date: (r.created_at ?? "").slice(0, 10),
  price: `${r.currency || "PEN"} ${Number(r.price || 0).toLocaleString()}`,
  publishedAt: r.published_at ?? null,
  expiresAt: r.expires_at ?? null,
});

const PAGE_SIZE = 5;

const DAY_MS = 86_400_000;

// ISO (UTC) -> valor para <input type="datetime-local"> (hora LOCAL, sin zona).
const toLocalInput = (iso: string | null): string => {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// Duración configurada del aviso (ms) a partir de sus fechas; 30 días si faltan.
const listingDurationMs = (l: Listing): number =>
  l.publishedAt && l.expiresAt
    ? Math.max(0, new Date(l.expiresAt).getTime() - new Date(l.publishedAt).getTime())
    : 30 * DAY_MS;

const AdminListings = ({ role }: { role: AdminRole }) => {
  // Matriz de permisos: habilitar/deshabilitar avisos requiere can_edit (solo aplica al rol admin).
  const { can } = usePermissions(role === "admin");
  const canModerate = can("Gestión de avisos", "edit");
  // Herramienta de PRUEBA: cambiar fecha de publicación. Solo para superadmin.
  const isSuperadmin = role === "superadmin";
  const [rows, setRows] = useState<Listing[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<Listing | null>(null);
  const [disableTarget, setDisableTarget] = useState<{ id: string; title: string; advertiser: string } | null>(null);
  const [disableReason, setDisableReason] = useState("");
  const [reports, setReports] = useState<AdminReport[]>([]);
  // Filtro por estado de la pestaña "Reportados". Los resueltos NO se ocultan
  // (el admin decide qué ver); por defecto se muestran todos.
  const [reportStatus, setReportStatus] = useState<string>("all");
  const visibleReports = reportStatus === "all" ? reports : reports.filter((r) => r.status === reportStatus);
  // Aviso denunciado que se está inspeccionando desde la pestaña "Reportados".
  const [reportado, setReportado] = useState<AdminReport | null>(null);
  const [disabled, setDisabled] = useState<Record<string, string>>(() => loadDisabled());
  const [detailImg, setDetailImg] = useState<string | null>(null);
  const [imgLoading, setImgLoading] = useState(false);
  // Diálogo "cambiar fecha de publicación" (prueba de caducidad).
  const [dateTarget, setDateTarget] = useState<Listing | null>(null);
  const [dateValue, setDateValue] = useState("");
  const [savingDate, setSavingDate] = useState(false);

  const load = () => fetchAdminListings().then(({ data }) => setRows(data.map(mapRow)));
  // Avisos reportados REALES desde la BD (tabla `reports`), solo target_type "listing".
  // Los reportes de usuarios se gestionan en "Reclamos / Moderación".
  const loadReportedListings = () =>
    fetchReports().then(({ data }) => setReports(data.filter((r) => r.target_type === "listing")));
  useEffect(() => {
    load();
    loadReportedListings();
    setDisabled(loadDisabled());
  }, []);

  // Al abrir "Ver", carga la imagen principal real del aviso.
  useEffect(() => {
    if (!detail) { setDetailImg(null); return; }
    setImgLoading(true);
    let active = true;
    fetchListingImages(detail.id).then((imgs) => {
      if (active) { setDetailImg(imgs[0] ?? null); setImgLoading(false); }
    });
    return () => { active = false; };
  }, [detail]);

  const filtered = useMemo(
    () =>
      rows.filter((l) =>
        (filter === "all" || l.status === filter) &&
        (q === "" || l.title.toLowerCase().includes(q.toLowerCase()) || l.advertiser.toLowerCase().includes(q.toLowerCase())),
      ),
    [rows, q, filter],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const list = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const confirmDisable = async () => {
    if (!disableTarget || !disableReason.trim()) return;
    const reason = disableReason.trim();
    try {
      if (isUuid(disableTarget.id)) {
        await setListingStatus(disableTarget.id, "rejected", reason);
        await load();
      } else {
        // Dato mock (sin backend): conserva el comportamiento local.
        disableListing(disableTarget.id, reason);
        setDisabled(loadDisabled());
      }
      toast({
        title: "Aviso deshabilitado",
        description: `Notificación enviada a ${disableTarget.advertiser}: "${reason}"`,
      });
    } catch (e: any) {
      toast({ title: "No se pudo deshabilitar", description: e?.message ?? "Error", variant: "destructive" });
    }
    setDisableTarget(null);
    setDisableReason("");
  };

  // Vuelve a publicar un aviso deshabilitado (status -> active).
  const enableListing = async (l: Listing) => {
    if (!isUuid(l.id)) {
      // Dato mock: limpia el flag local.
      const next = { ...loadDisabled() }; delete next[l.id];
      try { localStorage.setItem("effe_disabled", JSON.stringify(next)); } catch { /* noop */ }
      setDisabled(next);
      toast({ title: "Aviso habilitado", description: l.title });
      return;
    }
    try {
      await setListingStatus(l.id, "active");
      await load();
      toast({ title: "Aviso habilitado", description: `"${l.title}" vuelve a estar visible.` });
    } catch (e: any) {
      toast({ title: "No se pudo habilitar", description: e?.message ?? "Error", variant: "destructive" });
    }
  };

  // Abre el diálogo de fecha, prefijando la fecha de publicación actual.
  const openDateDialog = (l: Listing) => {
    setDateTarget(l);
    setDateValue(toLocalInput(l.publishedAt ?? (l.date ? `${l.date}T00:00:00` : null)));
  };

  // Vigencia resultante con la fecha elegida (conservando la duración del aviso).
  const previewExpiry = useMemo(() => {
    if (!dateTarget || !dateValue) return null;
    const published = new Date(dateValue);
    if (isNaN(published.getTime())) return null;
    const expiry = new Date(published.getTime() + listingDurationMs(dateTarget));
    return { expiry, expired: expiry.getTime() < Date.now() };
  }, [dateTarget, dateValue]);

  // Preset: dejar el aviso ya vencido (publicación = ahora - duración - 1 min).
  const setExpireNow = () => {
    if (!dateTarget) return;
    const published = new Date(Date.now() - listingDurationMs(dateTarget) - 60_000);
    setDateValue(toLocalInput(published.toISOString()));
  };

  const confirmDate = async () => {
    if (!dateTarget || !dateValue) return;
    const published = new Date(dateValue);
    if (isNaN(published.getTime())) {
      toast({ title: "Fecha inválida", variant: "destructive" });
      return;
    }
    setSavingDate(true);
    try {
      await setListingPublishedAt(dateTarget.id, published.toISOString());
      await load();
      toast({
        title: "Fecha de publicación actualizada",
        description: previewExpiry?.expired
          ? `"${dateTarget.title}" quedó Vencido y dejará de mostrarse.`
          : `"${dateTarget.title}" vence el ${previewExpiry?.expiry.toLocaleString("es-PE")}.`,
      });
      setDateTarget(null);
      setDateValue("");
    } catch (e: any) {
      toast({ title: "No se pudo actualizar", description: e?.message ?? "Error", variant: "destructive" });
    } finally {
      setSavingDate(false);
    }
  };

  return (
    <>
      <Tabs defaultValue="todos">
        <TabsList>
          <TabsTrigger value="todos">Todos los avisos</TabsTrigger>
          <TabsTrigger value="reportados" className="gap-1.5">
            Reportados {reports.length > 0 && <Badge variant="outline" className="text-destructive border-destructive/30 bg-destructive/10 ml-1">{reports.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="todos" className="pt-4">
          <Card>
            <CardHeader className="space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <CardTitle className="text-base md:text-lg">Listado de avisos</CardTitle>
                <p className="text-xs text-muted-foreground">{filtered.length} resultados</p>
              </div>
              <div className="flex flex-col md:flex-row gap-3">
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Buscar por nombre o anunciante..." className="pl-9" />
                </div>
                <Select value={filter} onValueChange={(v) => { setFilter(v); setPage(1); }}>
                  <SelectTrigger className="md:w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los estados</SelectItem>
                    <SelectItem value="Activo">Activos</SelectItem>
                    <SelectItem value="Destacado">Destacados</SelectItem>
                    <SelectItem value="Pendiente">Pendientes</SelectItem>
                    <SelectItem value="Rechazado">Deshabilitados</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {/* Desktop table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre del aviso</TableHead>
                      <TableHead>Anunciante</TableHead>
                      <TableHead>Categoría</TableHead>
                      <TableHead>Precio</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.map((l) => {
                      const isDisabled = l.status === "Rechazado" || !!disabled[l.id];
                      return (
                        <TableRow key={l.id}>
                          <TableCell className="font-medium">{l.title}</TableCell>
                          <TableCell className="text-muted-foreground">{l.advertiser}</TableCell>
                          <TableCell><Badge variant="outline">{l.category}</Badge></TableCell>
                          <TableCell className="font-semibold">{l.price}</TableCell>
                          <TableCell>
                            {isDisabled ? (
                              <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/30">Deshabilitado</Badge>
                            ) : (
                              <Badge className={statusColor[l.status]} variant="outline">{l.status}</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="icon" variant="ghost" title="Ver detalle" onClick={() => setDetail(l)}>
                                <Eye size={16} />
                              </Button>
                              {isSuperadmin && isUuid(l.id) && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="text-secondary"
                                  title="Cambiar fecha de publicación (prueba de caducidad)"
                                  onClick={() => openDateDialog(l)}
                                >
                                  <CalendarClock size={16} />
                                </Button>
                              )}
                              {canModerate && (isDisabled ? (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="text-success"
                                  title="Habilitar"
                                  onClick={() => enableListing(l)}
                                >
                                  <RotateCcw size={16} />
                                </Button>
                              ) : (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="text-destructive"
                                title="Deshabilitar"
                                onClick={() => setDisableTarget({ id: l.id, title: l.title, advertiser: l.advertiser })}
                              >
                                <Ban size={16} />
                              </Button>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                {list.map((l) => {
                  const isDisabled = l.status === "Rechazado" || !!disabled[l.id];
                  return (
                    <div key={l.id} className="border p-4 bg-card listing-shadow">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground text-sm truncate">{l.title}</p>
                          <p className="text-xs text-muted-foreground">{l.advertiser}</p>
                        </div>
                        {isDisabled ? (
                          <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/30">Deshabilitado</Badge>
                        ) : (
                          <Badge className={statusColor[l.status]} variant="outline">{l.status}</Badge>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
                        <Badge variant="outline">{l.category}</Badge>
                        <span className="font-bold text-foreground">{l.price}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => setDetail(l)}><Eye size={14} /> Ver</Button>
                        {canModerate && (isDisabled ? (
                          <Button size="sm" variant="outline" className="text-success" onClick={() => enableListing(l)}>
                            <RotateCcw size={14} /> Habilitar
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" className="text-destructive"
                            onClick={() => setDisableTarget({ id: l.id, title: l.title, advertiser: l.advertiser })}>
                            <Ban size={14} /> Deshabilitar
                          </Button>
                        ))}
                      </div>
                      {isSuperadmin && isUuid(l.id) && (
                        <Button size="sm" variant="outline" className="text-secondary w-full mt-1.5"
                          onClick={() => openDateDialog(l)}>
                          <CalendarClock size={14} /> Cambiar fecha (prueba)
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>

              {filtered.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <p className="text-sm">Sin resultados.</p>
                </div>
              )}

              {filtered.length > 0 && (
                <div className="flex items-center justify-between mt-5 pt-4 border-t">
                  <p className="text-xs text-muted-foreground">Página {page} de {totalPages}</p>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                      <ChevronLeft size={14} /> Anterior
                    </Button>
                    <Button size="sm" variant="outline" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
                      Siguiente <ChevronRight size={14} />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reportados" className="pt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <CardTitle className="text-base md:text-lg flex items-center gap-2">
                  <Flag size={16} className="text-destructive" /> Avisos reportados
                </CardTitle>
                {reports.length > 0 && (
                  <Select value={reportStatus} onValueChange={setReportStatus}>
                    <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los estados</SelectItem>
                      {Object.entries(REPORT_STATUS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {reports.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No hay avisos reportados.</p>
              ) : visibleReports.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No hay reportes con ese estado.</p>
              ) : (
                <div className="space-y-3">
                  {visibleReports.map((r) => {
                    const rowMatch = rows.find((x) => x.id === r.listing_id);
                    const isDisabled = rowMatch?.status === "Rechazado" || !!disabled[r.listing_id ?? ""];
                    const st = REPORT_STATUS[r.status] ?? { label: r.status, cls: "" };
                    return (
                      <div key={r.id} className="border p-4 bg-card">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-foreground text-sm">{r.listing_title ?? "Aviso"}</p>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              {r.category && <Badge variant="outline">{r.category}</Badge>}
                              <Badge variant="outline" className={st.cls}>{st.label}</Badge>
                            </div>
                            <p className="text-sm text-foreground mt-2"><span className="text-muted-foreground">Motivo:</span> {r.reason}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Reportado por <b>{r.reporter ?? "Usuario"}</b> · {new Date(r.created_at).toLocaleString("es-PE")}
                            </p>
                          </div>
                          <div className="flex flex-col gap-2">
                            {/* Sin esto hay que decidir si deshabilitar un aviso sin haberlo visto. */}
                            {r.listing_id && (
                              <Button size="sm" variant="outline" className="gap-1" onClick={() => setReportado(r)}>
                                <Eye size={14} /> Ver aviso
                              </Button>
                            )}
                            {isDisabled ? (
                              <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/30">Deshabilitado</Badge>
                            ) : canModerate && (
                              <Button size="sm" variant="outline" className="text-destructive gap-1"
                                onClick={() => setDisableTarget({ id: r.listing_id ?? "", title: r.listing_title ?? "Aviso", advertiser: r.reported ?? "Anunciante" })}>
                                <Ban size={14} /> Deshabilitar
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Aviso denunciado, con su descripción e imágenes (admin_get_listing). */}
      <ListingPreviewDialog
        listingId={reportado?.listing_id ?? null}
        reason={reportado?.reason}
        fallbackTitle={reportado?.listing_title}
        onClose={() => setReportado(null)}
      />

      {/* Detail dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <DialogTitle className="text-lg md:text-xl">{detail.title}</DialogTitle>
                    <DialogDescription>{detail.advertiser}</DialogDescription>
                  </div>
                  <Badge className={statusColor[detail.status]} variant="outline">{detail.status}</Badge>
                </div>
              </DialogHeader>
              <div className="aspect-video bg-muted border rounded-lg overflow-hidden flex items-center justify-center text-muted-foreground text-xs">
                {imgLoading ? (
                  "Cargando imagen…"
                ) : detailImg ? (
                  <img src={detailImg} alt={detail.title} className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  "Este aviso no tiene imagen"
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2"><Tag size={14} className="text-secondary" /><span className="text-muted-foreground">Categoría:</span><span className="font-medium">{detail.category}</span></div>
                <div className="flex items-center gap-2"><Calendar size={14} className="text-secondary" /><span className="text-muted-foreground">Publicado:</span><span className="font-medium">{detail.date}</span></div>
                <div className="flex items-center gap-2"><User size={14} className="text-secondary" /><span className="text-muted-foreground">Anunciante:</span><span className="font-medium">{detail.advertiser}</span></div>
                <div className="flex items-center gap-2"><MapPin size={14} className="text-secondary" /><span className="text-muted-foreground">Ubicación:</span><span className="font-medium">Lima, Perú</span></div>
              </div>
              <div className="flex items-center justify-between border-t pt-3">
                <p className="text-2xl font-extrabold text-secondary">{detail.price}</p>
                <Button variant="outline" onClick={() => setDetail(null)}>Cerrar</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Disable dialog */}
      <Dialog open={!!disableTarget} onOpenChange={(o) => { if (!o) { setDisableTarget(null); setDisableReason(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Deshabilitar aviso</DialogTitle>
            <DialogDescription>
              "{disableTarget?.title}" dejará de ser visible. El anunciante recibirá una notificación con el motivo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Motivo</Label>
            <Textarea
              rows={4}
              value={disableReason}
              onChange={(e) => setDisableReason(e.target.value)}
              placeholder="Ej: contenido engañoso, viola políticas de la plataforma…"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setDisableTarget(null); setDisableReason(""); }}>Cancelar</Button>
            <Button onClick={confirmDisable} disabled={!disableReason.trim()} className="gap-2">
              <Ban size={14} /> Deshabilitar y notificar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cambiar fecha de publicación — herramienta de PRUEBA de caducidad (superadmin). */}
      <Dialog open={!!dateTarget} onOpenChange={(o) => { if (!o) { setDateTarget(null); setDateValue(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock size={18} className="text-secondary" /> Cambiar fecha de publicación
            </DialogTitle>
            <DialogDescription>
              Prueba de caducidad para <b>"{dateTarget?.title}"</b>. Se conserva la duración
              del aviso y se recalcula el vencimiento; si la nueva vigencia ya pasó, quedará
              <b> Vencido</b> al instante.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pub-date">Nueva fecha y hora de publicación</Label>
              <Input
                id="pub-date"
                type="datetime-local"
                value={dateValue}
                onChange={(e) => setDateValue(e.target.value)}
              />
            </div>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={setExpireNow}>
              <CalendarClock size={14} /> Simular vencimiento (dejar ya vencido)
            </Button>
            {previewExpiry && (
              <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Vence:</span>
                  <span className="font-medium">{previewExpiry.expiry.toLocaleString("es-PE")}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Estado resultante:</span>
                  {previewExpiry.expired ? (
                    <Badge variant="outline" className={statusColor.Vencido}>Vencido</Badge>
                  ) : (
                    <Badge variant="outline" className={statusColor.Activo}>Activo</Badge>
                  )}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setDateTarget(null); setDateValue(""); }}>Cancelar</Button>
            <Button onClick={confirmDate} disabled={!dateValue || savingDate} className="gap-2">
              <CalendarClock size={14} /> {savingDate ? "Guardando…" : "Aplicar fecha"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AdminListings;
