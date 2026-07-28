// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  REQUIRED_ENV,
  computeEnvDiagnostics,
  validateSupabaseConfig,
  cleanEnvValue,
  normalizeSupabaseUrl,
  probeSupabase,
} from "@/lib/bootDiagnostics";

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
    expect(validateSupabaseConfig("https://x.supabase.co", "anon")).toBeNull();
  });
  it("URL vacía → mensaje de URL", () => {
    expect(validateSupabaseConfig("", "anon")).toMatch(/VITE_SUPABASE_URL/);
  });
  it("clave vacía → mensaje de clave", () => {
    expect(validateSupabaseConfig("https://x.supabase.co", "")).toMatch(/ANON_KEY/);
  });
  it("URL sin http(s) ahora se normaliza y es válida", () => {
    expect(validateSupabaseConfig("x.supabase.co", "anon")).toBeNull();
  });
  it("URL con comillas envolventes se limpia y es válida", () => {
    expect(validateSupabaseConfig('"https://x.supabase.co"', '"anon"')).toBeNull();
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
