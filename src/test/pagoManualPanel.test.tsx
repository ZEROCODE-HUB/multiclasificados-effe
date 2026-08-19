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
  cuentas: [{ metodo: "yape" as const, numero: "999888777", banco: "BCP", titular: "eFFe SAC" }],
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
});
