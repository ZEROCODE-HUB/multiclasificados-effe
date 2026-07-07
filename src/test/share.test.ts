import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Plataforma controlable: por defecto web; cada test la ajusta.
const isNative = vi.fn(() => false);
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => isNative() },
}));

// Navegador nativo de Capacitor (solo se usa en el APK).
const browserOpen = vi.fn(() => Promise.resolve());
vi.mock("@capacitor/browser", () => ({ Browser: { open: browserOpen } }));

const BASE = "https://effe.test";

// Importa el módulo con el entorno ya preparado (base pública fija).
async function loadShare() {
  vi.resetModules();
  vi.stubEnv("VITE_PUBLIC_SITE_URL", BASE);
  return import("@/lib/share");
}

beforeEach(() => {
  isNative.mockReturnValue(false);
  browserOpen.mockClear();
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

  it("en el APK abre WhatsApp con el navegador nativo (no window.open)", async () => {
    isNative.mockReturnValue(true);
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const { shareListingWhatsApp } = await loadShare();

    await shareListingWhatsApp("Auto usado", "42");

    expect(browserOpen).toHaveBeenCalledTimes(1);
    expect(browserOpen.mock.calls[0][0].url).toContain("https://wa.me/?text=");
    expect(openSpy).not.toHaveBeenCalled();
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
});
