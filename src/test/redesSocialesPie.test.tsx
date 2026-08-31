import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { prepararDom } from "./domPolyfills";

// Los iconos del pie (B-16). Lo que se comprueba aquí es el comportamiento que
// el cliente va a ver: que solo aparezca lo que él configuró, y que mientras no
// configure nada el pie quede exactamente como estaba.

beforeEach(prepararDom);

const rpc = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: { rpc: (...a: unknown[]) => rpc(...a) },
}));

import { RedesSocialesPie } from "@/components/RedesSocialesPie";

const responde = (data: unknown) => rpc.mockResolvedValue({ data, error: null });

beforeEach(() => rpc.mockReset());

describe("qué se pinta", () => {
  it("solo las redes con enlace", async () => {
    responde({
      facebook: "https://facebook.com/coleffe",
      instagram: "",
      tiktok: null,
      whatsapp: "51903375308",
    });
    render(<RedesSocialesPie />);

    await waitFor(() => expect(screen.getByLabelText("Facebook")).toBeTruthy());
    expect(screen.getByLabelText("WhatsApp")).toBeTruthy();
    expect(screen.queryByLabelText("Instagram")).toBeNull();
    expect(screen.queryByLabelText("TikTok")).toBeNull();
  });

  it("el número de WhatsApp llega convertido en su enlace", async () => {
    responde({ whatsapp: "+51 903 375 308" });
    render(<RedesSocialesPie />);
    const a = await screen.findByLabelText("WhatsApp");
    expect(a.getAttribute("href")).toBe("https://wa.me/51903375308");
  });

  it("cada enlace abre fuera y sin dejar que la otra página nos mueva", async () => {
    // Sin `noopener` el destino recibe `window.opener` y puede redirigir
    // nuestra pestaña desde la suya.
    responde({ facebook: "https://facebook.com/coleffe" });
    render(<RedesSocialesPie />);
    const a = await screen.findByLabelText("Facebook");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toContain("noopener");
    expect(a.getAttribute("rel")).toContain("noreferrer");
  });
});

describe("cuando no hay nada que pintar", () => {
  it("sin redes configuradas no deja un hueco en el pie", async () => {
    responde({});
    const { container } = render(<RedesSocialesPie />);
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(container.innerHTML).toBe("");
  });

  it("si la consulta falla, el pie sigue en pie", async () => {
    // Es el mismo criterio que el modo mantenimiento: un fallo de red no puede
    // dejar la portada rota. Supabase no lanza: devuelve `{ data, error }`, así
    // que se reproduce esa forma y no un `throw`, que sería probar otra cosa.
    rpc.mockResolvedValue({ data: null, error: { message: "sin conexión" } });
    const { container } = render(<RedesSocialesPie />);
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(container.innerHTML).toBe("");
  });

  it("una red con un valor peligroso no se pinta", async () => {
    responde({ facebook: "javascript:alert(1)", instagram: "https://instagram.com/x" });
    render(<RedesSocialesPie />);
    await screen.findByLabelText("Instagram");
    expect(screen.queryByLabelText("Facebook")).toBeNull();
  });
});
