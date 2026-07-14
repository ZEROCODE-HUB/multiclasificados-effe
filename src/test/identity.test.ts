import { describe, it, expect } from "vitest";
import { personKindLabel, docKindLabel, factilizaRows } from "@/lib/identity";

describe("personKindLabel — Usuario vs Empresa", () => {
  it("usa el tipo cuando está: dni/ce = Usuario, ruc = Empresa", () => {
    expect(personKindLabel("dni", "12345678")).toBe("Usuario");
    expect(personKindLabel("ce", "000111")).toBe("Usuario");
    expect(personKindLabel("ruc", "20123456789")).toBe("Empresa");
  });
  it("sin tipo, lo infiere por longitud (11 dígitos = Empresa)", () => {
    expect(personKindLabel(null, "20123456789")).toBe("Empresa");
    expect(personKindLabel(null, "12345678")).toBe("Usuario");
    expect(personKindLabel(null, "")).toBe("—");
  });
});

describe("docKindLabel — etiqueta del documento", () => {
  it("respeta el tipo y cae a la longitud si falta", () => {
    expect(docKindLabel("ruc", "20123456789")).toBe("RUC");
    expect(docKindLabel("dni", "12345678")).toBe("DNI");
    expect(docKindLabel(null, "20123456789")).toBe("RUC");
    expect(docKindLabel(null, "12345678")).toBe("DNI");
  });
});

describe("factilizaRows — ficha legible de Factiliza", () => {
  it("DNI: arma el domicilio con dirección + ubigeo y agrega datos personales", () => {
    const rows = factilizaRows("dni", {
      nombre_completo: "JUAN PEREZ",
      direccion: "JR. LOS OLIVOS 123",
      distrito: "MIRAFLORES", provincia: "LIMA", departamento: "LIMA",
      fecha_nacimiento: "1990-05-01", sexo: "MASCULINO",
    });
    const map = Object.fromEntries(rows);
    expect(map["Domicilio"]).toBe("JR. LOS OLIVOS 123, MIRAFLORES - LIMA - LIMA");
    expect(map["Fecha de nacimiento"]).toBe("1990-05-01");
    expect(map["Sexo"]).toBe("MASCULINO");
  });

  it("RUC: muestra domicilio fiscal, estado y condición", () => {
    const rows = factilizaRows("ruc", {
      direccion_completa: "AV. INDUSTRIAL 900 - LIMA",
      estado: "ACTIVO", condicion: "HABIDO", tipo_contribuyente: "S.A.C.",
    });
    const map = Object.fromEntries(rows);
    expect(map["Domicilio fiscal"]).toBe("AV. INDUSTRIAL 900 - LIMA");
    expect(map["Estado"]).toBe("ACTIVO");
    expect(map["Condición"]).toBe("HABIDO");
    expect(map["Tipo contribuyente"]).toBe("S.A.C.");
  });

  it("omite campos vacíos y devuelve [] si no hay ficha", () => {
    expect(factilizaRows("dni", null)).toEqual([]);
    expect(factilizaRows("dni", { direccion: "", sexo: "  " })).toEqual([]);
  });
});
