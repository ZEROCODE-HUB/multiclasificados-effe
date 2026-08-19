import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  normalizarConfig, medioDisponible, mediosDisponibles,
  mensajeDeVoucher, codigoDePago, CONFIG_VACIA,
} from "@/lib/pagoManual";

vi.mock("@/lib/supabase", () => ({ supabase: { rpc: vi.fn() } }));
vi.mock("@/lib/share", () => ({ abrirWhatsApp: vi.fn() }));

const cuenta = (metodo: string, numero = "999888777") =>
  ({ metodo, numero, banco: "BCP", titular: "eFFe SAC" });

describe("configuración de Yape/Plin", () => {
  beforeEach(() => vi.clearAllMocks());

  it("normaliza lo que escribió una persona a mano", () => {
    const cfg = normalizarConfig({
      activo: true,
      cuentas: [
        { metodo: "YAPE", numero: "  999 888 777 ", banco: " BCP ", titular: " eFFe " },
        { metodo: "plin", numero: "911222333", banco: "", titular: "eFFe" },
      ],
      whatsapp: "  51999888777 ",
      mensaje: " Hola ",
    });
    expect(cfg.activo).toBe(true);
    expect(cfg.cuentas[0].metodo).toBe("yape");
    expect(cfg.cuentas[0].numero).toBe("999 888 777");
    expect(cfg.whatsapp).toBe("51999888777");
    expect(cfg.mensaje).toBe("Hola");
  });

  it("descarta las cuentas sin número: no llevan a ningún sitio", () => {
    const cfg = normalizarConfig({ activo: true, cuentas: [cuenta("yape", "  ")], whatsapp: "51999" });
    expect(cfg.cuentas).toHaveLength(0);
  });

  it("un ajuste vacío o roto no revienta", () => {
    expect(normalizarConfig(null)).toEqual(CONFIG_VACIA);
    expect(normalizarConfig({ cuentas: "no es una lista" }).cuentas).toEqual([]);
  });

  describe("cuándo se puede ofrecer un medio", () => {
    it("apagado, no se ofrece nada aunque haya cuentas", () => {
      const cfg = normalizarConfig({ activo: false, cuentas: [cuenta("yape")], whatsapp: "51999" });
      expect(mediosDisponibles(cfg)).toEqual([]);
    });

    it("sin WhatsApp tampoco: el voucher no llegaría a ningún lado", () => {
      const cfg = normalizarConfig({ activo: true, cuentas: [cuenta("yape")], whatsapp: "" });
      expect(mediosDisponibles(cfg)).toEqual([]);
    });

    it("solo se ofrece el medio que tiene cuenta", () => {
      const cfg = normalizarConfig({ activo: true, cuentas: [cuenta("yape")], whatsapp: "51999888777" });
      expect(medioDisponible(cfg, "yape")).toBe(true);
      expect(medioDisponible(cfg, "plin")).toBe(false);
      expect(mediosDisponibles(cfg)).toEqual(["yape"]);
    });

    it("con las dos cuentas se ofrecen las dos", () => {
      const cfg = normalizarConfig({
        activo: true,
        cuentas: [cuenta("yape"), cuenta("plin", "911222333")],
        whatsapp: "51999888777",
      });
      expect(mediosDisponibles(cfg)).toEqual(["yape", "plin"]);
    });
  });
});

describe("el mensaje que llega por WhatsApp", () => {
  const orderId = "3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

  it("lleva medio, importe y el código con el que encontrar el pago", () => {
    const texto = mensajeDeVoucher({
      plantilla: "Hola, ya pagué",
      medio: "yape",
      monto: 16.14,
      orderId,
      nombre: "Ana Pérez",
    });
    expect(texto).toContain("Hola, ya pagué");
    expect(texto).toContain("Medio: Yape");
    expect(texto).toContain("S/ 16.14");
    expect(texto).toContain(codigoDePago(orderId));
    expect(texto).toContain("Ana Pérez");
  });

  it("sin plantilla configurada sigue diciendo algo con sentido", () => {
    const texto = mensajeDeVoucher({ plantilla: "   ", medio: "plin", monto: 50, orderId });
    expect(texto.startsWith("Hola")).toBe(true);
    expect(texto).toContain("Medio: Plin");
  });

  it("el código es corto y estable: se teclea desde el móvil", () => {
    const codigo = codigoDePago(orderId);
    expect(codigo).toHaveLength(8);
    expect(codigo).toBe(codigo.toUpperCase());
    expect(codigo).not.toContain("-");
    expect(codigoDePago(orderId)).toBe(codigo);
  });
});
