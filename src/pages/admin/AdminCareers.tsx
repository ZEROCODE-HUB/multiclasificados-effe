// «Trabaje con nosotros» en el panel — punto B-18 de la auditoría.
//
// El cliente pidió que la postulación se guardara y llegara un correo. Esta
// pantalla es lo que hace falta para que ese correo sirva de algo: verlas,
// filtrarlas, marcarlas y descargarlas.
//
// UNA COSA QUE NO SE HACE AQUÍ: BORRAR
//
// Una postulación descartada se marca, no se destruye. Es el mismo criterio que
// con las cuentas de quien ya contrató (B-01): quien descarta hoy puede tener
// que explicar mañana por qué, y una fila borrada no explica nada.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Briefcase, Search, FileSpreadsheet, Loader2, Mail, Phone } from "lucide-react";
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
import { fechaHoraCorta } from "@/lib/fechas";
import {
  fetchCareers, actualizarPostulacion, filasParaExcel,
  ESTADOS, NOMBRE_ESTADO, NOMBRE_GRADO,
  type Career, type CareerStatus, type FiltroCareers,
} from "@/lib/careers";
import type { AdminRole } from "@/components/AdminLayout";

const CLASE_ESTADO: Record<CareerStatus, string> = {
  nueva: "bg-secondary/15 text-secondary border-secondary/30",
  revisada: "bg-muted text-muted-foreground border-border",
  contratada: "bg-success/15 text-success border-success/30",
  descartada: "bg-destructive/10 text-destructive border-destructive/30",
};

