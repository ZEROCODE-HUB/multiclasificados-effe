// REQ-01: crea un aviso real, sube las imágenes al Storage y lo publica con
// vigencia. NO emite comprobante: la boleta se emite SOLO al COMPRAR créditos
// (flujo Izipay). Publicar únicamente descuenta saldo, lo hace el llamador.
import { supabase } from "@/lib/supabase";
import { compressImage } from "@/lib/compressImage";
import { fetchListingDocumentUrl } from "@/lib/listings";
import type { AdjuntoSubido } from "@/lib/subidaAnticipada";

export interface PublishPhoto {
  file: File;
  name: string;
  /**
   * La imagen ya pasó por `compressImage` (se hace al ELEGIRLA, mientras el
   * usuario sigue rellenando el formulario). Sin esto, comprimir cuatro fotos
   * de 10 MP se acumulaba entero en el clic de "Publicar": 1-3 s de interfaz
   * congelada justo cuando el usuario espera.
   */
  comprimida?: boolean;
  /**
   * El archivo YA está en Storage, subido mientras se rellenaba el formulario
   * (ver `subidaAnticipada.ts`). Cuando viene, publicar no vuelve a subirlo: solo
   * apunta la fila a donde ya está. Es lo que hace que "Publicar" sea instantáneo
   * en vez de esperar a que suban 46 MB de vídeo.
   */
  subido?: AdjuntoSubido;
}

export interface ListingForm {
  category: string;
  title: string;
  description: string;
  price: string;
  currency: string;
  /** Código de departamento del INEI. Es por lo que se filtra en el buscador. */
  department: string;
  /** Referencia libre (distrito, urbanización). No se usa para filtrar. */
  location: string;
  condition: string;
  /** País del aviso (ISO alpha-2). Sin valor = Perú, que es el caso normal. */
  country?: string;
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
  // Imágenes adicionales (adicional "Imagen adicional", hasta 3). Van después de
  // la portada, en orden.
  extraPhotos: PublishPhoto[];
  // PDF adjunto (adicional "PDF adjunto"). Se sube al bucket privado listing-docs
  // y su ruta queda en listings.document_url. Null = no se adjuntó / se quitó.
  pdf?: PublishPhoto | null;
  /**
   * Vídeos del aviso (adicional "video20", hasta 3 de 20 s). Van al bucket
   * público listing-videos y sus filas a `listing_videos`.
   */
  videos?: PublishPhoto[];
  // Si viene, se actualiza ese borrador en vez de crear otro. Así "Guardar"
  // dos veces no deja dos avisos en "Mis borradores".
  draftId?: string | null;
  /**
   * Identificador con el que CREAR el aviso, reservado por el navegador antes de
   * que exista la fila (ver `subidaAnticipada.ts`).
   *
   * Es lo que permite subir los adjuntos mientras el usuario escribe: la ruta de
   * Storage necesita saber a qué aviso pertenece el archivo, y esperar a tener
   * la fila obligaría a crear un borrador en "Mis avisos" solo para poder subir
   * una foto. Con el id reservado, la ruta es desde el principio la definitiva.
   *
   * Se ignora si ya hay `draftId`: entonces el aviso existe y tiene el suyo.
   */
  idReservado?: string | null;
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
  // Nunca negativo: el campo es un <input type=number> y el navegador deja
  // teclear "-5" aunque tenga min=0. La base lo remata con un CHECK.
  price: Math.max(0, Number(input.form.price) || 0),
  currency: input.form.currency === "USD" ? "USD" : "PEN",
  condition: CONDITION_MAP[input.form.condition] ?? "na",
  // El departamento es del INEI: solo tiene sentido dentro del Perú.
  country: (input.form.country || "PE").toUpperCase(),
  department: (input.form.country || "PE").toUpperCase() === "PE"
    ? input.form.department || null
    : null,
  location: input.form.location,
  lat: input.lat ?? null,
  lng: input.lng ?? null,
  // Plan elegido pero aún no pagado (ver 0041_listing_draft_plan.sql). Sin esto,
  // al retomar un borrador se perdía la duración y los extras.
  plan_duration_days: input.duration,
  plan_quantity: input.quantity,
  plan_extras: input.extras,
});

