import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Plataforma controlable: por defecto web; cada test la ajusta.
const isNative = vi.fn(() => false);
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => isNative() },
}));

// Navegador nativo de Capacitor (solo se usa en el APK).
const browserOpen = vi.fn((_opts: { url: string }) => Promise.resolve());
vi.mock("@capacitor/browser", () => ({ Browser: { open: browserOpen } }));

const BASE = "https://effe.test";

// Importa el módulo con el entorno ya preparado (base pública fija).
async function loadShare() {
  vi.resetModules();
  vi.stubEnv("VITE_PUBLIC_SITE_URL", BASE);
  return import("@/lib/share");
}

// `location.assign` (el salto al esquema whatsapp://) y la visibilidad de la
// pestaña, ambos simulados: jsdom no navega ni cambia de app.
const assignSpy = vi.fn();
let visibility: DocumentVisibilityState = "visible";

beforeEach(() => {
  isNative.mockReturnValue(false);
  browserOpen.mockClear();
  assignSpy.mockClear();
  visibility = "visible";
  Object.defineProperty(window, "location", {
    value: { ...window.location, assign: assignSpy },
    writable: true,
    configurable: true,
  });
  Object.defineProperty(document, "visibilityState", {
    get: () => visibility,
    configurable: true,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("share — enlace del aviso", () => {
  it("construye la URL pública absoluta /aviso/:id", async () => {
    const { listingUrl } = await loadShare();
    expect(listingUrl("abc123")).toBe(`${BASE}/aviso/abc123`);
  });
});

describe("share — WhatsApp", () => {
  it("en web abre wa.me con título + enlace en una pestaña nueva", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const { shareListingWhatsApp } = await loadShare();

    await shareListingWhatsApp("Auto usado", "42");

    expect(openSpy).toHaveBeenCalledTimes(1);
    const [url, target] = openSpy.mock.calls[0];
    const expectedText = encodeURIComponent(`Auto usado\n${BASE}/aviso/42`);
    expect(url).toBe(`https://wa.me/?text=${expectedText}`);
    expect(target).toBe("_blank");
    expect(browserOpen).not.toHaveBeenCalled();
  });

  // MOB-07: en el APK, abrir wa.me dentro del navegador embebido perdía el texto
  // por el camino y WhatsApp se abría vacío. Ahora va por el esquema nativo.
  it("en el APK salta a WhatsApp por su esquema propio, con el mensaje", async () => {
    isNative.mockReturnValue(true);
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const { shareListingWhatsApp } = await loadShare();

    await shareListingWhatsApp("Auto usado", "42");

    const expectedText = encodeURIComponent(`Auto usado\n${BASE}/aviso/42`);
    expect(assignSpy).toHaveBeenCalledWith(`whatsapp://send?text=${expectedText}`);
    // El navegador embebido ya no interviene en el camino normal.
    expect(browserOpen).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("si WhatsApp no abre (la app sigue a la vista), cae a wa.me como respaldo", async () => {
    vi.useFakeTimers();
    isNative.mockReturnValue(true);
    const { shareListingWhatsApp } = await loadShare();

    await shareListingWhatsApp("Auto usado", "42");
    expect(browserOpen).not.toHaveBeenCalled();

    // Pasa el plazo sin que la app se haya ido a segundo plano.
    await vi.advanceTimersByTimeAsync(1500);

    expect(browserOpen).toHaveBeenCalledTimes(1);
    expect(browserOpen.mock.calls[0][0].url).toContain("https://wa.me/?text=");
    vi.useRealTimers();
  });

  it("si WhatsApp sí abrió (la app pasó a segundo plano), no abre nada más", async () => {
    vi.useFakeTimers();
    isNative.mockReturnValue(true);
    const { shareListingWhatsApp } = await loadShare();

    await shareListingWhatsApp("Auto usado", "42");

    // El sistema pasó a WhatsApp: la nuestra deja de estar visible.
    visibility = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(1500);

    expect(browserOpen).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe("share — copiar enlace", () => {
  it("copia la URL del aviso al portapapeles y devuelve true", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const { copyListingLink } = await loadShare();

    const ok = await copyListingLink("99");

    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith(`${BASE}/aviso/99`);
  });

  it("devuelve false si el portapapeles falla", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denegado"));
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const { copyListingLink } = await loadShare();

    expect(await copyListingLink("99")).toBe(false);
  });
});

describe("share — hoja nativa del sistema (Web Share API)", () => {
  it("canSystemShare refleja si navigator.share existe", async () => {
    const { canSystemShare } = await loadShare();

    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    expect(canSystemShare()).toBe(false);

    Object.defineProperty(navigator, "share", { value: vi.fn(), configurable: true });
    expect(canSystemShare()).toBe(true);
  });

  it("comparte con la hoja del sistema pasando título y enlace", async () => {
    const shareFn = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: shareFn, configurable: true });
    const { shareListingSystem } = await loadShare();

    const handled = await shareListingSystem("Depa céntrico", "7");

    expect(handled).toBe(true);
    expect(shareFn).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Depa céntrico", url: `${BASE}/aviso/7` }),
    );
  });

  it("devuelve false (cae al menú manual) si no hay Web Share API", async () => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    const { shareListingSystem } = await loadShare();

    expect(await shareListingSystem("X", "1")).toBe(false);
  });

  it("si el usuario cancela la hoja, igual se considera manejado", async () => {
    const shareFn = vi.fn().mockRejectedValue(new Error("AbortError"));
    Object.defineProperty(navigator, "share", { value: shareFn, configurable: true });
    const { shareListingSystem } = await loadShare();

    expect(await shareListingSystem("X", "1")).toBe(true);
  });

  /**
   * Confirmar un pago por Yape no puede llevarse la pestaña por delante.
   *
   * `abrirWhatsApp` navega en la misma pestaña cuando el dispositivo es táctil
   * —correcto al compartir un aviso, porque detrás no queda nada que ver—, pero
   * al mandar el voucher la página tiene que seguir viva para llevar al usuario
   * a sus avisos. Comprobado en producción: se abría WhatsApp encima y al
   * volver con "atrás" seguía en el formulario de publicar.
   */
  describe("abrirWhatsAppAparte", () => {
    let openSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      openSpy = vi.fn(() => ({}) as Window);
      Object.defineProperty(window, "open", { value: openSpy, configurable: true, writable: true });
    });

    it("abre en otra pestaña incluso en un dispositivo táctil", async () => {
      // `pointer: coarse` es lo que hace que `abrirWhatsApp` navegue en la
      // misma pestaña; aquí NO debe pasar eso.
      Object.defineProperty(window, "matchMedia", {
        value: (q: string) => ({ matches: q.includes("coarse"), media: q, addEventListener() {}, removeEventListener() {} }),
        configurable: true, writable: true,
      });
      const { abrirWhatsAppAparte } = await loadShare();

      expect(abrirWhatsAppAparte("Hola", "51999888777")).toBe(true);
      expect(assignSpy).not.toHaveBeenCalled();
      const [url, destino] = openSpy.mock.calls[0];
      expect(destino).toBe("_blank");
      expect(String(url)).toContain("wa.me/51999888777");
      expect(decodeURIComponent(String(url))).toContain("Hola");
    });

    it("avisa cuando el navegador bloquea la ventana", async () => {
      openSpy.mockReturnValue(null);
      const { abrirWhatsAppAparte } = await loadShare();
      expect(abrirWhatsAppAparte("Hola", "51999888777")).toBe(false);
    });

    it("en el APK usa el esquema nativo, no window.open", async () => {
      // En el WebView `window.open` no abre nada y devuelve null: el comprador
      // se quedaba con el aviso de "ventana bloqueada" y sin forma de mandar su
      // voucher. El esquema whatsapp:// cambia de APP, así que la pantalla
      // sigue viva detrás, que es lo que hace falta aquí.
      isNative.mockReturnValue(true);
      const { abrirWhatsAppAparte } = await loadShare();

      expect(abrirWhatsAppAparte("Hola", "51999888777")).toBe(true);
      expect(openSpy).not.toHaveBeenCalled();
      expect(String(assignSpy.mock.calls[0][0])).toContain("whatsapp://send?phone=51999888777");
    });

    it("el número viaja sin signos ni espacios", async () => {
      const { enlaceWhatsApp } = await loadShare();
      expect(enlaceWhatsApp("Hola", "+51 999 888-777")).toContain("wa.me/51999888777");
    });
  });
});