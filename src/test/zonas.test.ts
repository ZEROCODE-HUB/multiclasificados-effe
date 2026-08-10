import { describe, it, expect } from "vitest";
import {
  zonas as cargarZonas,
  buscarZonas,
  etiquetaZona,
  zonaPorId,
  zonaPorTexto,
  zonaMasCercana,
  distanciaKm,
} from "@/lib/zonas";

// El catálogo de zonas es la pieza que hace que TODO aviso tenga coordenadas y
// que quien no da permiso de ubicación pueda igual ver lo que tiene cerca.

const ZONAS = cargarZonas();
const porNombre = (nombre: string, region: string) =>
  ZONAS.find((z) => z.nombre === nombre && (z.provincia === region || z.departamento === region))!;

describe("catálogo de zonas", () => {
  it("trae los distritos de todo el país, no solo los de Lima", () => {
    expect(ZONAS.length).toBe(1874);
    expect(porNombre("Miraflores", "Lima")).toBeTruthy();
    expect(porNombre("Bellavista", "Callao")).toBeTruthy();
    // La prueba de fuego es fuera de Lima: si una ciudad de provincia fuera un
    // punto único, "cerca de mí" no distinguiría un extremo de otro.
    expect(porNombre("Cayma", "Arequipa")).toBeTruthy();
    expect(porNombre("Socabaya", "Arequipa")).toBeTruthy();
    expect(porNombre("La Esperanza", "Trujillo")).toBeTruthy();
  });

  it("dos distritos de una misma ciudad de provincia NO comparten punto", () => {
    // Este era el defecto de quedarse en provincia: Cayma y Socabaya, en los dos
    // extremos de Arequipa, salían a la misma distancia de cualquier cosa.
    const cayma = porNombre("Cayma", "Arequipa");
    const socabaya = porNombre("Socabaya", "Arequipa");
    const d = distanciaKm(cayma.lat, cayma.lng, socabaya.lat, socabaya.lng);
    expect(d).toBeGreaterThan(5);
  });

  it("todas tienen coordenadas dentro del Perú", () => {
    for (const z of ZONAS) {
      expect(Number.isFinite(z.lat) && Number.isFinite(z.lng)).toBe(true);
      expect(z.lat).toBeGreaterThan(-18.4); // extremo sur
      expect(z.lat).toBeLessThan(-0.03); // extremo norte
      expect(z.lng).toBeGreaterThan(-81.4); // extremo oeste
      expect(z.lng).toBeLessThan(-68.6); // extremo este
    }
  });

  it("ninguna etiqueta se repite (identifica la zona en el aviso)", () => {
    const vistas = new Set(ZONAS.map(etiquetaZona));
    expect(vistas.size).toBe(ZONAS.length);
  });

  it("la etiqueta no repite el nombre cuando distrito y provincia coinciden", () => {
    expect(etiquetaZona(porNombre("Miraflores", "Lima"))).toBe("Miraflores, Lima");
    expect(etiquetaZona(porNombre("Cayma", "Arequipa"))).toBe("Cayma, Arequipa");
    // El distrito capital se llama igual que su provincia: "Cusco, Cusco" no
    // aportaría nada.
    expect(etiquetaZona(porNombre("Cusco", "Cusco"))).toBe("Cusco");
  });
});

describe("buscar zonas", () => {
  it("encuentra sin importar tildes ni mayúsculas", () => {
    const conTilde = buscarZonas("Áncash");
    const sinTilde = buscarZonas("ancash");
    expect(sinTilde.length).toBeGreaterThan(0);
    expect(sinTilde.map((z) => z.id)).toEqual(conTilde.map((z) => z.id));
  });

  it("pone primero las que empiezan por lo tecleado", () => {
    const r = buscarZonas("lima");
    expect(r[0].nombre.toLowerCase().startsWith("lima")).toBe(true);
  });

  it("busca también por provincia y departamento", () => {
    // Escribir la ciudad debe sacar sus distritos, aunque no se llamen así.
    const r = buscarZonas("arequipa", 200);
    expect(r.some((z) => z.nombre === "Cayma")).toBe(true);
    expect(r.some((z) => z.nombre === "Socabaya")).toBe(true);
  });

  it("sin texto devuelve un primer puñado, no las 1.874", () => {
    expect(buscarZonas("", 10).length).toBe(10);
  });

  it("devuelve vacío si no hay nada parecido", () => {
    expect(buscarZonas("zzzz")).toEqual([]);
  });

  // Lo que se veía al abrir el selector: las primeras del catálogo por orden
  // alfabético, o sea TODAS con A (Abancay, Acarí, Accha…). No le sirven a nadie.
  it("sin escribir nada NO enseña el abecedario, sino sitios reconocibles", () => {
    const iniciales = new Set(buscarZonas("", 20).map((z) => z.nombre[0].toUpperCase()));
    expect(iniciales.size).toBeGreaterThan(3);
    // Son los distritos de Lima y Callao, donde está la mayoría de usuarios.
    expect(buscarZonas("", 50).every((z) => z.provincia === "Lima" || z.provincia === "Callao")).toBe(true);
  });

  // Antes se buscaba "contiene" en cualquier posición, así que una letra suelta
  // devolvía cosas absurdas y parecía que siempre encontraba algo.
  it("no encuentra a media palabra: una 'x' no saca 'Alexander' ni 'Oxapampa'", () => {
    const r = buscarZonas("x");
    expect(r.map((z) => z.nombre)).not.toContain("Alexander Von Humboldt");
    expect(r.every((z) => z.nombre.toLowerCase().startsWith("x"))).toBe(true);
  });

  it("sí encuentra por el inicio de cualquier palabra del nombre", () => {
    // Quien busca "Los Olivos" suele escribir "olivos".
    expect(buscarZonas("olivos")[0].nombre).toBe("Los Olivos");
  });
});

