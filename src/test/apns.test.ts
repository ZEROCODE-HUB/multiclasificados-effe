// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import {
  apnsConfigurado, importarClaveP8, firmarJwtApns, crearProveedorDeJwt,
  urlDeApns, cabecerasDeApns, cuerpoDeApns, interpretarApns,
  type ConfigApns,
} from "../../supabase/functions/_shared/apns.ts";

/**
 * El envío de push a iPhone, que va directo a Apple.
 *
 * Se prueba con cuidado porque es lo contrario de lo demás: no hay iPhone
 * delante, no hay simulador que valga (Apple no entrega push al simulador) y
 * cada intento real cuesta una build entera por Codemagic y TestFlight. Si la
 * firma está mal, Apple contesta un 403 escueto y no dice por qué.
 *
 * Por eso aquí se firma con una clave P-256 DE VERDAD, generada en la prueba, y
 * se verifica la firma con su clave pública. Si el JWT no valida aquí, tampoco
 * lo hará en Apple.
 *
 * Y hay una garantía que importa más que ninguna: un fallo NUESTRO —clave mal
 * pegada, Key ID equivocado— no puede costar tokens. Borrarlos por eso dejaría
 * a todos los usuarios sin notificaciones y sin forma de recuperarlas salvo
 * reinstalando la app.
 */

let claveP8: string;
let publica: CryptoKey;

/** Genera una clave igual en forma a la que Apple entrega en el .p8. */
beforeAll(async () => {
  const par = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"],
  );
  publica = par.publicKey;
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", par.privateKey));
  let bin = "";
  der.forEach((b) => (bin += String.fromCharCode(b)));
  const b64 = btoa(bin).replace(/(.{64})/g, "$1\n");
  claveP8 = `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----\n`;
});

const config = (extra: Partial<ConfigApns> = {}): ConfigApns => ({
  claveP8,
  keyId: "ABCD123456",
  teamId: "TEAM123456",
  bundleId: "com.effe.multiclasificados",
  entorno: "production",
  ...extra,
});

const deB64url = (s: string) =>
  Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

describe("APNs · la credencial", () => {
  it("firma un JWT que Apple podría verificar", async () => {
    const jwt = await firmarJwtApns(config(), 1_770_000_000);
    const [cab, cuerpo, firma] = jwt.split(".");

    expect(JSON.parse(deB64url(cab).toString())).toEqual({
      alg: "ES256", kid: "ABCD123456",
    });
    expect(JSON.parse(deB64url(cuerpo).toString())).toEqual({
      iss: "TEAM123456", iat: 1_770_000_000,
    });

    // La comprobación de verdad: que la firma valide con la clave pública.
    // ES256 en JWS lleva la firma "cruda" (r‖s, 64 bytes); si alguien la
    // cambiara al formato DER que usan otras librerías, Apple daría 403 y esto
    // es lo único que lo cazaría antes.
    const valida = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      publica,
      deB64url(firma),
      new TextEncoder().encode(`${cab}.${cuerpo}`),
    );
    expect(valida).toBe(true);
    expect(deB64url(firma)).toHaveLength(64);
  });

  it("aguanta un .p8 pegado de cualquier manera", async () => {
    // Copiar el archivo a un panel de secretos suele destrozar los saltos de
    // línea. Eso no puede dejar sin notificaciones a nadie.
    const maltratada = claveP8.replace(/\n/g, "\\n").replace(/\\n$/, "");
    await expect(importarClaveP8(maltratada)).resolves.toBeDefined();
    await expect(importarClaveP8(claveP8.replace(/\n/g, " "))).resolves.toBeDefined();
  });

  it("dice qué pasa si la clave no sirve, en vez de fallar en Apple", async () => {
    await expect(importarClaveP8("")).rejects.toThrow(/vacía/i);
    await expect(importarClaveP8("no-es-una-clave!!")).rejects.toThrow(/base64/i);
  });

  it("reutiliza el JWT: Apple castiga regenerarlo cada dos por tres", async () => {
    let reloj = 1_770_000_000_000;
    const proveedor = crearProveedorDeJwt(config(), () => reloj);

    const primero = await proveedor.obtener();
    const segundo = await proveedor.obtener();
    expect(segundo).toBe(primero);

    reloj += 30 * 60 * 1000;               // media hora: sigue valiendo
    expect(await proveedor.obtener()).toBe(primero);

    reloj += 25 * 60 * 1000;               // 55 min: toca renovar antes de la hora
    expect(await proveedor.obtener()).not.toBe(primero);
  });

  it("no intenta enviar si falta cualquier pieza", () => {
    expect(apnsConfigurado(config())).toBe(true);
    expect(apnsConfigurado({ ...config(), keyId: "" })).toBe(false);
    expect(apnsConfigurado({ ...config(), claveP8: "" })).toBe(false);
    expect(apnsConfigurado({ ...config(), teamId: "" })).toBe(false);
    expect(apnsConfigurado({})).toBe(false);
  });
});

