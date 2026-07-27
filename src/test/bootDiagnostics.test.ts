// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  REQUIRED_ENV,
  computeEnvDiagnostics,
  validateSupabaseConfig,
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
  it("URL sin http(s) → mensaje de URL inválida", () => {
    expect(validateSupabaseConfig("x.supabase.co", "anon")).toMatch(/http/i);
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
