import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { prepararDom } from "./domPolyfills";

/**
 * La pestaña "Reportados", repasada el 1-sep-2026.
 *
 * Tres cosas que estaban mal y que solo se ven con datos de verdad:
 *
 *  1. `reason` se guarda como "categoría — comentario", y la tarjeta pintaba la
 *     categoría en su etiqueta Y otra vez dentro del motivo.
 *  2. La única acción era "Deshabilitar". Un aviso legítimo denunciado por
 *     despecho se quedaba "Pendiente" para siempre, porque cerrarlo sin bajar
 *     el aviso no se podía. El cliente pidió expresamente el estado "anulado".
 *  3. La chapa de la pestaña contaba también las denuncias resueltas, así que
 *     nunca bajaba.
 */

beforeEach(() => {
  prepararDom();
  if (!window.matchMedia) {
    (window as unknown as { matchMedia: unknown }).matchMedia = () => ({
      matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
    });
  }
});

const base = {
  target_type: "listing", reporter: "Perfil Anónimo", reported: "Luis",
  reporter_id: null, reported_id: null, assigned_to: null, assignee: null,
  created_at: "2026-08-25T16:05:48Z",
};

// Tal cual salen de producción: la categoría repetida dentro de `reason`.
const ABIERTA = {
  ...base,
  id: "33333333-3333-4333-8333-333333333333",
  reason: "Publicación duplicada o spam — se repite el mismo texto en cinco avisos",
  category: "Publicación duplicada o spam", status: "open", action_taken: null,
  listing_id: "22222222-2222-4222-8222-222222222222", listing_title: "Casa",
  reporter_name: "ANA RAMIREZ SOTO", reporter_doc_type: "DNI",
  reporter_doc_number: "45678912", reporter_doc_verified: true,
  reportes_del_aviso: 3,
};

const SIN_COMENTARIO = {
  ...base,
  id: "44444444-4444-4444-8444-444444444444",
  reason: "Precio incorrecto", category: "Precio incorrecto",
  status: "open", action_taken: null,
  listing_id: "55555555-5555-4555-8555-555555555555", listing_title: "Auto",
  reporter_name: null, reporter_doc_type: null,
  reporter_doc_number: null, reporter_doc_verified: null,
  reportes_del_aviso: 1,
};

const RESUELTA = {
  ...base,
  id: "66666666-6666-4666-8666-666666666666",
  reason: "Posible estafa o fraude — pide adelanto por Yape",
  category: "Posible estafa o fraude", status: "resolved", action_taken: "remove",
  listing_id: "77777777-7777-4777-8777-777777777777", listing_title: "Moto",
  reporter_name: "LUIS QUISPE", reporter_doc_type: "DNI",
  reporter_doc_number: "10203040", reporter_doc_verified: true,
  reportes_del_aviso: 1,
};

const resolveReport = vi.fn();
let REPORTES: unknown[] = [];

vi.mock("@/lib/admin", () => ({
  fetchAdminListings: async () => ({ data: [], real: true }),
  fetchReports: async () => ({ data: REPORTES, real: true }),
  setListingStatus: async () => {},
  resolveReport: (...a: unknown[]) => resolveReport(...a),
  fetchAdminListing: async () => null,
}));
vi.mock("@/lib/pricing", () => ({
  disableListing: async () => {},
  loadDisabled: () => ({}),
  formatPrecioAviso: () => "Precio a convenir",
}));
vi.mock("@/lib/listings", () => ({ fetchListingImages: async () => [] }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ can: () => true }) }));
vi.mock("@/hooks/use-toast", () => ({ toast: () => {}, useToast: () => ({ toast: () => {} }) }));

const exportExcel = vi.fn();
vi.mock("@/lib/exportReport", () => ({ exportExcel: (...a: unknown[]) => exportExcel(...a) }));

import AdminListings from "@/pages/admin/AdminListings";

const abrirReportados = async () => {
  render(<AdminListings role="superadmin" />);
  // El Tab de Radix cambia con mousedown, no con click.
  fireEvent.mouseDown(await screen.findByRole("tab", { name: /Reportados/ }));
  await screen.findByText("Avisos reportados");
};

/** La tarjeta que contiene ese título. */
const tarjetaDe = (titulo: string) =>
  screen.getByText(titulo).closest("div.border") as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  resolveReport.mockResolvedValue(undefined);
  REPORTES = [ABIERTA, SIN_COMENTARIO, RESUELTA];
});

