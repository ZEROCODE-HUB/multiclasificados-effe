import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  paisPorCodigo, nombrePais, esPeru, paisDeZonaHoraria,
  paisGuardado, guardarPais, paisPreferido, PAISES,
  filtroPaisInicial, hayPaisElegido, TODOS_LOS_PAISES,
} from "@/lib/paises";

describe("catálogo de países", () => {
  it("Perú va primero: es el caso normal de la plataforma", () => {
    expect(PAISES[0].code).toBe("PE");
  });

  it("los códigos son ISO de dos letras y no se repiten", () => {
    const codes = PAISES.map((p) => p.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of codes) expect(c).toMatch(/^[A-Z]{2}$/);
  });

  it("ninguna zona horaria está en dos países a la vez", () => {
    const vistas = new Set<string>();
    for (const p of PAISES) {
      for (const z of p.zonas) {
        expect(vistas.has(z)).toBe(false);
        vistas.add(z);
      }
    }
  });

  it("busca sin distinguir mayúsculas y tolera espacios", () => {
    expect(paisPorCodigo("pe")?.nombre).toBe("Perú");
    expect(paisPorCodigo(" CO ")?.nombre).toBe("Colombia");
    expect(paisPorCodigo("")).toBeNull();
    expect(paisPorCodigo(null)).toBeNull();
  });

  it("un código desconocido se muestra como 'Otro país', no como vacío", () => {
    expect(nombrePais("ZZ")).toBe("Otro país");
    expect(nombrePais(null)).toBe("Otro país");
  });

  it("esPeru trata la ausencia de país como Perú (los avisos de siempre)", () => {
    expect(esPeru("PE")).toBe(true);
    expect(esPeru(undefined)).toBe(true);
    expect(esPeru("CL")).toBe(false);
  });
});

describe("país deducido de la zona horaria", () => {
  it("reconoce las zonas de los países del catálogo", () => {
    expect(paisDeZonaHoraria("America/Lima").code).toBe("PE");
    expect(paisDeZonaHoraria("Europe/Madrid").code).toBe("ES");
    expect(paisDeZonaHoraria("America/Bogota").code).toBe("CO");
    expect(paisDeZonaHoraria("America/New_York").code).toBe("US");
    expect(paisDeZonaHoraria("Asia/Tokyo").code).toBe("JP");
  });

  it("una zona desconocida o vacía cae en Perú, que es el error barato", () => {
    expect(paisDeZonaHoraria("Antarctica/Troll").code).toBe("PE");
    expect(paisDeZonaHoraria("").code).toBe("PE");
  });
});

describe("país recordado en el dispositivo", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("guarda y recupera", () => {
    guardarPais("CL");
    expect(paisGuardado()?.code).toBe("CL");
    guardarPais(null);
    expect(paisGuardado()).toBeNull();
  });

  it("lo elegido a mano gana a la zona horaria", () => {
    guardarPais("AR");
    expect(paisPreferido().code).toBe("AR");
  });

  it("sin elección previa, manda la zona horaria del dispositivo", () => {
    vi.stubGlobal("Intl", {
      ...Intl,
      DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: "America/Santiago" }) }),
    });
    expect(paisPreferido().code).toBe("CL");
  });

  it("si el almacenamiento está bloqueado (modo privado) no revienta", () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() { throw new Error("bloqueado"); },
    });
    expect(() => guardarPais("PE")).not.toThrow();
    expect(paisGuardado()).toBeNull();
    if (original) Object.defineProperty(window, "localStorage", original);
  });

  // Se descubrió probando en producción: elegir "Todos los países", recargar, y
  // el buscador volvía al Perú. "Todos" se confundía con "no eligió nada".
  describe("«todos los países» es una elección, no la ausencia de una", () => {
    it("sobrevive a recargar la página", () => {
      guardarPais(TODOS_LOS_PAISES);
      expect(filtroPaisInicial(null)).toBe("");
      expect(hayPaisElegido(null)).toBe(true);
    });

    it("viaja en el enlace que se comparte", () => {
      expect(filtroPaisInicial("todos")).toBe("");
      expect(hayPaisElegido("todos")).toBe(true);
    });

    it("la URL manda sobre lo guardado en el dispositivo", () => {
      guardarPais("AR");
      expect(filtroPaisInicial("CL")).toBe("CL");
      expect(filtroPaisInicial("todos")).toBe("");
    });

    it("sin nada elegido, el filtro arranca en el país de la zona horaria", () => {
      vi.stubGlobal("Intl", {
        ...Intl,
        DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: "America/Bogota" }) }),
      });
      expect(filtroPaisInicial(null)).toBe("CO");
      expect(hayPaisElegido(null)).toBe(false);
    });

    it("«todos» guardado no se confunde con un país", () => {
      guardarPais(TODOS_LOS_PAISES);
      expect(paisGuardado()).toBeNull();
    });
  });
});