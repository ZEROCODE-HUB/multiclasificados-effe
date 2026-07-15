import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Polyfills para Radix Dialog en jsdom.
beforeEach(() => {
  (globalThis as Record<string, unknown>).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (!Element.prototype.hasPointerCapture) (Element.prototype as Record<string, unknown>).hasPointerCapture = () => false;
  if (!Element.prototype.releasePointerCapture) (Element.prototype as Record<string, unknown>).releasePointerCapture = () => {};
  if (!window.matchMedia) (window as Record<string, unknown>).matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
});

vi.mock("@/lib/pricingRemote", () => ({ fetchPricingSettings: () => new Promise(() => {}) }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

const verifyDocument = vi.fn();
vi.mock("@/lib/verifyDoc", async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  verifyDocument: (...a: unknown[]) => verifyDocument(...a),
}));

const createPayment = vi.fn();
const pollOrderStatus = vi.fn();
const getPurchaseResult = vi.fn();
vi.mock("@/lib/payments", () => ({
  createPayment: (...a: unknown[]) => createPayment(...a),
  pollOrderStatus: (...a: unknown[]) => pollOrderStatus(...a),
  getPurchaseResult: (...a: unknown[]) => getPurchaseResult(...a),
  hostedPaymentUrl: () => "https://x/pay",
}));

// Stub del formulario embebido: evita cargar Krypton por CDN y expone un botón
// que simula que la transacción quedó PAGADA.
vi.mock("@/components/PaymentForm", () => ({
  PaymentForm: ({ onPaid }: { onPaid: () => void }) => (
    <button onClick={onPaid}>SIMULAR_PAGO</button>
  ),
}));

import { BuyCreditsModal } from "@/components/BuyCreditsModal";

const onPurchaseComplete = vi.fn();
const onClose = vi.fn();
const open = () =>
  render(<BuyCreditsModal open onClose={onClose} creditCost={0} currentBalance={0} onPurchaseComplete={onPurchaseComplete} />);

beforeEach(() => {
  vi.clearAllMocks();
  verifyDocument.mockResolvedValue({ ok: true, nombre: "JUAN PEREZ", data: {} });
  createPayment.mockResolvedValue({ orderId: "ord-1", formToken: "tok", publicKey: "pk-1" });
  pollOrderStatus.mockResolvedValue("paid");
  getPurchaseResult.mockResolvedValue({ balance: 116.14, invoiceNumber: "B001-000009" });
});

// Completa el paso 1 (documento verificado + correo) y pulsa "Continuar al pago".
async function fillAndContinue() {
  open();
  fireEvent.change(screen.getByPlaceholderText("12345678"), { target: { value: "44443333" } });
  fireEvent.change(screen.getByPlaceholderText("tu@correo.com"), { target: { value: "juan@correo.com" } });
  await screen.findByText("JUAN PEREZ");
  const continuar = screen.getByRole("button", { name: /continuar al pago/i });
  await waitFor(() => expect(continuar).not.toBeDisabled());
  fireEvent.click(continuar);
}

describe("BuyCreditsModal — flujo de pago con Izipay (web)", () => {
  it("paso 1 → crea el pago con la CONFIG correcta (sin precio) y pasa al formulario", async () => {
    await fillAndContinue();

    await waitFor(() => expect(createPayment).toHaveBeenCalledTimes(1));
    const cfg = createPayment.mock.calls[0][0];
    expect(cfg).toMatchObject({
      quantity: 1,
      duration: 7,
      receipt: { receiptType: "boleta", email: "juan@correo.com", advertiserName: "JUAN PEREZ", docType: "dni", docNumber: "44443333" },
    });
    expect(cfg).not.toHaveProperty("total");

    // Aparece el formulario de pago (stub).
    await screen.findByText("SIMULAR_PAGO");
  });

  it("al PAGAR se confirma por polling, acredita saldo y cierra", async () => {
    await fillAndContinue();
    const pagar = await screen.findByText("SIMULAR_PAGO");
    fireEvent.click(pagar);

    await waitFor(() => expect(pollOrderStatus).toHaveBeenCalledWith("ord-1"));
    await waitFor(() => expect(getPurchaseResult).toHaveBeenCalledWith("ord-1"));
    await waitFor(() => expect(onPurchaseComplete).toHaveBeenCalledWith(116.14));
    expect(onClose).toHaveBeenCalled();
  });

  it("si el pago no se aprueba (failed), vuelve al paso 1 sin acreditar", async () => {
    pollOrderStatus.mockResolvedValue("failed");
    await fillAndContinue();
    fireEvent.click(await screen.findByText("SIMULAR_PAGO"));

    await waitFor(() => expect(pollOrderStatus).toHaveBeenCalled());
    expect(onPurchaseComplete).not.toHaveBeenCalled();
    // Regresa a la configuración (botón de continuar visible de nuevo).
    await screen.findByRole("button", { name: /continuar al pago/i });
  });

  it("no crea el pago si el documento no está verificado", async () => {
    verifyDocument.mockResolvedValue({ ok: false, error: "Documento inválido." });
    open();
    fireEvent.change(screen.getByPlaceholderText("12345678"), { target: { value: "00000000" } });
    fireEvent.change(screen.getByPlaceholderText("tu@correo.com"), { target: { value: "ana@correo.com" } });
    await screen.findByText(/Documento inválido/i);

    const continuar = screen.getByRole("button", { name: /continuar al pago/i });
    expect(continuar).toBeDisabled();
    fireEvent.click(continuar);
    expect(createPayment).not.toHaveBeenCalled();
  });
});
