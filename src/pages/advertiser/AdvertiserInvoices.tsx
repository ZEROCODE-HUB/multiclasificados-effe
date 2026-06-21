import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText } from "lucide-react";
import { Invoice, loadInvoices, formatSoles } from "@/lib/pricing";

const AdvertiserInvoices = () => {
  const [invoices, setInvoices] = useState<Invoice[]>(() => loadInvoices());
  useEffect(() => {
    const sync = () => setInvoices(loadInvoices());
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
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
          {invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Aún no tienes boletas. Se generarán automáticamente al publicar un aviso.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>N° Boleta</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Aviso</TableHead>
                  <TableHead>Correo</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono text-xs">{inv.number}</TableCell>
                    <TableCell className="text-xs">{new Date(inv.date).toLocaleDateString("es-PE")}</TableCell>
                    <TableCell className="font-medium text-sm">{inv.listingTitle}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{inv.email}</TableCell>
                    <TableCell className="text-right font-bold">{formatSoles(inv.amount)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-success border-success/30 bg-success/10">Enviada</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </DashboardLayout>
  );
};

export default AdvertiserInvoices;
