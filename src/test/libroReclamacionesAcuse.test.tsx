import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { prepararDom } from "./domPolyfills";

// Lo que ve el consumidor después de enviar su reclamo. La norma no se agota
// en guardar la hoja: hay que darle constancia de CUÁNDO quedó registrada y
// avisarle de que le llega una copia. Antes la pantalla solo decía el número.

beforeEach(prepararDom);

const submitComplaint = vi.fn();
vi.mock("@/lib/complaints", async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  submitComplaint: (...a: unknown[]) => submitComplaint(...a),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { LibroReclamaciones } from "@/components/LibroReclamaciones";

async function llenarYEnviar() {
  fireEvent.click(screen.getByRole("button", { name: /registrar reclamo/i }));
  await waitFor(() => expect(screen.getByPlaceholderText(/nombres y apellidos/i)).toBeTruthy());

  const escribir = (placeholder: RegExp | string, valor: string) =>
    fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value: valor } });

  escribir(/nombres y apellidos/i, "María Ñáñez");
  escribir("Número", "44443333");
  escribir("tucorreo@ejemplo.com", "maria@ejemplo.com");
  escribir(/describe lo ocurrido/i, "No se publicó mi aviso.");
  escribir(/qué solución esperas/i, "Que lo publiquen.");
  fireEvent.click(screen.getByRole("button", { name: /enviar reclamo/i }));
}

describe("confirmación del Libro de Reclamaciones", () => {
  it("muestra el número de hoja, la hora del registro y a qué correo fue la copia", async () => {
    submitComplaint.mockResolvedValue({
      ok: true,
      code: "13",
      createdAt: "2026-08-17T15:37:00Z", // 10:37 en Lima
      ackSent: true,
    });

    render(<LibroReclamaciones />);
    await llenarYEnviar();

    // `findByText` y no `waitFor(getByText)`: el envío pasa por varios estados
    // asíncronos y, con la suite entera corriendo, el segundo por defecto de
    // `waitFor` se agota antes de que React pinte la confirmación. Fallaba de
    // forma intermitente solo en la pasada completa, que es la que firma el APK.
    await screen.findByText(/reclamo registrado/i, undefined, { timeout: 5000 });
    expect(screen.getByText(/N\.º 13/)).toBeTruthy();
    // La hora es la del servidor traída a hora de Perú, no la del teléfono.
    expect(screen.getByText("17/08/2026 10:37")).toBeTruthy();
    expect(screen.getByText(/maria@ejemplo\.com/)).toBeTruthy();
    expect(screen.getByText(/copia de tu Hoja de Reclamación en PDF/i)).toBeTruthy();
  });

  it("si la copia no salió, lo dice en vez de dar por hecho que llegó", async () => {
    submitComplaint.mockResolvedValue({
      ok: true,
      code: "14",
      createdAt: "2026-08-17T15:37:00Z",
      ackSent: false,
    });

    render(<LibroReclamaciones />);
    await llenarYEnviar();

    // `findByText` y no `waitFor(getByText)`: el envío pasa por varios estados
    // asíncronos y, con la suite entera corriendo, el segundo por defecto de
    // `waitFor` se agota antes de que React pinte la confirmación. Fallaba de
    // forma intermitente solo en la pasada completa, que es la que firma el APK.
    await screen.findByText(/reclamo registrado/i, undefined, { timeout: 5000 });
    expect(screen.getByText(/No pudimos enviarte la copia/i)).toBeTruthy();
    // El reclamo sigue registrado: el número es la prueba y tiene que verse.
    expect(screen.getByText(/N\.º 14/)).toBeTruthy();
  });

  it("sin fecha del servidor no se inventa una", async () => {
    submitComplaint.mockResolvedValue({ ok: true, code: "15", ackSent: true });

    render(<LibroReclamaciones />);
    await llenarYEnviar();

    // `findByText` y no `waitFor(getByText)`: el envío pasa por varios estados
    // asíncronos y, con la suite entera corriendo, el segundo por defecto de
    // `waitFor` se agota antes de que React pinte la confirmación. Fallaba de
    // forma intermitente solo en la pasada completa, que es la que firma el APK.
    await screen.findByText(/reclamo registrado/i, undefined, { timeout: 5000 });
    expect(screen.queryByText(/registrada el/i)).toBeNull();
  });
});
