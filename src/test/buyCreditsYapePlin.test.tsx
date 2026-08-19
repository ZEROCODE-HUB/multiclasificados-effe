import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { prepararDom } from "./domPolyfills";

/**
 * El medio de pago en el cuadro de compra.
 *
 * Lo que se protege aquí es que Yape/Plin NO aparezcan cuando no se pueden
 * usar de verdad —sin cuentas o sin WhatsApp, ofrecerlos deja al comprador sin
 * a dónde pagar— y que elegirlos lleve por el camino manual en vez de abrir la
 * pasarela.
 */
beforeEach(() => {
  prepararDom();
  (globalThis as Record<string, unknown>).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});

vi.mock("@/lib/pricingRemote", () => ({ fetchPricingSettings: () => new Promise(() => {}) }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

const verifyDocument = vi.fn();
vi.mock("@/lib/verifyDoc", async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  verifyDocument: (...a: unknown[]) => verifyDocument(...a),
}));

const createPayment = vi.fn();
vi.mock("@/lib/payments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/payments")>()),
  createPayment: (...a: unknown[]) => createPayment(...a),
  pollOrderStatus: vi.fn().mockResolvedValue("paid"),
  getPurchaseResult: vi.fn().mockResolvedValue({ balance: 0, invoiceNumber: "" }),
  hostedPaymentUrl: () => "https://x/pay",
}));

const configYapePlin = vi.fn();
vi.mock("@/lib/pagoManual", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/pagoManual")>()),
  configYapePlin: () => configYapePlin(),
  confirmarPagoManual: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/components/PaymentForm", () => ({
  PaymentForm: () => <button>SIMULAR_PAGO</button>,
  precargarKrypton: () => {},
}));

import { BuyCreditsModal } from "@/components/BuyCreditsModal";

const CFG_COMPLETA = {
  activo: true,
  cuentas: [
    { metodo: "yape" as const, numero: "999888777", banco: "BCP", titular: "eFFe SAC" },
    { metodo: "plin" as const, numero: "911222333", banco: "IBK", titular: "eFFe SAC" },
  ],
  whatsapp: "51999888777",
  mensaje: "Hola, ya pagué",
};

const abrir = () =>
  render(<BuyCreditsModal open onClose={vi.fn()} creditCost={0} currentBalance={0} onPurchaseComplete={vi.fn()} />);

async function completarDatos() {
  fireEvent.change(screen.getByPlaceholderText("12345678"), { target: { value: "44443333" } });
  fireEvent.change(screen.getByPlaceholderText("tu@correo.com"), { target: { value: "juan@correo.com" } });
  await screen.findByText("JUAN PEREZ");
}

beforeEach(() => {
  vi.clearAllMocks();
  verifyDocument.mockResolvedValue({ ok: true, nombre: "JUAN PEREZ", data: {} });
  configYapePlin.mockResolvedValue(CFG_COMPLETA);
  createPayment.mockResolvedValue({
    manual: true,
    orderId: "ord-yape-1",
    provider: "yape",
    amount: 16.14,
    listingCost: null,
    cuentas: [CFG_COMPLETA.cuentas[0]],
    whatsapp: CFG_COMPLETA.whatsapp,
    mensaje: CFG_COMPLETA.mensaje,
  });
});

describe("elegir Yape o Plin al comprar saldo", () => {
  it("se ofrecen los dos medios cuando están configurados", async () => {
    abrir();
    expect(await screen.findByText("Yape")).toBeInTheDocument();
    expect(screen.getByText("Plin")).toBeInTheDocument();
    expect(screen.getByText("Tarjeta")).toBeInTheDocument();
  });

  it("apagados, el cuadro se ve como siempre: solo tarjeta", async () => {
    configYapePlin.mockResolvedValue({ ...CFG_COMPLETA, activo: false });
    abrir();
    await screen.findByPlaceholderText("tu@correo.com");
    await waitFor(() => expect(screen.queryByText("Yape")).not.toBeInTheDocument());
    // Y sin medios que elegir tampoco se pinta el selector.
    expect(screen.queryByText(/cómo quieres pagar/i)).not.toBeInTheDocument();
  });

  it("sin WhatsApp no se ofrece ninguno: el voucher no llegaría a ningún lado", async () => {
    configYapePlin.mockResolvedValue({ ...CFG_COMPLETA, whatsapp: "" });
    abrir();
    await screen.findByPlaceholderText("tu@correo.com");
    await waitFor(() => expect(screen.queryByText("Yape")).not.toBeInTheDocument());
  });

  it("solo se ofrece el medio que tiene cuenta", async () => {
    configYapePlin.mockResolvedValue({ ...CFG_COMPLETA, cuentas: [CFG_COMPLETA.cuentas[0]] });
    abrir();
    expect(await screen.findByText("Yape")).toBeInTheDocument();
    expect(screen.queryByText("Plin")).not.toBeInTheDocument();
  });

  it("al elegir Yape se pide la orden con ese medio y NO se abre la pasarela", async () => {
    abrir();
    await completarDatos();
    fireEvent.click(await screen.findByText("Yape"));
    fireEvent.click(screen.getByRole("button", { name: /pagar con yape/i }));

    await waitFor(() => expect(createPayment).toHaveBeenCalledTimes(1));
    expect(createPayment.mock.calls[0][0]).toMatchObject({ provider: "yape" });

    // Aparece la pantalla de transferencia, no el formulario de tarjeta.
    expect(await screen.findByText("999888777")).toBeInTheDocument();
    expect(screen.queryByText("SIMULAR_PAGO")).not.toBeInTheDocument();
  });

  it("con tarjeta no se manda ningún proveedor: sigue siendo el camino de siempre", async () => {
    createPayment.mockResolvedValue({ orderId: "ord-1", formToken: "tok", publicKey: "pk" });
    abrir();
    await completarDatos();
    const continuar = screen.getByRole("button", { name: /continuar al pago/i });
    await waitFor(() => expect(continuar).not.toBeDisabled());
    fireEvent.click(continuar);

    await waitFor(() => expect(createPayment).toHaveBeenCalledTimes(1));
    expect(createPayment.mock.calls[0][0].provider).toBeUndefined();
    expect(await screen.findByText("SIMULAR_PAGO")).toBeInTheDocument();
  });
});
