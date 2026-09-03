import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

/**
 * Ofrecer instalar la web.
 *
 * LO QUE PREGUNTÓ EL CLIENTE: "para instalar el PWA en iOS ya está todo
 * configurado? y sale el aviso?".
 *
 * Configurado sí, pero el aviso NO salía en ninguna parte. Y en el iPhone no
 * puede salir solo: Safari nunca ha implementado `beforeinstallprompt`, así que
 * allí lo único posible es explicar los dos toques. En Chrome sí se instala de
 * un toque, pero había que capturar el evento para poder ofrecerlo nosotros.
 *
 * Lo que se fija aquí es sobre todo A QUIÉN NO se le enseña: un cartel de
 * instalación mal puesto es de los que hacen cerrar la pestaña.
 */

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/126.0 Mobile Safari/537.36";

const nativa = { valor: false };
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => nativa.valor },
}));

import { AvisoInstalar } from "@/components/AvisoInstalar";
import {
  esIOS, esSafariDeIOS, modoDeInstalacion, contarVisita, descartar, yaInstalada,
} from "@/lib/instalable";

/** Cambia el navegador que el código cree estar viendo. */
const comoSiFuera = (ua: string, opciones: { tactil?: number; instalada?: boolean } = {}) => {
  Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });
  Object.defineProperty(navigator, "maxTouchPoints", {
    value: opciones.tactil ?? 5, configurable: true,
  });
  Object.defineProperty(navigator, "standalone", {
    value: opciones.instalada ?? false, configurable: true,
  });
  window.matchMedia = ((q: string) => ({
    matches: opciones.instalada === true && q.includes("standalone"),
    media: q, addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
};

/** Dispara el evento de Chrome, que es lo que habilita el botón de instalar. */
const chromeOfreceInstalar = () => {
  const e = new Event("beforeinstallprompt") as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
  };
  e.prompt = vi.fn().mockResolvedValue(undefined);
  e.userChoice = Promise.resolve({ outcome: "accepted" as const });
  act(() => { window.dispatchEvent(e); });
  return e;
};

/** El aviso solo se decide tras un respiro, para no competir con el arranque. */
const pasarElRespiro = async () => {
  await act(async () => { vi.advanceTimersByTime(4100); });
};

/** Deja la segunda visita hecha: en la primera no se ofrece nada. */
const yaVinoAntes = () => window.localStorage.setItem("effe:visitas", "5");

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  nativa.valor = false;
  comoSiFuera(ANDROID);
});
afterEach(() => { vi.useRealTimers(); });

// ───────────────────────────────────────────────── la decisión, sin pintar nada
describe("a quién se le ofrece", () => {
  const base = { nativa: false, hayEvento: false, visita: 5, ua: IPHONE_SAFARI };

  it("en el iPhone solo se puede EXPLICAR, no instalar", () => {
    // Safari no implementa `beforeinstallprompt`. No es que falte configurar
    // nada: Apple no permite que una web pida instalarse.
    expect(modoDeInstalacion(base)).toBe("ios-manual");
  });

  it("en Chrome se instala de un toque, y eso siempre gana", () => {
    expect(modoDeInstalacion({ ...base, ua: ANDROID, hayEvento: true })).toBe("automatico");
  });

  it("sin evento y sin ser Safari de iPhone, no se ofrece nada", () => {
    // Un botón "Instalar" que no puede instalar es peor que no tener botón.
    expect(modoDeInstalacion({ ...base, ua: ANDROID })).toBe("ninguno");
  });

  it("NO en la primera visita: se viene a mirar avisos, no a instalar", () => {
    expect(modoDeInstalacion({ ...base, visita: 1 })).toBe("ninguno");
    expect(modoDeInstalacion({ ...base, visita: 2 })).toBe("ios-manual");
  });

  it("NO dentro del APK ni del iPhone nativo: ya está instalada por la tienda", () => {
    expect(modoDeInstalacion({ ...base, nativa: true, hayEvento: true })).toBe("ninguno");
  });

  it("NO si ya se está viendo desde el icono instalado", () => {
    comoSiFuera(IPHONE_SAFARI, { instalada: true });
    expect(modoDeInstalacion(base)).toBe("ninguno");
  });

  it("y NO si dijo que ahora no, durante dos meses", () => {
    const ahora = Date.parse("2026-09-03T12:00:00Z");
    descartar(ahora);
    expect(modoDeInstalacion({ ...base, ahora })).toBe("ninguno");
    // Un mes después sigue callado.
    expect(modoDeInstalacion({ ...base, ahora: ahora + 30 * 86400000 })).toBe("ninguno");
    // A los tres, vuelve a ofrecerse: para siempre sería no poder cambiar de idea.
    expect(modoDeInstalacion({ ...base, ahora: ahora + 90 * 86400000 })).toBe("ios-manual");
  });
});

