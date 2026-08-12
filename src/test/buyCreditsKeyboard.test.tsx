import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { prepararDom } from "./domPolyfills";

// Polyfills para Radix Dialog en jsdom.
beforeEach(prepararDom);

// La carga remota de precios nunca resuelve: se usan los ajustes por defecto.
vi.mock("@/lib/pricingRemote", () => ({ fetchPricingSettings: () => new Promise(() => {}) }));
vi.mock("@/lib/credits", () => ({ purchaseCredits: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

import { BuyCreditsModal } from "@/components/BuyCreditsModal";

describe("BuyCreditsModal — el teclado móvil no debe tapar DNI/correo", () => {
  const open = () =>
    render(<BuyCreditsModal open onClose={() => {}} creditCost={0} currentBalance={0} onPurchaseComplete={() => {}} />);

  it("al enfocar el DNI, desplaza el campo al centro visible (tras abrir el teclado)", () => {
    vi.useFakeTimers();
    const scrollSpy = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
    open();
    fireEvent.focus(screen.getByPlaceholderText("12345678"));
    // Antes del temporizador aún no se desplaza (se espera a que abra el teclado).
    expect(scrollSpy).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(350); });
    expect(scrollSpy).toHaveBeenCalledWith(expect.objectContaining({ block: "center" }));
    vi.useRealTimers();
  });

  it("también desplaza al enfocar el correo del comprobante", () => {
    vi.useFakeTimers();
    const scrollSpy = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
    open();
    fireEvent.focus(screen.getByPlaceholderText("tu@correo.com"));
    act(() => { vi.advanceTimersByTime(350); });
    expect(scrollSpy).toHaveBeenCalledWith(expect.objectContaining({ block: "center" }));
    vi.useRealTimers();
  });
});