describe("APNs · a dónde y con qué se manda", () => {
  it("una build de TestFlight va al servidor de producción", () => {
    expect(urlDeApns(config(), "abc123")).toBe("https://api.push.apple.com/3/device/abc123");
    expect(urlDeApns(config({ entorno: "sandbox" }), "abc123"))
      .toBe("https://api.sandbox.push.apple.com/3/device/abc123");
  });

  it("lleva los encabezados sin los que Apple contesta 400", () => {
    const h = cabecerasDeApns(config(), "eyJ.eyJ.zzz");
    expect(h.authorization).toBe("bearer eyJ.eyJ.zzz");
    expect(h["apns-topic"]).toBe("com.effe.multiclasificados");
    expect(h["apns-push-type"]).toBe("alert");
    expect(h["apns-priority"]).toBe("10");
  });

  it("el cuerpo pone lo visible dentro de aps y lo nuestro fuera", () => {
    const c = JSON.parse(cuerpoDeApns({
      titulo: "Nuevo mensaje", cuerpo: "Hola",
      tipo: "new_message", payload: { conversation_id: "c1" },
      route: "/dashboard/anunciante/mensajes",
    }));
    expect(c.aps.alert).toEqual({ title: "Nuevo mensaje", body: "Hola" });
    expect(c.aps.sound).toBe("default");
    // Fuera de `aps`, y con los mismos nombres que manda Android: así `push.ts`
    // no tiene que distinguir de qué plataforma vino el aviso.
    expect(c.type).toBe("new_message");
    expect(c.route).toBe("/dashboard/anunciante/mensajes");
    expect(JSON.parse(c.payload)).toEqual({ conversation_id: "c1" });
  });

  it("sin ruta no inventa una: abriría el inicio y ya", () => {
    const c = JSON.parse(cuerpoDeApns({
      titulo: "t", cuerpo: "b", tipo: "otro", payload: null, route: null,
    }));
    expect(c).not.toHaveProperty("route");
    expect(JSON.parse(c.payload)).toEqual({});
  });
});

describe("APNs · qué hacer con lo que contesta Apple", () => {
  const conRazon = (status: number, reason: string) =>
    interpretarApns(status, JSON.stringify({ reason }));

  it("200 es entregado", () => {
    expect(interpretarApns(200, "")).toEqual({
      entregado: true, borrarToken: false, motivo: "ok",
    });
  });

  it("borra el token cuando el dispositivo ya no existe", () => {
    // 410 = desinstalaron la app. Sin borrarlo se reintentaría para siempre.
    expect(interpretarApns(410, '{"reason":"Unregistered"}').borrarToken).toBe(true);
    expect(conRazon(400, "BadDeviceToken").borrarToken).toBe(true);
    expect(conRazon(400, "DeviceTokenNotForTopic").borrarToken).toBe(true);
  });

  it("NUNCA borra tokens por un fallo de configuración nuestro", () => {
    // Lo peor que podría pasar: pegar mal el .p8 y quedarnos sin la lista de
    // dispositivos de todos los usuarios. Solo se recuperaría reinstalando.
    for (const [status, razon] of [
      [403, "InvalidProviderToken"], [403, "ExpiredProviderToken"],
      [400, "TopicDisallowed"], [401, "MissingProviderToken"],
    ] as Array<[number, string]>) {
      const r = conRazon(status, razon);
      expect(r.borrarToken, `${razon} no puede costar un token`).toBe(false);
      expect(r.motivo).toMatch(/APNS_KEY_ID/);
    }
  });

  it("ante un fallo desconocido no borra nada y deja el motivo a la vista", () => {
    expect(interpretarApns(500, "")).toEqual({
      entregado: false, borrarToken: false, motivo: "HTTP 500",
    });
    expect(interpretarApns(503, "se cayó todo").motivo).toBe("se cayó todo");
  });
});
