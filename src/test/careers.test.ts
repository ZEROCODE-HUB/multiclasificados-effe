import { describe, it, expect } from "vitest";
import {
  camposIncompletos, filasParaExcel, GRADOS, NOMBRE_GRADO, ESTADOS,
  type Career, type CareerInput,
} from "@/lib/careers";

/**
 * «Trabaje con nosotros» (B-18) — la parte que decide si una postulación se
 * pierde o no.
 */

const COMPLETO: CareerInput = {
  apellidoPaterno: "Ramírez",
  apellidoMaterno: "Soto",
  nombres: "Ana",
  docType: "DNI",
  docNumber: "45678912",
  email: "ana@correo.com",
  phone: "999888777",
  grado: "tecnico",
  puesto: "Asesora comercial",
  descripcion: "Cinco años en ventas.",
};

describe("qué se exige", () => {
  it("un formulario completo no tiene nada que reclamar", () => {
    expect(camposIncompletos(COMPLETO)).toEqual([]);
  });

  it("el teléfono es opcional; lo demás no", () => {
    // Mucha gente postula desde el móvil sin querer dar su número, y perder un
    // candidato por eso no compensa: el correo ya alcanza para contestarle.
    expect(camposIncompletos({ ...COMPLETO, phone: "" })).toEqual([]);
  });

  it("devuelve los que faltan EN ORDEN de pantalla", () => {
    // El orden importa: el primero de la lista es donde se deja el cursor, y
    // tiene que ser el primero que se ve, no uno de más abajo.
    const faltan = camposIncompletos({ ...COMPLETO, nombres: "", apellidoPaterno: "", puesto: "" });
    expect(faltan).toEqual(["apellidoPaterno", "nombres", "puesto"]);
  });

  it("un campo con solo espacios cuenta como vacío", () => {
    expect(camposIncompletos({ ...COMPLETO, descripcion: "   " })).toContain("descripcion");
  });

  it("sin grado de instrucción no se puede enviar", () => {
    expect(camposIncompletos({ ...COMPLETO, grado: undefined })).toContain("grado");
  });
});

describe("el correo se comprueba, no solo se pide", () => {
  it("uno mal escrito no pasa", () => {
    // Es peor que uno vacío: la postulación entra y la respuesta no llega
    // nunca. El candidato se queda esperando y nosotros creemos haber contestado.
    for (const malo of ["ana", "ana@", "ana@correo", "@correo.com", "ana correo@x.com"]) {
      expect(camposIncompletos({ ...COMPLETO, email: malo })).toContain("email");
    }
  });

  it("uno bien escrito sí", () => {
    for (const bueno of ["ana@correo.com", "ana.perez@sub.dominio.pe", "a+b@x.co"]) {
      expect(camposIncompletos({ ...COMPLETO, email: bueno })).not.toContain("email");
    }
  });
});

describe("los cinco grados que pidió el cliente", () => {
  it("están todos y en su orden", () => {
    expect(GRADOS.map((g) => g.valor)).toEqual([
      "secundaria", "tecnico", "bachiller", "maestria", "doctorado",
    ]);
  });

  it("se enseñan con tilde aunque se guarden sin ella", () => {
    // En la base van sin tilde para no depender de la codificación; en pantalla
    // "Maestria" queda mal.
    expect(NOMBRE_GRADO.maestria).toBe("Maestría");
    expect(NOMBRE_GRADO.tecnico).toBe("Técnico");
  });
});

describe("la descarga a Excel", () => {
  const fila = (extra: Partial<Career> = {}): Career => ({
    ...COMPLETO,
    id: "1", code: 7, status: "nueva", nota: null,
    createdAt: "2026-08-31T15:00:00Z",
    nombreCompleto: "Ana Ramírez Soto",
    ...extra,
  });

  it("lleva todo lo que hace falta para tratar una postulación fuera de la app", () => {
    const [f] = filasParaExcel([fila()]);
    expect(f["N.º"]).toBe(7);
    expect(f.Apellidos).toBe("Ramírez Soto");
    expect(f.Nombres).toBe("Ana");
    expect(f.Documento).toBe("DNI 45678912");
    expect(f.Correo).toBe("ana@correo.com");
    expect(f["Grado de instrucción"]).toBe("Técnico");
    expect(f.Puesto).toBe("Asesora comercial");
    expect(f.Estado).toBe("Nueva");
  });

  it("una nota vacía sale en blanco, no como 'null'", () => {
    const [f] = filasParaExcel([fila({ nota: null, phone: "" })]);
    expect(f.Nota).toBe("");
    expect(f["Teléfono"]).toBe("");
  });

  it("los cuatro estados tienen nombre", () => {
    for (const e of ESTADOS) {
      const [f] = filasParaExcel([fila({ status: e.valor })]);
      expect(f.Estado).toBe(e.etiqueta);
    }
  });
});
