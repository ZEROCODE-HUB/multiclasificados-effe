import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// MOB-01: al confirmar la venta desde el chat, el aviso emergente se quedaba
// fijo en pantalla y solo se iba si el usuario lo cerraba a mano.
//
// Dos causas sumadas: la constante heredada de shadcn/ui retiraba el toast del
// DOM a los ~16 minutos, y el temporizador de Radix se PAUSA cuando la ventana
// pierde el foco — dentro del WebView de iOS ese foco podía no volver nunca.
// Por eso el cierre automático es ahora nuestro y no depende del foco.

// El estado de los toasts es un singleton del módulo: se recarga en cada test
// para que uno no herede los del anterior.
async function loadToast() {
  vi.resetModules();
  return import("@/hooks/use-toast");
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("use-toast — cierre automático", () => {
  it("se cierra solo a los pocos segundos y luego sale del DOM", async () => {
    const { useToast, toast, TOAST_DURATION } = await loadToast();
    const { result } = renderHook(() => useToast());

    act(() => { toast({ title: "Venta marcada como concretada" }); });
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].open).toBe(true);

    // Justo antes del plazo sigue visible…
    act(() => { vi.advanceTimersByTime(TOAST_DURATION - 1); });
    expect(result.current.toasts[0].open).toBe(true);

    // …y al cumplirse se cierra sin que nadie lo toque.
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.toasts[0].open).toBe(false);

    // Poco después se retira del DOM (el retraso solo cubre la animación de
    // salida; antes eran 1.000.000 ms).
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current.toasts).toHaveLength(0);
  });

  it("el plazo es de segundos, no de minutos", async () => {
    const { TOAST_DURATION } = await loadToast();
    expect(TOAST_DURATION).toBeGreaterThanOrEqual(3000);
    expect(TOAST_DURATION).toBeLessThanOrEqual(8000);
  });

  it("cerrarlo a mano no deja pendiente el cierre automático", async () => {
    const { useToast, toast, TOAST_DURATION } = await loadToast();
    const { result } = renderHook(() => useToast());

    let handle!: { dismiss: () => void };
    act(() => { handle = toast({ title: "Enlace copiado" }); });
    act(() => { handle.dismiss(); });
    expect(result.current.toasts[0].open).toBe(false);

    // Que no quede un temporizador huérfano intentando cerrar lo ya cerrado.
    act(() => { vi.advanceTimersByTime(TOAST_DURATION + 2000); });
    expect(result.current.toasts).toHaveLength(0);
  });

  it("con duration: Infinity se queda hasta que el usuario lo cierre", async () => {
    const { useToast, toast } = await loadToast();
    const { result } = renderHook(() => useToast());

    act(() => { toast({ title: "Requiere tu atención", duration: Infinity }); });
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(result.current.toasts[0].open).toBe(true);
  });
});
