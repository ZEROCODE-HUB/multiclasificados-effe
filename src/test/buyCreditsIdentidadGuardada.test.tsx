import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { prepararDom } from "./domPolyfills";

// La segunda compra no debería costar otra consulta a Factiliza: el documento
// ya se verificó una vez y quedó en el perfil. Antes el modal siempre abría con
// el campo vacío, así que había que volver a escribirlo y se volvía a consultar.

beforeEach(prepararDom);

vi.mock("@/lib/pricingRemote", () => ({ fetchPricingSettings: () => new Promise(() => {}) }));
vi.mock("@/lib/payments", () => ({
  createPayment: vi.fn().mockResolvedValue({ orderId: "o1", formToken: "t", publicKey: "pk" }),
  pollOrderStatus: vi.fn(), getPurchaseResult: vi.fn(), hostedPaymentUrl: () => "https://x/pay",
}));
vi.mock("@/components/PaymentForm", () => ({ PaymentForm: () => <div>FORM_PAGO</div>, precargarKrypton: () => {} }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

const verifyDocument = vi.fn();
vi.mock("@/lib/verifyDoc", async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  verifyDocument: (...a: unknown[]) => verifyDocument(...a),
}));

const fetchMyIdentity = vi.fn();
const saveMyIdentity = vi.fn();
vi.mock("@/lib/identity", async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  fetchMyIdentity: () => fetchMyIdentity(),
  saveMyIdentity: (...a: unknown[]) => saveMyIdentity(...a),
}));

import { BuyCreditsModal } from "@/components/BuyCreditsModal";

const open = () =>
  render(<BuyCreditsModal open onClose={() => {}} creditCost={0} currentBalance={0} onPurchaseComplete={() => {}} />);

beforeEach(() => {
  vi.clearAllMocks();
  fetchMyIdentity.mockResolvedValue(null);
});

describe("BuyCreditsModal — identidad ya verificada", () => {
  it("trae el DNI del perfil y lo da por bueno SIN volver a consultar", async () => {
    fetchMyIdentity.mockResolvedValue({
      docType: "dni", docNumber: "47386685",
      name: "SALAZAR DAVILA, LEONOR ALMENDRA",
      accountEmail: "leonor@correo.com", docVerified: true,
    });
    open();

    await screen.findByText("SALAZAR DAVILA, LEONOR ALMENDRA");
    expect((screen.getByPlaceholderText("12345678") as HTMLInputElement).value).toBe("47386685");
    // Lo que importa: ni una consulta más a Factiliza.
    await act(async () => { await new Promise((r) => setTimeout(r, 700)); });
    expect(verifyDocument).not.toHaveBeenCalled();
  });

  it("un RUC guardado abre el modal en Empresa, con factura", async () => {
    fetchMyIdentity.mockResolvedValue({
      docType: "ruc", docNumber: "20616009061",
      name: "CORP LOZANOCHEFFER SAC",
      accountEmail: "empresa@correo.com", docVerified: true,
    });
    open();

    await screen.findByText("CORP LOZANOCHEFFER SAC");
    expect(screen.getByText("Empresa verificada")).toBeInTheDocument();
    expect((screen.getByPlaceholderText("20123456789") as HTMLInputElement).value).toBe("20616009061");
    expect(verifyDocument).not.toHaveBeenCalled();
  });

  it("propone el correo de la cuenta para el comprobante", async () => {
    fetchMyIdentity.mockResolvedValue({
      docType: null, docNumber: null, name: "", accountEmail: "ana@correo.com", docVerified: false,
    });
    open();

    await waitFor(() =>
      expect((screen.getByPlaceholderText("tu@correo.com") as HTMLInputElement).value).toBe("ana@correo.com"),
    );
  });

  it("si escribe OTRO documento, ese sí se verifica y se guarda para la próxima", async () => {
    fetchMyIdentity.mockResolvedValue({
      docType: "dni", docNumber: "47386685", name: "LEONOR SALAZAR",
      accountEmail: "leonor@correo.com", docVerified: true,
    });
    verifyDocument.mockResolvedValue({ ok: true, nombre: "JUAN PEREZ", data: {} });
    open();
    await screen.findByText("LEONOR SALAZAR");

    fireEvent.change(screen.getByPlaceholderText("12345678"), { target: { value: "44443333" } });
    await screen.findByText("JUAN PEREZ");

    expect(verifyDocument).toHaveBeenCalledTimes(1);
    expect(saveMyIdentity).toHaveBeenCalledWith({
      docType: "dni", docNumber: "44443333", name: "JUAN PEREZ",
    });
  });

  it("sin nada guardado, el modal se comporta como siempre", async () => {
    open();
    await waitFor(() =>
      expect((screen.getByPlaceholderText("12345678") as HTMLInputElement).value).toBe(""),
    );
    expect(verifyDocument).not.toHaveBeenCalled();
  });
});
