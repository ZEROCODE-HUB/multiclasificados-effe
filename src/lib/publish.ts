// REQ-01: crea un aviso real, sube las imágenes al Storage, genera la orden +
// comprobante y lo publica con vigencia. Devuelve el id y el número de boleta.
import { supabase } from "@/lib/supabase";

export interface PublishPhoto {
  file: File;
  name: string;
}

export interface PublishInput {
  form: {
    category: string;
    title: string;
    description: string;
    price: string;
    currency: string;
    location: string;
    condition: string;
  };
  quantity: number;
  duration: number;
  extras: Record<string, number | undefined>;
  total: number;
  mainPhoto: PublishPhoto | null;
  secondPhoto: PublishPhoto | null;
  receiptType: "boleta" | "factura";
  email: string;
  advertiserName: string;
}

const CONDITION_MAP: Record<string, "nuevo" | "usado" | "na"> = {
  nuevo: "nuevo",
  usado: "usado",
  reacondicionado: "usado",
  na: "na",
};

const sanitize = (n: string) => n.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-40);
const round2 = (n: number) => Math.round(n * 100) / 100;

export async function createAndPublishListing(
  input: PublishInput
): Promise<{ listingId: string; invoiceNumber: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Debes iniciar sesión para publicar.");

  // 1) Crear el aviso (borrador)
  const { data: listing, error: lErr } = await supabase
    .from("listings")
    .insert({
      owner_id: user.id,
      category_id: input.form.category,
      title: input.form.title,
      description: input.form.description,
      price: Number(input.form.price) || 0,
      currency: input.form.currency === "USD" ? "USD" : "PEN",
      condition: CONDITION_MAP[input.form.condition] ?? "na",
      location: input.form.location,
      status: "draft",
    })
    .select("id")
    .single();
  if (lErr || !listing) throw new Error(lErr?.message ?? "No se pudo crear el aviso.");

  const listingId = listing.id as string;

  // 2) Subir imágenes al bucket listing-images (carpeta = uid del dueño)
  const photos = [input.mainPhoto, input.secondPhoto].filter(Boolean) as PublishPhoto[];
  let sort = 0;
  for (const p of photos) {
    const path = `${user.id}/${listingId}/${sort}-${sanitize(p.name)}`;
    const { error: upErr } = await supabase.storage
      .from("listing-images")
      .upload(path, p.file, { upsert: true });
    if (!upErr) {
      const { data: pub } = supabase.storage.from("listing-images").getPublicUrl(path);
      await supabase.from("listing_images").insert({
        listing_id: listingId,
        storage_path: path,
        url: pub.publicUrl,
        sort_order: sort,
      });
    }
    sort++;
  }

  // 3) Orden + comprobante (best-effort; el total ya incluye IGV 18%)
  let invoiceNumber = "";
  try {
    const subtotal = round2(input.total / 1.18);
    const igv = round2(input.total - subtotal);
    const { data: order } = await supabase
      .from("orders")
      .insert({
        user_id: user.id,
        listing_qty: input.quantity,
        duration_days: input.duration,
        extras: input.extras,
        subtotal,
        igv,
        total: input.total,
        status: "paid",
      })
      .select("id")
      .single();
    if (order) {
      await supabase.from("order_listings").insert({ order_id: order.id, listing_id: listingId });
      const { data: inv } = await supabase
        .from("invoices")
        .insert({
          order_id: order.id,
          type: input.receiptType,
          email: input.email,
          advertiser_name: input.advertiserName,
          amount: input.total,
          detail: `Aviso ${input.duration} días · ${input.quantity} unidad(es)`,
        })
        .select("number")
        .single();
      invoiceNumber = inv?.number ?? "";
    }
  } catch {
    /* el comprobante es secundario; el aviso ya está creado */
  }

  // 4) Publicar: estado active + vigencia (published_at / expires_at)
  const { error: pErr } = await supabase.rpc("publish_listing", {
    p_listing: listingId,
    p_duration_days: input.duration,
  });
  if (pErr) throw new Error(pErr.message);

  return { listingId, invoiceNumber };
}
