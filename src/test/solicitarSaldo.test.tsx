import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { prepararDom } from "./domPolyfills";
import { SolicitarSaldoDialog } from "@/components/SolicitarSaldoDialog";
import {
  CORREO_SOPORTE, enlaceSolicitudDeSaldo, enlaceDevolucionSaldo,
} from "@/lib/soporte";

/**
 * "Solicitar saldo": el anunciante pide al equipo que se lo carguen a mano.
 *
 * Pendiente 11 de la auditoría, el que el cliente marcó con interrogación porque
 * no sabía si estaba. No estaba: lo que sí existía era "Solicitar devolución",
 * que es el movimiento CONTRARIO —sacar el dinero que ya tiene dentro— y además
 * vivía enterrado dentro del cuadro de comprar.
 */
const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => toast(...a) }));

beforeEach(() => { prepararDom(); vi.clearAllMocks(); });

const abrir = (props = {}) =>
  render(
    <SolicitarSaldoDialog
      open
      onOpenChange={vi.fn()}
      nombre="Ana Quispe"
      correo="ana@ejemplo.pe"
      saldo={42.5}
      {...props}
    />,
  );

describe("el correo al que escribe", () => {
  it("es el buzón que de verdad recibe correo", () => {
    // `soporte@coleffe.com` NO existe en cPanel: un botón que escribe a una
    // dirección que rebota es peor que no tener botón.
    expect(CORREO_SOPORTE).toBe("avisos@coleffe.com");
    expect(enlaceSolicitudDeSaldo()).toContain("mailto:avisos@coleffe.com");
  });

  it("pedir saldo y pedir la devolución son cosas distintas", () => {
    // Son las dos direcciones del mismo dinero. Si el asunto fuera el mismo,
    // soporte no sabría si tiene que cargar o devolver.
    const pedir = decodeURIComponent(enlaceSolicitudDeSaldo());
    const devolver = decodeURIComponent(enlaceDevolucionSaldo());
    expect(pedir).toContain("Solicitud de recarga de saldo");
    expect(devolver).toContain("Solicitud de devolución de saldo");
    expect(pedir).not.toBe(devolver);
  });
});

describe("lo que lleva escrito el correo", () => {
  const cuerpo = (d?: Parameters<typeof enlaceSolicitudDeSaldo>[0]) =>
    decodeURIComponent(enlaceSolicitudDeSaldo(d));

  it("va con quién escribe y cuánto tiene: soporte no tiene que buscarlo", () => {
    const c = cuerpo({ nombre: "Ana Quispe", correo: "ana@ejemplo.pe", saldo: 42.5 });
    expect(c).toContain("Ana Quispe");
    expect(c).toContain("ana@ejemplo.pe");
    expect(c).toContain("S/ 42.50");
  });

  it("deja escrito lo que hay que preguntar de todas formas", () => {
    // Sin esto, cada solicitud son tres correos de ida y vuelta antes de poder
    // hacer nada.
    const c = cuerpo();
    expect(c).toContain("Monto que necesito recargar");
    expect(c).toContain("Forma de pago");
    expect(c).toContain("factura");
  });

  it("sin datos no inventa ninguno: deja el hueco a la vista", () => {
    const c = cuerpo();
    expect(c).toContain("(completar)");
    expect(c).toContain("S/ 0.00");
  });

  it("un saldo que no es un número no rompe el correo", () => {
    expect(cuerpo({ saldo: Number.NaN })).toContain("S/ 0.00");
    expect(cuerpo({ saldo: null })).toContain("S/ 0.00");
  });
});

describe("el cuadro de diálogo", () => {
  it("enseña la dirección, no solo un botón que puede no hacer nada", async () => {
    // Un `mailto:` falla EN SILENCIO si no hay cliente de correo configurado, y
    // la persona se queda creyendo que escribió. Por eso la dirección está a la
    // vista y se puede copiar: nadie se queda sin poder escribir.
    abrir();
    expect(await screen.findByText(CORREO_SOPORTE)).toBeInTheDocument();
  });

  it("el botón abre el correo con todo dentro", async () => {
    abrir();
    const enlace = await screen.findByRole("link", { name: /escribir a soporte/i });
    const href = decodeURIComponent(enlace.getAttribute("href") ?? "");
    expect(href).toContain("mailto:avisos@coleffe.com");
    expect(href).toContain("Ana Quispe");
    expect(href).toContain("S/ 42.50");
  });

  it("copiar deja la dirección en el portapapeles", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    abrir();
    fireEvent.click(await screen.findByRole("button", { name: /copiar/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(CORREO_SOPORTE));
    expect(await screen.findByText(/copiado/i)).toBeInTheDocument();
  });

  it("sin portapapeles no se rompe: se dice la dirección y ya", async () => {
    // Contexto no seguro o WebView antiguo. La dirección sigue en pantalla.
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("sin permiso")) },
    });
    abrir();
    fireEvent.click(await screen.findByRole("button", { name: /copiar/i }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: CORREO_SOPORTE })),
    );
  });

  it("dice para qué sirve, que no es lo mismo que comprar saldo", async () => {
    abrir();
    expect(await screen.findByText(/transferencia o con factura/i)).toBeInTheDocument();
  });
});
