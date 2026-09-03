import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Cómo se manda una postulación de «Trabaje con nosotros».
 *
 * LO QUE REPORTÓ EL CLIENTE: "new row violates row-level security policy for
 * table careers — No se pudo registrar tu postulación".
 *
 * `submitCareer` insertaba en la tabla pidiendo la fila de vuelta
 * (`.select("code, created_at")`), y esa tabla NO se puede leer: guarda
 * documento, correo y teléfono de terceros. El propio insert se bloqueaba.
 *
 * La prueba de la pantalla no lo vio porque tenía `submitCareer` simulado: nadie
 * ejercitaba este camino. El detalle de la base está en `migration0145.test.ts`;
 * aquí se fija lo del cliente, que es no volver a tocar la tabla directamente.
 */

const rpc = vi.fn();
const from = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    from: (...a: unknown[]) => from(...a),
  },
}));

import { submitCareer, YaPostulaste, type CareerInput } from "@/lib/careers";

const COMPLETO: CareerInput = {
  apellidoPaterno: " Ramírez ", apellidoMaterno: "Soto", nombres: " Ana ",
  docType: "DNI", docNumber: " 45678912 ", email: "  ANA@Correo.COM ",
  phone: " 999888777 ", grado: "tecnico", puesto: " Asesora ",
  descripcion: " Cinco años en ventas. ",
};

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({
    data: { code: 7, created_at: "2026-09-03T12:00:00Z" }, error: null,
  });
  from.mockReset();
});

describe("por dónde va la postulación", () => {
  it("por el RPC, y NO tocando la tabla", async () => {
    // Es la línea que arregla el fallo: en cuanto alguien vuelva a
    // `supabase.from("careers").insert(...)`, esto se pone en rojo.
    await submitCareer(COMPLETO);
    expect(rpc).toHaveBeenCalledWith("postular_a_la_empresa", expect.any(Object));
    expect(from).not.toHaveBeenCalled();
  });

  it("manda los campos recortados y el correo en minúsculas", async () => {
    await submitCareer(COMPLETO);
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_apellido_paterno: "Ramírez",
      p_nombres: "Ana",
      p_doc_number: "45678912",
      p_email: "ana@correo.com",
      p_phone: "999888777",
      p_descripcion: "Cinco años en ventas.",
    });
  });

  it("un teléfono en blanco viaja como null, no como cadena vacía", async () => {
    await submitCareer({ ...COMPLETO, phone: "   " });
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_phone: null });
  });

  it("devuelve el número y la fecha para enseñárselos a quien postula", async () => {
    // Es su referencia: sin esto, la pantalla de "Recibimos tu postulación" no
    // puede decirle con qué número quedó registrada.
    expect(await submitCareer(COMPLETO)).toEqual({
      code: 7, createdAt: "2026-09-03T12:00:00Z",
    });
  });
});

describe("cuando algo falla", () => {
  it("el freno se distingue: «ya postulaste» no es un error inesperado", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "23514", message: "Ya registramos tu postulación." },
    });
    await expect(submitCareer(COMPLETO)).rejects.toBeInstanceOf(YaPostulaste);
  });

  it("y lo demás sube como error normal", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "permission denied" } });
    const err = await submitCareer(COMPLETO).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(YaPostulaste);
  });
});
