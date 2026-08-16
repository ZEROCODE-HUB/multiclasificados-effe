// Lee los comprobantes reales del anunciante desde la base de datos
// (tabla public.invoices), que es la fuente de verdad. La RLS `invoices_select`
// ya limita cada usuario a sus propias boletas (vía orders.user_id = auth.uid()).
import { supabase } from "@/lib/supabase";

export interface DbInvoice {
  number: string;
  type: "boleta" | "factura";
  date: string;          // issued_at
  email: string;
  advertiser: string;    // advertiser_name (nombre de Factiliza)
  docType: string | null;
  docNumber: string | null;
  factilizaData: Record<string, unknown> | null;
  amount: number;
  detail: string;
  listingTitle: string;  // título del aviso (join) o el detalle como respaldo
  /** Estado ante SUNAT. 'omitido' = comprobante interno, no declarado. */
  sunatStatus: string;
  /** Estado del correo al comprador. */
  emailStatus: string;
  /** Anulado desde el panel: la compra quedó sin efecto y se retiró el saldo. */
  anuladoAt: string | null;
  anuladoMotivo: string | null;
  /** Nota de crédito que lo anula ante SUNAT (null si era interno). */
  notaNumber: string | null;
}

interface Row {
  number: string;
  type: "boleta" | "factura";
  email: string | null;
  advertiser_name: string | null;
  doc_type: string | null;
  doc_number: string | null;
  factiliza_data: Record<string, unknown> | null;
  amount: number | string;
  detail: string | null;
  issued_at: string;
  sunat_status: string | null;
  email_status: string | null;
  anulado_at: string | null;
  anulado_motivo: string | null;
  nota_number: string | null;
  orders?: { order_listings?: Array<{ listings?: { title?: string | null } | null }> } | null;
}

export async function loadInvoicesFromDb(): Promise<DbInvoice[]> {
  const { data, error } = await supabase
    .from("invoices")
    .select(
      "number, type, email, advertiser_name, doc_type, doc_number, factiliza_data, amount, detail, issued_at, sunat_status, email_status, anulado_at, anulado_motivo, nota_number, orders(order_listings(listings(title)))"
    )
    .order("issued_at", { ascending: false });

  if (error) throw new Error(error.message);

  return ((data as Row[] | null) ?? []).map((r) => {
    const title = r.orders?.order_listings?.[0]?.listings?.title ?? "";
    return {
      number: r.number,
      type: r.type,
      date: r.issued_at,
      email: r.email ?? "",
      advertiser: r.advertiser_name ?? "",
      docType: r.doc_type,
      docNumber: r.doc_number,
      factilizaData: r.factiliza_data ?? null,
      amount: Number(r.amount) || 0,
      detail: r.detail ?? "",
      listingTitle: title || r.detail || "—",
      sunatStatus: r.sunat_status ?? "omitido",
      emailStatus: r.email_status ?? "pendiente",
      anuladoAt: r.anulado_at ?? null,
      anuladoMotivo: r.anulado_motivo ?? null,
      notaNumber: r.nota_number ?? null,
    };
  });
}
