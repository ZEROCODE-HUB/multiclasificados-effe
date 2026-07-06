import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

beforeEach(() => {
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (!Element.prototype.hasPointerCapture) (Element.prototype as any).hasPointerCapture = () => false;
  if (!Element.prototype.releasePointerCapture) (Element.prototype as any).releasePointerCapture = () => {};
  if (!window.matchMedia) (window as any).matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
});

// DashboardLayout como passthrough para no arrastrar router/sesión.
vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const APP = {
  id: "a1", listing_id: "L1", applicant_id: "p1", message: "Me interesa el puesto",
  cv_url: "p1/L1-1.pdf", status: "pending" as const, created_at: "2026-06-01T00:00:00Z",
  listing_title: "Vacante QA", applicant_name: "Ana Pérez",
};

const fetchApplicationsForOwner = vi.fn().mockResolvedValue([{ ...APP }]);
const updateApplicationStatus = vi.fn().mockResolvedValue(undefined);
const getCvSignedUrl = vi.fn().mockResolvedValue("https://signed/cv.pdf");
// Mantiene STATUS_LABEL/STATUS_FLOW reales; solo mockea las funciones de datos.
vi.mock("@/lib/applications", async (orig) => {
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return {
    ...actual,
    fetchApplicationsForOwner: (...a: unknown[]) => fetchApplicationsForOwner(...a),
    updateApplicationStatus: (...a: unknown[]) => updateApplicationStatus(...a),
    getCvSignedUrl: (...a: unknown[]) => getCvSignedUrl(...a),
  };
});

const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => toast(...a) }));

import AdvertiserApplications from "@/pages/advertiser/AdvertiserApplications";

beforeEach(() => {
  vi.clearAllMocks();
  fetchApplicationsForOwner.mockResolvedValue([{ ...APP }]);
  updateApplicationStatus.mockResolvedValue(undefined);
  getCvSignedUrl.mockResolvedValue("https://signed/cv.pdf");
  (window as any).open = vi.fn();
});

describe("AdvertiserApplications — panel del anunciante (receptor)", () => {
  it("muestra la postulación recibida con nombre, aviso y estado 'Recibido'", async () => {
    render(<AdvertiserApplications />);
    expect(await screen.findByText("Ana Pérez")).toBeTruthy();
    expect(screen.getByText("Para: Vacante QA")).toBeTruthy();
    expect(screen.getByText("Me interesa el puesto")).toBeTruthy();
    expect(screen.getByText("Recibido")).toBeTruthy(); // STATUS_LABEL.pending
  });

  it("permite abrir el CV con un enlace firmado", async () => {
    render(<AdvertiserApplications />);
    await screen.findByText("Ana Pérez");
    fireEvent.click(screen.getByRole("button", { name: /Ver CV/i }));
    await waitFor(() => expect(getCvSignedUrl).toHaveBeenCalledWith("p1/L1-1.pdf"));
    await waitFor(() => expect((window as any).open).toHaveBeenCalledWith("https://signed/cv.pdf", "_blank", "noopener"));
  });

  it("cambia el estado a 'En entrevista' (requisito clave del empleador)", async () => {
    render(<AdvertiserApplications />);
    await screen.findByText("Ana Pérez");
    fireEvent.click(screen.getByRole("button", { name: /En entrevista/i }));
    await waitFor(() => expect(updateApplicationStatus).toHaveBeenCalledWith("a1", "interview"));
    // La UI refleja el nuevo estado.
    await waitFor(() => expect(screen.getByText("En entrevista")).toBeTruthy());
  });

  it("ofrece los estados de seguimiento pedidos y rechazar", async () => {
    render(<AdvertiserApplications />);
    await screen.findByText("Ana Pérez");
    // Para un 'pending' se ofrecen: En revisión, En entrevista, Aceptar, Rechazar.
    expect(screen.getByRole("button", { name: /En revisión/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /En entrevista/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Aceptar/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Rechazar/i })).toBeTruthy();
  });

  it("muestra error si falla la actualización de estado", async () => {
    updateApplicationStatus.mockRejectedValue(new Error("denied"));
    render(<AdvertiserApplications />);
    await screen.findByText("Ana Pérez");
    fireEvent.click(screen.getByRole("button", { name: /En revisión/i }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
  });
});
