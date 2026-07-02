// Lee los comprobantes reales del anunciante desde la base de datos
// (tabla public.invoices), que es la fuente de verdad. La RLS `invoices_select`
// ya limita cada usuario a sus propias boletas (vía orders.user_id = auth.uid()).
import { supabase } from "@/lib/supabase";

export interface DbInvoice {
  number: string;
  type: "boleta" | "factura";
  date: string;          // issued_at
  email: string;
  advertiser: string;    // advertiser_name
  docNumber: string | null;
  amount: number;
  detail: string;
  listingTitle: string;  // título del aviso (join) o el detalle como respaldo
}

interface Row {
  number: string;
  type: "boleta" | "factura";
  email: string | null;
  advertiser_name: string | null;
  doc_number: string | null;
  amount: number | string;
  detail: string | null;
  issued_at: string;
  orders?: { order_listings?: Array<{ listings?: { title?: string | null } | null }> } | null;
}

export async function loadInvoicesFromDb(): Promise<DbInvoice[]> {
  const { data, error } = await supabase
    .from("invoices")
    .select(
      "number, type, email, advertiser_name, doc_number, amount, detail, issued_at, orders(order_listings(listings(title)))"
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
      docNumber: r.doc_number,
      amount: Number(r.amount) || 0,
      detail: r.detail ?? "",
      listingTitle: title || r.detail || "—",
    };
  });
}
