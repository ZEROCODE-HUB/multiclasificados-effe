import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * B-10 — el documento de quien reporta.
 *
 * Todo este archivo gira alrededor de UNA decisión: qué hacer cuando no se
 * puede comprobar el documento.
 *
 * Si se bloqueara el reporte, una caída de Factiliza sería un botón de silencio
 * — nadie podría denunciar un aviso fraudulento mientras durase, y nosotros no
 * nos enteraríamos porque lo que se ve es "reportes: cero". Así que **falla
 * abierto**: el reporte entra marcado como no verificado y una persona lo mira.
 *
 * Un reporte de más lo revisa alguien; un reporte que no se pudo hacer no lo
 * revisa nadie.
 */

const verifyDocument = vi.fn();
vi.mock("@/lib/verifyDoc", () => ({
  verifyDocument: (...a: unknown[]) => verifyDocument(...a),
  normalizeDocNumber: (v: string, n: number) => v.replace(/\D/g, "").slice(0, n),
}));

const insert = vi.fn();
const single = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: () => ({ insert: (fila: unknown) => insert(fila) }),
  },
}));

import { comprobarDocumento, reportListing, faltaEnLaDenuncia } from "@/lib/reports";

beforeEach(() => {
  verifyDocument.mockReset();
  insert.mockReset();
  single.mockReset();
  insert.mockResolvedValue({ error: null });
});

describe("cuándo se bloquea un reporte", () => {
  it("solo cuando el registro dice que ese documento NO existe", async () => {
    verifyDocument.mockResolvedValue({
      ok: false, causa: "no_existe",
      error: "No se encontró el USUARIO/EMPRESA con el DNI/RUC ingresado",
    });
    const r = await comprobarDocumento("DNI", "45678912");
    expect(r.estado).toBe("no-existe");
  });

  it("y cuando el número no tiene forma de documento", async () => {
    verifyDocument.mockResolvedValue({ ok: false, causa: "entrada", error: "El DNI debe tener 8 dígitos." });
    expect((await comprobarDocumento("DNI", "456")).estado).toBe("no-existe");
  });
});

describe("cuándo NO se bloquea, aunque falle", () => {
  it("si el servicio está caído", async () => {
    verifyDocument.mockResolvedValue({ ok: false, causa: "servicio", error: "No se pudo verificar…" });
    expect((await comprobarDocumento("DNI", "45678912")).estado).toBe("no-se-pudo");
  });

  it("si se agotó la cuota de consultas", async () => {
    // Reintentar con otro número tampoco funcionaría: no es culpa de quien
    // denuncia.
    verifyDocument.mockResolvedValue({ ok: false, causa: "cuota", rateLimited: true, error: "Demasiadas consultas." });
    expect((await comprobarDocumento("DNI", "45678912")).estado).toBe("no-se-pudo");
  });

  it("y si la función desplegada es vieja y no manda `causa`", async () => {
    // Es el caso que más fácil se pasa por alto: el código nuevo sube antes que
    // la Edge Function. Ante la duda, no se bloquea a nadie.
    verifyDocument.mockResolvedValue({ ok: false, error: "algo pasó" });
    expect((await comprobarDocumento("DNI", "45678912")).estado).toBe("no-se-pudo");
  });
});

describe("cuando el documento existe", () => {
  it("devuelve el nombre del registro", async () => {
    verifyDocument.mockResolvedValue({ ok: true, nombre: "ANA RAMIREZ SOTO" });
    const r = await comprobarDocumento("DNI", "45678912");
    expect(r).toEqual({ estado: "existe", nombre: "ANA RAMIREZ SOTO" });
  });

  it("un RUC se consulta como RUC, no como DNI", async () => {
    verifyDocument.mockResolvedValue({ ok: true, nombre: "EFFE SAC" });
    await comprobarDocumento("RUC", "20123456789");
    expect(verifyDocument).toHaveBeenCalledWith("ruc", "20123456789");
  });
});

