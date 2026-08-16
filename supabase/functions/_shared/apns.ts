// Envío de notificaciones a iPhone hablando DIRECTO con Apple (APNs).
//
// Por qué existe este archivo
// ---------------------------
// Android va por Firebase: la app registra un token de FCM y `send-push` se lo
// pasa a Google. En iPhone eso no vale. `@capacitor/push-notifications` entrega
// el token de **APNs**, que es de Apple, y el campo `token` de FCM solo acepta
// tokens de FCM: le mandes lo que le mandes desde un iPhone, lo rechaza.
//
// Hay dos formas de salvar esa diferencia: meter el SDK de Firebase en iOS para
// que canjee un token por otro, o hablar con Apple directamente. Se eligió lo
// segundo porque no hay Mac para depurar: cada retoque del lado nativo es una
// vuelta entera por Codemagic y TestFlight, mientras que esto es código de
// servidor que se corrige en un minuto. Y deja Android intacto, que es lo único
// que hoy funciona.
//
// Lo que Apple pide, y que no se parece a FCM
// -------------------------------------------
//   · Autenticación con un JWT firmado en **ES256** (curva P-256) usando la
//     clave `.p8` que se descarga UNA sola vez de developer.apple.com.
//   · El JWT vale como mucho una hora, y Apple **rechaza** que se regenere más
//     de una vez cada 20 minutos. Por eso se cachea.
//   · La URL lleva el token del dispositivo dentro: no va en el cuerpo.
//   · `apns-topic` es el bundle id, y `apns-push-type` es obligatorio.
//   · Dos servidores distintos: el de producción y el de pruebas. Una build de
//     TestFlight o de la App Store usa el de **producción**; solo una build
//     instalada desde Xcode usa el de pruebas.
//
// Este módulo es puro y sin red a propósito (salvo la firma, que usa WebCrypto):
// así se puede probar de verdad, que es lo que no se puede hacer con un iPhone
// que no tenemos delante.

export interface ConfigApns {
  /** Contenido íntegro del archivo .p8, con sus líneas BEGIN/END. */
  claveP8: string;
  /** Key ID de la clave (10 caracteres), de developer.apple.com → Keys. */
  keyId: string;
  /** Team ID de la cuenta de Apple Developer (10 caracteres). */
  teamId: string;
  /** El identificador de la app: com.effe.multiclasificados */
  bundleId: string;
  /** 'production' para TestFlight y App Store; 'sandbox' solo para builds de Xcode. */
  entorno: "production" | "sandbox";
}

/** Si falta cualquier pieza, no se intenta enviar: sin esto Apple da 403. */
export function apnsConfigurado(c: Partial<ConfigApns>): c is ConfigApns {
  return Boolean(c.claveP8 && c.keyId && c.teamId && c.bundleId);
}

function b64url(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Convierte el .p8 (PEM) en una clave utilizable.
 *
 * El archivo de Apple viene en PKCS#8 y de la curva P-256. Se le quitan las
 * líneas de cabecera y todos los saltos: un `.p8` copiado a mano en un panel de
 * secretos suele llegar con los saltos hechos un desastre, y eso no puede
 * impedir que salga una notificación.
 */
export async function importarClaveP8(p8: string): Promise<CryptoKey> {
  const limpio = p8
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\\n/g, "")
    .replace(/\s/g, "");
  if (!limpio) throw new Error("La clave .p8 llegó vacía");
  let der: Uint8Array;
  try {
    der = Uint8Array.from(atob(limpio), (ch) => ch.charCodeAt(0));
  } catch {
    throw new Error("La clave .p8 no es base64 válido: revisa cómo se pegó");
  }
  return crypto.subtle.importKey(
    "pkcs8",
    der.buffer as ArrayBuffer,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

/**
 * El JWT que Apple pide como credencial.
 *
 * WebCrypto devuelve la firma ECDSA en formato "raw" (r‖s, 64 bytes), que es
 * justo lo que JWS espera para ES256. Con RS256 —lo que usa Firebase— esto sería
 * distinto; es un detalle que cuesta un 403 sin explicación si se copia el
 * código de al lado sin mirar.
 */
export async function firmarJwtApns(c: ConfigApns, ahoraSegundos: number): Promise<string> {
  const cabecera = b64url(JSON.stringify({ alg: "ES256", kid: c.keyId }));
  const cuerpo = b64url(JSON.stringify({ iss: c.teamId, iat: ahoraSegundos }));
  const sinFirmar = `${cabecera}.${cuerpo}`;
  const clave = await importarClaveP8(c.claveP8);
  const firma = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      clave,
      new TextEncoder().encode(sinFirmar),
    ),
  );
  return `${sinFirmar}.${b64url(firma)}`;
}

