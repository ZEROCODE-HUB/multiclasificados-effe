import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

// Polyfills para Radix Dialog en jsdom.
beforeEach(() => {
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (!window.matchMedia) (window as any).matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
});

vi.mock("@/lib/pricingRemote", () => ({ fetchPricingSettings: () => new Promise(() => {}) }));
const createPayment = vi.fn();
vi.mock("@/lib/payments", () => ({
  createPayment: (...a: unknown[]) => createPayment(...a),
  pollOrderStatus: vi.fn().mockResolvedValue("paid"),
  getPurchaseResult: vi.fn().mockResolvedValue({ balance: 100, invoiceNumber: "B001-1" }),
  hostedPaymentUrl: () => "https://x/pay",
}));
// Stub del formulario embebido: evita cargar Krypton por CDN en el paso 2.
vi.mock("@/components/PaymentForm", () => ({ PaymentForm: () => <div>FORM_PAGO</div> }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

const verifyDocument = vi.fn();
vi.mock("@/lib/verifyDoc", async (orig) => ({
  // normalizeDocNumber va REAL: es lo que limpia lo que el usuario pega.
  ...(await (orig() as Promise<Record<string, unknown>>)),
  verifyDocument: (...a: unknown[]) => verifyDocument(...a),
}));

import { BuyCreditsModal } from "@/components/BuyCreditsModal";

const open = () =>
  render(<BuyCreditsModal open onClose={() => {}} creditCost={0} currentBalance={0} onPurchaseComplete={() => {}} />);

beforeEach(() => {
  vi.clearAllMocks();
  createPayment.mockResolvedValue({ orderId: "ord-1", formToken: "tok", publicKey: "pk-1" });
});

describe("BuyCreditsModal — verificación de documento con Factiliza + campos obligatorios", () => {
  it("al completar el DNI (8 dígitos) consulta Factiliza y muestra el nombre", async () => {
    verifyDocument.mockResolvedValue({ ok: true, nombre: "ROMAINA SILVA, LISMELI", data: { direccion: "AV. LIMA 123" } });
    open();

    fireEvent.change(screen.getByPlaceholderText("12345678"), { target: { value: "44443333" } });

    await waitFor(() =>
      expect(verifyDocument).toHaveBeenCalledWith("dni", "44443333"),
    );
    // Muestra el nombre y la dirección devueltos por Factiliza.
    await screen.findByText("ROMAINA SILVA, LISMELI");
    expect(screen.getByText("AV. LIMA 123")).toBeInTheDocument();
  });

  it("DNI: muestra la ficha completa (documento + domicilio con ubigeo)", async () => {
    verifyDocument.mockResolvedValue({
      ok: true,
      nombre: "ROMAINA SILVA, LISMELI",
      data: {
        direccion: "JR. FELICIANO PAREDES C/N",
        direccion_completa: "JR. FELICIANO PAREDES C/N, UCAYALI - CORONEL PORTILLO - MASISEA",
        departamento: "UCAYALI", provincia: "CORONEL PORTILLO", distrito: "MASISEA",
      },
    });
    open();
    fireEvent.change(screen.getByPlaceholderText("12345678"), { target: { value: "44443333" } });

    await screen.findByText("ROMAINA SILVA, LISMELI");
    expect(screen.getByText("DNI:")).toBeInTheDocument();
    expect(screen.getByText("44443333")).toBeInTheDocument();
    // Prefiere `direccion_completa` (ya trae el ubigeo concatenado).
    expect(screen.getByText(/UCAYALI - CORONEL PORTILLO - MASISEA/)).toBeInTheDocument();
  });

  it("DNI: si falta direccion_completa, arma el domicilio con dirección + ubigeo", async () => {
    verifyDocument.mockResolvedValue({
      ok: true,
      nombre: "ANA TORRES",
      data: { direccion: "AV. LIMA 123", distrito: "MIRAFLORES", provincia: "LIMA", departamento: "LIMA" },
    });
    open();
    fireEvent.change(screen.getByPlaceholderText("12345678"), { target: { value: "44443333" } });

    await screen.findByText("ANA TORRES");
    expect(screen.getByText("AV. LIMA 123, MIRAFLORES - LIMA - LIMA")).toBeInTheDocument();
  });

  it("RUC: muestra razón social, estado, condición y domicilio fiscal (omite lo vacío)", async () => {
    verifyDocument.mockResolvedValue({
      ok: true,
      nombre: "SUNAT",
      data: {
        estado: "ACTIVO", condicion: "HABIDO",
        tipo_contribuyente: "", // Factiliza lo devuelve vacío: la fila no debe salir
        direccion_completa: "AV. GARCILASO DE LA VEGA NRO. 1472, LIMA - LIMA - LIMA",
      },
    });
    open();
    fireEvent.click(screen.getByText("Empresa"));
    fireEvent.change(screen.getByPlaceholderText("20123456789"), { target: { value: "20131312955" } });

    await waitFor(() => expect(verifyDocument).toHaveBeenCalledWith("ruc", "20131312955"));
    await screen.findByText("SUNAT");
    expect(screen.getByText("Empresa verificada")).toBeInTheDocument();
    expect(screen.getByText("ACTIVO")).toBeInTheDocument();
    expect(screen.getByText("HABIDO")).toBeInTheDocument();
    expect(screen.getByText(/GARCILASO DE LA VEGA/)).toBeInTheDocument();
    expect(screen.queryByText("Tipo:")).not.toBeInTheDocument();
  });

  it("pegar el DNI CON ESPACIO conserva los 8 dígitos y verifica", async () => {
    verifyDocument.mockResolvedValue({ ok: true, nombre: "MAMANI GOMEZ, REBECA", data: {} });
    open();

    // Formato habitual al copiar un DNI. Antes el maxLength del input recortaba
    // "4444 5555" a "4444 555" y quedaban 7 dígitos: nunca se consultaba.
    fireEvent.change(screen.getByPlaceholderText("12345678"), { target: { value: "4444 5555" } });

    expect((screen.getByPlaceholderText("12345678") as HTMLInputElement).value).toBe("44445555");
    await waitFor(() => expect(verifyDocument).toHaveBeenCalledWith("dni", "44445555"));
    await screen.findByText("MAMANI GOMEZ, REBECA");
  });

  it("NO consulta si el DNI está incompleto", async () => {
    open();
    fireEvent.change(screen.getByPlaceholderText("12345678"), { target: { value: "4444" } });
    // pequeño respiro para que un posible efecto corra
    await act(async () => { await Promise.resolve(); });
    expect(verifyDocument).not.toHaveBeenCalled();
  });

  it("muestra el error de Factiliza si el documento no existe", async () => {
    verifyDocument.mockResolvedValue({ ok: false, error: "No se encontró información con el número de DNI." });
    open();
    fireEvent.change(screen.getByPlaceholderText("12345678"), { target: { value: "00000000" } });
    await screen.findByText(/No se encontró información/i);
  });

  it("el botón de pago queda deshabilitado sin documento verificado y NO inicia el pago", async () => {
    verifyDocument.mockResolvedValue({ ok: false, error: "Documento inválido." });
    open();

    // Solo correo, documento no verificado.
    fireEvent.change(screen.getByPlaceholderText("tu@correo.com"), { target: { value: "ana@correo.com" } });
    fireEvent.change(screen.getByPlaceholderText("12345678"), { target: { value: "00000000" } });
    await screen.findByText(/Documento inválido/i);

    const continuar = screen.getByRole("button", { name: /continuar al pago/i });
    expect(continuar).toBeDisabled();
    fireEvent.click(continuar);
    expect(createPayment).not.toHaveBeenCalled();
  });

  it("con documento verificado y correo válido, habilita e inicia el pago (con el nombre real)", async () => {
    verifyDocument.mockResolvedValue({ ok: true, nombre: "JUAN PEREZ", data: {} });
    open();

    fireEvent.change(screen.getByPlaceholderText("12345678"), { target: { value: "44443333" } });
    fireEvent.change(screen.getByPlaceholderText("tu@correo.com"), { target: { value: "juan@correo.com" } });
    await screen.findByText("JUAN PEREZ");

    const continuar = screen.getByRole("button", { name: /continuar al pago/i });
    await waitFor(() => expect(continuar).not.toBeDisabled());
    fireEvent.click(continuar);

    await waitFor(() => expect(createPayment).toHaveBeenCalledTimes(1));
    // El comprobante lleva el nombre verificado.
    expect(createPayment.mock.calls[0][0].receipt).toMatchObject({ advertiserName: "JUAN PEREZ", email: "juan@correo.com" });
  });
});
