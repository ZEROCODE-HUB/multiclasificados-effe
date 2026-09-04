import { describe, it, expect, vi, beforeEach } from "vitest";
import { EnlaceFalso } from "./routerStubs";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { prepararDom } from "./domPolyfills";

/**
 * Publicar con saldo NO puede degradar el documento del anunciante.
 *
 * ── QUÉ PASABA ───────────────────────────────────────────────────────────────
 *
 * `AdvertiserPublish` deducía el tipo de documento de `personType`:
 *
 *     const tipoDoc = personType === "juridica" ? "ruc" : "dni";
 *
 * Y `personType` solo tiene dos valores, natural y jurídica. Así que el
 * pasaporte y el carné de extranjería —los dos tipos con los que un extranjero
 * puede recibir una boleta peruana (catálogo 06 de SUNAT: 7 y 4)— caían los dos
 * del lado "natural" y se guardaban en el perfil como **dni**, conservando el
 * número del pasaporte.
 *
 * ── POR QUÉ IMPORTA ──────────────────────────────────────────────────────────
 *
 * Aquí no se emite ningún comprobante: eso lo hace `settle_paid_order` en el
 * camino de pago, y allí el tipo sí se elige bien. Pero lo que se escribe en el
 * perfil es lo que precarga la SIGUIENTE compra. Con el tipo degradado a `dni`,
 * a un extranjero se le pedía un DNI de 8 dígitos que no tiene, y su número de
 * pasaporte quedaba etiquetado como documento peruano.
 *
 * La prueba fija que el documento del perfil se respeta tal cual.
 */

beforeEach(prepararDom);

const getCreditBalance = vi.fn();
vi.mock("@/lib/credits", () => ({ getCreditBalance: (...a: unknown[]) => getCreditBalance(...a) }));

vi.mock("@/lib/payments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/payments")>()),
  createPayment: vi.fn(),
  createPublishPayment: vi.fn(),
  pollOrderStatus: vi.fn(),
  getPurchaseResult: vi.fn(),
  hostedPaymentUrl: () => "https://x/pay",
}));
vi.mock("@/components/PaymentForm", () => ({ PaymentForm: () => null, precargarKrypton: () => {} }));

const createAndPublishListing = vi.fn();
vi.mock("@/lib/publish", () => ({
  createAndPublishListing: (...a: unknown[]) => createAndPublishListing(...a),
  saveListingDraft: vi.fn().mockResolvedValue("L1"),
  finalizeListingPublication: vi.fn().mockResolvedValue({ published: true }),
  SaldoInsuficiente: class SaldoInsuficiente extends Error {
    listingId?: string;
  },
}));

// La identidad del perfil: lo que de verdad se está probando.
const fetchMyIdentity = vi.fn();
vi.mock("@/lib/identity", async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  fetchMyIdentity: (...a: unknown[]) => fetchMyIdentity(...a),
}));

vi.mock("@/lib/promotions", async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  fetchActivePromotions: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: { email: "juan@correo.com" } } } }),
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
    },
  },
}));
vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("react-router-dom", async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  useNavigate: () => vi.fn(),
  Link: EnlaceFalso,
}));
vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({ role: "anunciante", name: "Juan", initials: "J", supabase: true }),
}));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

import AdvertiserPublish from "@/pages/advertiser/AdvertiserPublish";

const seedDraft = () => {
  localStorage.setItem("effe:publish-draft", JSON.stringify({
    form: {
      category: "inmuebles",
      title: "Casa bonita",
      description: "Descripción larga del aviso",
      price: "100",
      currency: "PEN",
      department: "15",
      location: "Lima",
      condition: "nuevo",
    },
    duration: 7,
    quantity: 1,
    extras: {},
  }));
};

const subirPortada = () => {
  const input = document.querySelectorAll("input[type=file]")[0] as HTMLInputElement;
  const file = new File(["img"], "portada.png", { type: "image/png" });
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  fireEvent.change(input);
};

/** Publica de verdad: botón → modal de confirmación → confirmar. */
const publicar = async () => {
  subirPortada();
  fireEvent.click(screen.getByRole("button", { name: /publicar aviso/i }));
  await screen.findByText(/confirmar publicación/i);
  fireEvent.click(screen.getByRole("button", { name: /confirmar y publicar/i }));
};

/** El tipo de documento con el que se llamó a `createAndPublishListing`. */
const docTypeEnviado = () =>
  (createAndPublishListing.mock.calls[0]?.[0] as { docType?: string } | undefined)?.docType;

beforeEach(() => {
  localStorage.clear();
  getCreditBalance.mockReset().mockResolvedValue(1000);
  createAndPublishListing.mockReset().mockResolvedValue({ listingId: "L1", published: true });
  fetchMyIdentity.mockReset();
});

describe("publicar con saldo respeta el documento del anunciante", () => {
  it("un PASAPORTE sigue siendo pasaporte, no se convierte en DNI", async () => {
    // Este es el caso que se rompía. Antes llegaba "dni" con el número AB123456.
    fetchMyIdentity.mockResolvedValue({
      docType: "pasaporte",
      docNumber: "AB123456",
      name: "JUAN QUISPE MAMANI",
      docVerified: false,
    });
    seedDraft();
    render(<AdvertiserPublish />);
    await waitFor(() => expect(fetchMyIdentity).toHaveBeenCalled());

    await publicar();

    await waitFor(() => expect(createAndPublishListing).toHaveBeenCalled());
    expect(docTypeEnviado()).toBe("pasaporte");
  });

  it("un carné de extranjería tampoco se degrada", async () => {
    fetchMyIdentity.mockResolvedValue({
      docType: "ce",
      docNumber: "001234567",
      name: "MARIA LOPEZ",
      docVerified: false,
    });
    seedDraft();
    render(<AdvertiserPublish />);
    await waitFor(() => expect(fetchMyIdentity).toHaveBeenCalled());

    await publicar();

    await waitFor(() => expect(createAndPublishListing).toHaveBeenCalled());
    expect(docTypeEnviado()).toBe("ce");
  });

  it("y el caso peruano de siempre no cambia", async () => {
    // Lo que ya funcionaba tiene que seguir igual: el arreglo no puede empezar a
    // mandar otra cosa para quien tiene DNI o RUC.
    fetchMyIdentity.mockResolvedValue({
      docType: "ruc",
      docNumber: "20616009061",
      name: "CORP LOZANOCHEFFER SAC",
      docVerified: true,
    });
    seedDraft();
    render(<AdvertiserPublish />);
    await waitFor(() => expect(fetchMyIdentity).toHaveBeenCalled());

    await publicar();

    await waitFor(() => expect(createAndPublishListing).toHaveBeenCalled());
    expect(docTypeEnviado()).toBe("ruc");
  });

  it("sin documento en el perfil, se deduce como antes", async () => {
    // Perfil nuevo: no hay nada que respetar, así que vale el valor por defecto.
    fetchMyIdentity.mockResolvedValue(null);
    seedDraft();
    render(<AdvertiserPublish />);
    await waitFor(() => expect(fetchMyIdentity).toHaveBeenCalled());

    await publicar();

    await waitFor(() => expect(createAndPublishListing).toHaveBeenCalled());
    expect(docTypeEnviado()).toBe("dni");
  });
});
