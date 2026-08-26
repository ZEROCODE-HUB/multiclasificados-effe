import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { prepararDom } from "./domPolyfills";

// Polyfills para Radix Dialog en jsdom.
beforeEach(prepararDom);

// La carga remota de precios nunca resuelve: se usan los ajustes por defecto.
vi.mock("@/lib/pricingRemote", () => ({ fetchPricingSettings: () => new Promise(() => {}) }));
// `BuyCreditsModal` pide la configuración de Yape/Plin al abrirse (línea 261).
// Sin mockearla sale a Supabase de verdad y resuelve DESPUÉS de que la prueba
// termine: React intenta actualizar un componente ya desmontado y salta
// `ReferenceError: window is not defined`. Las pruebas pasan igual, pero vitest
// lo cuenta como error suelto y **termina con código 1** — o sea que tumbaba el
// flujo que firma el AAB, sin que ningún test apareciera en rojo.
//
// Es una carrera, así que solo salta cuando la promesa llega tarde: en local
// pasaba y en el runner de GitHub fallaba. Aquí no se prueba Yape/Plin.
vi.mock("@/lib/pagoManual", async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  configYapePlin: () => new Promise(() => {}),
}));
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
