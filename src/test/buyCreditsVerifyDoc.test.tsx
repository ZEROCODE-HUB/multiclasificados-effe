import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { prepararDom } from "./domPolyfills";

// Polyfills para Radix Dialog en jsdom.
beforeEach(prepararDom);

vi.mock("@/lib/pricingRemote", () => ({ fetchPricingSettings: () => new Promise(() => {}) }));
const createPayment = vi.fn();
vi.mock("@/lib/payments", () => ({
  createPayment: (...a: unknown[]) => createPayment(...a),
  pollOrderStatus: vi.fn().mockResolvedValue("paid"),
  getPurchaseResult: vi.fn().mockResolvedValue({ balance: 100, invoiceNumber: "B001-1" }),
  hostedPaymentUrl: () => "https://x/pay",
}));
// Stub del formulario embebido: evita cargar Krypton por CDN en el paso 2.
vi.mock("@/components/PaymentForm", () => ({ PaymentForm: () => <div>FORM_PAGO</div>, precargarKrypton: () => {} }));
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
    await screen.findByText("ROMAINA SILVA, LISMELI");
  });

  it("DNI: NO enseña el domicilio, solo el nombre y el número", async () => {
    // Para confirmar que el DNI es el correcto basta el nombre. La dirección de
    // casa de alguien en la pantalla del móvil, delante de quien sea, sobra.
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
    expect(screen.queryByText(/FELICIANO PAREDES/)).not.toBeInTheDocument();
    expect(screen.queryByText(/CORONEL PORTILLO/)).not.toBeInTheDocument();
    expect(screen.queryByText("Domicilio:")).not.toBeInTheDocument();
  });

  it("RUC: muestra razón social, estado y condición, pero NO el domicilio fiscal", async () => {
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
    expect(screen.queryByText(/GARCILASO DE LA VEGA/)).not.toBeInTheDocument();
    expect(screen.queryByText("Domicilio fiscal:")).not.toBeInTheDocument();
    expect(screen.queryByText("Tipo:")).not.toBeInTheDocument();
  });

  it("el mismo documento no se consulta dos veces", async () => {
    // Cada consulta se le paga a Factiliza. Corregir un dígito y volver a
    // escribir el mismo número disparaba otra.
    verifyDocument.mockResolvedValue({ ok: true, nombre: "JUAN PEREZ", data: {} });
    open();

    const campo = screen.getByPlaceholderText("12345678");
    fireEvent.change(campo, { target: { value: "44443333" } });
    await screen.findByText("JUAN PEREZ");
    expect(verifyDocument).toHaveBeenCalledTimes(1);

    // Borra el último dígito y lo vuelve a poner: mismo documento.
    fireEvent.change(campo, { target: { value: "4444333" } });
    fireEvent.change(campo, { target: { value: "44443333" } });
    await screen.findByText("JUAN PEREZ");
    await act(async () => { await new Promise((r) => setTimeout(r, 700)); });
    expect(verifyDocument).toHaveBeenCalledTimes(1);
  });

  it("mientras se teclea no se consulta: solo cuando para", async () => {
    verifyDocument.mockResolvedValue({ ok: true, nombre: "ANA TORRES", data: {} });
    open();

    const campo = screen.getByPlaceholderText("12345678");
    // Ocho dígitos, y enseguida un noveno que el campo descarta... pero antes
    // pasa por dos números completos distintos.
    fireEvent.change(campo, { target: { value: "44443333" } });
    fireEvent.change(campo, { target: { value: "44443334" } });
    await screen.findByText("ANA TORRES");

    expect(verifyDocument).toHaveBeenCalledTimes(1);
    expect(verifyDocument).toHaveBeenCalledWith("dni", "44443334");
  });

  it("si el servidor corta por exceso de consultas, lo explica y no insiste", async () => {
    verifyDocument.mockResolvedValue({
      ok: false,
      error: "Has hecho varias verificaciones seguidas. Espera unos minutos e inténtalo de nuevo.",
      rateLimited: true,
    });
    open();
    fireEvent.change(screen.getByPlaceholderText("12345678"), { target: { value: "44443333" } });

    await screen.findByText(/varias verificaciones seguidas/i);
    expect(screen.getByText(/ciérralo y vuelve a abrirlo/i)).toBeInTheDocument();
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

  it("sin documento verificado NO inicia el pago y señala el campo", async () => {
    verifyDocument.mockResolvedValue({ ok: false, error: "Documento inválido." });
    open();

    // Solo correo, documento no verificado.
    fireEvent.change(screen.getByPlaceholderText("tu@correo.com"), { target: { value: "ana@correo.com" } });
    fireEvent.change(screen.getByPlaceholderText("12345678"), { target: { value: "00000000" } });
    await screen.findByText(/Documento inválido/i);

    // El botón ya no se queda muerto sin explicar por qué: se pulsa, no se cobra
    // nada y el campo que falta queda marcado.
    const continuar = screen.getByRole("button", { name: /continuar al pago/i });
    fireEvent.click(continuar);
    expect(createPayment).not.toHaveBeenCalled();
    await screen.findByText(/Ingresa tu DNI para emitir la boleta/i);
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
