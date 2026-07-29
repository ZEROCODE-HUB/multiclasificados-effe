// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  REQUIRED_ENV,
  computeEnvDiagnostics,
  validateSupabaseConfig,
  cleanEnvValue,
  normalizeSupabaseUrl,
  probeSupabase,
  checkSupabaseHealth,
  isPlaceholderValue,
  looksLikeAnonKey,
} from "@/lib/bootDiagnostics";

// Clave con forma de JWT para los casos válidos (la validación mira el formato).
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.Rm1ybWEtZGUtcHJ1ZWJh";

describe("computeEnvDiagnostics", () => {
  it("marca todo presente cuando las requeridas están completas", () => {
    const d = computeEnvDiagnostics({
      VITE_SUPABASE_URL: "https://x.supabase.co",
      VITE_SUPABASE_ANON_KEY: "anon",
    });
    expect(d.ok).toBe(true);
    expect(d.missing).toEqual([]);
    expect(d.present).toEqual([...REQUIRED_ENV]);
  });

  it("detecta las faltantes (vacías o ausentes)", () => {
    const d = computeEnvDiagnostics({ VITE_SUPABASE_URL: "   ", VITE_SUPABASE_ANON_KEY: "" });
    expect(d.ok).toBe(false);
    expect(d.missing).toContain("VITE_SUPABASE_URL");
    expect(d.missing).toContain("VITE_SUPABASE_ANON_KEY");
  });

  it("una presente y otra faltante", () => {
    const d = computeEnvDiagnostics({ VITE_SUPABASE_URL: "https://x.supabase.co" });
    expect(d.present).toEqual(["VITE_SUPABASE_URL"]);
    expect(d.missing).toEqual(["VITE_SUPABASE_ANON_KEY"]);
  });
});

describe("cleanEnvValue", () => {
  it("recorta espacios", () => {
    expect(cleanEnvValue("  hola  ")).toBe("hola");
  });
  it("quita comillas dobles envolventes (error de CI)", () => {
    expect(cleanEnvValue('"https://x.supabase.co"')).toBe("https://x.supabase.co");
  });
  it("quita comillas simples envolventes", () => {
    expect(cleanEnvValue("'anon-key'")).toBe("anon-key");
  });
  it("no toca comillas internas", () => {
    expect(cleanEnvValue('ab"cd')).toBe('ab"cd');
  });
  it("no-string → cadena vacía", () => {
    expect(cleanEnvValue(undefined)).toBe("");
  });
});

describe("normalizeSupabaseUrl", () => {
  it("antepone https:// si falta el esquema", () => {
    expect(normalizeSupabaseUrl("x.supabase.co")).toBe("https://x.supabase.co");
  });
  it("quita comillas y normaliza", () => {
    expect(normalizeSupabaseUrl('"x.supabase.co"')).toBe("https://x.supabase.co");
  });
  it("respeta una URL ya válida (y quita la barra final)", () => {
    expect(normalizeSupabaseUrl("https://x.supabase.co/")).toBe("https://x.supabase.co");
  });
  it("vacío → vacío", () => {
    expect(normalizeSupabaseUrl("")).toBe("");
  });
});

describe("validateSupabaseConfig", () => {
  it("URL válida + clave → null", () => {
    expect(validateSupabaseConfig("https://x.supabase.co", KEY)).toBeNull();
  });
  it("URL vacía → mensaje de URL", () => {
    expect(validateSupabaseConfig("", KEY)).toMatch(/VITE_SUPABASE_URL/);
  });
  it("clave vacía → mensaje de clave", () => {
    expect(validateSupabaseConfig("https://x.supabase.co", "")).toMatch(/ANON_KEY/);
  });
  it("URL sin http(s) ahora se normaliza y es válida", () => {
    expect(validateSupabaseConfig("x.supabase.co", KEY)).toBeNull();
  });
  it("URL con comillas envolventes se limpia y es válida", () => {
    expect(validateSupabaseConfig('"https://x.supabase.co"', `"${KEY}"`)).toBeNull();
  });
  it("rechaza la URL de ejemplo (build sin las variables reales)", () => {
    expect(validateSupabaseConfig("https://dummy.supabase.co", KEY)).toMatch(/ejemplo/i);
  });
  it("rechaza una clave copiada a medias", () => {
    expect(validateSupabaseConfig("https://x.supabase.co", "eyJhbGciOi")).toMatch(/formato/i);
  });
  it("acepta el formato nuevo de clave publicable", () => {
    expect(validateSupabaseConfig("https://x.supabase.co", "sb_publishable_ABCdef123456")).toBeNull();
  });
});

