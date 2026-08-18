import { describe, it, expect, vi, beforeEach } from "vitest";
import { EnlaceFalso } from "./routerStubs";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { prepararDom } from "./domPolyfills";

// El apartado de vídeos aparece solo cuando el adicional está activo, y admite
// tantos como se hayan contratado (hasta 3). Un vídeo que no cumple no se
// queda: se rechaza con el motivo.

beforeEach(prepararDom);

const validarVideo = vi.fn();
vi.mock("@/lib/video", async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  validarVideo: (...a: unknown[]) => validarVideo(...a),
}));
vi.mock("@/lib/credits", () => ({
  getCreditBalance: vi.fn().mockResolvedValue(1000),
  purchaseCredits: vi.fn(),
}));
vi.mock("@/lib/publish", () => ({
  createAndPublishListing: vi.fn(), saveListingDraft: vi.fn(),
  finalizeListingPublication: vi.fn(), cargarAvisoParaCopiar: vi.fn(),
  SaldoInsuficiente: class SaldoInsuficiente extends Error {},
}));
vi.mock("@/lib/verifyDoc", async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  verifyDocument: vi.fn().mockResolvedValue({ ok: true, nombre: "JUAN PEREZ", data: {} }),
}));
vi.mock("@/lib/promotions", async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  fetchActivePromotions: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: {
    getSession: vi.fn().mockResolvedValue({ data: { session: { user: { email: "t@correo.com" } } } }),
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
  } },
}));
vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("react-router-dom", async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  useNavigate: () => vi.fn(), Link: EnlaceFalso,
}));
vi.mock("@/hooks/useSession", () => ({ useSession: () => ({ role: "anunciante", name: "T", supabase: true }) }));
const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => toast(...a) }));

import AdvertiserPublish from "@/pages/advertiser/AdvertiserPublish";

const elegirArchivo = (nombre: string) => {
  // El input del vídeo es el último de tipo file que monta la pantalla.
  const inputs = document.querySelectorAll<HTMLInputElement>('input[type=file][accept*="video"]');
  const input = inputs[inputs.length - 1];
  const file = new File(["v"], nombre, { type: "video/mp4" });
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  fireEvent.change(input);
};

beforeEach(() => {
  toast.mockClear();
  validarVideo.mockReset().mockResolvedValue({ ok: true, duracion: 12 });
  localStorage.setItem("effe:publish-draft", JSON.stringify({
    form: { category: "inmuebles", title: "Casa", description: "desc larga", price: "100", currency: "PEN", department: "15", location: "Lima", condition: "nuevo" },
    duration: 7, quantity: 1, extras: {},
  }));
});

describe("AdvertiserPublish — apartado de videos", () => {
  it("no se muestra si el adicional no está activo", async () => {
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa");
    expect(screen.queryByText(/Agregar video/i)).not.toBeInTheDocument();
  });

  it("aparece al activar el adicional y se oculta al desactivarlo", async () => {
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa");

    fireEvent.click(screen.getByRole("button", { name: /agregar video del aviso/i }));
    await waitFor(() => expect(screen.getByText(/Agregar video \(0\/1\)/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /quitar video del aviso/i }));
    await waitFor(() => expect(screen.queryByText(/Agregar video/i)).not.toBeInTheDocument());
  });

  it("un video válido se añade con su duración", async () => {
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa");
    fireEvent.click(screen.getByRole("button", { name: /agregar video del aviso/i }));
    await screen.findByText(/Agregar video \(0\/1\)/i);

    elegirArchivo("clip.mp4");

    await screen.findByText("clip.mp4");
    expect(screen.getByText("12 s")).toBeInTheDocument();
  });

  it("un video que no cumple se rechaza diciendo por qué", async () => {
    validarVideo.mockResolvedValue({ ok: false, motivo: "El video dura 35 s y el máximo son 20 s." });
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa");
    fireEvent.click(screen.getByRole("button", { name: /agregar video del aviso/i }));
    await screen.findByText(/Agregar video \(0\/1\)/i);

    elegirArchivo("largo.mp4");

    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "No se puede usar ese video",
      description: "El video dura 35 s y el máximo son 20 s.",
    })));
    expect(screen.queryByText("largo.mp4")).not.toBeInTheDocument();
  });

  it("cuando se llenan los contratados, ya no se puede agregar otro", async () => {
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa");
    fireEvent.click(screen.getByRole("button", { name: /agregar video del aviso/i }));
    await screen.findByText(/Agregar video \(0\/1\)/i);

    elegirArchivo("uno.mp4");
    await screen.findByText("uno.mp4");

    // Contratado 1 de 3: el botón desaparece hasta que se contrate otro.
    expect(screen.queryByText(/Agregar video/i)).not.toBeInTheDocument();
  });
});