describe("buscar zonas — cuál sale primero", () => {
  it("con 'mira', Miraflores de Lima va por delante del resto", () => {
    // Hay cinco Miraflores en el país y uno se llama "Miracosta". Quien escribe
    // "mira" casi siempre busca el distrito limeño.
    const r = buscarZonas("mira");
    expect(r[0].nombre).toBe("Miraflores");
    expect(r[0].provincia).toBe("Lima");
  });

  it("el nombre exacto gana a los que solo empiezan igual", () => {
    expect(buscarZonas("lima")[0].nombre).toBe("Lima");
    expect(buscarZonas("cusco")[0].nombre).toBe("Cusco");
  });

  it("escribir una ciudad saca primero la ciudad y luego sus distritos", () => {
    const r = buscarZonas("arequipa", 200);
    expect(r[0].nombre).toBe("Arequipa");
    expect(r.some((z) => z.nombre === "Cayma")).toBe(true);
  });
});

describe("reconocer la zona de un aviso ya publicado", () => {
  it("acierta con la etiqueta tal cual", () => {
    expect(zonaPorTexto("Miraflores, Lima")?.id).toBe(porNombre("Miraflores", "Lima").id);
  });

  it("acierta aunque esté escrito al revés o sin tildes", () => {
    // Lo que un anunciante pudo escribir a mano antes del selector.
    expect(zonaPorTexto("Lima, Miraflores")?.id).toBe(porNombre("Miraflores", "Lima").id);
    expect(zonaPorTexto("miraflores, lima")?.id).toBe(porNombre("Miraflores", "Lima").id);
  });

  it("acierta con el nombre solo cuando no hay otro igual", () => {
    expect(zonaPorTexto("Chachapoyas")?.nombre).toBe("Chachapoyas");
  });

  it("NO adivina cuando el nombre está repetido en el país", () => {
    // Hay varios "Bellavista"; elegir uno al azar mandaría el aviso a otra región.
    expect(zonaPorTexto("Bellavista")).toBeNull();
  });

  it("devuelve null con texto que no es una zona", () => {
    expect(zonaPorTexto("Online")).toBeNull();
    expect(zonaPorTexto("")).toBeNull();
    expect(zonaPorTexto(null)).toBeNull();
  });
});

describe("distancias", () => {
  it("mide la distancia real entre dos puntos conocidos", () => {
    const lima = porNombre("Miraflores", "Lima");
    const cusco = porNombre("Cusco", "Cusco");
    // Lima–Cusco son ~570 km en línea recta.
    expect(distanciaKm(lima.lat, lima.lng, cusco.lat, cusco.lng)).toBeGreaterThan(500);
    expect(distanciaKm(lima.lat, lima.lng, cusco.lat, cusco.lng)).toBeLessThan(650);
  });

  it("dos distritos vecinos de Lima quedan a pocos kilómetros", () => {
    const mira = porNombre("Miraflores", "Lima");
    const barranco = porNombre("Barranco", "Lima");
    expect(distanciaKm(mira.lat, mira.lng, barranco.lat, barranco.lng)).toBeLessThan(5);
  });

  it("nombra la zona más cercana a unas coordenadas del GPS", () => {
    // Un punto en pleno Miraflores.
    expect(zonaMasCercana(-12.1211, -77.0296).nombre).toBe("Miraflores");
  });
});

describe("buscar por id", () => {
  it("encuentra la zona y devuelve null si no existe", () => {
    expect(zonaPorId("150122")?.nombre).toBe("Miraflores");
    expect(zonaPorId("999999")).toBeNull();
    expect(zonaPorId(null)).toBeNull();
  });
});
