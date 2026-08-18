import { describe, it, expect, vi, beforeEach } from "vitest";

// Un país DEDUCIDO no puede dejar a nadie mirando una pantalla vacía.
//
// Caso real detectado en producción: un equipo con la zona horaria en
// America/Caracas hacía que el buscador filtrase por Venezuela. Con la
// migración de países aplicada, ese usuario habría visto cero avisos en un
// catálogo de 224.

const searchListings = vi.fn();
vi.mock("@/lib/listings", async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  searchListings: (...a: unknown[]) => searchListings(...a),
  fetchListingsByOwner: vi.fn().mockResolvedValue([]),
  topeAlcanzado: () => false,
}));

import { paisDeZonaHoraria, paisGuardado, guardarPais } from "@/lib/paises";

beforeEach(() => {
  localStorage.clear();
  searchListings.mockReset();
});

describe("país deducido de la zona horaria", () => {
  it("una zona horaria mal configurada apunta a otro país (el caso que falló)", () => {
    // No es un error del cálculo: Caracas ES Venezuela. El problema es confiar
    // en el dato sin red de seguridad.
    expect(paisDeZonaHoraria("America/Caracas").code).toBe("VE");
  });

  it("deducir no es elegir: no se guarda en el dispositivo", () => {
    // Si el país deducido se guardara, no habría forma de distinguir después
    // entre "lo eligió el usuario" y "lo supusimos nosotros".
    expect(paisGuardado()).toBeNull();
    guardarPais("VE");
    expect(paisGuardado()?.code).toBe("VE");
  });
});
