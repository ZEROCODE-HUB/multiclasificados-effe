import { describe, it, expect } from "vitest";
import {
  normalizar, aplicarMarca, marcasDelRango, aTextoPlano, tieneFormato,
  desdeTextoPlano, validar, MAX_FRAGMENTOS, claseDeColor, hexDeColor, COLORES,
  type TextoConFormato,
} from "@/lib/textoConFormato";

/**
 * La lógica de la descripción con negrita y color.
 *
 * Aquí están los casos raros de verdad: partir un fragmento por la mitad,
 * fusionar los que quedan iguales y decidir qué marcas tiene una selección que
 * cruza varios trozos. Es lógica pura a propósito —sin React ni DOM— para poder
 * probarla a fondo sin montar nada.
 */

const texto = (f: TextoConFormato) => aTextoPlano(f);

describe("normalizar", () => {
  it("junta los vecinos que dicen lo mismo", () => {
    // NO es cosmético. Sin esto, escribir una palabra en negrita letra a letra
    // deja un fragmento POR LETRA, y con el tope de 300 una descripción normal
    // dejaría de poder guardarse.
    const r = normalizar([{ t: "Ho" }, { t: "la" }, { t: " mundo" }]);
    expect(r).toEqual([{ t: "Hola mundo" }]);
  });

  it("pero no junta los que tienen marcas distintas", () => {
    const r = normalizar([{ t: "Hola " }, { t: "mundo", b: true }]);
    expect(r).toHaveLength(2);
  });

  it("tira los fragmentos vacíos", () => {
    expect(normalizar([{ t: "" }, { t: "a" }, { t: "" }])).toEqual([{ t: "a" }]);
  });

  it("no deja pasar un `b: false`, que la base rechazaría", () => {
    const r = normalizar([{ t: "a", b: false as unknown as true }]);
    expect(r[0]).not.toHaveProperty("b");
  });
});

describe("aplicar negrita", () => {
  const base = desdeTextoPlano("Depa amoblado en Lima");

  it("solo al trozo seleccionado", () => {
    const r = aplicarMarca(base, { desde: 5, hasta: 13 }, { b: true });
    expect(texto(r)).toBe("Depa amoblado en Lima");
    expect(r).toEqual([
      { t: "Depa " }, { t: "amoblado", b: true }, { t: " en Lima" },
    ]);
  });

  it("seleccionar media palabra NO cambia la otra mitad", () => {
    const r = aplicarMarca(base, { desde: 0, hasta: 2 }, { b: true });
    expect(r[0]).toEqual({ t: "De", b: true });
    expect(r[1].b).toBeUndefined();
  });

  it("volver a pulsar la quita", () => {
    const con = aplicarMarca(base, { desde: 5, hasta: 13 }, { b: true });
    const sin = aplicarMarca(con, { desde: 5, hasta: 13 }, { b: false });
    expect(sin).toEqual([{ t: "Depa amoblado en Lima" }]);
    // Y al quitarla vuelve a ser UN solo fragmento: si no, cada ida y vuelta
    // dejaría el contenido más troceado que antes.
    expect(sin).toHaveLength(1);
  });

  it("una selección que cruza varios fragmentos los marca todos", () => {
    const mezcla: TextoConFormato = [
      { t: "uno " }, { t: "dos", c: "rojo" }, { t: " tres" },
    ];
    const r = aplicarMarca(mezcla, { desde: 0, hasta: 12 }, { b: true });
    expect(r.every((p) => p.b)).toBe(true);
    // Y el color de en medio se respeta: negrita y color son independientes.
    expect(r.find((p) => p.t === "dos")?.c).toBe("rojo");
  });

  it("sin selección no cambia nada", () => {
    expect(aplicarMarca(base, { desde: 4, hasta: 4 }, { b: true })).toBe(base);
  });

  it("el texto NUNCA cambia al dar formato", () => {
    // Es lo que garantiza que el buscador siga encontrando lo mismo.
    const r = aplicarMarca(base, { desde: 3, hasta: 9 }, { c: "verde" });
    expect(texto(r)).toBe(texto(base));
  });
});

