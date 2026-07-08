import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

// Polyfills para Radix Dialog en jsdom.
beforeEach(() => {
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (!window.matchMedia) (window as any).matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
});

vi.mock("@/lib/pricingRemote", () => ({ fetchPricingSettings: () => new Promise(() => {}) }));
const purchaseCredits = vi.fn().mockResolvedValue({ newBalance: 100, invoiceNumber: "B001-1" });
vi.mock("@/lib/credits", () => ({ purchaseCredits: (...a: unknown[]) => purchaseCredits(...a) }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

const verifyDocument = vi.fn();
vi.mock("@/lib/verifyDoc", () => ({ verifyDocument: (...a: unknown[]) => verifyDocument(...a) }));

import { BuyCreditsModal } from "@/components/BuyCreditsModal";

const open = () =>
  render(<BuyCreditsModal open onClose={() => {}} creditCost={0} currentBalance={0} onPurchaseComplete={() => {}} />);

beforeEach(() => {
  vi.clearAllMocks();
  purchaseCredits.mockResolvedValue({ newBalance: 100, invoiceNumber: "B001-1" });
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

  it("el botón Comprar queda deshabilitado sin documento verificado y NO compra", async () => {
    verifyDocument.mockResolvedValue({ ok: false, error: "Documento inválido." });
    open();

    // Solo correo, documento no verificado.
    fireEvent.change(screen.getByPlaceholderText("tu@correo.com"), { target: { value: "ana@correo.com" } });
    fireEvent.change(screen.getByPlaceholderText("12345678"), { target: { value: "00000000" } });
    await screen.findByText(/Documento inválido/i);

    const comprar = screen.getByRole("button", { name: /comprar/i });
    expect(comprar).toBeDisabled();
    fireEvent.click(comprar);
    expect(purchaseCredits).not.toHaveBeenCalled();
  });

  it("con documento verificado y correo válido, habilita y compra (con el nombre real)", async () => {
    verifyDocument.mockResolvedValue({ ok: true, nombre: "JUAN PEREZ", data: {} });
    open();

    fireEvent.change(screen.getByPlaceholderText("12345678"), { target: { value: "44443333" } });
    fireEvent.change(screen.getByPlaceholderText("tu@correo.com"), { target: { value: "juan@correo.com" } });
    await screen.findByText("JUAN PEREZ");

    const comprar = screen.getByRole("button", { name: /comprar/i });
    await waitFor(() => expect(comprar).not.toBeDisabled());
    fireEvent.click(comprar);

    await waitFor(() => expect(purchaseCredits).toHaveBeenCalledTimes(1));
    // El comprobante lleva el nombre verificado.
    expect(purchaseCredits.mock.calls[0][1]).toMatchObject({ advertiserName: "JUAN PEREZ", email: "juan@correo.com" });
  });
});
