import { describe, it, expect, beforeEach } from "vitest";
import {
  DEPARTAMENTOS,
  departamentoPorId,
  departamentoDeTexto,
  nombreDepartamento,
  departamentoGuardado,
  guardarDepartamento,
} from "@/lib/departamentos";

// El departamento es el único criterio por el que se filtra la ubicación de un
// aviso: si esto falla, o se esconden avisos que corresponden o aparecen los que
// no. Por eso se prueba el reconocimiento con las formas reales en que la gente
// escribió su ubicación antes de que existiera el selector.

describe("catálogo de departamentos", () => {
  it("están los 25 del país, con Lima y Callao en una sola opción", () => {
    expect(DEPARTAMENTOS).toHaveLength(24);
    const limaCallao = DEPARTAMENTOS.find((d) => d.id === "15")!;
    expect(limaCallao.nombre).toBe("Lima y Callao");
    // Abarca los dos códigos oficiales: si no, quien elige Lima no vería
    // Bellavista, que está a 11 km del centro.
    expect(limaCallao.ubigeos.sort()).toEqual(["07", "15"]);
    expect(DEPARTAMENTOS.find((d) => d.nombre === "Callao")).toBeUndefined();
  });

  it("no hay nombres ni códigos repetidos", () => {
    expect(new Set(DEPARTAMENTOS.map((d) => d.nombre)).size).toBe(DEPARTAMENTOS.length);
    expect(new Set(DEPARTAMENTOS.map((d) => d.id)).size).toBe(DEPARTAMENTOS.length);
  });

  it("cubre los 25 códigos de ubigeo, sin dejarse ninguno", () => {
    const cubiertos = new Set(DEPARTAMENTOS.flatMap((d) => d.ubigeos));
    for (let i = 1; i <= 25; i++) {
      expect(cubiertos.has(String(i).padStart(2, "0"))).toBe(true);
    }
  });

  it("los nombres van bien escritos, con sus tildes", () => {
    const nombres = DEPARTAMENTOS.map((d) => d.nombre);
    expect(nombres).toContain("Áncash");
    expect(nombres).toContain("Apurímac");
    expect(nombres).toContain("Huánuco");
    expect(nombres).toContain("Junín");
    expect(nombres).toContain("San Martín");
  });
});

describe("reconocer el departamento de un aviso ya publicado", () => {
  const id = (t: string) => departamentoDeTexto(t)?.id ?? null;

  it("acierta con la forma en que lo escribe el selector", () => {
    expect(id("Miraflores, Lima")).toBe("15");
    expect(id("Cayma, Arequipa")).toBe("04");
  });

  it("acierta sin tildes, en minúsculas y con la ciudad delante o detrás", () => {
    expect(id("lima, miraflores")).toBe("15");
    expect(id("HUANUCO")).toBe("10");
    expect(id("ancash")).toBe("02");
    expect(id("Cusco - Perú")).toBe("08");
  });

  it("reconoce el Callao como Lima y Callao", () => {
    // Es la misma opción: un aviso en Bellavista debe salir al elegir Lima.
    expect(id("Bellavista, Callao")).toBe("15");
    expect(id("CALLAO")).toBe("15");
  });

  it("acierta con los nombres de varias palabras", () => {
    expect(id("Trujillo, La Libertad")).toBe("13");
    expect(id("Tarapoto, San Martín")).toBe("22");
    expect(id("Puerto Maldonado, Madre de Dios")).toBe("17");
  });

  it("NO confunde una palabra que solo empieza igual", () => {
    // "Limatambo" es un distrito del Cusco: no es Lima.
    expect(id("Limatambo")).not.toBe("15");
    expect(id("Iquitos")).not.toBe("11"); // no es Ica
  });

  it("devuelve null cuando el texto no nombra ningún departamento", () => {
    expect(departamentoDeTexto("A domicilio en todo el país")).toBeNull();
    expect(departamentoDeTexto("Online")).toBeNull();
    expect(departamentoDeTexto("")).toBeNull();
    expect(departamentoDeTexto(null)).toBeNull();
  });
});

describe("mostrar el departamento", () => {
  it("da su nombre, y uno claro cuando no hay", () => {
    expect(nombreDepartamento("15")).toBe("Lima y Callao");
    expect(nombreDepartamento("04")).toBe("Arequipa");
    expect(nombreDepartamento(null)).toBe("Sin especificar");
    expect(nombreDepartamento("99")).toBe("Sin especificar");
  });

  it("busca por código y devuelve null si no existe", () => {
    expect(departamentoPorId("08")?.nombre).toBe("Cusco");
    expect(departamentoPorId("99")).toBeNull();
    expect(departamentoPorId(null)).toBeNull();
  });
});

describe("se recuerda el departamento del usuario", () => {
  beforeEach(() => localStorage.clear());

  it("se guarda y se recupera entre visitas", () => {
    guardarDepartamento(departamentoPorId("04"));
    expect(departamentoGuardado()?.nombre).toBe("Arequipa");
  });

  it("se puede borrar", () => {
    guardarDepartamento(departamentoPorId("04"));
    guardarDepartamento(null);
    expect(departamentoGuardado()).toBeNull();
  });

  it("un código guardado que ya no existe no rompe nada", () => {
    localStorage.setItem("effe:departamento", "99");
    expect(departamentoGuardado()).toBeNull();
  });
});