describe("isPlaceholderValue / looksLikeAnonKey", () => {
  it("detecta valores de relleno", () => {
    expect(isPlaceholderValue("https://dummy.supabase.co")).toBe(true);
    expect(isPlaceholderValue("<tu-proyecto>")).toBe(true);
    expect(isPlaceholderValue("https://prhbgniwymaaevnisyov.supabase.co")).toBe(false);
  });
  it("una clave real no se confunde con un valor de ejemplo aunque lleve base64 raro", () => {
    // La clave NO pasa por el detector de placeholders justamente por esto.
    expect(validateSupabaseConfig("https://x.supabase.co", "eyJhbGciOiJIUzI1NiJ9.eyJ4eHh4IjoxfQ.QQ")).toBeNull();
  });
  it("reconoce las dos formas de clave anónima", () => {
    expect(looksLikeAnonKey(KEY)).toBe(true);
    expect(looksLikeAnonKey("sb_publishable_ABCdef123456")).toBe(true);
    expect(looksLikeAnonKey("clave-cualquiera")).toBe(false);
    expect(looksLikeAnonKey("")).toBe(false);
  });
});

describe("checkSupabaseHealth", () => {
  afterEach(() => vi.unstubAllGlobals());

  const respuesta = (status: number, body?: unknown) => ({
    status,
    json: async () => body ?? {},
  });

  it("proyecto vivo y clave aceptada → ok, enviando la clave en la cabecera", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respuesta(200));
    vi.stubGlobal("fetch", fetchMock);

    expect(await checkSupabaseHealth("https://x.supabase.co", KEY)).toEqual({ status: "ok" });
    // Sin la cabecera `apikey`, /auth/v1/health responde 401 aunque todo esté
    // bien: es lo que haría fallar el diagnóstico contra un proyecto sano.
    expect(fetchMock).toHaveBeenCalledWith(
      "https://x.supabase.co/auth/v1/health",
      expect.objectContaining({ headers: { apikey: KEY } }),
    );
  });

  it("clave rechazada → invalid-key con el mensaje del servidor", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respuesta(401, { message: "Invalid API key" })));

    const r = await checkSupabaseHealth("https://x.supabase.co", KEY);
    expect(r.status).toBe("invalid-key");
    expect(r.httpStatus).toBe(401);
    expect(r.detail).toBe("Invalid API key");
  });

  it("la URL no es un proyecto de Supabase → unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respuesta(404)));
    const r = await checkSupabaseHealth("https://otra-cosa.example.com", KEY);
    expect(r.status).toBe("unreachable");
    expect(r.httpStatus).toBe(404);
  });

  it("fallo de red → unreachable con el motivo", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Load failed")));
    const r = await checkSupabaseHealth("https://x.supabase.co", KEY);
    expect(r.status).toBe("unreachable");
    expect(r.detail).toBe("Load failed");
  });

  it("sin internet NO culpa a la configuración", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await checkSupabaseHealth("https://x.supabase.co", KEY)).toEqual({ status: "offline" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("error del servidor → server-error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respuesta(503)));
    expect((await checkSupabaseHealth("https://x.supabase.co", KEY)).status).toBe("server-error");
  });

  it("una sola petición: no sondea /rest/v1/, que da 401 aun con la clave buena", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respuesta(200));
    vi.stubGlobal("fetch", fetchMock);
    await checkSupabaseHealth("https://x.supabase.co", KEY);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("/rest/v1/");
  });
});

describe("probeSupabase", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("URL ausente o inválida → skipped (sin red)", async () => {
    expect(await probeSupabase("")).toBe("skipped");
    expect(await probeSupabase("no-es-url")).toBe("skipped");
  });

  it("fetch que resuelve → ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    expect(await probeSupabase("https://x.supabase.co")).toBe("ok");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://x.supabase.co/auth/v1/health",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("fetch que rechaza → unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    expect(await probeSupabase("https://x.supabase.co")).toBe("unreachable");
  });
});
