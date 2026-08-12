// Vista previa del enlace de un aviso (WhatsApp, Facebook, Telegram, X…).
//
// EL PORQUÉ. La app es una SPA: el servidor devuelve siempre el mismo
// `index.html` y es el navegador quien pinta el aviso. Pero los que generan la
// tarjeta de vista previa NO EJECUTAN JAVASCRIPT: solo leen las etiquetas
// <meta> del HTML que reciben. Por eso, compartieras el aviso que compartieras,
// WhatsApp enseñaba siempre lo mismo (y encima era una captura heredada de
// Lovable alojada en un bucket ajeno).
//
// LO QUE HACE. Atiende /aviso/:id, consulta ese aviso y devuelve el MISMO
// index.html pero con las etiquetas og: rellenas con su foto, su título y su
// precio. El navegador de una persona recibe exactamente la app de siempre —no
// se sirve una versión distinta a los buscadores, que además de tramposo es
// frágil—; lo único que cambia son unas etiquetas de la cabecera.
//
// Se cachea en el CDN de Vercel, así que un aviso muy compartido se resuelve
// sin volver a consultar la base de datos.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? "";

interface Aviso {
  title: string | null;
  description: string | null;
  price: number | null;
  currency: string | null;
  location: string | null;
  image_url: string | null;
  status: string | null;
}

/** Escapa lo que va dentro de un atributo HTML. El título lo escribe el
 *  anunciante: sin esto, unas comillas romperían la etiqueta. */
function escapar(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Recorta a `max` sin cortar una palabra por la mitad. */
function resumir(texto: string, max: number): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  if (limpio.length <= max) return limpio;
  const corte = limpio.slice(0, max);
  const ultimo = corte.lastIndexOf(" ");
  return `${ultimo > max * 0.6 ? corte.slice(0, ultimo) : corte}…`;
}

function precio(a: Aviso): string {
  if (typeof a.price !== "number" || a.price <= 0) return "";
  const n = a.price.toLocaleString("es-PE");
  return a.currency === "USD" ? `US$ ${n}` : `S/ ${n}`;
}

/**
 * Sustituye el contenido de una etiqueta <meta> ya existente. Se reemplaza en
 * vez de añadir porque los lectores de vista previa se quedan con la PRIMERA
 * que encuentran: añadirlas al final no serviría de nada.
 */
function ponerMeta(html: string, atributo: "property" | "name", clave: string, valor: string): string {
  const re = new RegExp(`(<meta\\s+${atributo}=["']${clave}["']\\s+content=["'])[^"']*(["'])`, "i");
  if (re.test(html)) return html.replace(re, `$1${escapar(valor)}$2`);
  return html.replace(
    /<\/head>/i,
    `  <meta ${atributo}="${clave}" content="${escapar(valor)}" />\n</head>`,
  );
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";

  // El index.html real del despliegue: así la app servida es SIEMPRE la misma,
  // se toque esto o no.
  const base = await fetch(new URL("/index.html", url.origin));
  let html = await base.text();

  const responder = () =>
    new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        // El CDN guarda la respuesta 10 min y sigue sirviendo la vieja mientras
        // refresca: un aviso muy compartido no golpea la base de datos.
        "cache-control": "public, s-maxage=600, stale-while-revalidate=86400",
      },
    });

  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(id) || !SUPABASE_URL || !SUPABASE_ANON_KEY) return responder();

  let aviso: Aviso | null = null;
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/listing_cards?id=eq.${id}` +
        `&select=title,description,price,currency,location,image_url,status&limit=1`,
      { headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${SUPABASE_ANON_KEY}` } },
    );
    if (r.ok) aviso = ((await r.json()) as Aviso[])[0] ?? null;
  } catch {
    /* Si la consulta falla, se devuelve la app con las etiquetas genéricas: una
       vista previa sosa es mejor que un enlace roto. */
  }

  // Un aviso inexistente, en borrador o vencido no se anuncia con su ficha.
  if (!aviso || aviso.status !== "active") return responder();

  const partes = [precio(aviso), aviso.location ?? ""].filter(Boolean).join(" · ");
  const titulo = aviso.title?.trim()
    ? `${aviso.title.trim()}${partes ? ` — ${partes}` : ""}`
    : "Aviso en eFFe Multiclasificados";
  const descripcion = aviso.description?.trim()
    ? resumir(aviso.description, 200)
    : "Míralo en eFFe Multiclasificados.";
  const enlace = `${url.origin}/aviso/${id}`;

  html = ponerMeta(html, "property", "og:title", titulo);
  html = ponerMeta(html, "property", "og:description", descripcion);
  html = ponerMeta(html, "property", "og:url", enlace);
  html = ponerMeta(html, "property", "og:type", "article");
  html = ponerMeta(html, "name", "twitter:title", titulo);
  html = ponerMeta(html, "name", "twitter:description", descripcion);

  // Sin foto se deja la imagen por defecto del sitio: una tarjeta con un hueco
  // roto se ve peor que una con el logo.
  if (aviso.image_url) {
    html = ponerMeta(html, "property", "og:image", aviso.image_url);
    html = ponerMeta(html, "name", "twitter:image", aviso.image_url);
  }
  // Y el <title>, que es lo que se ve en la pestaña y lo que usan algunos
  // lectores cuando no encuentran og:title.
  html = html.replace(/<title>[^<]*<\/title>/i, `<title>${escapar(titulo)}</title>`);

  return responder();
}
