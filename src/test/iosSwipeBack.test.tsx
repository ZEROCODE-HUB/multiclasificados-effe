import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Swipe-back de iOS: un arrastre horizontal desde el borde izquierdo navega
// atrás. Solo en iOS; ni Android ni web disparan.

const { navigateSpy, platform } = vi.hoisted(() => ({
  navigateSpy: vi.fn(),
  platform: { value: "ios" },
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { getPlatform: () => platform.value } }));
vi.mock("react-router-dom", async (orig) => {
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return { ...actual, useNavigate: () => navigateSpy };
});

import { IosSwipeBack } from "@/components/IosSwipeBack";

beforeEach(() => { vi.clearAllMocks(); platform.value = "ios"; });

const mount = () => render(<MemoryRouter><IosSwipeBack /></MemoryRouter>);

describe("IosSwipeBack", () => {
  it("swipe desde el borde izquierdo → navega atrás", () => {
    mount();
    fireEvent.touchStart(document, { touches: [{ clientX: 5, clientY: 200 }] });
    fireEvent.touchEnd(document, { changedTouches: [{ clientX: 120, clientY: 210 }] });
    expect(navigateSpy).toHaveBeenCalledWith(-1);
  });

  it("swipe que NO empieza en el borde → no navega", () => {
    mount();
    fireEvent.touchStart(document, { touches: [{ clientX: 150, clientY: 200 }] });
    fireEvent.touchEnd(document, { changedTouches: [{ clientX: 260, clientY: 205 }] });
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it("scroll vertical (aunque empiece en el borde) → no navega", () => {
    mount();
    fireEvent.touchStart(document, { touches: [{ clientX: 5, clientY: 100 }] });
    fireEvent.touchEnd(document, { changedTouches: [{ clientX: 30, clientY: 400 }] });
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it("en Android no hace nada (ya tiene back de sistema)", () => {
    platform.value = "android";
    mount();
    fireEvent.touchStart(document, { touches: [{ clientX: 5, clientY: 200 }] });
    fireEvent.touchEnd(document, { changedTouches: [{ clientX: 220, clientY: 205 }] });
    expect(navigateSpy).not.toHaveBeenCalled();
  });
});
