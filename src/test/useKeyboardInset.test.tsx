import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";

// Por defecto simulamos WEB (sin plataforma nativa): el hook no engancha el
// plugin de teclado, solo expone el desplazamiento del campo enfocado.
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => false },
}));

import { useKeyboardInset } from "@/hooks/useKeyboardInset";

function focusEventFor(tagName: "INPUT" | "TEXTAREA" | "DIV") {
  const el = document.createElement(tagName);
  const scrollIntoView = vi.fn();
  (el as unknown as { scrollIntoView: () => void }).scrollIntoView = scrollIntoView;
  // Solo necesitamos `target` para el handler.
  return { event: { target: el } as unknown as React.FocusEvent<HTMLElement>, scrollIntoView };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useKeyboardInset", () => {
  it("en web, kbPad arranca en 0 (sin reservar espacio)", () => {
    const { result } = renderHook(() => useKeyboardInset());
    expect(result.current.kbPad).toBe(0);
  });

  it("centra el INPUT enfocado tras abrirse el teclado (350 ms)", () => {
    const { result } = renderHook(() => useKeyboardInset());
    const { event, scrollIntoView } = focusEventFor("INPUT");

    result.current.scrollFocusedIntoView(event);
    expect(scrollIntoView).not.toHaveBeenCalled(); // aún no: espera al teclado
    vi.advanceTimersByTime(350);

    expect(scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ block: "center", behavior: "smooth" }),
    );
  });

  it("también centra un TEXTAREA (mensaje/postulación)", () => {
    const { result } = renderHook(() => useKeyboardInset());
    const { event, scrollIntoView } = focusEventFor("TEXTAREA");

    result.current.scrollFocusedIntoView(event);
    vi.advanceTimersByTime(350);

    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: "center" }));
  });

  it("ignora el foco de elementos que no son campos de texto", () => {
    const { result } = renderHook(() => useKeyboardInset());
    const { event, scrollIntoView } = focusEventFor("DIV");

    result.current.scrollFocusedIntoView(event);
    vi.advanceTimersByTime(500);

    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
