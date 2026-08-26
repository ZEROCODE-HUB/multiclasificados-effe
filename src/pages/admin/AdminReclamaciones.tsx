// Libro de Reclamaciones — punto B-09 de la auditoría.
//
// Los reclamos se guardaban y el consumidor recibía su acuse con la hoja en PDF,
// pero para atenderlos había que entrar a la base de datos. Esta pantalla es lo
// que faltaba: consultarlos, imprimir la hoja y responder.
//
// TRES COSAS QUE MANDA LA NORMA Y NO EL GUSTO
//
//  1. El plazo son TREINTA DÍAS calendario desde el registro. Por eso cada fila
//     dice cuántos quedan, y no la fecha a secas: "12 jun" obliga a hacer la
//     cuenta, y esa cuenta es la que se olvida.
//  2. La respuesta se GUARDA además de enviarse. Hay que poder acreditarla, y
//     un correo en la bandeja de alguien no es un registro: si esa persona se
//     va, la constancia se va con ella.
//  3. La hoja se imprime con TODOS los datos del consumidor. Es el documento que
//     se enseña si Indecopi lo pide.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen, Search, Printer, Mail, Loader2, AlertTriangle, CheckCircle2, Clock,
  FileSpreadsheet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { mensajeDeError } from "@/lib/errores";
import { usePermissions } from "@/hooks/usePermissions";
import { exportExcel } from "@/lib/exportReport";
import {
  fetchReclamos, responderReclamo, type ReclamoAdmin, type FiltroReclamos,
} from "@/lib/complaints";
import type { AdminRole } from "@/components/AdminLayout";

/** Días que quedan del plazo legal de 30 días. Negativo = vencido. */
function diasDePlazo(createdAt: string): number {
  const alta = new Date(createdAt).getTime();
  if (!Number.isFinite(alta)) return 30;
  const pasados = Math.floor((Date.now() - alta) / 86_400_000);
  return 30 - pasados;
}

