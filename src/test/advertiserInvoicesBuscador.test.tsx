import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// La pantalla de comprobantes del anunciante traía TODO el historial de golpe y
// sin forma de buscar. Ahora filtra y pagina contra el servidor.

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

// La pantalla lee `?comprobante=` para señalar el que trae el enlace del correo,
// así que necesita un router. En la aplicación siempre lo tiene.
const montar = (url = "/dashboard/anunciante/boletas") =>
  render(<MemoryRouter initialEntries={[url]}><AdvertiserInvoices /></MemoryRouter>);

const comprobante = (n: number) => ({
  number: `B001-00000${n}`,
  type: "boleta" as const,
  date: "2026-08-01T10:00:00Z",
  email: "ana@correo.com",
  advertiser: "Ana García",
  docType: "dni",
  docNumber: "44443333",
  factilizaData: null,
  amount: 16.14,
  detail: "Compra de saldo",
  listingTitle: "Compra de saldo",
  sunatStatus: "emitido",
  emailStatus: "enviado",
  anuladoAt: null,
  anuladoMotivo: null,
  notaNumber: null,
});

beforeEach(() => {
  loadInvoicesFromDb.mockReset().mockResolvedValue({ rows: [comprobante(1)], total: 1 });
});

describe("AdvertiserInvoices — buscador y paginación", () => {
  it("pide solo la primera página, no el historial entero", async () => {
    montar();
    await waitFor(() => expect(loadInvoicesFromDb).toHaveBeenCalled());
    expect(loadInvoicesFromDb).toHaveBeenCalledWith({ search: undefined, page: 1 });
  });

  it("al escribir, busca en el servidor", async () => {
    montar();
    await screen.findAllByText("B001-000001");

    fireEvent.change(screen.getByPlaceholderText(/Buscar por N/i), { target: { value: "B001-000009" } });

    await waitFor(() =>
      expect(loadInvoicesFromDb).toHaveBeenCalledWith({ search: "B001-000009", page: 1 }));
  });

  it("sin resultados lo dice, y distingue 'no hay' de 'no coincide'", async () => {
    loadInvoicesFromDb.mockResolvedValue({ rows: [], total: 0 });
    montar();
    await screen.findByText(/Aún no tienes boletas/i);

    fireEvent.change(screen.getByPlaceholderText(/Buscar por N/i), { target: { value: "nada" } });
    await screen.findByText(/Ningún comprobante coincide/i);
  });

  it("con más de una página aparecen los controles", async () => {
    loadInvoicesFromDb.mockResolvedValue({
      rows: Array.from({ length: 10 }, (_, i) => comprobante(i + 1)),
      total: 25,
    });
    montar();
    await screen.findByText(/Mostrando 1–10 de 25 comprobantes/i);

    fireEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    await waitFor(() => expect(loadInvoicesFromDb).toHaveBeenCalledWith({ search: undefined, page: 2 }));
  });
});