const AdminCareers = ({ role }: { role: AdminRole }) => {
  const { can } = usePermissions(role === "admin");
  const puedeEditar = can ? can("Trabaje con nosotros", "edit") : true;

  const [filas, setFilas] = useState<Career[]>([]);
  const [cargando, setCargando] = useState(true);
  const [buscar, setBuscar] = useState("");
  const [estado, setEstado] = useState<CareerStatus | "all">("all");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const [abierta, setAbierta] = useState<Career | null>(null);
  const [nota, setNota] = useState("");
  const [nuevoEstado, setNuevoEstado] = useState<CareerStatus>("nueva");
  const [guardando, setGuardando] = useState(false);

  const filtro = useMemo<FiltroCareers>(
    () => ({ buscar, estado, desde, hasta }),
    [buscar, estado, desde, hasta],
  );

  const cargar = useCallback(() => {
    setCargando(true);
    fetchCareers(filtro)
      .then(setFilas)
      .catch((e) => toast({
        title: "No se pudieron cargar las postulaciones",
        description: mensajeDeError(e, "Error"), variant: "destructive",
      }))
      .finally(() => setCargando(false));
  }, [filtro]);

  useEffect(() => {
    // Espera al teclear: sin esto cada letra del buscador es una consulta.
    const t = setTimeout(cargar, 400);
    return () => clearTimeout(t);
  }, [cargar]);

  const nuevas = filas.filter((c) => c.status === "nueva").length;

  const abrir = (c: Career) => {
    setAbierta(c);
    setNota(c.nota ?? "");
    setNuevoEstado(c.status);
  };

  const guardar = async () => {
    if (!abierta) return;
    setGuardando(true);
    try {
      await actualizarPostulacion(abierta.id, { status: nuevoEstado, nota });
      toast({ title: "Postulación actualizada" });
      setAbierta(null);
      cargar();
    } catch (e) {
      toast({ title: "No se pudo guardar", description: mensajeDeError(e, "Error"), variant: "destructive" });
    } finally {
      setGuardando(false);
    }
  };

  /** Va todo lo filtrado, no la página en pantalla: es el fallo B-19. */
  const exportar = () =>
    exportExcel(
      `postulaciones-${new Date().toISOString().slice(0, 10)}`,
      filasParaExcel(filas).map((f) => ({ ...f, Fecha: fechaHoraCorta(String(f.Fecha)) })),
      "Trabaje con nosotros",
    );

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base md:text-lg flex items-center gap-2">
            <Briefcase size={16} className="text-secondary" /> Trabaje con nosotros
            {nuevas > 0 && (
              <Badge variant="outline" className="bg-secondary/15 text-secondary border-secondary/30">
                {nuevas} sin revisar
              </Badge>
            )}
          </CardTitle>
          <Button variant="outline" size="sm" className="gap-2" onClick={exportar} disabled={filas.length === 0}>
            <FileSpreadsheet size={14} /> Excel
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Nombre, documento, correo o puesto"
              value={buscar} onChange={(e) => setBuscar(e.target.value)} />
          </div>
          <Select value={estado} onValueChange={(v) => setEstado(v as CareerStatus | "all")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              {ESTADOS.map((e) => (
                <SelectItem key={e.valor} value={e.valor}>{e.etiqueta}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} aria-label="Desde" />
          <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} aria-label="Hasta" />
        </div>
      </CardHeader>

      <CardContent>
        {cargando ? (
          <p className="py-10 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 size={14} className="animate-spin" /> Cargando…
          </p>
        ) : filas.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No hay postulaciones que coincidan con el filtro.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">N.º</TableHead>
                  <TableHead>Postulante</TableHead>
                  <TableHead>Puesto</TableHead>
                  <TableHead className="hidden md:table-cell">Grado</TableHead>
                  <TableHead className="hidden lg:table-cell">Recibida</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="tabular-nums text-muted-foreground">{c.code ?? "—"}</TableCell>
                    <TableCell>
                      <p className="font-medium">{c.nombreCompleto}</p>
                      <p className="text-xs text-muted-foreground">{c.docType} {c.docNumber}</p>
                    </TableCell>
                    <TableCell className="max-w-[16rem]"><span className="line-clamp-2">{c.puesto}</span></TableCell>
                    <TableCell className="hidden md:table-cell text-sm">{NOMBRE_GRADO[c.grado] ?? c.grado}</TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground whitespace-nowrap">
                      {fechaHoraCorta(c.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={CLASE_ESTADO[c.status]}>
                        {NOMBRE_ESTADO[c.status] ?? c.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => abrir(c)}>Ver</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={!!abierta} onOpenChange={(v) => !v && setAbierta(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {abierta && (
            <>
              <DialogHeader>
                <DialogTitle>{abierta.nombreCompleto}</DialogTitle>
                <DialogDescription>
                  Postulación N.º {abierta.code ?? "—"} · recibida el {fechaHoraCorta(abierta.createdAt)}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <p className="flex items-center gap-2 min-w-0">
                    <Mail size={14} className="text-muted-foreground shrink-0" />
                    <span className="break-all">{abierta.email}</span>
                  </p>
                  {abierta.phone && (
                    <p className="flex items-center gap-2">
                      <Phone size={14} className="text-muted-foreground shrink-0" />{abierta.phone}
                    </p>
                  )}
                </div>

                <Dato titulo="Documento" texto={`${abierta.docType} ${abierta.docNumber}`} />
                <Dato titulo="Grado de instrucción" texto={NOMBRE_GRADO[abierta.grado] ?? abierta.grado} />
                <Dato titulo="Puesto al que postula" texto={abierta.puesto} />
                <Dato titulo="Habilidades y experiencia" texto={abierta.descripcion} />

                <div className="border-t pt-3 space-y-3">
                  <div className="space-y-2">
                    <Label>Estado</Label>
                    <Select value={nuevoEstado} onValueChange={(v) => setNuevoEstado(v as CareerStatus)} disabled={!puedeEditar}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ESTADOS.map((e) => (
                          <SelectItem key={e.valor} value={e.valor}>{e.etiqueta}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nota-postulacion">Nota interna</Label>
                    <Textarea id="nota-postulacion" rows={3} value={nota} disabled={!puedeEditar}
                      placeholder="Por ejemplo: por qué se descarta, o para qué convocatoria se guarda."
                      onChange={(e) => setNota(e.target.value)} />
                    <p className="text-xs text-muted-foreground">Solo la ve el personal; el postulante no la recibe.</p>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setAbierta(null)}>Cerrar</Button>
                <Button onClick={guardar} disabled={!puedeEditar || guardando} className="gap-2">
                  {guardando && <Loader2 size={14} className="animate-spin" />} Guardar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
};

function Dato({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="border-t pt-2">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{titulo}</p>
      {/* `whitespace-pre-wrap`: quien postula escribe con saltos de línea, y
          aplanarlos convierte su experiencia en un párrafo ilegible. */}
      <p className="whitespace-pre-wrap break-words mt-0.5">{texto}</p>
    </div>
  );
}

export default AdminCareers;
