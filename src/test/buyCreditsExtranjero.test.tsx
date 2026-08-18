import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { prepararDom } from "./domPolyfills";

// Comprar saldo siendo extranjero. Hasta ahora era imposible: la pantalla exigía
// verificar un DNI o un RUC contra Factiliza, y quien no tiene documento peruano
// no podía pasar de ahí ni aunque quisiera pagar.
beforeEach(prepararDom);

const createPayment = vi.fn();
const verifyDocument = vi.fn();

vi.mock("@/lib/payments", () => ({
  createPayment: (...a: unknown[]) => createPayment(...a),
  createPublishPayment: vi.fn(),
  pollOrderStatus: vi.fn().mockResolvedValue("paid"),
  getPurchaseResult: vi.fn().mockResolvedValue({ balance: 0, invoiceNumber: "", published: null }),
  hostedPaymentUrl: () => "https://x/pay",
  SaldoYaSuficiente: class extends Error {},
}));
vi.mock("@/components/PaymentForm", () => ({
  PaymentForm: () => <div>FORM_PAGO</div>,
  precargarKrypton: () => {},
}));
vi.mock("@/lib/verifyDoc", async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  verifyDocument: (...a: unknown[]) => verifyDocument(...a),
}));
vi.mock("@/lib/identity", () => ({
  fetchMyIdentity: vi.fn().mockResolvedValue(null),
  saveMyIdentity: vi.fn(),
  factilizaRows: () => [],
}));
vi.mock("@/lib/pricingRemote", () => ({ fetchPricingSettings: () => new Promise(() => {}) }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock("@capacitor/browser", () => ({ Browser: { open: vi.fn(), close: vi.fn() } }));

import { BuyCreditsModal } from "@/components/BuyCreditsModal";

const abrir = () =>
  render(
    <BuyCreditsModal
      open
      onClose={() => {}}
      creditCost={0}
      currentBalance={0}
      onPurchaseComplete={() => {}}
    />,
  );

const elegirExtranjero = () => fireEvent.click(screen.getByText("Extranjero"));

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("effe:pais", "PE");
  createPayment.mockReset().mockResolvedValue({ orderId: "o1", formToken: "t", publicKey: "pk", amount: 16.14 });
  verifyDocument.mockReset().mockResolvedValue({ ok: true, nombre: "JUAN PEREZ", data: {} });
});

describe("BuyCreditsModal — comprador extranjero", () => {
  it("al elegir Extranjero pide los datos a mano y NO llama a Factiliza", async () => {
    abrir();
    elegirExtranjero();

    await screen.findByPlaceholderText("Tal como debe salir en la boleta");
    expect(screen.getByText(/No verificamos este documento con RENIEC ni SUNAT/i)).toBeTruthy();
    // Ni una consulta: no hay a quién preguntarle por un pasaporte extranjero.
    expect(verifyDocument).not.toHaveBeenCalled();
  });

  it("manda el pasaporte, el país y el nombre escritos, y emite boleta", async () => {
    abrir();
    elegirExtranjero();

    fireEvent.change(await screen.findByPlaceholderText("Tal como debe salir en la boleta"),
      { target: { value: "JOHN SMITH" } });
    fireEvent.change(screen.getByPlaceholderText("AB123456"), { target: { value: "ab-123456" } });
    fireEvent.change(screen.getByPlaceholderText("tu@correo.com"), { target: { value: "john@correo.com" } });

    fireEvent.click(screen.getByRole("button", { name: /continuar al pago/i }));

    await waitFor(() => expect(createPayment).toHaveBeenCalled());
    const arg = createPayment.mock.calls[0][0] as { receipt: Record<string, unknown> };
    expect(arg.receipt).toEqual(expect.objectContaining({
      receiptType: "boleta",
      docType: "pasaporte",
      // El guion se limpia y las letras se conservan: si se filtraran los
      // caracteres no numéricos, el pasaporte llegaría partido a la boleta.
      docNumber: "AB123456",
      advertiserName: "JOHN SMITH",
      country: "PE",
    }));
  });

  it("permite elegir carné de extranjería en vez de pasaporte", async () => {
    abrir();
    elegirExtranjero();
    await screen.findByPlaceholderText("Tal como debe salir en la boleta");

    // El primer combobox del bloque es el del tipo de documento.
    fireEvent.click(screen.getAllByRole("combobox")[0]);
    fireEvent.click(await screen.findByText("Carné de extranjería"));

    fireEvent.change(screen.getByPlaceholderText("Tal como debe salir en la boleta"), { target: { value: "MARIA LOPEZ" } });
    fireEvent.change(screen.getByPlaceholderText("AB123456"), { target: { value: "001234567" } });
    fireEvent.change(screen.getByPlaceholderText("tu@correo.com"), { target: { value: "maria@correo.com" } });
    fireEvent.click(screen.getByRole("button", { name: /continuar al pago/i }));

    await waitFor(() => expect(createPayment).toHaveBeenCalled());
    const arg = createPayment.mock.calls[0][0] as { receipt: Record<string, unknown> };
    expect(arg.receipt.docType).toBe("ce");
  });

  it("sin nombre no deja pagar y lo dice", async () => {
    abrir();
    elegirExtranjero();
    await screen.findByPlaceholderText("Tal como debe salir en la boleta");
    fireEvent.change(screen.getByPlaceholderText("AB123456"), { target: { value: "AB123456" } });
    fireEvent.change(screen.getByPlaceholderText("tu@correo.com"), { target: { value: "john@correo.com" } });

    fireEvent.click(screen.getByRole("button", { name: /continuar al pago/i }));

    await screen.findByText(/Escribe tu nombre completo/i);
    expect(createPayment).not.toHaveBeenCalled();
  });
});
