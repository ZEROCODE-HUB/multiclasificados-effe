import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PagoManualPanel } from "@/components/PagoManualPanel";

const confirmar = vi.fn().mockResolvedValue(undefined);
const abrirVoucher = vi.fn().mockReturnValue(true);
const toast = vi.fn();

vi.mock("@/lib/pagoManual", async () => {
  const real = await vi.importActual<typeof import("@/lib/pagoManual")>("@/lib/pagoManual");
  return {
    ...real,
    confirmarPagoManual: (...a: unknown[]) => confirmar(...a),
    abrirVoucherEnWhatsApp: (...a: unknown[]) => abrirVoucher(...a),
  };
});
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => toast(...a) }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: vi.fn() } }));
vi.mock("@/lib/share", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/share")>()),
  abrirWhatsAppAparte: vi.fn().mockReturnValue(true),
}));

const props = {
  orderId: "3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
  medio: "yape" as const,
  monto: 16.14,
  cuentas: [{ metodo: "yape" as const, numero: "999888777", banco: "BCP", titular: "eFFe SAC", qr: "" }],
  whatsapp: "51999888777",
  mensaje: "Hola, ya pagué",
  onListo: vi.fn(),
};

describe("pantalla de pago con Yape/Plin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    confirmar.mockResolvedValue(undefined);
    abrirVoucher.mockReturnValue(true);
  });

  it("enseña el importe y la cuenta a la que hay que transferir", () => {
    render(<PagoManualPanel {...props} />);
    expect(screen.getByText("S/ 16.14")).toBeInTheDocument();
    expect(screen.getByText("999888777")).toBeInTheDocument();
    expect(screen.getByText(/eFFe SAC/)).toBeInTheDocument();
  });

  it("dice que el aviso se publica solo, que es lo que hay que entender", () => {
    render(<PagoManualPanel {...props} publicaAviso />);
    expect(screen.getByText(/tu aviso se publica solo/i)).toBeInTheDocument();
  });

  it("en una recarga habla del saldo, no de ningún aviso", () => {
    render(<PagoManualPanel {...props} />);
    expect(screen.getByText(/el saldo entra en tu cuenta/i)).toBeInTheDocument();
    expect(screen.queryByText(/aviso se publica/i)).not.toBeInTheDocument();
  });

  it("abre WhatsApp en otra pestaña y marca el pago", async () => {
    const onListo = vi.fn();
    render(<PagoManualPanel {...props} onListo={onListo} />);

    fireEvent.click(screen.getByRole("button", { name: /ya pagué/i }));

    // La pestaña se abre PRIMERO y dentro del clic: después de un await, el
    // navegador móvil la bloquea por no venir de un gesto del usuario.
    expect(abrirVoucher).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: props.orderId, medio: "yape", monto: 16.14, whatsapp: "51999888777" }),
    );
    await waitFor(() => expect(confirmar).toHaveBeenCalledWith({ orderId: props.orderId }));
    await waitFor(() => expect(onListo).toHaveBeenCalled());
  });

  it("si la marca falla igual sigue: el pago ya está en la bandeja", async () => {
    // La orden existe desde que eligió Yape; lo único que se pierde es el orden
    // de la lista del administrador. Cortarle el paso por eso sería peor.
    confirmar.mockRejectedValueOnce(new Error("sin conexión"));
    const onListo = vi.fn();
    render(<PagoManualPanel {...props} onListo={onListo} />);

    fireEvent.click(screen.getByRole("button", { name: /ya pagué/i }));

    await waitFor(() => expect(onListo).toHaveBeenCalled());
    expect(abrirVoucher).toHaveBeenCalled();
  });

  it("si el navegador bloquea la ventana, se queda con el enlace a mano", async () => {
    abrirVoucher.mockReturnValue(false);
    const onListo = vi.fn();
    render(<PagoManualPanel {...props} onListo={onListo} />);

    fireEvent.click(screen.getByRole("button", { name: /ya pagué/i }));

    // No se le lleva a ningún lado: todavía tiene que mandarnos el voucher.
    await waitFor(() => expect(screen.getByText(/bloqueó la ventana/i)).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /ábrelo desde aquí/i })).toBeInTheDocument();
    expect(onListo).not.toHaveBeenCalled();
  });

  it("al renovar no dice que se publica: el aviso ya está fuera", () => {
    // Decirle "tu aviso se publica solo" a quien renueva le hace pensar que su
    // aviso se cayó. Lo que compra son días.
    render(<PagoManualPanel {...props} publicaAviso esRenovacion />);
    expect(screen.getByText(/suma sus días/i)).toBeInTheDocument();
    expect(screen.queryByText(/se publica solo/i)).not.toBeInTheDocument();
  });

  describe("cuando la cuenta tiene QR", () => {
    const conQr = {
      ...props,
      medio: "plin" as const,
      cuentas: [{
        metodo: "plin" as const, numero: "903375308", banco: "",
        titular: "eFFe SAC", qr: "https://cdn/qr-pagos/1.png",
      }],
    };

    it("enseña el QR y pide escanearlo, no teclear el número", () => {
      render(<PagoManualPanel {...conQr} />);
      const img = screen.getByRole("img", { name: /código qr/i });
      expect(img).toHaveAttribute("src", "https://cdn/qr-pagos/1.png");
      expect(screen.getByText(/escanea el qr/i)).toBeInTheDocument();
    });

    it("el número sigue estando, pero como alternativa", () => {
      render(<PagoManualPanel {...conQr} />);
      expect(screen.getByText("903375308")).toBeInTheDocument();
      expect(screen.getByText(/o paga a este número/i)).toBeInTheDocument();
    });

    it("una cuenta solo con QR no deja un hueco donde iba el número", () => {
      render(<PagoManualPanel {...conQr} cuentas={[{ ...conQr.cuentas[0], numero: "" }]} />);
      expect(screen.getByRole("img", { name: /código qr/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /copiar/i })).not.toBeInTheDocument();
    });

    it("el QR no se difiere: en el diálogo se quedaba sin cargar", () => {
      // Con loading="lazy" el navegador no llegaba a pedir la imagen aunque
      // estuviera a la vista, y quedaba un hueco donde va el QR. Comprobado en
      // producción; jsdom no reproduce el atributo, así que se vigila aquí.
      render(<PagoManualPanel {...conQr} />);
      expect(screen.getByRole("img", { name: /código qr/i })).not.toHaveAttribute("loading", "lazy");
    });

    it("Plin se anuncia como QR/Plin", () => {
      render(<PagoManualPanel {...conQr} />);
      expect(screen.getByText(/paga con qr\/plin/i)).toBeInTheDocument();
    });
  });
});