describe("lo que se guarda con el reporte", () => {
  const AVISO = "11111111-1111-4111-8111-111111111111";

  it("el documento va con el reporte, y sin puntos ni espacios", async () => {
    await reportListing(AVISO, "Posible estafa o fraude", "se repite el texto", {
      name: "ANA RAMIREZ SOTO", docType: "DNI", docNumber: "45.678.912", docVerified: true,
    });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      reporter_name: "ANA RAMIREZ SOTO",
      reporter_doc_type: "DNI",
      reporter_doc_number: "45678912",
      reporter_doc_verified: true,
    }));
  });

  it("«no se pudo comprobar» se guarda como null, no como false", async () => {
    // No es un matiz: `false` dice "ese documento no existe" y eso acusa a
    // alguien. `null` dice "no lo sabemos", que es la verdad.
    await reportListing(AVISO, "Otro", "", {
      name: "Ana", docType: "DNI", docNumber: "45678912", docVerified: null,
    });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ reporter_doc_verified: null }));
  });

  it("el motivo y el comentario siguen viajando juntos, como antes", async () => {
    await reportListing(AVISO, "Precio incorrecto", "dice 1 sol", {
      name: "Ana", docType: "DNI", docNumber: "45678912", docVerified: true,
    });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      category: "Precio incorrecto",
      reason: "Precio incorrecto — dice 1 sol",
      listing_id: AVISO,
    }));
  });

  it("sin datos de quien reporta no se inventan columnas vacías", async () => {
    // Es lo que mantiene vivo cualquier sitio que reporte sin documento; las
    // columnas se quedan nulas en la base, no en cadena vacía.
    await reportListing(AVISO, "Otro", "");
    const fila = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(fila).not.toHaveProperty("reporter_doc_number");
    expect(fila).not.toHaveProperty("reporter_doc_verified");
  });
});

describe("qué le falta al formulario antes de enviarlo", () => {
  const ok = { name: "ANA RAMIREZ SOTO", docType: "DNI" as const, docNumber: "45678912" };

  it("los nombres y apellidos son obligatorios", () => {
    // El cliente pidió "DNI, Apellidos y nombres". Y hace falta de verdad: si
    // Factiliza no responde tampoco llega el nombre del registro, así que sin
    // esto la denuncia se guardaría sin rastro de quién la puso.
    expect(faltaEnLaDenuncia({ ...ok, name: "" })).toEqual({
      campo: "name", mensaje: "Escribe tus nombres y apellidos.",
    });
    expect(faltaEnLaDenuncia({ ...ok, name: "   " })?.campo).toBe("name");
  });

  it("el nombre se pregunta antes que el documento", () => {
    // Importa el orden: la pantalla marca el PRIMERO que falta y le lleva el
    // cursor. Devolver el documento con el nombre vacío mandaría al usuario al
    // campo equivocado.
    expect(faltaEnLaDenuncia({ name: "", docType: "DNI", docNumber: "" })?.campo).toBe("name");
  });

  it("el DNI son ocho dígitos y el RUC once", () => {
    expect(faltaEnLaDenuncia({ ...ok, docNumber: "456" })).toEqual({
      campo: "docNumber", mensaje: "El DNI debe tener 8 dígitos.",
    });
    expect(faltaEnLaDenuncia({ ...ok, docType: "RUC", docNumber: "45678912" })).toEqual({
      campo: "docNumber", mensaje: "El RUC debe tener 11 dígitos.",
    });
    expect(faltaEnLaDenuncia({ ...ok, docType: "RUC", docNumber: "20123456789" })).toBeNull();
  });

  it("los puntos y espacios de un documento pegado no cuentan como dígitos", () => {
    expect(faltaEnLaDenuncia({ ...ok, docNumber: "45.678.912" })).toBeNull();
    expect(faltaEnLaDenuncia({ ...ok, docNumber: "4567 8912" })).toBeNull();
  });

  it("completo, no falta nada", () => {
    expect(faltaEnLaDenuncia(ok)).toBeNull();
  });
});
