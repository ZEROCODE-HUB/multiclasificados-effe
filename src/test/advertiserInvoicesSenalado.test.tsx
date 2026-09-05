import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import fs from "node:fs";
import path from "node:path";

/**
 * EL CORREO SEÑALA SU COMPROBANTE, no deja al usuario buscándolo.
 *
 * ── DE DÓNDE SALE ────────────────────────────────────────────────────────────
 *
 * El botón «Ver mis comprobantes» del correo llevaba a la lista entera. Un
 * tester del cliente pulsó ahí, vio tres comprobantes con nombres que no eran el
 * suyo y reportó que estaba viendo comprobantes ajenos. No lo eran: los tres
 * eran suyos, emitidos a nombre de una persona (DNI) y de su empresa (RUC),
 * porque en cada compra puso datos de facturación distintos.
 *
 * O sea: no era un fallo de permisos —la RLS filtra bien— sino que la pantalla
 * no decía CUÁL era el del correo. Es el mismo problema que ya se había resuelto
 * para los avisos con `?aviso=<id>` desde la campana.
 *
 * ── POR QUÉ SE RELLENA EL BUSCADOR ───────────────────────────────────────────
 *
 * Es la parte que se rompería sola si alguien la "simplifica" a solo resaltar:
 * **la lista va paginada de diez en diez**. Un enlace de correo se abre meses
 * después, cuando ese comprobante ya no está en la primera página — y entonces
 * no hay ninguna fila que resaltar. Buscando por su número aparece siempre.
 */

const loadInvoicesFromDb = vi.fn();
vi.mock("@/lib/invoices", () => ({
  loadInvoicesFromDb: (...a: unknown[]) => loadInvoicesFromDb(...a),
  MIS_COMPROBANTES_POR_PAGINA: 10,
}));
vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/InvoiceDetailDialog", () => ({ InvoiceDetailDialog: () => null }));

import AdvertiserInvoices from "@/pages/advertiser/AdvertiserInvoices";

const comprobante = (numero: string, advertiser = "Ana García") => ({
  number: numero,
  type: "boleta" as const,
  date: "2026-09-04T10:00:00Z",
  email: "ana@correo.com",
  advertiser,
  docType: "dni",
  docNumber: "44443333",
  factilizaData: null,
  amount: 6.92,
  detail: "Publicación de aviso",
  listingTitle: "Publicación de aviso",
  sunatStatus: "aceptado",
  emailStatus: "enviado",
  anuladoAt: null,
  anuladoMotivo: null,
  notaNumber: null,
});

const montar = (url: string) =>
  render(<MemoryRouter initialEntries={[url]}><AdvertiserInvoices /></MemoryRouter>);

beforeEach(() => {
  loadInvoicesFromDb.mockReset().mockResolvedValue({
    rows: [comprobante("B001-000002")],
    total: 1,
  });
});

describe("llegar desde el correo a un comprobante concreto", () => {
  it("🔴 con `?comprobante=`, lo busca por su número — no depende de la página", async () => {
    // Lo esencial: se pide al SERVIDOR filtrando por ese número. Si esto se
    // cambiara por «resaltar si está en pantalla», el enlace de un correo viejo
    // dejaría de funcionar en silencio.
    montar("/dashboard/anunciante/boletas?comprobante=B001-000002");
    await waitFor(() =>
      expect(loadInvoicesFromDb).toHaveBeenCalledWith({ search: "B001-000002", page: 1 }),
    );
  });

  it("y el número queda escrito en el buscador, a la vista", async () => {
    // Para que se entienda por qué la lista está filtrada, y se pueda vaciar.
    montar("/dashboard/anunciante/boletas?comprobante=B001-000002");
    const buscador = await screen.findByPlaceholderText(/Buscar por N/i);
    await waitFor(() => expect((buscador as HTMLInputElement).value).toBe("B001-000002"));
  });

  it("la fila del comprobante señalado se resalta", async () => {
    const { container } = montar("/dashboard/anunciante/boletas?comprobante=B001-000002");
    await screen.findAllByText("B001-000002");
    await waitFor(() =>
      expect(container.querySelector(".ring-secondary\\/40")).not.toBeNull(),
    );
  });

  it("sin el parámetro no se resalta ni se filtra nada", async () => {
    const { container } = montar("/dashboard/anunciante/boletas");
    await waitFor(() =>
      expect(loadInvoicesFromDb).toHaveBeenCalledWith({ search: undefined, page: 1 }),
    );
    await screen.findAllByText("B001-000002");
    expect(container.querySelector(".ring-secondary\\/40")).toBeNull();
  });

  it("si el usuario vacía el buscador, NO se lo volvemos a rellenar", async () => {
    // El parámetro sigue en la URL. Rellenarlo otra vez dejaría al usuario
    // encerrado en un comprobante sin poder ver los demás.
    montar("/dashboard/anunciante/boletas?comprobante=B001-000002");
    const buscador = await screen.findByPlaceholderText(/Buscar por N/i);
    await waitFor(() => expect((buscador as HTMLInputElement).value).toBe("B001-000002"));

    fireEvent.change(buscador, { target: { value: "" } });

    await waitFor(() =>
      expect(loadInvoicesFromDb).toHaveBeenLastCalledWith({ search: undefined, page: 1 }),
    );
    expect((buscador as HTMLInputElement).value).toBe("");
  });
});

describe("y el correo manda ese parámetro", () => {
  // La otra mitad: de nada sirve que la pantalla lo lea si el correo no lo pone.
  // Se comprueba sobre el fuente porque la función es de Deno y no se importa.
  const EMISION = fs.readFileSync(
    path.resolve(__dirname, "../../supabase/functions/emit-invoice/index.ts"),
    "utf8",
  );

  it("los enlaces a «Mis comprobantes» llevan `?comprobante=`", () => {
    // Ni uno suelto: son cuatro (texto y HTML, del comprobante y de la nota de
    // crédito) y el que se quede atrás es el que dejará al usuario perdido.
    // CERO enlaces «pelados»: el único sitio donde aparece esa ruta es dentro de
    // `urlDeMisComprobantes`, y ahí va seguida de `?comprobante=`.
    const sueltos = EMISION.match(/dashboard\/anunciante\/boletas(?!\?)/g) ?? [];
    expect(sueltos, "quedó un enlace que no señala ningún comprobante").toEqual([]);
    // Y los CUATRO enlaces pasan por el ayudante: texto y HTML del comprobante,
    // texto y HTML de la nota de crédito. Si mañana se añade un quinto correo
    // con este botón, esta cuenta lo obliga a pasar por aquí también.
    const conNumero = EMISION.match(/urlDeMisComprobantes\(/g) ?? [];
    expect(conNumero.length, "los cuatro enlaces tienen que señalar el comprobante").toBe(4);
  });

  it("el número va escapado en la URL", () => {
    // Un número de comprobante es inocuo, pero va a una URL: escaparlo es lo que
    // evita que un dato raro parta el enlace.
    expect(EMISION).toMatch(/comprobante=\$\{encodeURIComponent\(numero\)\}/);
  });
});
