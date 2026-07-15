import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Internamente el saldo se lleva en créditos con conversión 1 sol = 1 crédito,
// pero en la UI TODO se muestra como dinero, con la sigla "S/" ("S/ 16.14").
// Ya no aparece la palabra "créditos" de cara al usuario.

beforeEach(() => {
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (!Element.prototype.hasPointerCapture) (Element.prototype as any).hasPointerCapture = () => false;
  if (!Element.prototype.releasePointerCapture) (Element.prototype as any).releasePointerCapture = () => {};
});

const createPayment = vi.fn().mockResolvedValue({ orderId: "ord-1", formToken: "tok", publicKey: "pk-1" });
vi.mock("@/lib/payments", () => ({
  createPayment: (...a: unknown[]) => createPayment(...a),
  pollOrderStatus: vi.fn().mockResolvedValue("paid"),
  getPurchaseResult: vi.fn().mockResolvedValue({ balance: 100, invoiceNumber: "B001-1" }),
  hostedPaymentUrl: () => "https://x/pay",
}));
vi.mock("@/components/PaymentForm", () => ({ PaymentForm: () => <div>FORM_PAGO</div> }));

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

beforeEach(() => { createPayment.mockClear(); });

describe("Conversión — 1 sol = 1 crédito", () => {
  it("un sol es un crédito", () => {
    expect(solesToCredits(1)).toBe(1);
    expect(solesToCredits(ESTANDAR)).toBe(ESTANDAR);
  });

  it("el saldo se escribe como dinero, con la sigla 'S/'", () => {
    expect(formatCredits(ESTANDAR)).toBe("S/ 16.14");
    expect(formatCredits(1)).toBe("S/ 1");
    // Un entero no arrastra decimales: "S/ 8472", no "S/ 8472.00".
    expect(formatCredits(8472)).toBe("S/ 8472");
  });
});

describe("Comprar saldo — la app muestra todo en soles", () => {
  it("el costo del aviso, el saldo y lo que falta van en S/", async () => {
    abrir({ creditCost: ESTANDAR, currentBalance: 5 });
    await screen.findByText(/saldo a comprar/i);

    const aviso = screen.getByText(/Para publicar tu aviso necesitas/i);
    expect(aviso).toHaveTextContent("S/ 16.14");
    expect(aviso).toHaveTextContent("tu saldo: S/ 5");
    expect(screen.getByText(/^Faltan/)).toHaveTextContent("Faltan S/ 11.14");
  });

  it("el botón muestra el total en soles y la boleta también", async () => {
    abrir();
    await screen.findByText(/saldo a comprar/i);

    expect(screen.getByRole("button", { name: /continuar al pago · S\/ 16\.14/i })).toBeInTheDocument();
    // La cifra en soles que se paga en la boleta.
    expect(screen.getByText("Pagas (boleta)")).toBeInTheDocument();
    expect(screen.getAllByText("S/ 16.14").length).toBeGreaterThan(0);
  });

  it("saldo a comprar = soles a pagar (conversión 1:1)", async () => {
    abrir();
    // La UI muestra el mismo importe como "Saldo a comprar" y como "Pagas (boleta)".
    await screen.findByText(/saldo a comprar/i);
    const saldo = solesToCredits(ESTANDAR);
    expect(saldo).toBe(ESTANDAR);
    expect(formatCredits(saldo)).toBe("S/ 16.14");

    // Y al continuar, se inicia el pago (el monto lo recalcula el servidor).
    fireEvent.change(screen.getByPlaceholderText("12345678"), { target: { value: "44443333" } });
    await screen.findByText("ANA TORRES");
    fireEvent.change(screen.getByPlaceholderText("tu@correo.com"), { target: { value: "ana@correo.com" } });

    fireEvent.click(screen.getByRole("button", { name: /continuar al pago/i }));
    await waitFor(() => expect(createPayment).toHaveBeenCalled());
    expect(createPayment.mock.calls[0][0]).toMatchObject({ quantity: 1, duration: 7 });
  });
});
