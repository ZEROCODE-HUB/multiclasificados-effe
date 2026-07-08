// REQ-01: crea un aviso real, sube las imágenes al Storage, genera la orden +
// comprobante y lo publica con vigencia. Devuelve el id y el número de boleta.
import { supabase } from "@/lib/supabase";
import { splitIgv } from "@/lib/pricing";

export interface PublishPhoto {
  file: File;
  name: string;
}

export interface ListingForm {
  category: string;
  title: string;
  description: string;
  price: string;
  currency: string;
  location: string;
  condition: string;
}

// Lo que hace falta para dejar un aviso guardado como borrador: el contenido y
// el plan de publicación elegido. Sin comprobante ni identidad: no se cobra nada.
export interface DraftInput {
  form: ListingForm;
  lat?: number | null;
  lng?: number | null;
  quantity: number;
  duration: number;
  extras: Record<string, number | undefined>;
  mainPhoto: PublishPhoto | null;
  secondPhoto: PublishPhoto | null;
  // Si viene, se actualiza ese borrador en vez de crear otro. Así "Guardar"
  // dos veces no deja dos avisos en "Mis borradores".
  draftId?: string | null;
}

export interface PublishInput extends DraftInput {
  total: number;
  receiptType: "boleta" | "factura";
  email: string;
  advertiserName: string;
  docType?: "dni" | "ruc";
  docNumber?: string;
}

const CONDITION_MAP: Record<string, "nuevo" | "usado" | "na"> = {
  nuevo: "nuevo",
  usado: "usado",
  reacondicionado: "usado",
  na: "na",
};

const sanitize = (n: string) => n.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-40);

// Campos del aviso comunes al borrador y a la publicación.
const listingRow = (input: DraftInput) => ({
  category_id: input.form.category,
  title: input.form.title,
  description: input.form.description,
  price: Number(input.form.price) || 0,
  currency: input.form.currency === "USD" ? "USD" : "PEN",
  condition: CONDITION_MAP[input.form.condition] ?? "na",
  location: input.form.location,
  lat: input.lat ?? null,
  lng: input.lng ?? null,
  // Plan elegido pero aún no pagado (ver 0041_listing_draft_plan.sql). Sin esto,
  // al retomar un borrador se perdía la duración y los extras.
  plan_duration_days: input.duration,
  plan_quantity: input.quantity,
  plan_extras: input.extras,
});

// Sube la portada y la segunda foto. En una actualización se reemplazan las
// filas anteriores: si no, al volver a guardar el borrador el aviso acumularía
// imágenes viejas junto a las nuevas.
async function uploadListingPhotos(userId: string, listingId: string, input: DraftInput, replace: boolean) {
  const photos = [input.mainPhoto, input.secondPhoto].filter(Boolean) as PublishPhoto[];
  if (!photos.length) return;
  if (replace) await supabase.from("listing_images").delete().eq("listing_id", listingId);

  let sort = 0;
  for (const p of photos) {
    const path = `${userId}/${listingId}/${sort}-${sanitize(p.name)}`;
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
}

// Crea el aviso en estado `draft` (o actualiza el borrador indicado) y sube las
// imágenes. No cobra ni publica: es lo que usa "Guardar en mis borradores" y
// también el primer tramo de la publicación completa.
export async function saveListingDraft(input: DraftInput): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Debes iniciar sesión para guardar el borrador.");

  // La BD exige title y category_id (NOT NULL). Lo comprobamos aquí para dar un
  // mensaje entendible en vez de un error de Postgres.
  if (!input.form.title.trim()) throw new Error("Ponle un título al aviso para guardarlo.");
  if (!input.form.category) throw new Error("Elige una categoría para guardar el borrador.");

  if (input.draftId) {
    // `owner_id` en el filtro además de la RLS: `listings_update_own_or_staff`
    // no tiene WITH CHECK, y un staff editando su propio borrador no debería
    // poder apuntar a un id ajeno por un bug del cliente.
    const { error } = await supabase
      .from("listings")
      .update(listingRow(input))
      .eq("id", input.draftId)
      .eq("owner_id", user.id)
      .eq("status", "draft"); // nunca reescribir un aviso ya publicado
    if (error) throw new Error(error.message);
    await uploadListingPhotos(user.id, input.draftId, input, true);
    return input.draftId;
  }

  const { data, error } = await supabase
    .from("listings")
    .insert({ ...listingRow(input), owner_id: user.id, status: "draft" })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "No se pudo guardar el borrador.");

  const listingId = data.id as string;
  await uploadListingPhotos(user.id, listingId, input, false);
  return listingId;
}

