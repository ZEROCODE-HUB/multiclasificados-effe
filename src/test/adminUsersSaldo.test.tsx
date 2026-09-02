import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { prepararDom } from "./domPolyfills";

// Gestión de usuarios pasa de "Otorgar saldo" a un cuadro de saldo completo:
// enseña cuánto tiene, permite otorgar o devolver, y exige un motivo. Antes solo
// se podía sumar, y sin explicación.
beforeEach(prepararDom);

const ajustarSaldo = vi.fn();
const saldoDeUsuario = vi.fn();
vi.mock("@/lib/admin", () => ({
  fetchAdminUsers: vi.fn().mockResolvedValue({
    data: [{
      id: "24d479cf-52ce-40f4-b634-886eae34a7d0",
      full_name: "Ana García", email: "ana@correo.com",
      status: "active", verified: true, roles: "anunciante",
      listings_count: 0, created_at: "2026-01-01T00:00:00Z",
    }],
    count: 1,
  }),
  setUserStatus: vi.fn(), verifyUser: vi.fn(), deleteUser: vi.fn(), setUserRole: vi.fn(),
  ajustarSaldo: (...a: unknown[]) => ajustarSaldo(...a),
  saldoDeUsuario: (...a: unknown[]) => saldoDeUsuario(...a),
  // La lista real, no una inventada: si se añade un medio en `admin.ts` y aquí
  // no, la prueba seguiría en verde con un desplegable que no existe.
  MEDIOS_DE_COBRO: [
    { value: "transferencia", label: "Transferencia bancaria" },
    { value: "deposito", label: "Depósito en cuenta" },
    { value: "yape", label: "Yape" },
    { value: "plin", label: "Plin" },
    { value: "efectivo", label: "Efectivo" },
    { value: "otro", label: "Otro" },
  ],
}));

vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ can: () => true }) }));
vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: vi.fn() } } }));
const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => toast(...a) }));

import AdminUsers from "@/pages/admin/AdminUsers";

const abrirSaldo = async () => {
  render(<AdminUsers role="admin" />);
  await screen.findAllByText("Ana García");
  fireEvent.click(screen.getAllByTitle("Saldo")[0]);
  await screen.findByText(/Saldo de Ana García/);
};

const escribir = (placeholder: string | RegExp, valor: string) =>
  fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value: valor } });

beforeEach(() => {
  ajustarSaldo.mockReset().mockResolvedValue({ saldo_anterior: 100, saldo: 70, delta: -30 });
  saldoDeUsuario.mockReset().mockResolvedValue(100);
  toast.mockClear();
});

