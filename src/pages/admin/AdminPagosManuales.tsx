// Bandeja de pagos por Yape y Plin, y la configuración de a dónde se paga.
//
// Aquí un pago se aprueba o se rechaza, y aprobarlo hace exactamente lo mismo
// que haría la pasarela: acredita el saldo, emite la boleta y —si la compra
// venía de "pagar y publicar"— publica el aviso. Por eso la pantalla enseña
// siempre qué es cada pago: no es lo mismo aprobar una recarga de saldo que
// aprobar la publicación de un aviso que lleva horas esperando.
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminRole } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TablePagination } from "@/components/TablePagination";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Search, Check, X, Loader2, Plus, Trash2, Save, Smartphone, ExternalLink, AlertCircle,
  QrCode, Upload,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { formatSoles } from "@/lib/pricing";
import { mensajeDeError } from "@/lib/errores";
import { fetchSettings, subirQrDePago, borrarQrDePago, motivoQrInvalido, QR_PAGO_TIPOS } from "@/lib/admin";
import {
  fetchPagosManuales, aprobarPagoManual, rechazarPagoManual,
  guardarConfigYapePlin, normalizarConfig, codigoDePago,
  NOMBRE_MEDIO, MEDIOS_MANUALES, CONFIG_VACIA, PAGOS_MANUALES_PAGE_SIZE,
  type ConfigYapePlin, type CuentaManual, type MedioManual, type PagoManual,
} from "@/lib/pagoManual";
import { EVENTO_PAGOS_REVISADOS } from "@/hooks/usePagosManualesPendientes";

const ESTADOS: { value: string; label: string }[] = [
  { value: "pending", label: "Por revisar" },
  { value: "paid", label: "Aprobados" },
  { value: "failed", label: "Rechazados" },
  { value: "all", label: "Todos" },
];

const fecha = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("es-PE", {
        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
      })
    : "—";

/** Qué compró: lo que decide si aprobar publica un aviso o solo da saldo. */
function Concepto({ p }: { p: PagoManual }) {
  if (p.proposito === "publish" || p.proposito === "renew") {
    return (
      <div className="min-w-0">
        <p className="text-xs font-semibold text-secondary uppercase tracking-wider">
          {p.proposito === "renew" ? "Renovar aviso" : "Publicar aviso"}
        </p>
        <p className="text-sm truncate">{p.listingTitle ?? "Aviso"}</p>
      </div>
    );
  }
  return <p className="text-sm">{p.detalle}</p>;
}

