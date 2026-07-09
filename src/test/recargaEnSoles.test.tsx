import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// El crédito valía 1/10 de sol y el saldo se mostraba con la sigla "cr", que
// nadie entendía. Ahora 1 crédito = 1 sol y todo se lee en "S/".

beforeEach(() => {
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (!Element.prototype.hasPointerCapture) (Element.prototype as any).hasPointerCapture = () => false;
  if (!Element.prototype.releasePointerCapture) (Element.prototype as any).releasePointerCapture = () => {};
});

const purchaseCredits = vi.fn().mockResolvedValue({ newBalance: 100, invoiceNumber: "B001-1" });
vi.mock("@/lib/credits", () => ({ purchaseCredits: (...a: unknown[]) => purchaseCredits(...a) }));

const verifyDocument = vi.fn().mockResolvedValue({ ok: true, nombre: "ANA TORRES", data: {} });
vi.mock("@/lib/verifyDoc", async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  verifyDocument: (...a: unknown[]) => verifyDocument(...a),
}));

import { BuyCreditsModal } from "@/components/BuyCreditsModal";
import { DEFAULT_SETTINGS, priceForDuration, solesToCredits, formatCredits } from "@/lib/pricing";

// 1 aviso × 7 días con la matriz del Excel.
const ESTANDAR = priceForDuration(1, 7, DEFAULT_SETTINGS); // 16.14

const abrir = (props: Partial<{ creditCost: number; currentBalance: number }> = {}) =>
  render(
    <BuyCreditsModal
      open
      onClose={() => {}}
      creditCost={props.creditCost ?? 0}
      currentBalance={props.currentBalance ?? 0}
      onPurchaseComplete={() => {}}
    />,
  );

beforeEach(() => { purchaseCredits.mockClear(); });

describe("Recarga de créditos — 1 sol = 1 crédito, mostrado como S/", () => {
  it("un sol es un crédito", () => {
    expect(solesToCredits(1)).toBe(1);
    expect(solesToCredits(ESTANDAR)).toBe(ESTANDAR);
    expect(formatCredits(ESTANDAR)).toBe("S/ 16.14");
  });

  it("la recarga no muestra la sigla 'cr' por ninguna parte", async () => {
    abrir({ creditCost: ESTANDAR, currentBalance: 5 });
    await screen.findByText(/total a recargar/i);

    // "cr" suelto, no el prefijo de "créditos": \b no vale porque la tilde de
    // "créditos" no es carácter de palabra y abre un límite tras "cr".
    expect(document.body.textContent).not.toMatch(/(?<!\p{L})cr(?!\p{L})/iu);
  });

  it("el costo del aviso y el saldo salen en soles", async () => {
    abrir({ creditCost: ESTANDAR, currentBalance: 5 });
    await screen.findByText(/total a recargar/i);

    // El aviso a publicar y el saldo actual, ambos en soles.
    const aviso = screen.getByText(/Para publicar tu aviso necesitas/i);
    expect(aviso).toHaveTextContent("S/ 16.14");
    expect(aviso).toHaveTextContent("tu saldo: S/ 5.00");
    // Lo que falta para publicar, también en soles.
    expect(screen.getByText(/^Faltan/)).toHaveTextContent("Faltan S/ 11.14");
  });

  it("el botón recarga exactamente los soles que se van a pagar", async () => {
    abrir();
    await screen.findByText(/total a recargar/i);

    // Por defecto: 1 aviso × 7 días, sin adicionales.
    expect(screen.getByRole("button", { name: /recargar S\/ 16\.14/i })).toBeInTheDocument();
    expect(screen.getByText(/tu boleta dirá S\/ 16\.14/i)).toBeInTheDocument();
  });

  it("compra el mismo número de créditos que soles paga", async () => {
    abrir();
    fireEvent.change(screen.getByPlaceholderText("12345678"), { target: { value: "44443333" } });
    await screen.findByText("ANA TORRES");
    fireEvent.change(screen.getByPlaceholderText("tu@correo.com"), { target: { value: "ana@correo.com" } });

    fireEvent.click(screen.getByRole("button", { name: /recargar S\//i }));

    await waitFor(() => expect(purchaseCredits).toHaveBeenCalled());
    const [pkg] = purchaseCredits.mock.calls[0];
    expect(pkg.credits_amount).toBe(pkg.price_soles);
    expect(pkg.credits_amount).toBe(ESTANDAR);
  });
});