/** Vale una hora, pero Apple castiga regenerarlo antes de 20 minutos. */
const VIDA_DEL_JWT_MS = 50 * 60 * 1000;

/**
 * Guarda el JWT firmado y lo reutiliza mientras siga vigente.
 *
 * Se pasa `ahora` como función para poder adelantar el reloj en las pruebas sin
 * esperar cincuenta minutos.
 */
export function crearProveedorDeJwt(c: ConfigApns, ahora: () => number = Date.now) {
  let cacheado: string | null = null;
  let firmadoEn = 0;
  return {
    async obtener(): Promise<string> {
      const t = ahora();
      if (cacheado && t - firmadoEn < VIDA_DEL_JWT_MS) return cacheado;
      cacheado = await firmarJwtApns(c, Math.floor(t / 1000));
      firmadoEn = t;
      return cacheado;
    },
    /** Solo para las pruebas y para el diagnóstico. */
    get firmadoEn() { return firmadoEn; },
  };
}

export function urlDeApns(c: ConfigApns, tokenDelDispositivo: string): string {
  const host = c.entorno === "sandbox"
    ? "api.sandbox.push.apple.com"
    : "api.push.apple.com";
  return `https://${host}/3/device/${tokenDelDispositivo}`;
}

export function cabecerasDeApns(c: ConfigApns, jwt: string): Record<string, string> {
  return {
    authorization: `bearer ${jwt}`,
    "apns-topic": c.bundleId,
    // Sin este encabezado Apple responde 400. 'alert' = notificación visible.
    "apns-push-type": "alert",
    // 10 = entregar ya. Con 5 Apple puede agruparla o retrasarla.
    "apns-priority": "10",
    "content-type": "application/json",
  };
}

export interface DatosDelAviso {
  titulo: string;
  cuerpo: string;
  tipo: string;
  /** El payload de la notificación, tal cual se guardó. */
  payload: unknown;
  /** Ruta interna a la que lleva el toque; la lee `push.ts`. */
  route: string | null;
}

/**
 * El cuerpo que entiende Apple.
 *
 * Lo visible va dentro de `aps`; lo nuestro va FUERA, al mismo nivel, y no
 * dentro de un objeto `data` como en FCM. La app lee esos campos en el evento
 * `pushNotificationActionPerformed`, así que se mandan con los mismos nombres
 * que usa Android para que `push.ts` no tenga que distinguir plataformas.
 */
export function cuerpoDeApns(d: DatosDelAviso): string {
  return JSON.stringify({
    aps: {
      alert: { title: d.titulo, body: d.cuerpo },
      sound: "default",
    },
    type: d.tipo,
    payload: JSON.stringify(d.payload ?? {}),
    ...(d.route ? { route: d.route } : {}),
  });
}

export interface ResultadoApns {
  entregado: boolean;
  /** El token ya no sirve: hay que borrarlo o se reintentará para siempre. */
  borrarToken: boolean;
  motivo: string;
}

/**
 * Qué significa lo que contesta Apple.
 *
 * La diferencia que importa es entre "este dispositivo ya no existe" —hay que
 * borrar el token— y "algo va mal en nuestra configuración" —hay que dejarlo
 * en paz y mirarlo—. Borrar tokens por un problema de credenciales dejaría a
 * todos los usuarios sin notificaciones y sin manera de recuperarlas salvo
 * reinstalando la app.
 */
export function interpretarApns(status: number, cuerpo: string): ResultadoApns {
  if (status === 200) return { entregado: true, borrarToken: false, motivo: "ok" };

  let razon = "";
  try {
    razon = String((JSON.parse(cuerpo || "{}") as { reason?: string }).reason ?? "");
  } catch {
    razon = cuerpo.slice(0, 120);
  }

  // El dispositivo ya no está: desinstalaron la app o el token caducó.
  const tokenMuerto =
    status === 410 ||
    razon === "BadDeviceToken" ||
    razon === "Unregistered" ||
    razon === "DeviceTokenNotForTopic";

  // Estos son NUESTROS: clave mal pegada, Key ID cambiado, bundle id que no
  // coincide, o el .p8 de otra cuenta. Nunca deben costar un token.
  const nuestro =
    status === 403 ||
    razon === "InvalidProviderToken" ||
    razon === "ExpiredProviderToken" ||
    razon === "TopicDisallowed" ||
    razon === "MissingProviderToken";

  return {
    entregado: false,
    borrarToken: tokenMuerto,
    motivo: nuestro
      ? `configuración de APNs (${razon || status}): revisa APNS_KEY_ID, APNS_TEAM_ID y el .p8`
      : razon || `HTTP ${status}`,
  };
}