/**
 * Id del usuario con sesión iniciada.
 *
 * `getSession()` lee el token que ya está en memoria/localStorage; `getUser()`
 * pregunta al servidor. Publicar llamaba a `getUser()` TRES veces (una por
 * `saveListingDraft`, otra por `finalizeListingPublication` y otra al refrescar
 * el saldo): medio segundo largo de espera para saber tres veces lo mismo.
 */
async function usuarioActual(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

// Sube la portada y las imágenes adicionales. En una actualización se reemplazan
// las filas anteriores: si no, al volver a guardar el borrador el aviso acumularía
// imágenes viejas junto a las nuevas.
//
// Las subidas van EN PARALELO y las filas de `listing_images` en un único insert.
// Antes era un `for` con `await` dentro: dos viajes al servidor por foto, uno
// detrás de otro. Con cuatro fotos eran ocho viajes encadenados, y en 4G eso son
// varios segundos de "Publicando…" sin que pase nada.
async function uploadListingPhotos(
  userId: string,
  listingId: string,
  input: DraftInput,
  replace: boolean,
  onProgress?: (hechas: number, total: number) => void,
) {
  const photos = [input.mainPhoto, ...(input.extraPhotos ?? [])].filter(Boolean) as PublishPhoto[];
  if (!photos.length) return;
  if (replace) await supabase.from("listing_images").delete().eq("listing_id", listingId);

  let hechas = 0;
  const total = photos.length;
  const filas = await Promise.all(
    photos.map(async (p, sort) => {
      // Ya subida mientras se rellenaba el formulario: solo hay que apuntar la
      // fila a donde está. Es el caso normal desde la subida anticipada, y es lo
      // que hace que "Publicar" no espere a ningún archivo.
      if (p.subido) {
        onProgress?.(++hechas, total);
        return { listing_id: listingId, storage_path: p.subido.path, url: p.subido.url, sort_order: sort };
      }
      // Si se comprimió al elegirla, no se vuelve a hacer: recodificar un WebP
      // ya reducido cuesta lo mismo y no gana nada.
      const file = p.comprimida ? p.file : await compressImage(p.file);
      const path = `${userId}/${listingId}/${sort}-${sanitize(file.name)}`;
      const { error: upErr } = await supabase.storage
        .from("listing-images")
        .upload(path, file, { upsert: true, cacheControl: "2592000", contentType: file.type || undefined });
      onProgress?.(++hechas, total);
      if (upErr) return null;
      const { data: pub } = supabase.storage.from("listing-images").getPublicUrl(path);
      return { listing_id: listingId, storage_path: path, url: pub.publicUrl, sort_order: sort };
    }),
  );

  const validas = filas.filter(Boolean);
  if (validas.length) await supabase.from("listing_images").insert(validas);
}

// Sube los vídeos del aviso. Sin comprimir: recodificar vídeo en el navegador
// tarda más que subirlo, y el tope del bucket ya acota lo que entra.
async function uploadListingVideos(
  userId: string,
  listingId: string,
  videos: PublishPhoto[],
  replace: boolean,
) {
  if (!videos.length) {
    if (replace) await supabase.from("listing_videos").delete().eq("listing_id", listingId);
    return;
  }
  if (replace) await supabase.from("listing_videos").delete().eq("listing_id", listingId);

  const filas = await Promise.all(
    videos.map(async (v, sort) => {
      // Un vídeo pesa hasta 15 MB: si ya subió mientras el usuario escribía, no
      // se vuelve a mandar ni por asomo. Aquí es donde más se nota.
      if (v.subido) {
        return { listing_id: listingId, storage_path: v.subido.path, url: v.subido.url, sort_order: sort };
      }
      const path = `${userId}/${listingId}/${sort}-${sanitize(v.name)}`;
      const { error } = await supabase.storage
        .from("listing-videos")
        .upload(path, v.file, { upsert: true, cacheControl: "2592000", contentType: v.file.type || undefined });
      if (error) { console.error("[publish] No se pudo subir el video:", error.message); return null; }
      const { data: pub } = supabase.storage.from("listing-videos").getPublicUrl(path);
      return { listing_id: listingId, storage_path: path, url: pub.publicUrl, sort_order: sort };
    }),
  );

  const validas = filas.filter(Boolean);
  if (validas.length) await supabase.from("listing_videos").insert(validas);
}

// Sube el PDF adjunto al bucket privado listing-docs y guarda su ruta en
// listings.document_url. La ruta empieza por el id del usuario (lo exige la RLS
// del bucket). Si algo falla, no rompe la publicación: el aviso queda sin PDF.
async function uploadListingDoc(userId: string, listingId: string, pdf: PublishPhoto): Promise<void> {
  if (pdf.subido) {
    const { error } = await supabase.from("listings").update({ document_url: pdf.subido.path }).eq("id", listingId);
    if (error) console.error("[publish] No se pudo guardar la ruta del PDF:", error.message);
    return;
  }
  const path = `${userId}/${listingId}.pdf`;
  const { error: upErr } = await supabase.storage
    .from("listing-docs")
    .upload(path, pdf.file, { contentType: "application/pdf", upsert: true });
  if (upErr) { console.error("[publish] No se pudo subir el PDF:", upErr.message); return; }
  const { error: dbErr } = await supabase.from("listings").update({ document_url: path }).eq("id", listingId);
  if (dbErr) console.error("[publish] No se pudo guardar la ruta del PDF:", dbErr.message);
}

// Crea el aviso en estado `draft` (o actualiza el borrador indicado) y sube las
// imágenes. No cobra ni publica: es lo que usa "Guardar en mis borradores" y
// también el primer tramo de la publicación completa.
export async function saveListingDraft(
  input: DraftInput,
  onProgress?: (hechas: number, total: number) => void,
): Promise<string> {
  const userId = await usuarioActual();
  if (!userId) throw new Error("Debes iniciar sesión para guardar el borrador.");

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
      .eq("owner_id", userId)
      .eq("status", "draft"); // nunca reescribir un aviso ya publicado
    if (error) throw new Error(error.message);
    // El PDF no depende de las fotos: subirlo después era encadenar dos esperas.
    await Promise.all([
      uploadListingPhotos(userId, input.draftId, input, true, onProgress),
      input.pdf ? uploadListingDoc(userId, input.draftId, input.pdf) : Promise.resolve(),
      uploadListingVideos(userId, input.draftId, input.videos ?? [], true),
    ]);
    return input.draftId;
  }

  // El id va explícito cuando el navegador ya lo reservó y subió archivos a esa
  // ruta. Si no se respetara, los adjuntos quedarían en la carpeta de un aviso
  // que no existe y el aviso saldría sin fotos.
  const fila: Record<string, unknown> = { ...listingRow(input), owner_id: userId, status: "draft" };
  if (input.idReservado) fila.id = input.idReservado;

  const { data, error } = await supabase
    .from("listings")
    .insert(fila)
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "No se pudo guardar el borrador.");

  const listingId = data.id as string;
  await Promise.all([
    uploadListingPhotos(userId, listingId, input, false, onProgress),
    input.pdf ? uploadListingDoc(userId, listingId, input.pdf) : Promise.resolve(),
    uploadListingVideos(userId, listingId, input.videos ?? [], false),
  ]);
  return listingId;
}

