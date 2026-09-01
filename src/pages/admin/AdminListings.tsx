import { useEffect, useMemo, useState } from "react";
import { imgUrl } from "@/lib/imageUrl";
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
import { Search, Eye, ChevronLeft, ChevronRight, MapPin, Calendar, Tag, User, Ban, RotateCcw, Flag,
  CalendarClock, ExternalLink, ShieldCheck, AlertTriangle, FileSpreadsheet, CheckCircle2 } from "lucide-react";
import { AdminListingStatus } from "@/data/adminMockData";
import { toast } from "@/hooks/use-toast";
import { disableListing, loadDisabled, formatPrecioAviso } from "@/lib/pricing";
import { fetchAdminListings, setListingStatus, setListingPublishedAt, fetchReports, resolveReport, type AdminListingRow, type AdminReport } from "@/lib/admin";
import { agruparPorAviso } from "@/lib/denuncias";
import { usePermissions } from "@/hooks/usePermissions";
import { fetchListingImages } from "@/lib/listings";
import { fechaHoraCorta } from "@/lib/fechas";
import { exportExcel } from "@/lib/exportReport";
import { ListingPreviewDialog } from "@/components/ListingPreviewDialog";
import { mensajeDeError } from "@/lib/errores";
import { fechaDelDia } from "@/lib/fechas";

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

/**
 * `reason` se guarda como "categoría — comentario" en un solo campo. Se parte
 * en dos sitios —el Excel y la tarjeta del panel— y por eso vive aquí: el
 * cliente pidió motivo y comentarios en COLUMNAS distintas, y en pantalla
 * repetir la categoría debajo de su propia etiqueta sobra.
 */
function partirMotivo(r: AdminReport): { motivo: string; comentario: string } {
  const corte = r.reason?.indexOf(" — ") ?? -1;
  return {
    motivo: r.category ?? (corte >= 0 ? r.reason.slice(0, corte) : r.reason ?? ""),
    comentario: corte >= 0 ? r.reason.slice(corte + 3) : "",
  };
}

/**
 * Qué hizo eFFe con la denuncia. `action_taken` guarda el código que entiende
 * la base ('remove', 'dismiss'…); al cliente hay que darle la palabra, no el
 * código: es la columna que pidió literalmente ("qué acciones realizó EFFE ante
 * ese reporte").
 */
const ACCION_DE_EFFE: Record<string, string> = {
  dismiss: "Desestimado (sin falta)",
  warn: "Anunciante advertido",
  remove: "Aviso deshabilitado",
  ban: "Cuenta suspendida",
};

/** El reporte de quienes reportan (B-10). */
function filasDeReportes(lista: AdminReport[]): Record<string, string | number>[] {
  return lista.map((r) => {
    const { motivo, comentario } = partirMotivo(r);
    return {
      "Fecha y hora": fechaHoraCorta(r.created_at),
      Documento: r.reporter_doc_number ? `${r.reporter_doc_type ?? "DNI"} ${r.reporter_doc_number}` : "",
      // Los tres estados, escritos para que se entiendan sin leyenda: "sin
      // verificar" no acusa a nadie, "no encontrado" sí.
      "Documento verificado":
        !r.reporter_doc_number ? "No se pidió"
          : r.reporter_doc_verified === true ? "Sí"
          : r.reporter_doc_verified === false ? "No encontrado"
          : "No se pudo comprobar",
      "Apellidos y nombres": r.reporter_name || r.reporter || "",
      Aviso: r.listing_title ?? "",
      "Reportes de ese aviso": r.reportes_del_aviso ?? "",
      Motivo: motivo,
      Comentarios: comentario,
      Estado: REPORT_STATUS[r.status]?.label ?? r.status,
      "Acción de eFFe": r.action_taken ? (ACCION_DE_EFFE[r.action_taken] ?? r.action_taken) : "",
      Asignado: r.assignee ?? "",
    };
  });
}

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
  // El día EN EL PERÚ. Recortar el ISO daba el día en UTC, así que un aviso
  // creado de noche aparecía fechado al día siguiente.
  date: fechaDelDia(r.created_at),
  // Mismo criterio que en la app: sin precio, "Precio a convenir".
  price: formatPrecioAviso(Number(r.price || 0), r.currency || "PEN"),
  publishedAt: r.published_at ?? null,
  expiresAt: r.expires_at ?? null,
});

