// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Con qué cuenta se cobra lo decide el SERVIDOR, nunca el build.
 *
 * El motivo es el APK. El bundle web va dentro del binario, así que una clave
 * horneada en tiempo de compilación se queda congelada en cada teléfono hasta
 * que alguien publique una versión nueva en la tienda. Si la cuenta de cobro
 * viviera ahí, pasar la pasarela a producción exigiría un release —y peor: las
 * apps ya instaladas seguirían cobrando con `testpublickey_` contra un backend
 * real, que es un fallo silencioso, con la tarjeta del cliente por delante y
 * sin nada en pantalla que permita adivinar qué pasa.
 *
 * Había además un fallo concreto, no hipotético: el script de Krypton se carga
 * UNA sola vez y lleva la clave como atributo. La precarga se hacía con la del
 * build antes de hablar con el servidor, así que la del servidor llegaba tarde
 * y se ignoraba. La clave del build era, en la práctica, la que mandaba.
 *
 * Estas pruebas leen el código fuente en vez de ejecutarlo porque lo que hay
 * que fijar es una **regla de procedencia**, y un test de comportamiento sobre
 * el formulario de Lyra exigiría levantar sus iframes.
 */
const lee = (p: string) => fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8");

const FORM = lee("src/components/PaymentForm.tsx");
const MODAL = lee("src/components/BuyCreditsModal.tsx");
const PAYMENTS = lee("src/lib/payments.ts");
const CREATE = lee("supabase/functions/create-payment/index.ts");

describe("el servidor manda", () => {
  it("create-payment exige la clave pública igual que el usuario y la contraseña", () => {
    // Sin esto devolvía `null` y el frontend "se las arreglaba" con la suya.
    expect(CREATE).toMatch(/!IZIPAY_SHOP_ID \|\| !IZIPAY_PASSWORD \|\| !IZIPAY_PUBLIC_KEY/);
    expect(CREATE).toContain("Pasarela de pago no configurada.");
  });

  it("y por eso ya no la devuelve como null", () => {
    expect(CREATE).not.toMatch(/publicKey:\s*IZIPAY_PUBLIC_KEY\s*\|\|\s*null/);
    expect(CREATE).toMatch(/publicKey:\s*IZIPAY_PUBLIC_KEY,/);
  });
});

describe("el formulario usa la clave del servidor, no la que cargó el script", () => {
  it("setFormConfig refija kr-public-key en cada montaje", () => {
    // Es lo que arregla el fallo de fondo: el script cacheado se queda con la
    // clave de la precarga, y esto la sobrescribe con la definitiva.
    expect(FORM).toMatch(/"kr-public-key":\s*publicKey/);
  });

  it("y avisa si el build y el servidor no coinciden", () => {
    // No es fatal, pero significa que dos sitios no están de acuerdo en con qué
    // cuenta se cobra. Eso no puede pasar en silencio.
    expect(FORM).toContain("krClaveCargada");
    expect(FORM).toMatch(/console\.warn/);
  });

  it("si no hay clave, lo dice en vez de intentar cobrar", () => {
    expect(FORM).toContain("Falta la clave pública de la pasarela.");
  });
});

describe("no quedan respaldos silenciosos en el flujo de cobro", () => {
  it("el formulario embebido no cae a la variable del build", () => {
    const linea = MODAL.split("\n").find((l) => l.includes("publicKey={payment"));
    expect(linea).toBeTruthy();
    expect(linea).not.toContain("VITE_IZIPAY_PUBLIC_KEY");
  });

  it("la página de pago del APK tampoco", () => {
    expect(PAYMENTS).not.toContain("publicKeyFallback");
    expect(PAYMENTS).toMatch(/pk:\s*r\.publicKey/);
  });

  it("hostedPaymentUrl ya no acepta un respaldo ni por parámetro", () => {
    // Mientras el parámetro exista, alguien volverá a pasarle la del build.
    expect(PAYMENTS).toMatch(/hostedPaymentUrl\(r: CreatePaymentResult\): string/);
    expect(MODAL).toMatch(/hostedPaymentUrl\(result\)/);
  });
});

describe("la precarga sigue existiendo, pero solo calienta el CDN", () => {
  it("se sigue llamando: quitarla devolvería 1-3 s de pantalla en blanco", () => {
    expect(MODAL).toContain("precargarKrypton(");
  });

  it("y está escrito que no decide con qué cuenta se cobra", () => {
    // El comentario es la única defensa contra que alguien "arregle" la
    // incoherencia aparente propagando la clave del build al pago.
    expect(MODAL).toMatch(/No decide con qué cuenta se\s*\/\/\s*cobra/);
  });
});
