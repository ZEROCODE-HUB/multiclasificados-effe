import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useFilaSenalada } from "@/hooks/useFilaSenalada";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, Eye } from "lucide-react";
import { formatSoles } from "@/lib/pricing";
import { loadInvoicesFromDb, MIS_COMPROBANTES_POR_PAGINA, type DbInvoice } from "@/lib/invoices";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { TablePagination } from "@/components/TablePagination";
import { personKindLabel } from "@/lib/identity";
import { InvoiceDetailDialog } from "@/components/InvoiceDetailDialog";

/**
 * Estado real del comprobante. Antes aquí había un "Enviada" fijo, de adorno:
 * no existía ningún envío detrás y el usuario veía "enviada" una boleta que
 * nadie le había mandado.
 */
function EstadoComprobante({ inv }: { inv: DbInvoice }) {
  // Un comprobante anulado ya no es "enviado a tu correo": esa compra quedó sin
  // efecto y sus créditos se retiraron. Es lo primero que hay que decir, y el
  // aviso in-app de la anulación trae al usuario justo aquí a comprobarlo.
  if (inv.anuladoAt) {
    return (
      <Badge variant="outline" className="text-destructive border-destructive/30 bg-destructive/10">
        Anulado
      </Badge>
    );
  }
  // Lo que le importa a quien compra es si ya lo tiene en el correo.
  if (inv.emailStatus === "enviado") {
    return (
      <Badge variant="outline" className="text-success border-success/30 bg-success/10">
        Enviada a tu correo
      </Badge>
    );
  }
  if (inv.emailStatus === "error" || inv.emailStatus === "omitido") {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Disponible aquí
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      Enviando…
    </Badge>
  );
}