/**
 * Renueva un aviso activo o recién vencido: le suma días sin dejarlo caer.
 *
 * A diferencia de publicar, el aviso conserva su id, sus visitas, sus favoritos
 * y su enlace. Los días se suman a los que le quedaban (ver migración 0113).
 */
export async function renovarAviso(listingId: string, duration: number): Promise<void> {
  const { error } = await supabase.rpc("renovar_aviso", {
    p_listing: listingId,
    p_duration_days: duration,
  });
  if (!error) return;
  if (error.code === "EF001" || /saldo insuficiente/i.test(error.message)) {
    const cifras = faltanteDelError(error.message);
    const err = new SaldoInsuficiente(
      cifras ? `Te faltan S/ ${cifras.faltan.toFixed(2)} para renovar este aviso.` : undefined,
    );
    err.listingId = listingId;
    if (cifras) { err.costo = cifras.costo; err.faltan = cifras.faltan; }
    throw err;
  }
  throw new Error(error.message);
}

/** Lo que hace falta para volver a llenar el formulario con un aviso existente. */
export interface AvisoCopiado {
  /** `country` va garantizado, a diferencia de `ListingForm`: la copia siempre
   *  sabe de qué país es, sea el del original o Perú. */
  form: ListingForm & { country: string };
  lat: number | null;
  lng: number | null;
  duration: number;
  quantity: number;
  extras: Record<string, number | undefined>;
  mainPhoto: PublishPhoto | null;
  extraPhotos: PublishPhoto[];
  pdf: PublishPhoto | null;
  /** true si alguna foto o el PDF no se pudieron traer. */
  faltanAdjuntos: boolean;
}