/** Diálogo de aprobación, con el importe corregible. */
function AprobarDialog({ pago, onHecho }: { pago: PagoManual; onHecho: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [monto, setMonto] = useState(String(pago.total));
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (abierto) { setMonto(String(pago.total)); setNota(""); }
  }, [abierto, pago.total]);

  const montoNum = Number(monto);
  const valido = Number.isFinite(montoNum) && montoNum > 0;
  const corregido = valido && Math.abs(montoNum - pago.total) > 0.005;
  const publica = pago.proposito === "publish" || pago.proposito === "renew";

  const confirmar = async () => {
    setEnviando(true);
    try {
      const r = await aprobarPagoManual(pago.id, corregido ? montoNum : undefined, nota);
      toast({
        title: "Pago aprobado",
        description: publica
          ? (r.published === false
              // El cobro entró igual; lo que falló fue publicar. Decirlo, porque
              // el usuario va a preguntar por su aviso.
              ? "Se acreditó el saldo, pero el aviso no llegó a publicarse. Revísalo en Gestión de avisos."
              : "Se acreditó el saldo y el aviso ya está publicado.")
          : "Se acreditó el saldo y se emitió su comprobante.",
      });
      setAbierto(false);
      onHecho();
    } catch (e) {
      toast({ title: "No se pudo aprobar", description: mensajeDeError(e, "Error"), variant: "destructive" });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <AlertDialog open={abierto} onOpenChange={setAbierto}>
      <Button size="sm" className="gap-1.5" onClick={() => setAbierto(true)}>
        <Check size={14} /> Aprobar
      </Button>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Aprobar el pago de {pago.fullName}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 pt-1">
              <div className="rounded-md border p-3 space-y-1 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Medio</span>
                  <span className="font-medium">{NOMBRE_MEDIO[pago.metodo]}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Código</span>
                  <span className="font-mono font-medium">{codigoDePago(pago.id)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Compró</span>
                  <span className="font-medium text-right">{pago.detalle}</span>
                </div>
              </div>

              <div>
                <Label className="text-xs">Importe recibido (S/)</Label>
                <Input
                  type="number" step="0.01" min="0" inputMode="decimal"
                  value={monto} onChange={(e) => setMonto(e.target.value)}
                  className="mt-1"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Cámbialo solo si el voucher no coincide con {formatSoles(pago.total)}.
                  El saldo, la boleta y el IGV se recalculan con lo que pongas aquí.
                </p>
              </div>

              {corregido && publica && montoNum < pago.total && (
                // Un aviso se publica solo si el saldo alcanza para su costo:
                // aprobar de menos deja el dinero acreditado y el aviso quieto.
                <p className="flex items-start gap-1.5 rounded-md bg-amber-50 p-2 text-xs text-amber-900
                              dark:bg-amber-950/40 dark:text-amber-200">
                  <AlertCircle size={13} className="mt-0.5 shrink-0" />
                  Con menos de {formatSoles(pago.total)} puede que no alcance para publicar el
                  aviso: se acreditará el saldo, pero el aviso seguirá sin salir.
                </p>
              )}

              <div>
                <Label className="text-xs">Nota (opcional)</Label>
                <Input
                  value={nota} onChange={(e) => setNota(e.target.value)}
                  placeholder="Ej. Voucher recibido por WhatsApp el 19/08" className="mt-1"
                />
              </div>

              <p className="text-xs text-muted-foreground">
                Al aprobar se acredita el saldo y se emite su comprobante
                {publica ? ", y el aviso se publica automáticamente." : "."}
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={enviando}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); void confirmar(); }}
            disabled={!valido || enviando}
          >
            {enviando ? <><Loader2 size={14} className="animate-spin mr-1.5" /> Aprobando…</> : `Aprobar ${formatSoles(valido ? montoNum : pago.total)}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Diálogo de rechazo. El motivo es obligatorio: lo recibe el comprador. */
function RechazarDialog({ pago, onHecho }: { pago: PagoManual; onHecho: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => { if (abierto) setMotivo(""); }, [abierto]);

  const confirmar = async () => {
    setEnviando(true);
    try {
      await rechazarPagoManual(pago.id, motivo.trim());
      toast({ title: "Pago rechazado", description: "Se le avisó al usuario con tu motivo." });
      setAbierto(false);
      onHecho();
    } catch (e) {
      toast({ title: "No se pudo rechazar", description: mensajeDeError(e, "Error"), variant: "destructive" });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <AlertDialog open={abierto} onOpenChange={setAbierto}>
      <Button size="sm" variant="outline" className="gap-1.5 text-destructive" onClick={() => setAbierto(true)}>
        <X size={14} /> Rechazar
      </Button>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Rechazar el pago de {pago.fullName}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 pt-1">
              <p className="text-sm">
                No se acredita nada y el usuario recibe tu motivo. Si más tarde aparece el
                pago, tendrá que volver a intentarlo.
              </p>
              <div>
                <Label className="text-xs">Motivo <span className="text-destructive">*</span></Label>
                <Textarea
                  value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ej. No encontramos ninguna transferencia con ese código."
                  className="mt-1" rows={3}
                />
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={enviando}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive hover:bg-destructive/90"
            onClick={(e) => { e.preventDefault(); void confirmar(); }}
            disabled={motivo.trim().length < 5 || enviando}
          >
            {enviando ? <><Loader2 size={14} className="animate-spin mr-1.5" /> Rechazando…</> : "Rechazar pago"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const AdminPagosManuales = ({ role }: { role: AdminRole }) => {
  const { can } = usePermissions(role === "admin");
  const puedeAprobar = can("Pagos Yape/Plin", "approve");
  // La configuración toca `system_settings`, que solo el superadmin escribe.
  const puedeConfigurar = role === "superadmin";

  const [estado, setEstado] = useState("pending");
  const [search, setSearch] = useState("");
  const [busq, setBusq] = useState("");
  const [page, setPage] = useState(1);
  const [pagos, setPagos] = useState<PagoManual[]>([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);

  // Debounce del buscador: una consulta por pausa, no por tecla.
  useEffect(() => {
    const t = window.setTimeout(() => { setBusq(search); setPage(1); }, 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const cargar = useCallback(() => {
    setCargando(true);
    fetchPagosManuales({ estado, search: busq, page })
      .then((r) => { setPagos(r.data); setTotal(r.total); })
      .catch((e) => toast({ title: "No se pudieron cargar los pagos", description: mensajeDeError(e, "Error"), variant: "destructive" }))
      .finally(() => setCargando(false));
  }, [estado, busq, page]);

  useEffect(() => { cargar(); }, [cargar]);

  const trasRevisar = () => {
    cargar();
    // El menú lleva el contador de pendientes: sin esto seguiría marcando uno
    // que ya se resolvió.
    window.dispatchEvent(new CustomEvent(EVENTO_PAGOS_REVISADOS));
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGOS_MANUALES_PAGE_SIZE));

  // ── Configuración ──
  const [cfg, setCfg] = useState<ConfigYapePlin>(CONFIG_VACIA);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!puedeConfigurar) return;
    fetchSettings()
      .then((rows) => {
        const fila = rows.find((r) => r.key === "yape_plin");
        if (fila) setCfg(normalizarConfig(fila.value));
      })
      .catch(() => { /* se queda con la configuración vacía */ });
  }, [puedeConfigurar]);

  const cuentaVacia = (metodo: MedioManual): CuentaManual =>
    ({ metodo, numero: "", banco: "", titular: "", qr: "" });

  // Qué cuenta está subiendo su QR (índice), para no bloquear las demás.
  const [subiendoQr, setSubiendoQr] = useState<number | null>(null);

  const elegirQr = async (i: number, file: File | undefined) => {
    if (!file) return;
    const motivo = motivoQrInvalido(file);
    if (motivo) {
      toast({ title: "Esa imagen no sirve", description: motivo, variant: "destructive" });
      return;
    }
    setSubiendoQr(i);
    try {
      const url = await subirQrDePago(file, cfg.cuentas[i]?.qr);
      actualizarCuenta(i, "qr", url);
      toast({
        title: "QR subido",
        description: "Recuerda guardar la configuración para que los compradores lo vean.",
      });
    } catch (e) {
      toast({ title: "No se pudo subir el QR", description: mensajeDeError(e, "Error"), variant: "destructive" });
    } finally {
      setSubiendoQr(null);
    }
  };

  const quitarQr = async (i: number) => {
    const url = cfg.cuentas[i]?.qr;
    actualizarCuenta(i, "qr", "");
    // Se borra del bucket sin esperar: si falla, queda un huérfano de 3 KB.
    await borrarQrDePago(url);
  };

  const actualizarCuenta = (i: number, campo: keyof CuentaManual, valor: string) =>
    setCfg((c) => ({
      ...c,
      cuentas: c.cuentas.map((x, j) => (j === i ? { ...x, [campo]: valor } : x)),
    }));

  const guardar = async () => {
    setGuardando(true);
    try {
      await guardarConfigYapePlin(cfg);
      toast({ title: "Configuración guardada", description: "Los compradores ya ven estos datos." });
    } catch (e) {
      toast({ title: "No se pudo guardar", description: mensajeDeError(e, "Error"), variant: "destructive" });
    } finally {
      setGuardando(false);
    }
  };

  // Faltan datos para que el medio funcione de verdad: activarlo sin cuentas o
  // sin WhatsApp lo ofrece al comprador y lo deja sin a dónde pagar.
  const avisoConfig = useMemo(() => {
    if (!cfg.activo) return null;
    if (!cfg.cuentas.some((c) => c.numero.trim() || c.qr.trim())) return "Está activo pero no hay ninguna cuenta: nadie podrá pagar.";
    if (!cfg.whatsapp.trim()) return "Está activo pero falta el WhatsApp: los vouchers no llegarían a ningún lado.";
    return null;
  }, [cfg]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base md:text-lg flex items-center gap-2">
          <Smartphone size={18} className="text-secondary" /> Pagos con Yape y Plin
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Aprobar un pago hace lo mismo que la pasarela: acredita el saldo, emite la boleta y,
          si la compra era para un aviso, lo publica.
        </p>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="bandeja">
          <TabsList>
            <TabsTrigger value="bandeja">Bandeja</TabsTrigger>
            {puedeConfigurar && <TabsTrigger value="config">Configuración</TabsTrigger>}
          </TabsList>

          {/* ─────────────── Bandeja ─────────────── */}
          <TabsContent value="bandeja" className="pt-4 space-y-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="relative flex-1 min-w-[220px]">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por nombre, correo o aviso…" className="pl-9 h-9"
                />
              </div>
              <Select value={estado} onValueChange={(v) => { setEstado(v); setPage(1); }}>
                <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ESTADOS.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {cargando ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Cargando pagos…</p>
            ) : pagos.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {estado === "pending" ? "No hay pagos esperando revisión." : "No hay pagos en esta sección."}
              </p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Usuario</TableHead>
                        <TableHead>Concepto</TableHead>
                        <TableHead>Medio</TableHead>
                        <TableHead>Código</TableHead>
                        <TableHead className="text-right">Importe</TableHead>
                        <TableHead>Avisó</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagos.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="max-w-[200px]">
                            <p className="font-medium truncate">{p.fullName}</p>
                            <p className="text-xs text-muted-foreground truncate">{p.email}</p>
                          </TableCell>
                          <TableCell className="max-w-[240px]"><Concepto p={p} /></TableCell>
                          <TableCell>{NOMBRE_MEDIO[p.metodo]}</TableCell>
                          <TableCell className="font-mono text-xs">{codigoDePago(p.id)}</TableCell>
                          <TableCell className="text-right font-semibold">{formatSoles(p.total)}</TableCell>
                          <TableCell className="text-xs">
                            {p.confirmadoAt
                              ? fecha(p.confirmadoAt)
                              : <span className="text-muted-foreground">Sin confirmar</span>}
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-2">
                              {p.status === "pending" && puedeAprobar ? (
                                <>
                                  <AprobarDialog pago={p} onHecho={trasRevisar} />
                                  <RechazarDialog pago={p} onHecho={trasRevisar} />
                                </>
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  {p.status === "paid" ? `Aprobado ${fecha(p.revisadoAt)}` :
                                   p.status === "failed" ? `Rechazado ${fecha(p.revisadoAt)}` :
                                   "Sin permiso para revisar"}
                                </span>
                              )}
                            </div>
                            {p.nota && <p className="text-right text-[11px] text-muted-foreground mt-1">{p.nota}</p>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <TablePagination
                  page={page}
                  totalPages={totalPages}
                  total={total}
                  from={(page - 1) * PAGOS_MANUALES_PAGE_SIZE + 1}
                  to={Math.min(total, page * PAGOS_MANUALES_PAGE_SIZE)}
                  setPage={setPage}
                  noun="pagos"
                />
              </>
            )}
          </TabsContent>

          {/* ─────────────── Configuración ─────────────── */}
          {puedeConfigurar && (
            <TabsContent value="config" className="pt-4 space-y-5 max-w-2xl">
              <div className="flex items-center justify-between gap-4 border p-3">
                <div>
                  <p className="font-semibold text-sm">Aceptar pagos por Yape y Plin</p>
                  <p className="text-xs text-muted-foreground">
                    Apagado, los compradores solo ven la tarjeta.
                  </p>
                </div>
                <Switch checked={cfg.activo} onCheckedChange={(v) => setCfg((c) => ({ ...c, activo: v }))} />
              </div>

              {avisoConfig && (
                <p className="flex items-start gap-1.5 rounded-md bg-amber-50 p-2.5 text-xs text-amber-900
                              dark:bg-amber-950/40 dark:text-amber-200">
                  <AlertCircle size={13} className="mt-0.5 shrink-0" /> {avisoConfig}
                </p>
              )}

              <div className="space-y-3">
                <Label className="text-xs uppercase tracking-wider font-bold text-muted-foreground">
                  Cuentas a las que se transfiere
                </Label>
                {cfg.cuentas.length === 0 && (
                  <p className="text-xs text-muted-foreground">Todavía no hay ninguna cuenta.</p>
                )}
                {cfg.cuentas.map((c, i) => (
                  <div key={i} className="border p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Select value={c.metodo} onValueChange={(v) => actualizarCuenta(i, "metodo", v)}>
                        <SelectTrigger className="h-9 w-28"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {MEDIOS_MANUALES.map((m) => (
                            <SelectItem key={m} value={m}>{NOMBRE_MEDIO[m]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        value={c.numero} onChange={(e) => actualizarCuenta(i, "numero", e.target.value)}
                        placeholder="Número (999 888 777)" className="h-9 flex-1" inputMode="tel"
                      />
                      <Button
                        variant="ghost" size="sm" className="text-destructive shrink-0"
                        onClick={() => setCfg((x) => ({ ...x, cuentas: x.cuentas.filter((_, j) => j !== i) }))}
                        title="Quitar esta cuenta"
                      >
                        <Trash2 size={15} />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        value={c.titular} onChange={(e) => actualizarCuenta(i, "titular", e.target.value)}
                        placeholder="Titular (como aparece en la app)" className="h-9"
                      />
                      <Input
                        value={c.banco} onChange={(e) => actualizarCuenta(i, "banco", e.target.value)}
                        placeholder="Banco (opcional)" className="h-9"
                      />
                    </div>

                    {/* QR de cobro: quien paga escanea en vez de teclear, que es
                        de donde salen los pagos a un número equivocado. */}
                    <div className="flex items-center gap-3 border-t pt-3">
                      {c.qr ? (
                        <img
                          src={c.qr} alt="QR de cobro"
                          className="w-16 h-16 object-contain border bg-white p-1 shrink-0"
                        />
                      ) : (
                        <div className="w-16 h-16 border border-dashed grid place-items-center text-muted-foreground shrink-0">
                          <QrCode size={20} />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold">Código QR de cobro</p>
                        <p className="text-[11px] text-muted-foreground">
                          {c.qr
                            ? "Se muestra al comprador junto al número."
                            : "Opcional. PNG, JPG o WEBP, hasta 2 MB."}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="outline" size="sm" className="gap-1.5"
                          disabled={subiendoQr === i}
                          onClick={() => document.getElementById(`qr-cuenta-${i}`)?.click()}
                        >
                          {subiendoQr === i
                            ? <Loader2 size={14} className="animate-spin" />
                            : <Upload size={14} />}
                          {c.qr ? "Cambiar" : "Subir"}
                        </Button>
                        {c.qr && (
                          <Button
                            variant="ghost" size="sm" className="text-destructive"
                            onClick={() => quitarQr(i)} title="Quitar el QR"
                          >
                            <Trash2 size={15} />
                          </Button>
                        )}
                        <input
                          id={`qr-cuenta-${i}`} type="file" className="hidden"
                          accept={QR_PAGO_TIPOS.join(",")}
                          onChange={(e) => {
                            void elegirQr(i, e.target.files?.[0]);
                            e.target.value = ""; // permite reelegir el mismo archivo
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <Button
                  variant="outline" size="sm" className="gap-1.5"
                  onClick={() => setCfg((c) => ({ ...c, cuentas: [...c.cuentas, cuentaVacia("yape")] }))}
                >
                  <Plus size={14} /> Añadir cuenta
                </Button>
              </div>

              <div>
                <Label className="text-xs">WhatsApp donde llegan los vouchers</Label>
                <Input
                  value={cfg.whatsapp} onChange={(e) => setCfg((c) => ({ ...c, whatsapp: e.target.value }))}
                  placeholder="51999888777" className="mt-1" inputMode="tel"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Con código de país y sin signos. Perú es 51: para el 999 888 777, escribe 51999888777.
                </p>
              </div>

              <div>
                <Label className="text-xs">Mensaje con el que se abre el chat</Label>
                <Textarea
                  value={cfg.mensaje} onChange={(e) => setCfg((c) => ({ ...c, mensaje: e.target.value }))}
                  rows={3} className="mt-1"
                  placeholder="Hola, acabo de pagar mi recarga de saldo en eFFe. Adjunto mi voucher."
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Debajo de tu texto se añaden solos el medio, el importe y el código del pago,
                  que es lo que permite encontrarlo aquí.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button onClick={guardar} disabled={guardando} className="gap-2">
                  {guardando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Guardar configuración
                </Button>
                {cfg.whatsapp.trim() && (
                  <a
                    href={`https://wa.me/${cfg.whatsapp.replace(/\D/g, "")}`}
                    target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  >
                    Probar el número <ExternalLink size={12} />
                  </a>
                )}
              </div>
            </TabsContent>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default AdminPagosManuales;
