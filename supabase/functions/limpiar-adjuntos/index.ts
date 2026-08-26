// Edge Function: limpiar-adjuntos
//
// Borra del almacenamiento los archivos que ya no pertenecen a ningún aviso.
//
// POR QUÉ NO SE HACE EN SQL. Quitar la fila de `storage.objects` NO libera el
// archivo: se queda en el almacén, ahora además sin índice, que es peor que
// dejarlo. Solo la API de Storage lo borra de verdad, y por eso esto vive aquí y
// no en un cron de base de datos. Lo que sí está en SQL es DECIDIR qué sobra
// (`adjuntos_huerfanos`, migración 0122), que es lo que conviene poder probar.
//
// DE DÓNDE SALE LA BASURA. Dos sitios, y ninguno es un fallo:
//   • Avisos borrados. Al borrar el aviso, sus archivos se quedaban. Es de donde
//     venían los 32 archivos que había acumulados al escribir esto.
//   • Formularios abandonados. Desde la 9.1 los adjuntos suben mientras se
//     rellena el formulario, para que "Publicar" no espere a 46 MB de vídeo.
//     Quien sube una foto y se marcha sin publicar deja esa foto suelta. Es el
//     precio de que publicar sea instantáneo, y se paga barriendo después.
//
// SEGURIDAD. Exige un secreto propio, `LIMPIEZA_SECRET`, y no el de los pagos.
// Se penso reutilizar aquel —ya existe y es el patron de `emit-invoice`— pero
// son dos cosas de riesgo muy distinto: si el secreto de esta se filtra, alguien
// puede borrar archivos; si se filtra el de los pagos, puede tocar cobros. Cada
// uno con el suyo, y rotar uno no obliga a rotar el otro.
//
// Ademas, por defecto NO borra nada: hay que pedirlo con `aplicar: true`. Sin
// eso responde que se llevaria, que es como conviene mirarlo la primera vez.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WORKER_SECRET = Deno.env.get("LIMPIEZA_SECRET") || "";

// Días que un archivo tiene que llevar sin dueño antes de tocarlo. Tres es de
// sobra: nadie tarda tres días en terminar de publicar un aviso, así que un
// formulario a medio rellenar nunca está en riesgo.
const DIAS_DE_GRACIA = 3;

// La API de Storage acepta listas largas, pero trocear evita que un fallo a
// mitad deje el trabajo en un estado difícil de contar.
const LOTE = 100;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-worker-secret",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

/** Comparación en tiempo constante: un `===` filtra el secreto por su duración. */
function secretoValido(recibido: string): boolean {
  if (!WORKER_SECRET || recibido.length !== WORKER_SECRET.length) return false;
  let dif = 0;
  for (let i = 0; i < WORKER_SECRET.length; i++) {
    dif |= WORKER_SECRET.charCodeAt(i) ^ recibido.charCodeAt(i);
  }
  return dif === 0;
}

interface Huerfano { bucket_id: string; name: string; bytes: number }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  if (!secretoValido(req.headers.get("x-worker-secret") ?? "")) {
    return json({ error: "no autorizado" }, 401);
  }

  let aplicar = false;
  let dias = DIAS_DE_GRACIA;
  try {
    const body = await req.json();
    aplicar = body?.aplicar === true;
    // El margen se puede AMPLIAR pero nunca reducir por parámetro: si alguien se
    // equivoca de signo, que el error sea barrer de menos.
    if (typeof body?.dias === "number") dias = Math.max(DIAS_DE_GRACIA, Math.floor(body.dias));
  } catch {
    /* Sin cuerpo: se queda en el modo que no borra nada. */
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data, error } = await admin.rpc("adjuntos_huerfanos", { p_dias: dias });
  if (error) return json({ error: error.message }, 500);

  const huerfanos = (data ?? []) as Huerfano[];
  const bytes = huerfanos.reduce((t, h) => t + Number(h.bytes || 0), 0);

  // Modo mirar, que es el de por defecto: dice qué se llevaría y no toca nada.
  if (!aplicar) {
    return json({
      modo: "simulacion",
      dias,
      archivos: huerfanos.length,
      bytes,
      // Una muestra basta para ver que las rutas tienen la pinta esperada; la
      // lista entera pueden ser miles de líneas.
      muestra: huerfanos.slice(0, 20).map((h) => `${h.bucket_id}/${h.name}`),
    });
  }

  // Agrupar por bucket: `remove` trabaja sobre uno solo.
  const porBucket = new Map<string, string[]>();
  for (const h of huerfanos) {
    const lista = porBucket.get(h.bucket_id) ?? [];
    lista.push(h.name);
    porBucket.set(h.bucket_id, lista);
  }

  let borrados = 0;
  const fallos: string[] = [];
  for (const [bucket, rutas] of porBucket) {
    for (let i = 0; i < rutas.length; i += LOTE) {
      const trozo = rutas.slice(i, i + LOTE);
      const { error: delErr } = await admin.storage.from(bucket).remove(trozo);
      if (delErr) fallos.push(`${bucket}: ${delErr.message}`);
      else borrados += trozo.length;
    }
  }

  console.log(`[limpiar-adjuntos] ${borrados} de ${huerfanos.length} archivos, ${bytes} bytes`);
  return json({ modo: "aplicado", dias, archivos: huerfanos.length, borrados, bytes, fallos });
});
