import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { prepararDom } from "./domPolyfills";

// Publicar un borrador desde "Mis avisos › Borradores": cobra y activa el aviso
// que YA existe. Nunca vuelve a crearlo (eso duplicaría el aviso) y exige la
// misma verificación de identidad que publicar desde el formulario.

beforeEach(prepararDom);

const getCreditBalance = vi.fn();
vi.mock("@/lib/credits", () => ({
  getCreditBalance: (...a: unknown[]) => getCreditBalance(...a),
  purchaseCredits: vi.fn(),
}));

const finalizeListingPublication = vi.fn();
const createAndPublishListing = vi.fn();
// El cobro ya no lo hace el cliente: desde la migración 0091 ocurre dentro de
// `publish_listing`, a la que llama `finalizeListingPublication`.
vi.mock("@/lib/publish", () => ({
  finalizeListingPublication: (...a: unknown[]) => finalizeListingPublication(...a),
  createAndPublishListing: (...a: unknown[]) => createAndPublishListing(...a),
  saveListingDraft: vi.fn(),
  SaldoInsuficiente: class SaldoInsuficiente extends Error {
    listingId?: string;
  },
}));

const verifyDocument = vi.fn();
vi.mock("@/lib/verifyDoc", async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  verifyDocument: (...a: unknown[]) => verifyDocument(...a),
}));

vi.mock("@/lib/promotions", async (orig) => {
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return { ...actual, fetchActivePromotions: vi.fn().mockResolvedValue([]) };
});
// El fetch real siempre devuelve un PricingSettings (cae a loadSettings si la BD
// no responde). Devolver undefined aquí reventaba BuyCreditsModal por un fallo
// del mock, no del componente.
vi.mock("@/lib/pricingRemote", () => ({
  fetchPricingSettings: vi.fn(async () => (await import("@/lib/pricing")).loadSettings()),
}));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) } },
}));

const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => toast(...a) }));

// Lo que el borrador tiene SUBIDO, que no es lo mismo que lo que contrató.
const contarAdjuntosDelAviso = vi.fn();
vi.mock("@/lib/listings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/listings")>()),
  contarAdjuntosDelAviso: (...a: unknown[]) => contarAdjuntosDelAviso(...a),
}));

import { PublishDraftDialog } from "@/components/PublishDraftDialog";
import type { MyListing } from "@/lib/listings";

// Un borrador COMPLETO: desde que publicar exige lo mismo que el formulario,
// uno sin ubicación en el mapa ya no llega a cobrarse (ver los tests del final).
const DRAFT = {
  id: "L-DRAFT", title: "Casa bonita", description: "d", price: 100, currency: "PEN",
  category: "inmuebles", location: "Lima", lat: -12.04, lng: -77.03, imageUrl: "x",
  date: "2026-07-08", featured: false, advertiser: "", views: 0,
  status: "draft", expiresAt: null, condition: "nuevo",
  planDurationDays: 7, planQuantity: 1, planExtras: {},
} as unknown as MyListing;

// 1 aviso × 7 días con la matriz por defecto: 16.14 soles = 16.14 créditos.
const COST_CREDITS = 16.14;

const onPublished = vi.fn();
const onClose = vi.fn();

const renderDialog = (draft: MyListing | null = DRAFT) =>
  render(
    <PublishDraftDialog draft={draft} email="test@correo.com" fallbackName="Test"
      onClose={onClose} onPublished={onPublished} />,
  );

const confirmIdentity = async () => {
  fireEvent.click(await screen.findByRole("button", { name: /persona natural/i }));
  fireEvent.change(screen.getByPlaceholderText("12345678"), { target: { value: "12345678" } });
  await screen.findByText("JUAN PEREZ");
  fireEvent.click(screen.getByRole("button", { name: /confirmar y continuar/i }));
};

beforeEach(() => {
  vi.clearAllMocks();
  getCreditBalance.mockResolvedValue(1000);
  verifyDocument.mockResolvedValue({ ok: true, nombre: "JUAN PEREZ", data: {} });
  finalizeListingPublication.mockResolvedValue({ published: true });
  contarAdjuntosDelAviso.mockResolvedValue({ imagenesExtra: 0, tienePdf: false, videos: 0 });
});

