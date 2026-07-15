import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import { formatSoles } from "@/lib/pricing";
import { personKindLabel, docKindLabel, factilizaRows } from "@/lib/identity";

// Datos mínimos comunes a la boleta del usuario (DbInvoice) y del admin (AdminInvoice).
export interface InvoiceDetailData {
  number: string;
  type: string;            // boleta | factura
  date: string;
  advertiser: string;      // nombre / razón social de Factiliza
  docType: string | null;
  docNumber: string | null;
  factilizaData?: Record<string, unknown> | null;
  email: string;
  listingTitle: string;
  amount: number;
}

// Modal "Ver": muestra TODOS los datos del comprobante, incluidos los traídos de
// Factiliza (nombre, DNI/RUC y tipo Usuario/Empresa). Se usa igual en el panel de
// administración y en la vista del usuario (móvil incluido).
export function InvoiceDetailDialog({ invoice, onClose }: { invoice: InvoiceDetailData | null; onClose: () => void }) {
  const rows: Array<[string, string]> = invoice
    ? [
        ["N° Comprobante", invoice.number],
        ["Tipo de comprobante", invoice.type],
        ["Fecha", new Date(invoice.date).toLocaleString("es-PE")],
        ["Nombre / Razón social", invoice.advertiser || "—"],
        ["Tipo", personKindLabel(invoice.docType, invoice.docNumber)],
        [docKindLabel(invoice.docType, invoice.docNumber), invoice.docNumber || "—"],
        // Ficha de Factiliza (domicilio, ubigeo, estado del RUC, etc.), si la hay.
        ...factilizaRows(invoice.docType, invoice.factilizaData),
        ["Correo", invoice.email || "—"],
        ["Aviso", invoice.listingTitle || "—"],
      ]
    : [];

  return (
    <Dialog open={!!invoice} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText size={16} className="text-secondary" /> Detalle del comprobante
          </DialogTitle>
          <DialogDescription className="sr-only">Datos completos de la boleta</DialogDescription>
        </DialogHeader>
        {invoice && (
          <div className="divide-y">
            {rows.map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-4 py-2">
                <span className="text-xs uppercase tracking-wide text-muted-foreground shrink-0">{label}</span>
                <span className="text-sm font-medium text-foreground text-right break-words capitalize">{value}</span>
              </div>
            ))}
            <div className="flex items-center justify-between gap-4 py-2">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Monto</span>
              <span className="text-base font-extrabold text-primary">{formatSoles(invoice.amount)}</span>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
