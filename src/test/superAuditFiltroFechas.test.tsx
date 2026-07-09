import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// El filtro de fechas del "Historial de acciones importantes" se resuelve en el
// servidor: cambiar Desde/Hasta tiene que volver a consultar, no recortar en
// memoria una página ya traída (el backend corta en 200 registros). Y lo que se
// descarga debe ser exactamente lo que el admin está viendo.

const fetchAuditLogs = vi.fn();
const exportExcel = vi.fn();

vi.mock("@/lib/admin", () => ({
  fetchAuditLogs: (...a: unknown[]) => fetchAuditLogs(...a),
}));
vi.mock("@/lib/exportReport", () => ({
  exportExcel: (...a: unknown[]) => exportExcel(...a),
}));

import SuperAudit from "@/pages/superadmin/SuperAudit";

const LOG = {
  id: "L-1", actor: "rosa@correo.com", action: "Cambió configuración",
  entity: "Configuración: diseño", ip: "190.12.0.1", time: "2026-07-09 12:00",
};

beforeEach(() => {
  vi.clearAllMocks();
  fetchAuditLogs.mockResolvedValue({ data: [LOG], real: true });
});

describe("SuperAudit — filtro por rango de fechas", () => {
  it("la primera carga no pide ningún rango", async () => {
    render(<SuperAudit />);
    await screen.findAllByText("rosa@correo.com");

    expect(fetchAuditLogs).toHaveBeenCalledTimes(1);
    expect(fetchAuditLogs).toHaveBeenCalledWith({ from: null, to: null });
  });

  it("elegir 'Desde' vuelve a consultar con ese extremo", async () => {
    render(<SuperAudit />);
    await screen.findAllByText("rosa@correo.com");

    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-07-01" } });

    await waitFor(() =>
      expect(fetchAuditLogs).toHaveBeenLastCalledWith({ from: "2026-07-01", to: null }),
    );
  });

  it("elegir ambos extremos consulta el rango completo", async () => {
    render(<SuperAudit />);
    await screen.findAllByText("rosa@correo.com");

    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-07-01" } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-07-09" } });

    await waitFor(() =>
      expect(fetchAuditLogs).toHaveBeenLastCalledWith({ from: "2026-07-01", to: "2026-07-09" }),
    );
  });

  it("los extremos se acotan entre sí para no armar un rango invertido", async () => {
    render(<SuperAudit />);
    await screen.findAllByText("rosa@correo.com");

    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-07-01" } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-07-09" } });

    expect(screen.getByLabelText("Hasta")).toHaveAttribute("min", "2026-07-01");
    expect(screen.getByLabelText("Desde")).toHaveAttribute("max", "2026-07-09");
  });

  it("'Limpiar' solo aparece con un rango puesto y lo deshace", async () => {
    render(<SuperAudit />);
    await screen.findAllByText("rosa@correo.com");
    expect(screen.queryByRole("button", { name: /Limpiar/i })).toBeNull();

    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-07-01" } });
    fireEvent.click(await screen.findByRole("button", { name: /Limpiar/i }));

    await waitFor(() => expect(fetchAuditLogs).toHaveBeenLastCalledWith({ from: null, to: null }));
    expect(screen.getByLabelText("Desde")).toHaveValue("");
  });
});

describe("SuperAudit — descarga del historial", () => {
  it("exporta con cabeceras en español y una fila por registro visible", async () => {
    render(<SuperAudit />);
    await screen.findAllByText("rosa@correo.com");

    fireEvent.click(screen.getByRole("button", { name: /Descargar historial/i }));

    expect(exportExcel).toHaveBeenCalledTimes(1);
    const [nombre, filas, titulo] = exportExcel.mock.calls[0];
    expect(nombre).toBe("auditoria");
    expect(titulo).toBe("Historial de acciones importantes");
    expect(filas).toEqual([{
      Registro: "L-1",
      "Realizado por": "rosa@correo.com",
      Acción: "Cambió configuración",
      "Elemento afectado": "Configuración: diseño",
      "Dirección IP": "190.12.0.1",
      // dd/mm/aaaa: en ISO, Excel en español lo convierte a número de serie.
      "Fecha y hora": "09/07/2026 12:00",
    }]);
  });

  it("la tabla en pantalla conserva el formato ISO; solo el archivo se traduce", async () => {
    render(<SuperAudit />);
    expect((await screen.findAllByText("2026-07-09 12:00")).length).toBeGreaterThan(0);
    expect(screen.queryByText("09/07/2026 12:00")).toBeNull();
  });

  it("un registro sin fecha no inventa una", async () => {
    fetchAuditLogs.mockResolvedValue({ data: [{ ...LOG, time: "" }], real: true });
    render(<SuperAudit />);
    await screen.findAllByText("rosa@correo.com");

    fireEvent.click(screen.getByRole("button", { name: /Descargar historial/i }));

    const [, filas] = exportExcel.mock.calls[0];
    expect(filas[0]["Fecha y hora"]).toBe("");
  });

  it("la descarga respeta la búsqueda: solo baja lo que se ve", async () => {
    fetchAuditLogs.mockResolvedValue({
      data: [LOG, { ...LOG, id: "L-2", actor: "ana@correo.com" }],
      real: true,
    });
    render(<SuperAudit />);
    await screen.findAllByText("ana@correo.com");

    fireEvent.change(screen.getByPlaceholderText(/Buscar por persona/i), { target: { value: "ana" } });
    fireEvent.click(screen.getByRole("button", { name: /Descargar historial/i }));

    const [, filas] = exportExcel.mock.calls[0];
    expect(filas).toHaveLength(1);
    expect(filas[0]["Realizado por"]).toBe("ana@correo.com");
  });

  it("sin registros no se puede descargar un archivo vacío", async () => {
    fetchAuditLogs.mockResolvedValue({ data: [], real: true });
    render(<SuperAudit />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Descargar historial/i })).toBeDisabled(),
    );
  });
});