describe("la tarjeta de la denuncia", () => {
  it("no repite la categoría debajo de su propia etiqueta", async () => {
    await abrirReportados();
    const tarjeta = tarjetaDe("Casa");

    // Se cuenta sobre el texto plano a propósito: antes la categoría salía en su
    // etiqueta Y otra vez dentro de "Motivo: …", y una consulta por elemento no
    // lo habría cazado porque el segundo nodo llevaba el comentario pegado.
    const veces = tarjeta.textContent!.split("Publicación duplicada o spam").length - 1;
    expect(veces).toBe(1);
    expect(tarjeta).not.toHaveTextContent("Motivo:");
    // Y lo que aporta —el comentario— sale entero y etiquetado como tal.
    expect(tarjeta).toHaveTextContent("Comentario: se repite el mismo texto en cinco avisos");
  });

  it("cuando la denuncia no trae comentario, lo dice", async () => {
    // Antes salía "Motivo: Precio incorrecto", que era la etiqueta otra vez y
    // parecía que el comentario se había perdido.
    await abrirReportados();
    expect(tarjetaDe("Auto")).toHaveTextContent("Sin comentario.");
  });

  it("una denuncia ya cerrada dice qué se hizo, y en castellano", async () => {
    await abrirReportados();
    // En la base es 'remove'; al moderador no se le enseña el código.
    const tarjeta = tarjetaDe("Moto");
    expect(tarjeta).toHaveTextContent("Aviso deshabilitado");
    expect(tarjeta).not.toHaveTextContent("remove");
  });

  it("el documento de quien reporta se ve, y su verificación", async () => {
    await abrirReportados();
    const tarjeta = tarjetaDe("Casa");
    expect(tarjeta).toHaveTextContent("ANA RAMIREZ SOTO");
    expect(tarjeta).toHaveTextContent("DNI 45678912");
    expect(tarjeta).toHaveTextContent("Documento verificado");
    expect(tarjeta).toHaveTextContent("3 reportes de este aviso");
  });

  it("los reportes anteriores a la 0136 no enseñan campos vacíos", async () => {
    await abrirReportados();
    const tarjeta = tarjetaDe("Auto");
    expect(tarjeta).toHaveTextContent("Perfil Anónimo");
    expect(tarjeta).not.toHaveTextContent(/DNI/);
    expect(tarjeta).not.toHaveTextContent(/verificar/i);
  });
});

describe("desestimar una denuncia infundada", () => {
  it("la cierra sin tocar el aviso", async () => {
    await abrirReportados();

    fireEvent.click(within(tarjetaDe("Casa")).getByRole("button", { name: /Desestimar/ }));
    const dialogo = await screen.findByRole("dialog");
    fireEvent.change(within(dialogo).getByRole("textbox"), {
      target: { value: "El texto es distinto en cada aviso." },
    });
    fireEvent.click(within(dialogo).getByRole("button", { name: /Desestimar/ }));

    await waitFor(() => expect(resolveReport).toHaveBeenCalledWith(
      ABIERTA.id, "dismiss", "El texto es distinto en cada aviso.",
    ));
  });

  it("sin escribir nada, queda constancia igual", async () => {
    // Un `action_taken` sin nota no explica nada a quien lea el reporte dentro
    // de seis meses.
    await abrirReportados();

    fireEvent.click(within(tarjetaDe("Casa")).getByRole("button", { name: /Desestimar/ }));
    const dialogo = await screen.findByRole("dialog");
    fireEvent.click(within(dialogo).getByRole("button", { name: /Desestimar/ }));

    await waitFor(() => expect(resolveReport).toHaveBeenCalledWith(
      ABIERTA.id, "dismiss", "Revisado: no se encontró incumplimiento.",
    ));
  });

  it("una denuncia ya resuelta no se puede volver a cerrar", async () => {
    await abrirReportados();
    expect(within(tarjetaDe("Moto")).queryByRole("button", { name: /Desestimar/ })).toBeNull();
    expect(within(tarjetaDe("Moto")).queryByRole("button", { name: /Deshabilitar/ })).toBeNull();
  });
});

describe("la chapa de la pestaña", () => {
  it("cuenta lo que queda por mirar, no el histórico", async () => {
    // Tres denuncias, una resuelta -> 2.
    render(<AdminListings role="superadmin" />);
    const tab = await screen.findByRole("tab", { name: /Reportados/ });
    await waitFor(() => expect(tab).toHaveTextContent("2"));
  });

  it("y desaparece cuando no queda ninguna pendiente", async () => {
    REPORTES = [RESUELTA];
    render(<AdminListings role="superadmin" />);
    const tab = await screen.findByRole("tab", { name: /Reportados/ });
    await waitFor(() => expect(tab).toHaveTextContent("Reportados"));
    expect(tab.textContent?.trim()).toBe("Reportados");
  });
});

describe("el reporte de los reportes (Excel)", () => {
  it("separa motivo y comentario, y traduce la acción de eFFe", async () => {
    await abrirReportados();
    fireEvent.click(screen.getByRole("button", { name: /Excel/ }));

    const filas = exportExcel.mock.calls[0][1] as Record<string, string | number>[];
    const casa = filas.find((f) => f.Aviso === "Casa")!;
    expect(casa.Motivo).toBe("Publicación duplicada o spam");
    expect(casa.Comentarios).toBe("se repite el mismo texto en cinco avisos");
    expect(casa.Documento).toBe("DNI 45678912");
    expect(casa["Documento verificado"]).toBe("Sí");
    expect(casa["Apellidos y nombres"]).toBe("ANA RAMIREZ SOTO");
    expect(casa["Reportes de ese aviso"]).toBe(3);

    const moto = filas.find((f) => f.Aviso === "Moto")!;
    expect(moto["Acción de eFFe"]).toBe("Aviso deshabilitado");

    // Sin documento no se inventa nada, pero tampoco se deja en blanco: hay que
    // poder distinguir "no se pidió" de "no se pudo comprobar".
    const auto = filas.find((f) => f.Aviso === "Auto")!;
    expect(auto["Documento verificado"]).toBe("No se pidió");
  });
});