describe("aplicar color", () => {
  const base = desdeTextoPlano("Oferta especial");

  it("marca el trozo con el color elegido", () => {
    const r = aplicarMarca(base, { desde: 0, hasta: 6 }, { c: "rojo" });
    expect(r[0]).toEqual({ t: "Oferta", c: "rojo" });
  });

  it("elegir «normal» lo quita", () => {
    const con = aplicarMarca(base, { desde: 0, hasta: 6 }, { c: "rojo" });
    const sin = aplicarMarca(con, { desde: 0, hasta: 6 }, { c: null });
    expect(sin).toEqual([{ t: "Oferta especial" }]);
  });

  it("un color sustituye al anterior en vez de acumularse", () => {
    const rojo = aplicarMarca(base, { desde: 0, hasta: 6 }, { c: "rojo" });
    const verde = aplicarMarca(rojo, { desde: 0, hasta: 6 }, { c: "verde" });
    expect(verde[0].c).toBe("verde");
  });
});

describe("qué marcas tiene lo seleccionado", () => {
  const f: TextoConFormato = [
    { t: "uno ", b: true }, { t: "dos", b: true, c: "rojo" }, { t: " tres" },
  ];

  it("con TODO en negrita, el botón sale pulsado", () => {
    expect(marcasDelRango(f, { desde: 0, hasta: 7 }).b).toBe(true);
  });

  it("con MEDIA selección en negrita, NO sale pulsado", () => {
    // Y es lo correcto: pulsarlo va a poner en negrita el resto, no a quitarla.
    expect(marcasDelRango(f, { desde: 0, hasta: 10 }).b).toBe(false);
  });

  it("el color solo se muestra si es el mismo en todo", () => {
    expect(marcasDelRango(f, { desde: 4, hasta: 7 }).c).toBe("rojo");
    expect(marcasDelRango(f, { desde: 0, hasta: 10 }).c).toBeNull();
  });
});

describe("validar lo que llega de fuera", () => {
  // Se usa al leer de la base: una fila puede venir de una versión anterior o de
  // alguien escribiendo por la API. Ante la duda, texto plano.
  it("acepta lo bueno", () => {
    expect(validar([{ t: "a", b: true, c: "rojo" }])).toEqual([{ t: "a", b: true, c: "rojo" }]);
  });

  it("rechaza un color que no es de la paleta", () => {
    expect(validar([{ t: "a", c: "fucsia" }])).toBeNull();
  });

  it("rechaza claves desconocidas", () => {
    // Aunque hoy el renderizador las ignoraría, el de mañana podría mirarlas.
    expect(validar([{ t: "a", onclick: "alert(1)" }])).toBeNull();
  });

  it("rechaza lo que no es una lista de objetos", () => {
    for (const malo of ["texto", 123, null, undefined, {}, [null], [[{ t: "a" }]], [{ t: 5 }]]) {
      expect(validar(malo)).toBeNull();
    }
  });

  it("rechaza un `b: false` en vez de arreglarlo por su cuenta", () => {
    expect(validar([{ t: "a", b: false }])).toBeNull();
  });

  it("rechaza más fragmentos de la cuenta", () => {
    const muchos = Array.from({ length: MAX_FRAGMENTOS + 1 }, (_, i) => ({ t: `${i}`, b: true as const }));
    expect(validar(muchos)).toBeNull();
  });

  it("una lista vacía es lo mismo que no tener formato", () => {
    expect(validar([])).toBeNull();
  });
});

describe("texto plano y formato", () => {
  it("el texto plano es lo que se guarda y lo que se busca", () => {
    expect(aTextoPlano([{ t: "Casa " }, { t: "grande", b: true }])).toBe("Casa grande");
  });

  it("conserva los saltos de línea", () => {
    // La ficha los pinta con `whitespace-pre-line`, igual que siempre.
    expect(aTextoPlano([{ t: "Uno\nDos" }])).toBe("Uno\nDos");
  });

  it("sin ninguna marca no cuenta como formato", () => {
    // Así no se guarda una columna llena de contenido que no aporta nada.
    expect(tieneFormato(desdeTextoPlano("Hola"))).toBe(false);
    expect(tieneFormato([{ t: "Hola", b: true }])).toBe(true);
  });

  it("un texto vacío no produce fragmentos", () => {
    expect(desdeTextoPlano("")).toEqual([]);
  });
});

describe("la paleta", () => {
  it("cada color tiene su clase y su tono, y coinciden entre sí", () => {
    // El editor pinta con el tono y la ficha con la clase. Si se separan, lo que
    // se escribe se vería distinto de lo que se publica.
    for (const c of COLORES) {
      expect(claseDeColor(c.valor)).toBe(c.clase);
      expect(hexDeColor(c.valor)).toBe(c.hex);
      expect(c.hex).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("un color inventado cae en el normal, no rompe nada", () => {
    expect(claseDeColor("fucsia" as never)).toBe(COLORES[0].clase);
  });
});
