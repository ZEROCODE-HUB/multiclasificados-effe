import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// En la app se paga con CRÉDITOS, no con dinero. Lo único que cambió es la
// conversión: antes 1 sol = 10 créditos (y se mostraban como "161 cr"), ahora
// 1 sol = 1 crédito. El símbolo "S/" solo aparece donde hay dinero real: la
// boleta de la compra.

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

describe("Conversión — 1 sol = 1 crédito", () => {
  it("un sol es un crédito", () => {
    expect(solesToCredits(1)).toBe(1);
    expect(solesToCredits(ESTANDAR)).toBe(ESTANDAR);
  });

  it("el saldo se escribe en créditos, nunca en 'cr' ni en 'S/'", () => {
    expect(formatCredits(ESTANDAR)).toBe("16.14 créditos");
    expect(formatCredits(1)).toBe("1 crédito");
    // Un entero no arrastra decimales: "8472 créditos", no "8472.00".
    expect(formatCredits(8472)).toBe("8472 créditos");
  });
});

describe("Comprar créditos — la app cobra en créditos y la boleta en soles", () => {
  it("no queda la sigla 'cr' suelta por ninguna parte", async () => {
    abrir({ creditCost: ESTANDAR, currentBalance: 5 });
    await screen.findByText(/créditos a comprar/i);

    // "cr" suelto, no el prefijo de "créditos": \b no vale porque la tilde de
    // "créditos" no es carácter de palabra y abre un límite tras "cr".
    expect(document.body.textContent).not.toMatch(/(?<!\p{L})cr(?!\p{L})/iu);
  });

  it("el costo del aviso, el saldo y lo que falta van en créditos", async () => {
    abrir({ creditCost: ESTANDAR, currentBalance: 5 });
    await screen.findByText(/créditos a comprar/i);

    const aviso = screen.getByText(/Para publicar tu aviso necesitas/i);
    expect(aviso).toHaveTextContent("16.14 créditos");
    expect(aviso).toHaveTextContent("tu saldo: 5 créditos");
    expect(screen.getByText(/^Faltan/)).toHaveTextContent("Faltan 11.14 créditos");
  });

  it("el botón compra créditos; el sol solo aparece en la boleta", async () => {
    abrir();
    await screen.findByText(/créditos a comprar/i);

    expect(screen.getByRole("button", { name: /comprar 16\.14 créditos/i })).toBeInTheDocument();
    // La única cifra en soles del cuadro de totales es la que se paga.
    expect(screen.getByText("Pagas (boleta)")).toBeInTheDocument();
    expect(screen.getByText("S/ 16.14")).toBeInTheDocument();
  });

  it("compra tantos créditos como soles paga (conversión 1:1)", async () => {
    abrir();
    fireEvent.change(screen.getByPlaceholderText("12345678"), { target: { value: "44443333" } });
    await screen.findByText("ANA TORRES");
    fireEvent.change(screen.getByPlaceholderText("tu@correo.com"), { target: { value: "ana@correo.com" } });

    fireEvent.click(screen.getByRole("button", { name: /comprar .* créditos/i }));

    await waitFor(() => expect(purchaseCredits).toHaveBeenCalled());
    const [pkg] = purchaseCredits.mock.calls[0];
    expect(pkg.credits_amount).toBe(pkg.price_soles);
    expect(pkg.credits_amount).toBe(ESTANDAR);
  });
});