const fecha = (iso: string) => {
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleString("es-PE", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";
};

const ESTADOS: Record<string, { label: string; clase: string }> = {
  pendiente:  { label: "Pendiente",  clase: "bg-warning/15 text-warning border-warning/30" },
  en_proceso: { label: "En proceso", clase: "bg-secondary/15 text-secondary border-secondary/30" },
  resuelto:   { label: "Resuelto",   clase: "bg-success/15 text-success border-success/30" },
};

/** El plazo, dicho de forma que no haya que calcular nada. */
function Plazo({ r }: { r: ReclamoAdmin }) {
  if (r.status === "resuelto") {
    return <span className="text-xs text-success flex items-center gap-1"><CheckCircle2 size={12} /> Respondido</span>;
  }
  const d = diasDePlazo(r.createdAt);
  if (d < 0) {
    return <span className="text-xs text-destructive font-bold flex items-center gap-1">
      <AlertTriangle size={12} /> Vencido hace {Math.abs(d)} d
    </span>;
  }
  const urgente = d <= 7;
  return (
    <span className={`text-xs flex items-center gap-1 ${urgente ? "text-destructive font-bold" : "text-muted-foreground"}`}>
      <Clock size={12} /> {d} {d === 1 ? "día" : "días"}
    </span>
  );
}

const AdminReclamaciones = ({ role }: { role: AdminRole }) => {
  const { can } = usePermissions(role === "admin");
  const puedeResponder = can ? can("Libro de Reclamaciones", "edit") : true;

  const [filas, setFilas] = useState<ReclamoAdmin[]>([]);
  const [cargando, setCargando] = useState(true);
  const [buscar, setBuscar] = useState("");
  const [estado, setEstado] = useState("all");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const [abierto, setAbierto] = useState<ReclamoAdmin | null>(null);
  const [respuesta, setRespuesta] = useState("");
  const [enviando, setEnviando] = useState(false);

  const filtro = useMemo<FiltroReclamos>(
    () => ({ buscar, estado, desde, hasta }),
    [buscar, estado, desde, hasta],
  );

  const cargar = useCallback(() => {
    setCargando(true);
    fetchReclamos(filtro)
      .then(setFilas)
      .catch((e) => toast({
        title: "No se pudieron cargar los reclamos",
        description: mensajeDeError(e, "Error"), variant: "destructive",
      }))
      .finally(() => setCargando(false));
  }, [filtro]);

  useEffect(() => {
    // Medio segundo de espera al teclear: sin esto cada letra del buscador es
    // una consulta.
    const t = setTimeout(cargar, 400);
    return () => clearTimeout(t);
  }, [cargar]);

  const pendientes = filas.filter((r) => r.status !== "resuelto").length;
  const vencidos = filas.filter((r) => r.status !== "resuelto" && diasDePlazo(r.createdAt) < 0).length;

  const abrir = (r: ReclamoAdmin) => {
    setAbierto(r);
    setRespuesta(r.respuesta ?? "");
  };

  const enviar = async () => {
    if (!abierto) return;
    if (!respuesta.trim()) {
      toast({ title: "Escribe la respuesta", variant: "destructive" });
      return;
    }
    setEnviando(true);
    try {
      const r = await responderReclamo(abierto.id, respuesta);
      // Se distingue a propósito: la respuesta QUEDA REGISTRADA aunque el correo
      // falle, y decir solo "enviado" o solo "error" sería mentir en un caso u
      // otro. Quien atiende necesita saber si el consumidor se enteró.
      toast({
        title: r.correoEnviado ? "Respondido y enviado" : "Respuesta guardada",
        description: r.correoEnviado
          ? `Se envió a ${abierto.email}.`
          : `Quedó registrada, pero el correo no salió: ${r.error ?? "revisa la configuración"}.`,
        variant: r.correoEnviado ? undefined : "destructive",
      });
      setAbierto(null);
      cargar();
    } catch (e) {
      toast({ title: "No se pudo responder", description: mensajeDeError(e, "Error"), variant: "destructive" });
    } finally {
      setEnviando(false);
    }
  };

  /** Excel para el reporte de Indecopi. Va todo lo filtrado, no la página. */
  const exportar = () => {
    exportExcel(
      `libro-reclamaciones-${new Date().toISOString().slice(0, 10)}`,
      filas.map((r) => ({
        "N.º": r.code ?? "",
        Tipo: r.kind === "queja" ? "Queja" : "Reclamo",
        Fecha: fecha(r.createdAt),
        Consumidor: r.fullName,
        Documento: `${r.docType} ${r.docNumber}`,
        Correo: r.email,
        Teléfono: r.phone,
        Domicilio: r.address,
        "Bien contratado": r.goodType,
        Monto: r.amount ?? "",
        Detalle: r.description,
        Pedido: r.request,
        Estado: ESTADOS[r.status]?.label ?? r.status,
        Respuesta: r.respuesta ?? "",
        "Respondido el": r.respondidaAt ? fecha(r.respondidaAt) : "",
      })),
      "Libro de Reclamaciones",
    );
  };

  return (
    <>
      {/* Lo que urge, arriba. Un reclamo vencido no es "uno más de la lista":
          es un incumplimiento con plazo legal ya pasado. */}
      {vencidos > 0 && (
        <div className="mb-4 border-l-4 border-destructive bg-destructive/5 p-3 flex items-start gap-2">
          <AlertTriangle size={18} className="text-destructive shrink-0 mt-0.5" />
          <p className="text-sm">
            <b>{vencidos}</b> {vencidos === 1 ? "reclamo pasó" : "reclamos pasaron"} los 30 días
            sin respuesta. El plazo del Reglamento ya venció.
          </p>
        </div>
      )}

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base md:text-lg flex items-center gap-2">
              <BookOpen size={18} className="text-secondary" /> Libro de Reclamaciones
              <span className="text-xs font-normal text-muted-foreground">
                {filas.length} {filas.length === 1 ? "registro" : "registros"}
                {pendientes > 0 && ` · ${pendientes} sin responder`}
              </span>
            </CardTitle>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={exportar} disabled={!filas.length}>
              <FileSpreadsheet size={14} /> Excel
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <div className="relative md:col-span-2">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={buscar}
                onChange={(e) => setBuscar(e.target.value)}
                placeholder="Nombre, documento o correo…"
                className="pl-9"
              />
            </div>
            <Select value={estado} onValueChange={setEstado}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="pendiente">Pendientes</SelectItem>
                <SelectItem value="en_proceso">En proceso</SelectItem>
                <SelectItem value="resuelto">Resueltos</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} aria-label="Desde" />
              <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} aria-label="Hasta" />
            </div>
          </div>
        </CardHeader>

        <CardContent className="overflow-x-auto">
          {cargando ? (
            <p className="py-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 size={16} className="animate-spin" /> Cargando…
            </p>
          ) : filas.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No hay reclamos con esos filtros.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>N.º</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Consumidor</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Plazo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.code ?? "—"}</TableCell>
                    <TableCell className="text-sm">{r.kind === "queja" ? "Queja" : "Reclamo"}</TableCell>
                    <TableCell className="text-sm">
                      <span className="font-semibold">{r.fullName}</span>
                      <span className="block text-xs text-muted-foreground">{r.docType} {r.docNumber}</span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fecha(r.createdAt)}</TableCell>
                    <TableCell><Plazo r={r} /></TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${ESTADOS[r.status]?.clase ?? ""}`}>
                        {ESTADOS[r.status]?.label ?? r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => abrir(r)}>Ver</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Ficha completa: la hoja que se imprime y el sitio donde se responde. */}
      <Dialog open={!!abierto} onOpenChange={(o) => !o && setAbierto(null)}>
        <DialogContent className="sm:max-w-2xl">
          {abierto && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  Hoja de {abierto.kind === "queja" ? "Queja" : "Reclamación"} N.º {abierto.code ?? "—"}
                </DialogTitle>
                <DialogDescription>
                  Registrado el {fecha(abierto.createdAt)} · CORP LOZANOCHEFFER S.A.C. — RUC 20616009061
                </DialogDescription>
              </DialogHeader>

              {/* `id` para imprimir solo esto: la hoja es el documento que se
                  enseña si Indecopi lo pide, no la pantalla entera. */}
              <div id="hoja-reclamo" className="space-y-3 text-sm max-h-[55vh] overflow-y-auto pr-1">
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <Dato k="Consumidor" v={abierto.fullName} />
                  <Dato k="Documento" v={`${abierto.docType} ${abierto.docNumber}`} />
                  <Dato k="Correo" v={abierto.email} />
                  <Dato k="Teléfono" v={abierto.phone || "—"} />
                  <Dato k="Domicilio" v={abierto.address || "—"} ancho />
                  <Dato k="Bien contratado" v={abierto.goodType} />
                  <Dato k="Monto reclamado" v={abierto.amount || "—"} />
                </div>
                <Bloque titulo="Detalle" texto={abierto.description} />
                <Bloque titulo="Pedido del consumidor" texto={abierto.request} />
                {abierto.respuesta && (
                  <Bloque
                    titulo={`Respuesta${abierto.respondidaAt ? ` · ${fecha(abierto.respondidaAt)}` : ""}`}
                    texto={abierto.respuesta}
                  />
                )}
                {abierto.respuestaEmailStatus === "error" && (
                  <p className="text-xs text-destructive flex items-start gap-1.5">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                    La respuesta está registrada, pero el correo no salió: {abierto.respuestaEmailError}
                  </p>
                )}
              </div>

              {puedeResponder && abierto.status !== "resuelto" && (
                <div className="border-t pt-3">
                  <Label htmlFor="resp" className="text-xs uppercase tracking-wider font-bold text-muted-foreground">
                    Responder al consumidor
                  </Label>
                  <Textarea
                    id="resp"
                    value={respuesta}
                    onChange={(e) => setRespuesta(e.target.value)}
                    rows={4}
                    className="mt-1"
                    placeholder="Escribe la respuesta. Se le enviará por correo y quedará registrada."
                  />
                </div>
              )}

              <DialogFooter className="gap-2">
                <Button variant="outline" className="gap-1.5" onClick={() => window.print()}>
                  <Printer size={14} /> Imprimir
                </Button>
                {puedeResponder && abierto.status !== "resuelto" && (
                  <Button className="gap-1.5" onClick={enviar} disabled={enviando}>
                    {enviando
                      ? <><Loader2 size={14} className="animate-spin" /> Enviando…</>
                      : <><Mail size={14} /> Responder y cerrar</>}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

function Dato({ k, v, ancho }: { k: string; v: string; ancho?: boolean }) {
  return (
    <div className={ancho ? "col-span-2" : ""}>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{k}</p>
      <p className="font-semibold break-words">{v}</p>
    </div>
  );
}

function Bloque({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="border-t pt-2">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{titulo}</p>
      {/* `whitespace-pre-wrap`: el consumidor escribió con saltos de línea y
          aplanarlos convierte un relato ordenado en un párrafo ilegible. */}
      <p className="whitespace-pre-wrap break-words mt-0.5">{texto}</p>
    </div>
  );
}

export default AdminReclamaciones;