describe("PublishDraftDialog — publicar un borrador guardado", () => {
  it("muestra el plan guardado (7 días) y el costo en S/", async () => {
    renderDialog();
    await screen.findByText("Casa bonita");
    await screen.findAllByText(`S/ ${COST_CREDITS}`);
    expect(screen.getByRole("button", { name: new RegExp(`Publicar por S/ ${COST_CREDITS}`) })).toBeTruthy();
  });

  it("exige identidad antes de cobrar: pulsar Publicar abre el cuadro y no cobra", async () => {
    renderDialog();
    await screen.findAllByText(`S/ ${COST_CREDITS}`);

    fireEvent.click(screen.getByRole("button", { name: /publicar por/i }));

    await screen.findByText(/verifica tu identidad/i);
    expect(finalizeListingPublication).not.toHaveBeenCalled();
  });

  it("tras confirmar identidad: cobra y ACTIVA el aviso existente, sin recrearlo", async () => {
    renderDialog();
    await screen.findAllByText(`S/ ${COST_CREDITS}`);
    fireEvent.click(screen.getByRole("button", { name: /publicar por/i }));
    await confirmIdentity();

    await waitFor(() => expect(finalizeListingPublication).toHaveBeenCalledTimes(1));
    expect(finalizeListingPublication).toHaveBeenCalledWith("L-DRAFT", expect.objectContaining({
      duration: 7, total: COST_CREDITS, docType: "dni", docNumber: "12345678", advertiserName: "JUAN PEREZ",
    }));

    // Clave: NO se crea un aviso nuevo.
    expect(createAndPublishListing).not.toHaveBeenCalled();
    await waitFor(() => expect(onPublished).toHaveBeenCalled());
  });

  it("RESPETA la duración guardada en el borrador (90 días), no un valor por defecto", async () => {
    const draft90 = { ...DRAFT, planDurationDays: 90 } as unknown as MyListing;
    // Saldo holgado para que 90 días (S/ 113.49) no abra el configurador de compra.
    getCreditBalance.mockResolvedValue(1000);
    renderDialog(draft90);
    await screen.findAllByText("S/ 113.49");
    fireEvent.click(screen.getByRole("button", { name: /publicar por/i }));
    await confirmIdentity();

    await waitFor(() => expect(finalizeListingPublication).toHaveBeenCalledTimes(1));
    // Publica por 90 días y con el costo de 90 (S/ 113.49), no el de 7.
    expect(finalizeListingPublication).toHaveBeenCalledWith(
      "L-DRAFT", expect.objectContaining({ duration: 90, total: 113.49 }),
    );
  });

  it("DNI falso: no cobra ni publica", async () => {
    verifyDocument.mockResolvedValue({ ok: false, error: "No se encontró el documento." });
    renderDialog();
    await screen.findAllByText(`S/ ${COST_CREDITS}`);
    fireEvent.click(screen.getByRole("button", { name: /publicar por/i }));

    fireEvent.click(await screen.findByRole("button", { name: /persona natural/i }));
    fireEvent.change(screen.getByPlaceholderText("12345678"), { target: { value: "12345678" } });
    await screen.findByText(/no se encontró el documento/i);

    expect(screen.getByRole("button", { name: /confirmar y continuar/i })).toBeDisabled();
    expect(finalizeListingPublication).not.toHaveBeenCalled();
  });

  it("sin saldo: ofrece pagar el aviso en el acto y no cobra nada todavía", async () => {
    getCreditBalance.mockResolvedValue(0);
    renderDialog();
    await screen.findAllByText(`S/ ${COST_CREDITS}`);

    const btn = await screen.findByRole("button", { name: /comprar saldo/i });
    fireEvent.click(btn);

    // Se cobra este aviso, no un paquete de saldo que el usuario deba armar.
    await screen.findByText(/a pagar ahora/i);
    expect(screen.getByRole("button", { name: /pagar y publicar/i })).toBeTruthy();
    expect(screen.queryByText(/saldo a comprar/i)).toBeNull();
    expect(finalizeListingPublication).not.toHaveBeenCalled();
  });

  it("si falta saldo, ni publica ni cobra, y ofrece comprar", async () => {
    // El saldo pudo cambiar entre que se abrió el diálogo y se confirmó. La
    // base de datos deshace la operación entera, así que el borrador queda
    // intacto: antes el aviso podía quedar activo sin haberse cobrado.
    const { SaldoInsuficiente } = await import("@/lib/publish");
    finalizeListingPublication.mockRejectedValue(new SaldoInsuficiente("Tu saldo no alcanza."));
    renderDialog();
    await screen.findAllByText(`S/ ${COST_CREDITS}`);
    fireEvent.click(screen.getByRole("button", { name: /publicar por/i }));
    await confirmIdentity();

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Te falta saldo" })));
    expect(onPublished).not.toHaveBeenCalled();
  });

  it("si el aviso no se activa, lo dice en vez de fingir éxito", async () => {
    finalizeListingPublication.mockResolvedValue({ published: false });
    renderDialog();
    await screen.findAllByText(`S/ ${COST_CREDITS}`);
    fireEvent.click(screen.getByRole("button", { name: /publicar por/i }));
    await confirmIdentity();

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "El aviso no se activó" })));
    expect(onPublished).not.toHaveBeenCalled();
  });

  /**
   * Publicar desde borradores se saltaba las reglas del formulario: cobraba y
   * sacaba al público avisos sin descripción, y cobraba adicionales que el
   * usuario había contratado pero nunca llegó a subir.
   */
  describe("no cobra un aviso que aún no está listo", () => {
    const publicar = async () => {
      await screen.findByText("Casa bonita");
      fireEvent.click(await screen.findByRole("button", { name: /^publicar/i }));
      await waitFor(() => expect(toast).toHaveBeenCalled());
    };

    it("sin descripción no cobra: lleva a completar el aviso", async () => {
      const onEditar = vi.fn();
      render(
        <PublishDraftDialog
          draft={{ ...DRAFT, description: "" } as MyListing}
          email="a@b.com" fallbackName="Ana"
          onClose={onClose} onPublished={onPublished} onEditar={onEditar}
        />,
      );
      await publicar();

      expect(finalizeListingPublication).not.toHaveBeenCalled();
      expect(onEditar).toHaveBeenCalledWith(expect.objectContaining({ id: "L-DRAFT" }), "descripcion");
    });

    it("sin ubicación tampoco", async () => {
      const onEditar = vi.fn();
      render(
        <PublishDraftDialog
          draft={{ ...DRAFT, lat: null, lng: null } as MyListing}
          email="a@b.com" fallbackName="Ana"
          onClose={onClose} onPublished={onPublished} onEditar={onEditar}
        />,
      );
      await publicar();

      expect(finalizeListingPublication).not.toHaveBeenCalled();
      expect(onEditar).toHaveBeenCalledWith(expect.anything(), "ubicacion");
    });

    it("con 3 videos contratados y ninguno subido no cobra", async () => {
      renderDialog({ ...DRAFT, planExtras: { video20: 3 } } as MyListing);
      await publicar();

      expect(finalizeListingPublication).not.toHaveBeenCalled();
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: expect.stringMatching(/falta subir/i) }),
      );
    });

    it("con los videos ya subidos sí publica", async () => {
      contarAdjuntosDelAviso.mockResolvedValue({ imagenesExtra: 0, tienePdf: false, videos: 3 });
      renderDialog({ ...DRAFT, planExtras: { video20: 3 } } as MyListing);
      await screen.findByText("Casa bonita");
      fireEvent.click(await screen.findByRole("button", { name: /^publicar/i }));

      // Llega al paso siguiente (identidad), que es lo que prueba que no se
      // quedó parado en la comprobación.
      expect(await screen.findByText(/verifica tu identidad/i)).toBeInTheDocument();
    });
  });
});