// 20 filas por pantalla. Estaba en 5 y el cliente lo reportó: revisar cien
// usuarios costaba veinte clics de paginación. La lista ya viene entera del
// servidor y se corta en el navegador, así que subirlo no cuesta consultas.
const PAGE_SIZE = 20;

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
  // `reportIds` solo viene cuando se deshabilita desde la pestaña "Reportados":
  // en ese caso, además de bajar el aviso, se cierran TODAS sus denuncias
  // abiertas (IT3-020). Antes se cerraba solo aquella en la que se pulsó, y las
  // demás del mismo aviso quedaban "Pendiente" con el aviso ya deshabilitado.
  const [disableTarget, setDisableTarget] = useState<{ id: string; title: string; advertiser: string; reportIds?: string[] } | null>(null);
  const [disableReason, setDisableReason] = useState("");
  const [reports, setReports] = useState<AdminReport[]>([]);
  // Filtro por estado de la pestaña "Reportados". Los resueltos NO se ocultan
  // (el admin decide qué ver); por defecto se muestran todos.
  const [reportStatus, setReportStatus] = useState<string>("all");
  const visibleReports = reportStatus === "all" ? reports : reports.filter((r) => r.status === reportStatus);
  // La chapa de la pestaña cuenta lo que queda POR MIRAR. Contando también los
  // resueltos nunca bajaba: hoy hay 21 denuncias de avisos y 8 ya cerradas, así
  // que decía 21 para siempre y dejaba de significar nada.
  const reportsPendientes = reports.filter((r) => r.status !== "resolved").length;
  const gruposDenunciados = agruparPorAviso(visibleReports);
  // Cerrar una denuncia infundada. Sin esto, la única salida era deshabilitar el
  // aviso: un aviso legítimo denunciado por despecho se quedaba "Pendiente" para
  // siempre, y "anulado" —uno de los estados que pidió el cliente— no existía.
  const [dismissTarget, setDismissTarget] = useState<{ ids: string[]; title: string } | null>(null);
  const [dismissNote, setDismissNote] = useState("");
  // Grupos con la lista larga desplegada. Se pliega a partir de la tercera:
  // nueve denuncias seguidas entierran el resto de avisos denunciados.
  const [gruposAbiertos, setGruposAbiertos] = useState<Record<string, boolean>>({});
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
  // Las denuncias contra personas se moderan en "Usuarios reportados".
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
        // Deshabilitar desde "Reportados" cierra la denuncia en la BD. Antes el
        // "resuelto" era solo visual (se deducía del estado del aviso), así que
        // volvía a "pendiente" al rehabilitarlo (IT3-020). El id se comprueba
        // porque `fetchReports` cae a datos de ejemplo si el RPC falla.
        // Son N llamadas, una por denuncia. Si alguna falla, el aviso YA está
        // bajado: callarlo dejaría denuncias abiertas sobre un aviso caído y
        // nadie sabría cuáles. Así que se cuentan y se dicen.
        const ids = (disableTarget.reportIds ?? []).filter(isUuid);
        if (ids.length) {
          const fallos = await cerrarDenuncias(ids, "remove", reason);
          if (fallos.length) {
            toast({
              title: fallos.length === ids.length
                ? "Aviso deshabilitado, pero las denuncias siguen abiertas"
                : `Aviso deshabilitado; ${fallos.length} de ${ids.length} denuncias siguen abiertas`,
              description: mensajeDeError(fallos[0], "Vuelve a intentarlo desde la pestaña Reportados."),
              variant: "destructive",
            });
          }
        }
        await Promise.all([load(), loadReportedListings()]);
      } else {
        // Dato mock (sin backend): conserva el comportamiento local.
        disableListing(disableTarget.id, reason);
        setDisabled(loadDisabled());
      }
      toast({
        title: "Aviso deshabilitado",
        description: `Notificación enviada a ${disableTarget.advertiser}: "${reason}"`,
      });
    } catch (e) {
      toast({ title: "No se pudo deshabilitar", description: mensajeDeError(e, "Error"), variant: "destructive" });
    }
    setDisableTarget(null);
    setDisableReason("");
  };

  /**
   * Cierra varias denuncias y devuelve los errores de las que no pudieron.
   *
   * Se cierran una a una y NO se corta al primer fallo: si la tercera falla, las
   * otras cuatro ya están resueltas y volver a intentarlas todas no estropea
   * nada (`admin_resolve_report` vuelve a poner el mismo estado). Cortar dejaría
   * un lote a medias sin decir por dónde se quedó.
   */
  const cerrarDenuncias = async (
    ids: string[], accion: "remove" | "dismiss", nota: string,
  ): Promise<unknown[]> => {
    const fallos: unknown[] = [];
    for (const id of ids) {
      try { await resolveReport(id, accion, nota); } catch (e) { fallos.push(e); }
    }
    return fallos;
  };

  // Cierra las denuncias sin tocar el aviso: se revisaron y no había falta.
  const confirmDismiss = async () => {
    if (!dismissTarget) return;
    const nota = dismissNote.trim() || "Revisado: no se encontró incumplimiento.";
    const ids = dismissTarget.ids.filter(isUuid);
    if (!ids.length) {
      toast({ title: "Denuncia de ejemplo: no hay nada que cerrar." });
      setDismissTarget(null); setDismissNote("");
      return;
    }
    const fallos = await cerrarDenuncias(ids, "dismiss", nota);
    await loadReportedListings();
    if (fallos.length) {
      toast({
        title: `No se pudieron cerrar ${fallos.length} de ${ids.length}`,
        description: mensajeDeError(fallos[0], "Error"),
        variant: "destructive",
      });
    } else {
      toast({
        title: ids.length === 1 ? "Denuncia desestimada" : `${ids.length} denuncias desestimadas`,
        description: `"${dismissTarget.title}" queda como está.`,
      });
    }
    setDismissTarget(null);
    setDismissNote("");
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
      // Rehabilitar NO reabre la denuncia: una vez revisada queda resuelta, y su
      // historial no debe depender de si el aviso vuelve a estar visible.
      await setListingStatus(l.id, "active");
      await Promise.all([load(), loadReportedListings()]);
      toast({ title: "Aviso habilitado", description: `"${l.title}" vuelve a estar visible.` });
    } catch (e) {
      toast({ title: "No se pudo habilitar", description: mensajeDeError(e, "Error"), variant: "destructive" });
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
    } catch (e) {
      toast({ title: "No se pudo actualizar", description: mensajeDeError(e, "Error"), variant: "destructive" });
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
            Reportados {reportsPendientes > 0 && <Badge variant="outline" className="text-destructive border-destructive/30 bg-destructive/10 ml-1">{reportsPendientes}</Badge>}
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
                              {/* Abre el aviso PÚBLICO (/aviso/:id) en otra pestaña.
                                  Antes solo existía el preview interno (IT2-041).
                                  Solo para avisos reales (UUID), no los de demo. */}
                              {isUuid(l.id) && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  title="Ver aviso público"
                                  onClick={() => window.open(`/aviso/${l.id}`, "_blank", "noopener")}
                                >
                                  <ExternalLink size={16} />
                                </Button>
                              )}
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
                <div className="flex items-center gap-2">
                {reports.length > 0 && (
                  <Button
                    variant="outline" size="sm" className="gap-2"
                    onClick={() => exportExcel(
                      `reportes-de-avisos-${new Date().toISOString().slice(0, 10)}`,
                      // Lo FILTRADO, no la pantalla: es el fallo B-19, y aquí
                      // habría vuelto a aparecer.
                      filasDeReportes(visibleReports),
                      "Reportes de avisos",
                    )}
                  >
                    <FileSpreadsheet size={14} /> Excel
                  </Button>
                )}
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
              </div>
            </CardHeader>
            <CardContent>
              {reports.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No hay avisos reportados.</p>
              ) : visibleReports.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No hay reportes con ese estado.</p>
              ) : (
                <div className="space-y-3">
                  {gruposDenunciados.map((g) => {
                    const rowMatch = rows.find((x) => x.id === g.listingId);
                    const isDisabled = rowMatch?.status === "Rechazado" || !!disabled[g.listingId ?? ""];
                    // A partir de la tercera se pliega: nueve denuncias seguidas
                    // entierran el resto de avisos denunciados.
                    const desplegado = !!gruposAbiertos[g.clave];
                    const aLaVista = desplegado ? g.denuncias : g.denuncias.slice(0, 3);
                    const ocultas = g.denuncias.length - aLaVista.length;
                    const puedeCerrar = canModerate && g.abiertas.length > 0;
                    return (
                      <div key={g.clave} className="border bg-card">
                        {/* ---- El aviso: aquí se decide ---- */}
                        <div className="p-4 flex items-start justify-between gap-3 flex-wrap border-b bg-muted/30">
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-foreground text-sm">{g.titulo}</p>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              {/* Lo primero que hay que saber es cuántas quedan
                                  por mirar, no cuántas hubo. */}
                              {g.abiertas.length > 0 ? (
                                <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/30">
                                  {g.abiertas.length} sin cerrar
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="bg-success/15 text-success border-success/30">
                                  Todas resueltas
                                </Badge>
                              )}
                              {g.total > g.abiertas.length && (
                                <Badge variant="outline">{g.total} en total</Badge>
                              )}
                              {isDisabled && (
                                <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/30">
                                  Aviso deshabilitado
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col gap-2">
                            {/* Sin esto hay que decidir si deshabilitar un aviso sin haberlo visto. */}
                            {g.listingId && (
                              <Button size="sm" variant="outline" className="gap-1" onClick={() => setReportado(g.denuncias[0])}>
                                <Eye size={14} /> Ver aviso
                              </Button>
                            )}
                            {!isDisabled && puedeCerrar && (
                              <Button size="sm" variant="outline" className="text-destructive gap-1"
                                onClick={() => setDisableTarget({
                                  id: g.listingId ?? "", title: g.titulo,
                                  advertiser: g.denuncias[0].reported ?? "Anunciante",
                                  // TODAS las abiertas: bajar el aviso y dejar
                                  // denuncias suyas en "Pendiente" no tiene sentido.
                                  reportIds: g.abiertas.map((r) => r.id),
                                })}>
                                <Ban size={14} /> Deshabilitar
                              </Button>
                            )}
                            {/* La otra mitad de moderar: decir que no había nada.
                                No toca el aviso ni avisa al anunciante. */}
                            {puedeCerrar && (
                              <Button size="sm" variant="ghost" className="gap-1"
                                onClick={() => setDismissTarget({ ids: g.abiertas.map((r) => r.id), title: g.titulo })}>
                                <CheckCircle2 size={14} />
                                {g.abiertas.length === 1 ? "Desestimar" : "Desestimar todas"}
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* ---- Las denuncias: cada una es un registro aparte ---- */}
                        <ul className="divide-y">
                          {aLaVista.map((r) => {
                            const st = REPORT_STATUS[r.status] ?? { label: r.status, cls: "" };
                            const { comentario } = partirMotivo(r);
                            return (
                              <li key={r.id} className="p-4 flex items-start justify-between gap-3 flex-wrap">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {r.category && <Badge variant="outline">{r.category}</Badge>}
                                    <Badge variant="outline" className={st.cls}>{st.label}</Badge>
                                  </div>
                                  {/* La categoría ya está en la etiqueta de arriba;
                                      repetirla dejaba "Motivo: Publicación duplicada
                                      o spam — Publicación duplicada o spam". Lo que
                                      aporta es el comentario. */}
                                  {comentario ? (
                                    <p className="text-sm text-foreground mt-2">
                                      <span className="text-muted-foreground">Comentario:</span> {comentario}
                                    </p>
                                  ) : (
                                    <p className="text-sm text-muted-foreground mt-2 italic">Sin comentario.</p>
                                  )}
                                  {/* Lo que ya se hizo con la denuncia. Sin esto, una
                                      cerrada se lee igual que una sin tocar. */}
                                  {r.action_taken && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                      Acción de eFFe: <b>{ACCION_DE_EFFE[r.action_taken] ?? r.action_taken}</b>
                                    </p>
                                  )}
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Reportado por <b>{r.reporter_name || r.reporter || "Usuario"}</b>
                                    {r.reporter_doc_number && (
                                      <> · {r.reporter_doc_type ?? "DNI"} {r.reporter_doc_number}</>
                                    )}
                                    {" · "}{fechaHoraCorta(r.created_at)}
                                  </p>
                                  {/* B-10. Los tres estados se dicen distinto a propósito:
                                      "sin verificar" es que el registro no respondió, y no
                                      acusa a nadie; "no encontrado" sí. Antes de la 0136 no
                                      se pedía documento, y esas denuncias no muestran nada. */}
                                  {r.reporter_doc_number && (
                                    r.reporter_doc_verified === true ? (
                                      <p className="text-xs text-success mt-0.5 flex items-center gap-1">
                                        <ShieldCheck size={12} /> Documento verificado
                                      </p>
                                    ) : r.reporter_doc_verified === false ? (
                                      <p className="text-xs text-destructive mt-0.5 flex items-center gap-1">
                                        <AlertTriangle size={12} /> El documento no se encontró en el registro
                                      </p>
                                    ) : (
                                      <p className="text-xs text-warning mt-0.5 flex items-center gap-1">
                                        <AlertTriangle size={12} /> No se pudo verificar el documento
                                      </p>
                                    )
                                  )}
                                </div>
                                {/* Suelto, y solo cuando hay más de una abierta: de tres
                                    denuncias a un aviso, dos pueden ser ciertas y una
                                    despecho. Con una sola, el botón de la cabecera ya
                                    hace esto mismo y repetirlo confunde. */}
                                {canModerate && r.status !== "resolved" && g.abiertas.length > 1 && (
                                  <Button size="sm" variant="ghost" className="gap-1 shrink-0"
                                    onClick={() => setDismissTarget({ ids: [r.id], title: g.titulo })}>
                                    <CheckCircle2 size={14} /> Desestimar esta
                                  </Button>
                                )}
                              </li>
                            );
                          })}
                        </ul>

                        {(ocultas > 0 || desplegado) && (
                          <button
                            type="button"
                            className="w-full text-xs text-muted-foreground hover:text-foreground py-2 border-t"
                            onClick={() => setGruposAbiertos((a) => ({ ...a, [g.clave]: !desplegado }))}
                          >
                            {ocultas > 0 ? `Ver las otras ${ocultas} denuncias` : "Ver menos"}
                          </button>
                        )}
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
        <DialogContent className="max-w-2xl overflow-y-auto">
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
                  <img src={imgUrl(detailImg, 600)} alt={detail.title} className="w-full h-full object-cover" loading="lazy" decoding="async" />
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

      {/* Desestimar la denuncia: se revisó y el aviso se queda. */}
      <Dialog open={!!dismissTarget} onOpenChange={(o) => { if (!o) { setDismissTarget(null); setDismissNote(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Desestimar denuncia</DialogTitle>
            <DialogDescription>
              "{dismissTarget?.title}" <b>no</b> se toca y el anunciante no recibe ninguna notificación.
              La denuncia queda cerrada.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Motivo (queda en el reporte de denuncias)</Label>
            <Textarea
              rows={3}
              value={dismissNote}
              onChange={(e) => setDismissNote(e.target.value)}
              placeholder="Ej: el precio del aviso es correcto; la denuncia no describe ningún incumplimiento…"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setDismissTarget(null); setDismissNote(""); }}>Cancelar</Button>
            <Button onClick={confirmDismiss} className="gap-2">
              <CheckCircle2 size={14} /> Desestimar
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
