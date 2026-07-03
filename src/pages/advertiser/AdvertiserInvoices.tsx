import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText } from "lucide-react";
import { formatSoles } from "@/lib/pricing";
import { loadInvoicesFromDb, type DbInvoice } from "@/lib/invoices";

const AdvertiserInvoices = () => {
  const [invoices, setInvoices] = useState<DbInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const rows = await loadInvoicesFromDb();
        if (active) { setInvoices(rows); setError(null); }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "No se pudieron cargar los comprobantes.");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    // Refresca cuando se emite un comprobante nuevo (misma pestaña) o vuelve el foco.
    const sync = () => load();
    window.addEventListener("effe:invoices-updated", sync);
    window.addEventListener("focus", sync);
    return () => {
      active = false;
      window.removeEventListener("effe:invoices-updated", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  return (
    <DashboardLayout role="anunciante">
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText size={16} className="text-secondary" /> Boletas de pago
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-5">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Cargando comprobantes…</p>
          ) : error ? (
            <p className="text-sm text-destructive text-center py-8">{error}</p>
          ) : invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Aún no tienes boletas. Se generarán automáticamente al publicar un aviso.
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
                      <TableHead>DNI/RUC</TableHead>
                      <TableHead>Correo</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((inv) => (
                      <TableRow key={inv.number}>
                        <TableCell className="font-mono text-xs">{inv.number}</TableCell>
                        <TableCell className="text-xs capitalize">{inv.type}</TableCell>
                        <TableCell className="text-xs">{new Date(inv.date).toLocaleDateString("es-PE")}</TableCell>
                        <TableCell className="font-medium text-sm">{inv.listingTitle}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{inv.docNumber || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{inv.email}</TableCell>
                        <TableCell className="text-right font-bold">{formatSoles(inv.amount)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-success border-success/30 bg-success/10">Enviada</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Móvil: tarjetas apiladas (sin scroll horizontal) */}
              <div className="md:hidden space-y-3">
                {invoices.map((inv) => (
                  <div key={inv.number} className="border rounded-xl p-4 bg-card">
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
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Tipo</p>
                        <p className="text-foreground capitalize">{inv.type}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">DNI/RUC</p>
                        <p className="font-mono text-foreground">{inv.docNumber || "—"}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Correo</p>
                        <p className="text-foreground truncate">{inv.email}</p>
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t flex justify-end">
                      <Badge variant="outline" className="text-success border-success/30 bg-success/10">Enviada</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </DashboardLayout>
  );
};

export default AdvertiserInvoices;
