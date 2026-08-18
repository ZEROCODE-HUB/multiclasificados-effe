import { describe, it, expect, vi, beforeEach } from "vitest";

// La web se despliega en minutos y las migraciones se aplican a mano: entre una
// cosa y la otra hay una ventana en la que la base todavía no conoce el filtro
// de país. Sin red de seguridad, el buscador se veía VACÍO — que es lo mismo
// que "no hay avisos con esos filtros" y cuesta horas de diagnosticar.

const rpc = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: { rpc: (...a: unknown[]) => rpc(...a) },
}));

import { searchListings } from "@/lib/listings";

beforeEach(() => rpc.mockReset());

const errorDeFirma = {
  code: "PGRST202",
  message: "Could not find the function public.search_listings(p_country) in the schema cache",
};

describe("searchListings — la base puede ir por detrás del despliegue", () => {
  it("si la migración de países no está aplicada, reintenta sin ese filtro", async () => {
    rpc
      .mockResolvedValueOnce({ data: null, error: errorDeFirma })
      .mockResolvedValueOnce({ data: [], error: null });

    const filas = await searchListings({ q: "casa", country: "PE" });

    expect(filas).toEqual([]);
    expect(rpc).toHaveBeenCalledTimes(2);
    // El reintento va sin país, pero conserva el resto de filtros.
    expect(rpc.mock.calls[1][1]).not.toHaveProperty("p_country");
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_query: "casa" });
  });

  it("con la migración aplicada no reintenta nada", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await searchListings({ q: "casa" });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][1]).toHaveProperty("p_country", "PE");
  });

  it("un error de verdad NO se disfraza de reintento", async () => {
    // Si la base está caída, reintentar solo esconde el problema.
    rpc.mockResolvedValue({ data: null, error: { code: "57P01", message: "server closed the connection" } });
    const filas = await searchListings({ q: "casa" });
    expect(filas).toEqual([]);          // el buscador no revienta…
    expect(rpc).toHaveBeenCalledTimes(1); // …pero tampoco insiste
  });
});
