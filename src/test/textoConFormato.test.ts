import { describe, it, expect } from "vitest";
import {
  normalizar, aplicarMarca, marcasDelRango, aTextoPlano, tieneFormato,
  desdeTextoPlano, validar, MAX_FRAGMENTOS, hexDeColor, esColorValido,
  normalizarColor, COLORES, COLOR_NORMAL,
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
      { t: "uno " }, { t: "dos", c: "#dc2626" }, { t: " tres" },
    ];
    const r = aplicarMarca(mezcla, { desde: 0, hasta: 12 }, { b: true });
    expect(r.every((p) => p.b)).toBe(true);
    // Y el color de en medio se respeta: negrita y color son independientes.
    expect(r.find((p) => p.t === "dos")?.c).toBe("#dc2626");
  });

  it("sin selección no cambia nada", () => {
    expect(aplicarMarca(base, { desde: 4, hasta: 4 }, { b: true })).toBe(base);
  });

  it("el texto NUNCA cambia al dar formato", () => {
    // Es lo que garantiza que el buscador siga encontrando lo mismo.
    const r = aplicarMarca(base, { desde: 3, hasta: 9 }, { c: "#059669" });
    expect(texto(r)).toBe(texto(base));
  });
});

describe("aplicar color", () => {
  const base = desdeTextoPlano("Oferta especial");

  it("marca el trozo con el color elegido", () => {
    const r = aplicarMarca(base, { desde: 0, hasta: 6 }, { c: "#dc2626" });
    expect(r[0]).toEqual({ t: "Oferta", c: "#dc2626" });
  });

  it("elegir «normal» lo quita", () => {
    const con = aplicarMarca(base, { desde: 0, hasta: 6 }, { c: "#dc2626" });
    const sin = aplicarMarca(con, { desde: 0, hasta: 6 }, { c: null });
    expect(sin).toEqual([{ t: "Oferta especial" }]);
  });

  it("un color sustituye al anterior en vez de acumularse", () => {
    const rojo = aplicarMarca(base, { desde: 0, hasta: 6 }, { c: "#dc2626" });
    const verde = aplicarMarca(rojo, { desde: 0, hasta: 6 }, { c: "#059669" });
    expect(verde[0].c).toBe("#059669");
  });
});

describe("qué marcas tiene lo seleccionado", () => {
  const f: TextoConFormato = [
    { t: "uno ", b: true }, { t: "dos", b: true, c: "#dc2626" }, { t: " tres" },
  ];

  it("con TODO en negrita, el botón sale pulsado", () => {
    expect(marcasDelRango(f, { desde: 0, hasta: 7 }).b).toBe(true);
  });

  it("con MEDIA selección en negrita, NO sale pulsado", () => {
    // Y es lo correcto: pulsarlo va a poner en negrita el resto, no a quitarla.
    expect(marcasDelRango(f, { desde: 0, hasta: 10 }).b).toBe(false);
  });

  it("el color solo se muestra si es el mismo en todo", () => {
    expect(marcasDelRango(f, { desde: 4, hasta: 7 }).c).toBe("#dc2626");
    expect(marcasDelRango(f, { desde: 0, hasta: 10 }).c).toBeNull();
  });
});

describe("validar lo que llega de fuera", () => {
  // Se usa al leer de la base: una fila puede venir de una versión anterior o de
  // alguien escribiendo por la API. Ante la duda, texto plano.
  it("acepta lo bueno", () => {
    expect(validar([{ t: "a", b: true, c: "#dc2626" }])).toEqual([{ t: "a", b: true, c: "#dc2626" }]);
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

describe("el color, que ahora puede ser cualquiera", () => {
  it("acepta un tono libre en `#rrggbb`", () => {
    // Es lo que pidió el cliente: no una lista de cuatro.
    expect(validar([{ t: "x", c: "#7c3aed" }])).toEqual([{ t: "x", c: "#7c3aed" }]);
  });

  it("pero SOLO con esa forma", () => {
    // Este valor acaba en un `style` de la ficha que abre cualquier visitante.
    // Lo que no sean seis dígitos hexadecimales en minúsculas no entra.
    for (const malo of [
      "rojo", "#FFF", "#ffffff ", "red", "#12345", "#1234567",
      "#ff0000; background: url(x)", "rgb(255,0,0)", "#GGGGGG", "",
    ]) {
      expect(validar([{ t: "x", c: malo }]), `coló ${malo}`).toBeNull();
      expect(esColorValido(malo), `coló ${malo}`).toBe(false);
    }
  });

  it("las mayúsculas se rechazan en vez de arreglarse solas", () => {
    // Si se admitieran las dos formas, "#FF0000" y "#ff0000" serían el mismo
    // color con dos valores, y dos fragmentos vecinos idénticos dejarían de
    // fusionarse. Una sola forma, y se normaliza al leer del navegador.
    expect(validar([{ t: "x", c: "#FF0000" }])).toBeNull();
  });

  it("los atajos de la casa son tonos de verdad", () => {
    for (const c of COLORES) {
      expect(esColorValido(c.hex), `${c.nombre} no es un tono válido`).toBe(true);
      expect(hexDeColor(c.hex)).toBe(c.hex);
    }
  });

  it("sin color se pinta con el tono normal del texto", () => {
    expect(hexDeColor(null)).toBe(COLOR_NORMAL);
    expect(hexDeColor("no es un color")).toBe(COLOR_NORMAL);
  });
});

describe("traducir lo que devuelve el navegador", () => {
  // Cada navegador contesta a su manera y todas significan lo mismo.
  it("entiende las formas que llegan", () => {
    expect(normalizarColor("#7C3AED")).toBe("#7c3aed");
    expect(normalizarColor("rgb(124, 58, 237)")).toBe("#7c3aed");
    expect(normalizarColor("rgb(124,58,237)")).toBe("#7c3aed");
    expect(normalizarColor("rgba(124, 58, 237, 0.5)")).toBe("#7c3aed");
    // La forma corta, que aparece al pegar de otra web.
    expect(normalizarColor("#abc")).toBe("#aabbcc");
    // Y rellena los ceros: sin esto "#010203" saldría como "#123".
    expect(normalizarColor("rgb(1, 2, 3)")).toBe("#010203");
  });

  it("y lo que no entiende NO se lo inventa", () => {
    // Antes que colar un tono que nadie eligió, el trozo se queda sin color.
    for (const malo of ["", null, undefined, "azulado", "rgb(300, 0, 0)", "transparent"]) {
      expect(normalizarColor(malo)).toBeNull();
    }
  });
});
