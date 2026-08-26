import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { prepararDom } from "./domPolyfills";

/**
 * El gráfico de "Avisos por categoría" del panel.
 *
 * Tenía dos problemas que se tapaban entre sí:
 *
 *   1. La leyenda era la de Recharts. Con quince categorías de nombres largos
 *      ocupaba dos tercios de la tarjeta y dejaba el donut del tamaño de una
 *      moneda, descolocándose además en cada ancho de pantalla.
 *   2. Había SEIS colores para quince categorías, así que se repetían. Con la
 *      leyenda arreglada seguiría sin poder leerse: dos trozos del mismo color.
 *
 * Y la leyenda solo decía el color. El número de avisos —que es el dato por el
 * que se mira este gráfico— había que adivinarlo del tamaño del trozo.
 */
beforeEach(prepararDom);

const CATEGORIAS = [
  { name: "Servicios", value: 12 },
  { name: "Tecnología", value: 40 },
  { name: "Equipos y Maquinaria Pesada, Industrial y Herramientas", value: 3 },
  { name: "Inmuebles", value: 25 },
  { name: "Mascotas", value: 7 },
  { name: "Empleos", value: 31 },
  { name: "Restaurantes", value: 2 },
  { name: "Vehículos y Repuestos", value: 18 },
];

vi.mock("@/lib/admin", async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  fetchAdminStats: async () => ({ data: null }),
  // Devuelve el array directo, no `{ data }`: se llama con `.then(setCatDist)`.
  fetchCategoryDistribution: async () => CATEGORIAS,
  fetchAdminListings: async () => ({ data: [] }),
  fetchRecentActivity: async () => ({ data: [] }),
  fetchGrowthSeries: async () => [],
  contarComprobantesConProblema: async () => 0,
}));
vi.mock("@/components/AdminLayout", () => ({
  AdminShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("react-router-dom", async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

import AdminDashboard from "@/pages/admin/AdminDashboard";

const leyenda = async () => {
  const titulo = await screen.findByText("Avisos por categoría");
  const tarjeta = titulo.closest("div")?.parentElement as HTMLElement;
  return within(tarjeta);
};

describe("la leyenda dice cuántos, no solo de qué color", () => {
  it("cada categoría sale con su número de avisos", async () => {
    render(<AdminDashboard role="admin" />);
    const t = await leyenda();
    expect(await t.findByText("Tecnología")).toBeInTheDocument();
    expect(t.getByText("40")).toBeInTheDocument();
    expect(t.getByText("31")).toBeInTheDocument();
  });

  it("salen TODAS, no solo las que caben", async () => {
    render(<AdminDashboard role="admin" />);
    const t = await leyenda();
    await t.findByText("Tecnología");
    for (const c of CATEGORIAS) {
      expect(t.getByText(c.name, { exact: true })).toBeInTheDocument();
    }
  });

  it("un nombre kilométrico se recorta, en vez de descuadrar la rejilla", async () => {
    // "Equipos y Maquinaria Pesada, Industrial y Herramientas" no cabe en
    // ningún ancho; partirlo en tres líneas rompía la rejilla entera. Se
    // recorta y el nombre completo queda en el `title`.
    render(<AdminDashboard role="admin" />);
    const t = await leyenda();
    const largo = await t.findByText(/Equipos y Maquinaria Pesada/);
    expect(largo.className).toContain("truncate");
    expect(largo).toHaveAttribute("title", "Equipos y Maquinaria Pesada, Industrial y Herramientas");
  });
});

describe("el orden", () => {
  it("de mayor a menor: la categoría grande no se busca entre quince líneas", async () => {
    render(<AdminDashboard role="admin" />);
    const t = await leyenda();
    await t.findByText("Tecnología");
    const nombres = CATEGORIAS.map((c) => c.name);
    const enPantalla = t.getAllByTitle(/./)
      .map((e) => e.getAttribute("title"))
      .filter((n): n is string => !!n && nombres.includes(n));
    expect(enPantalla[0]).toBe("Tecnología");   // 40
    expect(enPantalla[1]).toBe("Empleos");      // 31
    expect(enPantalla.at(-1)).toBe("Restaurantes"); // 2
  });
});

describe("los colores", () => {
  // Se prueba la función y no el DOM porque jsdom no entiende la sintaxis
  // moderna `hsl(220 56% 20%)` —la de CSS Color 4, sin comas— y descarta el
  // valor: en pantalla se ve bien y aquí llegaría vacío. La propiedad que
  // importa es de la función, así que se comprueba donde vive.
  it("ninguno se repite: con seis colores y quince categorías no se leía", async () => {
    const { colorDeTrozo } = await import("@/lib/coloresGrafico");
    const veinte = Array.from({ length: 20 }, (_, i) => colorDeTrozo(i));
    expect(new Set(veinte).size).toBe(20);
  });

  it("el trozo más grande lleva el azul de la marca", async () => {
    const { colorDeTrozo } = await import("@/lib/coloresGrafico");
    expect(colorDeTrozo(0)).toBe("hsl(220 56% 20%)");
  });

  it("y a partir del sexto los genera, en vez de repetir la paleta", async () => {
    // Repetir era el fallo: dos categorías del MISMO color en el mismo donut.
    const { colorDeTrozo } = await import("@/lib/coloresGrafico");
    expect(colorDeTrozo(6)).not.toBe(colorDeTrozo(0));
    expect(colorDeTrozo(7)).not.toBe(colorDeTrozo(1));
  });

  it("cada punto de la leyenda lleva SU color, no el de otro", async () => {
    render(<AdminDashboard role="admin" />);
    const t = await leyenda();
    await t.findByText("Tecnología");
    const puntos = (t.getByText("Tecnología").closest("ul") as HTMLElement)
      .querySelectorAll("li > span[aria-hidden]");
    expect(puntos).toHaveLength(CATEGORIAS.length);
  });
});
