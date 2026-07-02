import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock del cliente Supabase: controlamos qué devuelve functions.invoke.
const invoke = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } },
}));

import { verifyDocument } from "@/lib/verifyDoc";

beforeEach(() => invoke.mockReset());

describe("verifyDocument — validación previa (no gasta consulta)", () => {
  it("rechaza DNI que no tiene 8 dígitos sin llamar a la función", async () => {
    const r = await verifyDocument("dni", "123");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/8 dígitos/);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("rechaza RUC que no tiene 11 dígitos sin llamar a la función", async () => {
    const r = await verifyDocument("ruc", "20131312");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/11 dígitos/);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("limpia caracteres no numéricos antes de validar/enviar", async () => {
    invoke.mockResolvedValue({ data: { success: true, nombre: "JUAN PEREZ", data: {} }, error: null });
    await verifyDocument("dni", "4444-33 33");
    expect(invoke).toHaveBeenCalledWith("verify-doc", { body: { tipo: "dni", numero: "44443333" } });
  });
});

describe("verifyDocument — respuestas de la función", () => {
  it("DNI válido → ok con el nombre completo", async () => {
    invoke.mockResolvedValue({
      data: { success: true, tipo: "dni", nombre: "ROMAINA SILVA, LISMELI", data: { numero: "44443333" } },
      error: null,
    });
    const r = await verifyDocument("dni", "44443333");
    expect(r.ok).toBe(true);
    expect(r.nombre).toBe("ROMAINA SILVA, LISMELI");
    expect(r.data?.numero).toBe("44443333");
  });

  it("RUC válido → ok con la razón social", async () => {
    invoke.mockResolvedValue({
      data: { success: true, tipo: "ruc", nombre: "SUNAT", data: {} },
      error: null,
    });
    const r = await verifyDocument("ruc", "20131312955");
    expect(r.ok).toBe(true);
    expect(r.nombre).toBe("SUNAT");
  });

  it("documento inexistente → not ok con el mensaje de Factiliza", async () => {
    invoke.mockResolvedValue({
      data: { success: false, error: "No se encontro información con el numero de DNI: 00000000" },
      error: null,
    });
    const r = await verifyDocument("dni", "00000000");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/No se encontro/);
  });

  it("error de red/función → not ok, extrae error.context.json().error", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: { message: "Edge Function returned a non-2xx", context: { json: async () => ({ error: "Token de Factiliza inválido o vencido." }) } },
    });
    const r = await verifyDocument("ruc", "20131312955");
    expect(r.ok).toBe(false);
    expect(r.error).toBe("Token de Factiliza inválido o vencido.");
  });

  it("error sin context → conserva error.message", async () => {
    invoke.mockResolvedValue({ data: null, error: { message: "network down" } });
    const r = await verifyDocument("dni", "44443333");
    expect(r.ok).toBe(false);
    expect(r.error).toBe("network down");
  });
});
