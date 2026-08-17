import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { prepararDom } from "./domPolyfills";

/**
 * La tabla de Boletas se leía mal: el "S/" se separaba de su importe en dos
 * líneas, el encabezado "N° Comprobante" salía partido y las cifras estaban
 * alineadas como si fueran texto. Lo que se comprueba aquí es el criterio, no
 * el aspecto: texto a la izquierda, fechas y estados centrados, cifras a la
 * derecha, y nada que se parta donde partirlo estropea el dato.
 */

beforeEach(() => {
  prepararDom();
  if (!window.matchMedia) {
    (window as unknown as { matchMedia: unknown }).matchMedia = () => ({
      matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
    });
  }
});

const invoice = {
  id: "inv-1",
  number: "B066-00000012",
  type: "boleta" as const,
  date: "2026-08-17T15:00:00Z",
  advertiser: "SALAZAR DAVILA, LEONOR",
  email: "leonor@correo.com",
  docType: "dni",
  docNumber: "47386685",
  factilizaData: null,
  listingTitle: "Compra de saldo: 1 aviso · 3 días",
  amount: 16.14,
  sunatStatus: "aceptado",
  emailStatus: "enviado",
  needsReview: false,
  sunatError: null,
  sunatAttempts: 1,
  esPrueba: false,
  anuladoAt: null,
  anuladoMotivo: null,
  notaNumber: null,
  notaStatus: null,
};

vi.mock("@/lib/admin", () => ({
  fetchSettings: async () => [],
  setSetting: async () => {},
  fetchAllInvoices: async () => ({ data: [invoice], real: true }),
  fetchCategories: async () => ({ data: [], real: true }),
  createCategory: async () => {},
  updateCategory: async () => {},
  deleteCategory: async () => {},
  reorderCategories: async () => {},
  uploadCategoryImage: async () => "",
}));
vi.mock("@/lib/categories", () => ({
  CATEGORY_ICON_NAMES: [], iconFor: () => () => null, invalidateCategories: async () => {},
  CATEGORY_PHOTO_POOL: ["https://images.unsplash.com/photo-1?w=800"],
}));
vi.mock("@/hooks/use-toast", () => ({ toast: () => {}, useToast: () => ({ toast: () => {} }) }));

import AdminCommercial from "@/pages/admin/AdminCommercial";

const abrirBoletas = async () => {
  render(<AdminCommercial role="superadmin" />);
  // Los Tabs de Radix cambian con mousedown, no con click.
  fireEvent.mouseDown(await screen.findByRole("tab", { name: /Boletas/i }));
  return await screen.findByText("B066-00000012");
};

/** La celda (td/th) que contiene ese texto. */
const celdaDe = (el: HTMLElement) => el.closest("td, th") as HTMLElement;

describe("tabla de Boletas — cómo se alinea cada dato", () => {
  it("el importe no se parte: 'S/' y la cifra van juntos", async () => {
    await abrirBoletas();
    const monto = celdaDe(screen.getByText(/16[.,]14/));
    expect(monto.className).toContain("whitespace-nowrap");
    expect(monto.className).toContain("text-right");
  });

  it("el encabezado del comprobante no se quiebra en dos líneas", async () => {
    await abrirBoletas();
    expect(celdaDe(screen.getByText("N° Comprobante")).className).toContain("whitespace-nowrap");
  });

  it("el número de comprobante tampoco", async () => {
    const numero = await abrirBoletas();
    expect(celdaDe(numero).className).toContain("whitespace-nowrap");
  });

  it("las cifras van a la derecha: importe y documento", async () => {
    await abrirBoletas();
    expect(celdaDe(screen.getByText("47386685")).className).toContain("text-right");
  });

  it("la fecha y el estado, centrados", async () => {
    await abrirBoletas();
    // El formato exacto lo pone el sistema (17/8/2026 o 17/08/2026); lo que se
    // comprueba es dónde queda, no cómo se escribe.
    expect(celdaDe(screen.getByText(/^17\/0?8\/2026$/)).className).toContain("text-center");
    expect(celdaDe(screen.getByText("Aceptado")).className).toContain("text-center");
  });

  it("el texto se queda a la izquierda, que es por donde se lee", async () => {
    await abrirBoletas();
    for (const texto of ["SALAZAR DAVILA, LEONOR", "Compra de saldo: 1 aviso · 3 días"]) {
      const clase = celdaDe(screen.getByText(texto)).className;
      expect(clase).not.toContain("text-right");
      expect(clase).not.toContain("text-center");
    }
  });
});
