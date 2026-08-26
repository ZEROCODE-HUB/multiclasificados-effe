import { describe, it, expect, vi, beforeEach } from "vitest";

// Captura los args del RPC y controla los datos devueltos.
const state: { args: Record<string, unknown> | null; data: unknown[] } = { args: null, data: [] };

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: async (_fn: string, args: Record<string, unknown>) => {
      state.args = args;
      return { data: state.data, error: null };
    },
    auth: { getUser: async () => ({ data: { user: null } }) },
  },
}));

import { fetchAdminCreditTransactions, metodoDePago, nombreDeTipo, CREDIT_TX_PAGE_SIZE } from "@/lib/admin";

beforeEach(() => { state.args = null; state.data = []; });

describe("fetchAdminCreditTransactions (EFFE-054)", () => {
  it("envía search/tipo/from/to y calcula el offset por página", async () => {
    await fetchAdminCreditTransactions({ search: "ana", type: "spend", from: "2026-07-01", to: "2026-07-31", page: 3 });
    expect(state.args).toMatchObject({
      p_search: "ana", p_type: "spend", p_from: "2026-07-01", p_to: "2026-07-31",
      p_limit: CREDIT_TX_PAGE_SIZE, p_offset: (3 - 1) * CREDIT_TX_PAGE_SIZE,
    });
  });

  it("valores vacíos viajan como null y offset 0", async () => {
    await fetchAdminCreditTransactions({});
    expect(state.args).toMatchObject({ p_search: null, p_type: null, p_from: null, p_to: null, p_offset: 0 });
  });

  it("mapea filas y lee total_count de la primera fila", async () => {
    state.data = [{
      id: "t1", user_id: "u1", full_name: "Ana", email: "a@x.com",
      type: "purchase", credits: "100", description: "Compra", listing_title: null,
      created_at: "2026-07-20T10:00:00Z", total_count: "42",
    }];
    const res = await fetchAdminCreditTransactions({});
    expect(res.total).toBe(42);
    expect(res.data).toHaveLength(1);
    expect(res.data[0]).toMatchObject({ id: "t1", full_name: "Ana", credits: 100, type: "purchase" });
  });

  // El reporte exportaba `tx.data`, o sea las 20 filas de la página en pantalla,
  // y el archivo salía sin decir que faltaba el resto. Lo reportó el cliente en
  // la auditoría de agosto: para exportar entero hay que poder pedir más de una
  // página en una sola llamada.
  it("acepta un tamaño de página propio, para exportar todo lo filtrado", async () => {
    await fetchAdminCreditTransactions({ search: "ana", pageSize: 5000 });
    expect(state.args).toMatchObject({ p_search: "ana", p_limit: 5000, p_offset: 0 });
  });

  it("sin pageSize sigue paginando de 20 en 20 (la pantalla no cambia)", async () => {
    await fetchAdminCreditTransactions({ page: 2 });
    expect(state.args).toMatchObject({ p_limit: CREDIT_TX_PAGE_SIZE, p_offset: CREDIT_TX_PAGE_SIZE });
  });

  // Pedido en la auditoria de agosto (anexo B, 05): con tres vias de cobro
  // conviviendo, un reporte que no dice por donde entro el dinero obliga a
  // cruzar a mano con la bandeja de pagos manuales para cuadrar cualquier dia.
  describe("el modo de pago", () => {
    it("traduce el proveedor al nombre que ve el comprador", () => {
      expect(metodoDePago("izipay", "purchase").metodo).toBe("Tarjeta");
      expect(metodoDePago("yape", "purchase").metodo).toBe("Yape");
      // "QR/Plin" y no "Plin": es como se llama en la pantalla de pago, y si el
      // administrador lee otra cosa, cuadrar cuesta mas de lo que hace falta.
      expect(metodoDePago("plin", "purchase").metodo).toBe("QR/Plin");
    });

    it("un gasto se paga con el saldo, no con una tarjeta", () => {
      // Publicar o renovar sale del saldo ya cargado. Ahi "Saldo" es la
      // respuesta correcta, no un hueco del historial.
      const m = metodoDePago(null, "spend");
      expect(m.metodo).toBe("Saldo");
      expect(m.desconocido).toBe(false);
    });

    it("una compra sin dato SI es un hueco, y se marca aparte", () => {
      // Son las compras de antes de que se guardara el proveedor. Pintarlas
      // igual que un gasto esconderia justo lo que habria que mirar.
      const m = metodoDePago(null, "purchase");
      expect(m.metodo).toBe("Sin registrar");
      expect(m.desconocido).toBe(true);
    });

    it("el saldo otorgado a mano se distingue de un cobro real", () => {
      expect(metodoDePago("creditos", "purchase").metodo).toBe("Otorgado por admin");
    });

    it("un proveedor que no conocemos se enseña tal cual, no se oculta", () => {
      expect(metodoDePago("otro-banco", "purchase").metodo).toBe("otro-banco");
    });

    it("tolera mayusculas y espacios de la base", () => {
      expect(metodoDePago("  IZIPAY ", "purchase").metodo).toBe("Tarjeta");
    });

    // Descubierto mirando los datos reales al aplicar la 0123: existe un TERCER
    // tipo de movimiento, `refund`, que el reporte pintaba como "Gasto". La
    // migracion 0101 le dio tipo propio justamente para que NO contara como
    // gasto (inflaba lo "gastado" del usuario), y la pantalla lo colapsaba igual.
    describe("las devoluciones no son gastos", () => {
      it("se llaman por su nombre", () => {
        expect(nombreDeTipo("purchase")).toBe("Compra");
        expect(nombreDeTipo("spend")).toBe("Gasto");
        expect(nombreDeTipo("refund")).toBe("Devolucion");
      });

      it("y no se marcan como un hueco del historial", () => {
        // Una devolucion es saldo que sale, no dinero que entro por algun sitio:
        // "Sin registrar" la haria parecer un dato que falta.
        const m = metodoDePago(null, "refund");
        expect(m.metodo).toBe("Devolucion");
        expect(m.desconocido).toBe(false);
      });
    });

    it("viaja en cada fila del reporte", async () => {
      state.data = [{
        id: "t1", user_id: "u1", full_name: "Ana", email: "a@x.com",
        type: "purchase", credits: "100", description: "Compra",
        listing_title: null, payment_provider: "plin",
        created_at: "2026-07-20T10:00:00Z", total_count: "1",
      }];
      const res = await fetchAdminCreditTransactions({});
      expect(res.data[0]).toMatchObject({ metodo: "QR/Plin", metodoDesconocido: false });
    });
  });

  it("sin datos devuelve total 0", async () => {
    const res = await fetchAdminCreditTransactions({ page: 5 });
    expect(res).toEqual({ data: [], total: 0 });
  });
});