describe("qué navegador es cuál", () => {
  it("el iPad de hoy dice ser un Mac, y hay que reconocerlo igual", () => {
    // iPadOS 13+ manda un agente de Mac. Sin esto el iPad se queda sin el único
    // aviso que puede recibir.
    const IPAD = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15";
    comoSiFuera(IPAD, { tactil: 5 });
    expect(esIOS(IPAD)).toBe(true);
    // Un Mac de verdad no es táctil.
    comoSiFuera(IPAD, { tactil: 0 });
    expect(esIOS(IPAD)).toBe(false);
  });

  it("en Chrome del iPhone NO se explica: el botón Compartir está en otro sitio", () => {
    // Dar un paso a paso que no cuadra con lo que la persona ve en pantalla es
    // peor que no decir nada.
    expect(esSafariDeIOS(IPHONE_CHROME)).toBe(false);
    expect(esSafariDeIOS(IPHONE_SAFARI)).toBe(true);
  });
});

describe("cuando no se puede recordar nada", () => {
  it("un localStorage que LANZA no tumba la aplicación", () => {
    // En el modo privado de algunos navegadores el simple acceso revienta. Es
    // justo donde más gente entra a mirar avisos sin cuenta.
    const original = window.localStorage.getItem;
    window.localStorage.getItem = () => { throw new Error("denegado"); };
    window.localStorage.setItem = () => { throw new Error("denegado"); };
    expect(() => contarVisita()).not.toThrow();
    expect(() => descartar()).not.toThrow();
    expect(() => yaInstalada()).not.toThrow();
    window.localStorage.getItem = original;
  });
});

// ───────────────────────────────────────────────────────────────── la franja
describe("la franja", () => {
  it("en el iPhone explica los dos toques, sin botón de instalar", async () => {
    comoSiFuera(IPHONE_SAFARI);
    yaVinoAntes();
    render(<AvisoInstalar />);
    await pasarElRespiro();

    expect(screen.getByText(/Añadir a pantalla de inicio/i)).toBeInTheDocument();
    // No hay botón porque no hay nada que pulsar: lo hace el usuario en el menú
    // de Safari. Un botón ahí solo puede mentir.
    expect(screen.queryByRole("button", { name: /^instalar$/i })).toBeNull();
  });

  it("en Chrome instala de verdad al pulsar", async () => {
    comoSiFuera(ANDROID);
    yaVinoAntes();
    render(<AvisoInstalar />);
    const evento = chromeOfreceInstalar();

    // `findBy`/`waitFor` no sirven aquí: usan temporizadores, y están falseados
    // para poder saltarse el respiro de los 4 s. El evento ya pintó la franja de
    // forma síncrona dentro del `act`, así que se comprueba directamente.
    fireEvent.click(screen.getByRole("button", { name: /instalar/i }));
    await act(async () => {});
    expect(evento.prompt).toHaveBeenCalled();
  });

  it("y no deja que Chrome saque ADEMÁS su propio cartel", async () => {
    // Sin el `preventDefault` salen los dos a la vez, y el nuestro sobra.
    comoSiFuera(ANDROID);
    yaVinoAntes();
    render(<AvisoInstalar />);
    const e = new Event("beforeinstallprompt", { cancelable: true });
    act(() => { window.dispatchEvent(e); });
    expect(e.defaultPrevented).toBe(true);
  });

  it("al cerrarla desaparece y no vuelve", async () => {
    comoSiFuera(IPHONE_SAFARI);
    yaVinoAntes();
    const { unmount } = render(<AvisoInstalar />);
    await pasarElRespiro();

    fireEvent.click(screen.getByRole("button", { name: /ahora no/i }));
    expect(screen.queryByText(/Añadir a pantalla de inicio/i)).toBeNull();

    // Y en la siguiente visita tampoco.
    unmount();
    render(<AvisoInstalar />);
    await pasarElRespiro();
    expect(screen.queryByText(/Añadir a pantalla de inicio/i)).toBeNull();
  });

  it("se va sola cuando la app QUEDA instalada", async () => {
    // Si no, se queda ofreciendo lo que la persona acaba de hacer.
    comoSiFuera(ANDROID);
    yaVinoAntes();
    render(<AvisoInstalar />);
    chromeOfreceInstalar();
    expect(screen.getByRole("button", { name: /instalar/i })).toBeInTheDocument();

    act(() => { window.dispatchEvent(new Event("appinstalled")); });
    expect(screen.queryByRole("button", { name: /instalar/i })).toBeNull();
  });

  it("NO aparece en la primera visita", async () => {
    comoSiFuera(IPHONE_SAFARI);
    render(<AvisoInstalar />); // sin `yaVinoAntes()`
    await pasarElRespiro();
    expect(screen.queryByText(/Añadir a pantalla de inicio/i)).toBeNull();
  });

  it("NO aparece dentro del APK", async () => {
    nativa.valor = true;
    comoSiFuera(ANDROID);
    yaVinoAntes();
    render(<AvisoInstalar />);
    chromeOfreceInstalar();
    await pasarElRespiro();
    expect(screen.queryByRole("button", { name: /instalar/i })).toBeNull();
  });

  it("y no se pone delante de la barra inferior del móvil", async () => {
    // Con `--nav-bottom`, nunca con `env()` a mano: es la regla que ya siguen
    // los toasts y ShareListing desde la iteración móvil.
    comoSiFuera(IPHONE_SAFARI);
    yaVinoAntes();
    render(<AvisoInstalar />);
    await pasarElRespiro();
    expect(screen.getByRole("region", { name: /instalar/i }).className)
      .toContain("var(--nav-bottom)");
  });
});