const AdvertiserInvoices = () => {
  const [invoices, setInvoices] = useState<DbInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<DbInvoice | null>(null);
  // Buscador y paginación: antes se descargaba el historial entero en cada
  // visita, y quien lleva dos años comprando tiene bastantes comprobantes.
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);
  const [total, setTotal] = useState(0);
  const totalPaginas = Math.max(1, Math.ceil(total / MIS_COMPROBANTES_POR_PAGINA));

  // ── LLEGAR DESDE EL CORREO A UN COMPROBANTE CONCRETO ──────────────────────
  //
  // El botón «Ver mis comprobantes» trae `?comprobante=B001-000002`. Dejaba al
  // usuario en la lista entera y a buscar cuál era; con varias compras hechas a
  // nombres de facturación distintos eso llegó a confundir de verdad (un tester
  // creyó estar viendo comprobantes ajenos, siendo los tres suyos).
  //
  // POR QUÉ SE RELLENA EL BUSCADOR y no basta con resaltar la fila: esta lista
  // va PAGINADA de diez en diez. Resaltar solo funciona si la fila está en la
  // página cargada, y el enlace de un correo se abre meses después, cuando ese
  // comprobante ya está tres páginas atrás. Buscando por su número aparece
  // siempre, sea de cuando sea.
  //
  // Y queda a la vista: el número se ve escrito en el buscador, así que se
  // entiende por qué la lista está filtrada y se puede vaciar para ver el resto.
  const [searchParams] = useSearchParams();
  const senalado = searchParams.get("comprobante") ?? "";

  // Se sincroniza con el PARÁMETRO, no con cada render: así, si el usuario borra
  // el buscador para ver los demás, no se lo volvemos a rellenar. Solo cambia si
  // llega otro enlace con otro comprobante.
  useEffect(() => { if (senalado) setBusqueda(senalado); }, [senalado]);

  // El resaltado se apaga solo (mismo mecanismo que la campana con los avisos).
  // No se pide el salto porque, con el buscador puesto, la fila es la única que
  // hay: no hay a dónde bajar.
  const { clasesDeResaltado } = useFilaSenalada("comprobante", !loading);

  useEffect(() => { setPagina(1); }, [busqueda]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const { rows, total: n } = await loadInvoicesFromDb({ search: busqueda || undefined, page: pagina });
        if (active) { setInvoices(rows); setTotal(n); setError(null); }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "No se pudieron cargar los comprobantes.");
      } finally {
        if (active) setLoading(false);
      }
    };
    const t = setTimeout(load, busqueda ? 300 : 0);
    // Refresca cuando se emite un comprobante nuevo (misma pestaña) o vuelve el foco.
    const sync = () => load();
    window.addEventListener("effe:invoices-updated", sync);
    window.addEventListener("focus", sync);
    return () => {
      active = false;
      clearTimeout(t);
      window.removeEventListener("effe:invoices-updated", sync);
      window.removeEventListener("focus", sync);
    };
  }, [busqueda, pagina]);

  return (
    <DashboardLayout role="anunciante">
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText size={16} className="text-secondary" /> Boletas de pago
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-5">
          <div className="relative mb-4">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por N° de comprobante o concepto…"
              className="h-9 pl-9"
            />
          </div>
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Cargando comprobantes…</p>
          ) : error ? (
            <p className="text-sm text-destructive text-center py-8">{error}</p>
          ) : invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {busqueda
                ? "Ningún comprobante coincide con esa búsqueda."
                : "Aún no tienes boletas. Se generan automáticamente al comprar créditos."}
            </p>
          ) : (
            <>
              {/* Escritorio: tabla completa */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>N° Comprobante</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Aviso</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>DNI/RUC</TableHead>
                      <TableHead>Usuario/Empresa</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Ver</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((inv) => (
                      <TableRow key={inv.number} className={clasesDeResaltado(inv.number)}>
                        <TableCell className="font-mono text-xs">{inv.number}</TableCell>
                        <TableCell className="text-xs capitalize">{inv.type}</TableCell>
                        <TableCell className="text-xs">{new Date(inv.date).toLocaleDateString("es-PE")}</TableCell>
                        <TableCell className="font-medium text-sm">{inv.listingTitle}</TableCell>
                        <TableCell className="text-sm">{inv.advertiser || "—"}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{inv.docNumber || "—"}</TableCell>
                        <TableCell className="text-xs">{personKindLabel(inv.docType, inv.docNumber)}</TableCell>
                        <TableCell className="text-right font-bold">{formatSoles(inv.amount)}</TableCell>
                        <TableCell><EstadoComprobante inv={inv} /></TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setDetail(inv)}>
                            <Eye size={14} /> Ver
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Móvil: tarjetas apiladas (sin scroll horizontal) */}
              <div className="md:hidden space-y-3">
                {invoices.map((inv) => (
                  <div
                    key={inv.number}
                    className={`border rounded-xl p-4 bg-card transition-colors duration-500 ${clasesDeResaltado(inv.number)}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-xs text-muted-foreground">{inv.number}</p>
                        <p className="font-semibold text-sm leading-snug mt-0.5 line-clamp-2">{inv.listingTitle}</p>
                      </div>
                      <p className="text-lg font-extrabold text-primary whitespace-nowrap">{formatSoles(inv.amount)}</p>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Fecha</p>
                        <p className="text-foreground">{new Date(inv.date).toLocaleDateString("es-PE")}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Usuario/Empresa</p>
                        <p className="text-foreground">{personKindLabel(inv.docType, inv.docNumber)}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Nombre</p>
                        <p className="text-foreground truncate">{inv.advertiser || "—"}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">DNI/RUC</p>
                        <p className="font-mono text-foreground">{inv.docNumber || "—"}</p>
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t flex items-center justify-between gap-2">
                      <EstadoComprobante inv={inv} />
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setDetail(inv)}>
                        <Eye size={14} /> Ver
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {total > MIS_COMPROBANTES_POR_PAGINA && (
                <TablePagination
                  page={pagina}
                  totalPages={totalPaginas}
                  total={total}
                  from={(pagina - 1) * MIS_COMPROBANTES_POR_PAGINA + 1}
                  to={Math.min(pagina * MIS_COMPROBANTES_POR_PAGINA, total)}
                  setPage={setPagina}
                  noun="comprobantes"
                />
              )}
            </>
          )}
        </CardContent>
      </Card>

      <InvoiceDetailDialog invoice={detail} onClose={() => setDetail(null)} />
    </DashboardLayout>
  );
};

export default AdvertiserInvoices;
