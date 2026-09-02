import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { prepararDom } from "./domPolyfills";
import { DevolucionSaldoDialog } from "@/components/DevolucionSaldoDialog";
import fs from "node:fs";
import path from "node:path";
import { CORREO_SOPORTE, cuerpoDevolucionSaldo, enlaceDevolucionSaldo } from "@/lib/soporte";

/**
 * "Solicitar devolución de saldo" desde "Mi saldo".
 *
 * Es el pendiente 11 de la auditoría, el que el cliente marcó con interrogación.
 * Y el motivo de la duda estaba justificado: el enlace EXISTÍA, pero enterrado
 * dentro del cuadro de "Comprar saldo" —había que abrir el flujo de compra para
 * dar con él— y se pidió en "Mi saldo", que es donde uno mira cuando piensa en
 * su dinero. Es el lado del usuario de lo que el administrador ya puede hacer
 * desde Gestión de Usuarios (pendiente 10, que estaba marcado OK).
 */
const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => toast(...a) }));

beforeEach(() => { prepararDom(); vi.clearAllMocks(); });

const abrir = (props = {}) =>
  render(
    <DevolucionSaldoDialog
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
    expect(enlaceDevolucionSaldo()).toContain("mailto:avisos@coleffe.com");
  });

  it("el asunto dice qué se pide, para no confundirlo con otra cosa", () => {
    expect(decodeURIComponent(enlaceDevolucionSaldo()))
      .toContain("Solicitud de devolución de saldo");
  });
});

describe("lo que lleva escrito el correo", () => {
  const cuerpo = (d?: Parameters<typeof enlaceDevolucionSaldo>[0]) =>
    decodeURIComponent(enlaceDevolucionSaldo(d));

  it("va con quién escribe y cuánto tiene: soporte no tiene que buscarlo", () => {
    const c = cuerpo({ nombre: "Ana Quispe", correo: "ana@ejemplo.pe", saldo: 42.5 });
    expect(c).toContain("Ana Quispe");
    expect(c).toContain("ana@ejemplo.pe");
    expect(c).toContain("S/ 42.50");
  });

  it("deja escrito lo que hay que preguntar de todas formas", () => {
    // Sin el monto, el motivo y la cuenta, cada solicitud son tres correos de
    // ida y vuelta antes de poder transferir nada.
    const c = cuerpo();
    expect(c).toContain("Monto a devolver");
    expect(c).toContain("Motivo");
    expect(c).toContain("CCI");
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
    // la persona se queda creyendo que escribió. Tratándose de dinero, que
    // nadie se quede sin poder escribir importa más de lo normal.
    abrir();
    expect(await screen.findByText(CORREO_SOPORTE)).toBeInTheDocument();
  });

  it("recuerda cuánto saldo tiene, que es lo que va a pedir", async () => {
    abrir();
    expect(await screen.findByText("S/ 42.50")).toBeInTheDocument();
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

  it("avisa de que no es automática: hay que verificar la cuenta", async () => {
    // Prometer una devolución inmediata y tardar tres días en revisarla es
    // ganarse un reclamo que no hacía falta.
    abrir();
    expect(await screen.findByText(/no es automática/i)).toBeInTheDocument();
  });
});

describe("el `mailto:` no puede fallar en silencio", () => {
  /**
   * LO QUE REPORTÓ EL CLIENTE: "ese botón no está llevando correctamente a
   * enviar el correo".
   *
   * Un `mailto:` sin cliente de correo configurado no falla: no hace NADA. No
   * hay evento, no hay error y no hay forma de detectarlo desde la página. La
   * persona pulsa, no pasa nada, y se queda creyendo que escribió. Tratándose
   * de una devolución de dinero, es lo peor que puede pasar.
   *
   * Por eso al pulsar se copia además el correo entero y se avisa.
   */
  const escribirDatos = { nombre: "Ana Quispe", correo: "ana@ejemplo.pe", saldo: 42.5 };

  it("al pulsar «Escribir a soporte» copia el mensaje completo", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    abrir();
    fireEvent.click(screen.getByRole("link", { name: /escribir a soporte/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copiado = writeText.mock.calls[0][0] as string;
    // Lo mismo que va dentro del mailto, no un resumen: quien lo pegue tiene
    // que poder mandarlo tal cual.
    expect(copiado).toBe(cuerpoDevolucionSaldo(escribirDatos));
    expect(copiado).toContain("Ana Quispe");
    expect(copiado).toContain("S/ 42.50");
    expect(copiado).toContain("Banco y número de cuenta (CCI)");
  });

  it("y lo dice, con la dirección a la que pegarlo", async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    abrir();
    fireEvent.click(screen.getByRole("link", { name: /escribir a soporte/i }));

    await waitFor(() => expect(toast).toHaveBeenCalled());
    const aviso = toast.mock.calls.at(-1)![0] as { description: string };
    expect(aviso.description).toContain(CORREO_SOPORTE);
  });

  it("sin portapapeles el aviso sale igual: no se traga el clic", async () => {
    // WebView antiguo o contexto no seguro. La dirección sigue a la vista en el
    // diálogo para teclearla.
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("nope")) } });
    abrir();
    fireEvent.click(screen.getByRole("link", { name: /escribir a soporte/i }));
    await waitFor(() => expect(toast).toHaveBeenCalled());
  });

  it("el enlace sigue siendo un `mailto:` de verdad", () => {
    // La copia es la RED, no el sustituto: quien tenga el correo configurado se
    // ahorra pegar nada.
    abrir();
    const enlace = screen.getByRole("link", { name: /escribir a soporte/i });
    expect(enlace.getAttribute("href")).toBe(enlaceDevolucionSaldo(escribirDatos));
  });
});

describe("ya no está en «Comprar saldo»", () => {
  it("el cuadro de comprar no lleva el enlace suelto", () => {
    // Estaba ahí como un `mailto:` pelado, SIN este diálogo detrás: o sea sin
    // la dirección copiable ni la red del portapapeles. Y había que abrir el
    // flujo de COMPRAR para encontrar cómo pedir que te DEVUELVAN.
    const modal = fs.readFileSync(
      path.resolve(__dirname, "../components/BuyCreditsModal.tsx"), "utf8",
    );
    expect(modal).not.toContain("enlaceDevolucionSaldo");
  });

  it("y sí está en el menú «Mi cuenta», en escritorio y en móvil", () => {
    const navbar = fs.readFileSync(
      path.resolve(__dirname, "../components/Navbar.tsx"), "utf8",
    );
    expect(navbar).toContain("DevolucionSaldoDialog");
    // Dos veces: el desplegable de escritorio y el menú de móvil. Dejarlo solo
    // arriba lo escondería de la mitad de la gente.
    // Tres apariciones: la definición y los dos sitios que la usan.
    expect(navbar.match(/abrirDevolucion/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });
});