const CONDITION_INVERSA: Record<string, string> = { nuevo: "nuevo", usado: "usado", na: "na" };

/** Descarga un archivo público o firmado y lo convierte en File. */
async function comoArchivo(url: string, nombre: string, tipo?: string): Promise<PublishPhoto | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return { file: new File([blob], nombre, { type: tipo || blob.type }), name: nombre };
  } catch {
    return null;
  }
}

/**
 * Carga un aviso existente para publicar OTRO igual.
 *
 * No toca el original: devuelve sus datos y sus archivos ya descargados para
 * rellenar el formulario. Si alguna imagen no se puede traer se avisa, pero se
 * rellena todo lo demás: un formulario a medio llenar sirve, un error no.
 */
export async function cargarAvisoParaCopiar(listingId: string): Promise<AvisoCopiado> {
  const { data, error } = await supabase
    .from("listings")
    .select("title, description, price, currency, condition, category_id, department, location, lat, lng, " +
            "country, plan_duration_days, plan_quantity, plan_extras, document_url, listing_images(url, sort_order)")
    .eq("id", listingId)
    .maybeSingle();
  if (error || !data) throw new Error("No se pudo cargar el aviso que quieres copiar.");

  const r = data as unknown as Record<string, unknown>;
  const imagenes = ((r.listing_images ?? []) as Array<{ url?: string; sort_order?: number }>)
    .filter((i) => !!i.url)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const descargas = await Promise.all(
    imagenes.map((img, i) => comoArchivo(String(img.url), `copia-${i}.webp`, "image/webp")),
  );
  const pdfUrl = r.document_url ? await fetchListingDocumentUrl(listingId) : null;
  const pdf = pdfUrl ? await comoArchivo(pdfUrl, "documento.pdf", "application/pdf") : null;

  const fotos = descargas.filter((f): f is PublishPhoto => !!f);
  const faltanAdjuntos = fotos.length !== imagenes.length || (!!r.document_url && !pdf);

  return {
    form: {
      category: String(r.category_id ?? ""),
      title: String(r.title ?? ""),
      description: String(r.description ?? ""),
      price: r.price != null ? String(r.price) : "",
      currency: r.currency === "USD" ? "USD" : "PEN",
      department: String(r.department ?? ""),
      location: String(r.location ?? ""),
      condition: CONDITION_INVERSA[String(r.condition ?? "na")] ?? "na",
      // Sin esto la copia de un aviso de fuera del Perú salía con el país por
      // defecto: mismo texto de ubicación, pero archivado en otro sitio.
      country: String(r.country ?? "PE"),
    },
    lat: r.lat != null ? Number(r.lat) : null,
    lng: r.lng != null ? Number(r.lng) : null,
    duration: Number(r.plan_duration_days) || 7,
    quantity: Number(r.plan_quantity) || 1,
    extras: (r.plan_extras ?? {}) as Record<string, number | undefined>,
    mainPhoto: fotos[0] ?? null,
    extraPhotos: fotos.slice(1),
    pdf,
    faltanAdjuntos,
  };
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

/**
 * El aviso NO se publicó porque al anunciante no le alcanza el saldo.
 *
 * Desde la migración 0091 publicar y cobrar son una sola operación, así que
 * este caso deja el aviso como estaba (borrador o vencido) y sin cobrar nada.
 * Antes el aviso quedaba publicado y el cobro se perdía.
 */
export class SaldoInsuficiente extends Error {
  /**
   * El aviso que se quedó sin publicar. Ya existe en la base de datos como
   * borrador (las imágenes se subieron), así que quien reintente TIENE que
   * reutilizarlo: volver a llamar sin él dejaría un aviso duplicado.
   */
  listingId?: string;

  /** Lo que cuesta publicar, en soles. */
  costo?: number;
  /** Lo que le falta al usuario, en soles. */
  faltan?: number;

  constructor(message = "Tu saldo no alcanza para publicar este aviso.") {
    super(message);
    this.name = "SaldoInsuficiente";
  }
}

/**
 * Saca el costo y el saldo del mensaje que emite la base de datos
 * ("Saldo insuficiente: se necesitan X créditos y hay Y", migración 0096).
 *
 * Decir "no te alcanza" a secas obliga al usuario a ir a mirar su saldo y hacer
 * la resta él. La cifra ya viaja en el error: solo hay que leerla.
 */
export function faltanteDelError(mensaje: string): { costo: number; faltan: number } | null {
  const m = /se necesitan\s+([\d.]+)\s+cr[eé]ditos?\s+y\s+hay\s+([\d.]+)/i.exec(mensaje ?? "");
  if (!m) return null;
  const costo = Number(m[1]);
  const saldo = Number(m[2]);
  if (!Number.isFinite(costo) || !Number.isFinite(saldo)) return null;
  return { costo, faltan: Math.round(Math.max(0, costo - saldo) * 100) / 100 };
}

export async function createAndPublishListing(
  input: PublishInput,
  onProgress?: (hechas: number, total: number) => void,
): Promise<{ listingId: string; published: boolean }> {
  // 1) Crear el aviso en `draft` y subir las imágenes. Si `draftId` viene, se
  //    reutiliza ese borrador: publicar tras haber pulsado "Guardar en mis
  //    borradores" no debe dejar DOS avisos.
  const listingId = await saveListingDraft(input, onProgress);
  try {
    const r = await finalizeListingPublication(listingId, input);
    return { listingId, ...r };
  } catch (e) {
    // Si faltó saldo, el aviso ya está creado como borrador. Se devuelve su id
    // con el error para que el reintento publique ESE y no cree otro.
    if (e instanceof SaldoInsuficiente) e.listingId = listingId;
    throw e;
  }
}

// Orden + comprobante + activación de un aviso existente. Lo comparten la
// publicación desde el formulario y la publicación de un borrador guardado.
export async function finalizeListingPublication(
  listingId: string,
  input: FinalizeInput,
): Promise<{ published: boolean }> {
  const userId = await usuarioActual();
  if (!userId) throw new Error("Debes iniciar sesión para publicar.");

  // Persistir la identidad verificada (Factiliza) en el perfil del usuario, para
  // que el DNI/RUC quede en la base de datos. Se reutiliza en la compra de
  // créditos, que es el único punto donde se emite el comprobante.
  //
  // NO se toca `profiles.verified`: ese es el sello de confianza que decide el
  // equipo de administración y que se enseña en las tarjetas. Antes se ponía a
  // true aquí, con lo que casi cualquiera que publicase salía como "Verificado"
  // sin que nadie lo hubiera comprobado (ver migración 0087). Que el documento
  // esté validado se sabe por `doc_number`, que es lo que se guarda aquí.
  //
  // Va SIN await: el aviso no depende de que el perfil se haya guardado, y
  // esperarlo añadía un viaje al servidor delante de la publicación. Si falla,
  // el documento se vuelve a guardar en la siguiente compra de saldo.
  if (input.docType && input.docNumber) {
    const pf: Record<string, unknown> = {
      doc_type: input.docType, doc_number: input.docNumber,
    };
    if (input.advertiserName) pf.legal_name = input.advertiserName;
    void supabase.from("profiles").update(pf).eq("id", userId).then(({ error: pfErr }) => {
      if (pfErr) console.error("[publish] No se pudo guardar el documento en el perfil:", pfErr.message);
    });
  }

  // Publicar: estado active + vigencia (published_at / expires_at) Y cobro del
  // saldo, todo dentro de la misma transacción (migración 0091). El importe lo
  // calcula el servidor a partir de la duración y de `plan_extras`; el navegador
  // ya no decide cuánto se paga. NO se crea orden ni comprobante: la boleta se
  // emite al COMPRAR créditos.
  const { error: pErr } = await supabase.rpc("publish_listing", {
    p_listing: listingId,
    p_duration_days: input.duration,
  });
  if (pErr) {
    // Si no alcanza el saldo, la base de datos aborta la operación entera: el
    // aviso NO queda publicado y no se cobra nada. Eso hay que contarlo, no
    // solo registrarlo, porque el usuario tiene que ir a comprar saldo.
    if (pErr.code === "EF001" || /saldo insuficiente/i.test(pErr.message)) {
      const cifras = faltanteDelError(pErr.message);
      const err = new SaldoInsuficiente(
        cifras
          ? `Te faltan S/ ${cifras.faltan.toFixed(2)} para publicar este aviso.`
          : undefined,
      );
      if (cifras) { err.costo = cifras.costo; err.faltan = cifras.faltan; }
      throw err;
    }
    console.error("[publish] No se pudo activar el aviso:", pErr.message);
  }

  return { published: !pErr };
}