// Datos de cobro/comprobante para cerrar la publicación de un aviso que YA existe
// en la BD (recién creado, o un borrador que el usuario retoma).
export interface FinalizeInput {
  quantity: number;
  duration: number;
  extras: Record<string, number | undefined>;
  total: number;
  receiptType: "boleta" | "factura";
  email: string;
  advertiserName: string;
  docType?: "dni" | "ruc";
  docNumber?: string;
}

export async function createAndPublishListing(
  input: PublishInput
): Promise<{ listingId: string; invoiceNumber: string; published: boolean; invoiceSaved: boolean }> {
  // 1) Crear el aviso en `draft` y subir las imágenes. Si `draftId` viene, se
  //    reutiliza ese borrador: publicar tras haber pulsado "Guardar en mis
  //    borradores" no debe dejar DOS avisos.
  const listingId = await saveListingDraft(input);
  const r = await finalizeListingPublication(listingId, input);
  return { listingId, ...r };
}

// Orden + comprobante + activación de un aviso existente. Lo comparten la
// publicación desde el formulario y la publicación de un borrador guardado.
export async function finalizeListingPublication(
  listingId: string,
  input: FinalizeInput,
): Promise<{ invoiceNumber: string; published: boolean; invoiceSaved: boolean }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Debes iniciar sesión para publicar.");

  // 1.b) Persistir la identidad verificada (Factiliza) en el perfil del usuario,
  //      para que el DNI/RUC quede en la base de datos y coincida con el comprobante.
  if (input.docType && input.docNumber) {
    const { error: pfErr } = await supabase
      .from("profiles")
      .update({ doc_type: input.docType, doc_number: input.docNumber, verified: true })
      .eq("id", user.id);
    if (pfErr) console.error("[publish] No se pudo guardar el documento en el perfil:", pfErr.message);
  }

  // 3) Orden + comprobante — TODO comprobante debe guardarse: los errores se
  //    registran (no se ignoran en silencio) para poder diagnosticarlos.
  //    El total ya incluye IGV (ver IGV_RATE en el motor de precios).
  let invoiceNumber = "";
  let invoiceSaved = false;
  const { subtotal, igv } = splitIgv(input.total);
  const { data: order, error: oErr } = await supabase
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
  if (oErr || !order) {
    console.error("[publish] No se pudo crear la orden:", oErr?.message);
  } else {
    const { error: olErr } = await supabase
      .from("order_listings")
      .insert({ order_id: order.id, listing_id: listingId });
    if (olErr) console.error("[publish] No se pudo vincular el aviso a la orden:", olErr.message);

    const { data: inv, error: iErr } = await supabase
      .from("invoices")
      .insert({
        order_id: order.id,
        type: input.receiptType,
        email: input.email,
        advertiser_name: input.advertiserName,
        doc_number: input.docNumber ?? null,
        amount: input.total,
        detail: `Aviso ${input.duration} días · ${input.quantity} unidad(es)`,
      })
      .select("number")
      .single();
    if (iErr) console.error("[publish] No se pudo generar el comprobante en la BD:", iErr.message);
    invoiceNumber = inv?.number ?? "";
    invoiceSaved = !iErr && !!inv;
  }

  // 4) Publicar: estado active + vigencia (published_at / expires_at).
  //    Si falla, NO descartamos el comprobante: devolvemos published=false para
  //    que el llamador guarde igualmente la boleta y avise al usuario.
  const { error: pErr } = await supabase.rpc("publish_listing", {
    p_listing: listingId,
    p_duration_days: input.duration,
  });
  if (pErr) console.error("[publish] No se pudo activar el aviso:", pErr.message);

  return { invoiceNumber, published: !pErr, invoiceSaved };
}