describe("AdminUsers — cuadro de saldo", () => {
  it("muestra el saldo actual del usuario al abrirlo", async () => {
    await abrirSaldo();
    await waitFor(() => expect(saldoDeUsuario).toHaveBeenCalledWith("24d479cf-52ce-40f4-b634-886eae34a7d0"));
    await screen.findByText("S/ 100.00");
  });

  it("sin motivo no deja confirmar: es dinero y tiene que quedar explicado", async () => {
    await abrirSaldo();
    escribir("Ej. 100", "50");
    const boton = screen.getByRole("button", { name: /^Otorgar S\// });
    expect(boton).toBeDisabled();

    escribir(/Devolución acordada/, "abono duplicado");
    await waitFor(() => expect(boton).not.toBeDisabled());
  });

  it("devuelve saldo con signo negativo y anticipa cómo queda", async () => {
    await abrirSaldo();
    await screen.findByText("S/ 100.00");

    fireEvent.click(screen.getByRole("button", { name: "Quitar" }));
    escribir("Ej. 100", "30");
    escribir(/Devolución acordada/, "devolucion acordada");
    await screen.findByText(/Quedará en S\/ 70.00/);

    fireEvent.click(screen.getByRole("button", { name: /^Quitar S\// }));
    // El cuarto argumento es el medio de cobro: `null` porque no se marcó que
    // hubiera dinero, así que esto NO cuenta como ingreso (migración 0143).
    await waitFor(() => expect(ajustarSaldo).toHaveBeenCalledWith(
      "24d479cf-52ce-40f4-b634-886eae34a7d0", -30, "devolucion acordada", null,
    ));
  });

  it("no deja retirar más de lo que hay", async () => {
    await abrirSaldo();
    await screen.findByText("S/ 100.00");

    fireEvent.click(screen.getByRole("button", { name: "Quitar" }));
    escribir("Ej. 100", "500");
    escribir(/Devolución acordada/, "me equivoqué");

    await screen.findByText(/No alcanza: el usuario solo tiene S\/ 100.00/);
    expect(screen.getByRole("button", { name: /^Quitar S\// })).toBeDisabled();
    expect(ajustarSaldo).not.toHaveBeenCalled();
  });

  it("otorgar manda el delta en positivo", async () => {
    ajustarSaldo.mockResolvedValue({ saldo_anterior: 100, saldo: 150, delta: 50 });
    await abrirSaldo();
    escribir("Ej. 100", "50");
    escribir(/Devolución acordada/, "bono de bienvenida");
    fireEvent.click(screen.getByRole("button", { name: /^Otorgar S\// }));
    await waitFor(() => expect(ajustarSaldo).toHaveBeenCalledWith(
      "24d479cf-52ce-40f4-b634-886eae34a7d0", 50, "bono de bienvenida", null,
    ));
  });
});

describe("AdminUsers — marcar que hubo dinero (punto de Ingresos)", () => {
  /**
   * LO QUE REPORTÓ EL CLIENTE: "acabo de otorgar saldo a un usuario, y no se
   * aumentó el monto del gráfico".
   *
   * Detrás hay algo real —el equipo usa "otorgar saldo" para registrar cobros
   * por fuera— pero no se pueden contar todos: en producción hay 188.911
   * créditos otorgados en agosto con motivos como "Prueba de QA". Contarlos
   * llevaría "Ingresos" de S/ 24.732 a más de S/ 226.000.
   *
   * Por eso se pregunta. Y por eso el valor por defecto importa.
   */
  it("empieza APAGADO: lo excepcional es el cobro por fuera", async () => {
    // Un valor por defecto que infla los ingresos es de los que nadie revisa.
    await abrirSaldo();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByText(/no toca los Ingresos/i)).toBeInTheDocument();
  });

  it("sin marcar manda `null` y no cuenta como ingreso", async () => {
    await abrirSaldo();
    escribir("Ej. 100", "300");
    escribir(/Devolución acordada/, "cortesía");
    fireEvent.click(screen.getByRole("button", { name: /^Otorgar S\// }));
    await waitFor(() => expect(ajustarSaldo).toHaveBeenCalledWith(
      expect.any(String), 300, "cortesía", null,
    ));
  });

  it("marcándolo manda el medio, y ESO es lo que suma", async () => {
    await abrirSaldo();
    escribir("Ej. 100", "300");
    escribir(/Devolución acordada/, "transferencia del cliente");
    fireEvent.click(screen.getByRole("checkbox"));

    fireEvent.click(screen.getByRole("button", { name: /^Otorgar S\// }));
    await waitFor(() => expect(ajustarSaldo).toHaveBeenCalledWith(
      expect.any(String), 300, "transferencia del cliente", "transferencia",
    ));
  });

  it("al quitar saldo, el texto habla de devolver y no de cobrar", async () => {
    // Quitar saldo marcado RESTA de los ingresos. Decir "entró dinero" ahí
    // sería justo lo contrario de lo que pasa.
    await abrirSaldo();
    fireEvent.click(screen.getByRole("button", { name: "Quitar" }));
    expect(screen.getByText(/Le devolví dinero por este saldo/i)).toBeInTheDocument();
  });

  it("el desplegable de medio solo sale cuando se marca", async () => {
    await abrirSaldo();
    expect(screen.queryByText(/¿Por qué medio\?/)).toBeNull();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByText(/¿Por qué medio\?/)).toBeInTheDocument();
  });
});
