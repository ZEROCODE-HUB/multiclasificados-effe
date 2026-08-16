import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { InvoiceDetailDialog, type InvoiceDetailData } from "@/components/InvoiceDetailDialog";

// 0102: el aviso de anulación trae al usuario a "Mis comprobantes". Si al abrir
// el detalle no encontrara ni el motivo ni la nota de crédito, el viaje no le
// habría servido de nada.

const base: InvoiceDetailData = {
  number: "B066-000012",
  type: "boleta",
  date: "2026-08-15T12:00:00Z",
  advertiser: "JUAN PÉREZ",
  docType: "dni",
  docNumber: "44443333",
  email: "juan@correo.com",
  listingTitle: "Toyota Yaris 2019",
  amount: 100,
};

describe("detalle del comprobante · anulación", () => {
  it("muestra el motivo y la nota de crédito cuando está anulado", () => {
    render(
      <InvoiceDetailDialog
        invoice={{
          ...base,
          anuladoAt: "2026-08-15T18:30:00Z",
          anuladoMotivo: "Cobro duplicado",
          notaNumber: "BC66-000003",
        }}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("Motivo de la anulación")).toBeInTheDocument();
    expect(screen.getByText("Cobro duplicado")).toBeInTheDocument();
    expect(screen.getByText("Nota de crédito")).toBeInTheDocument();
    expect(screen.getByText("BC66-000003")).toBeInTheDocument();
    expect(screen.getByText("Anulado el")).toBeInTheDocument();
  });

  it("un comprobante interno anulado no inventa una nota que no existe", () => {
    render(
      <InvoiceDetailDialog
        invoice={{
          ...base,
          anuladoAt: "2026-08-15T18:30:00Z",
          anuladoMotivo: "Prueba",
          notaNumber: null,
        }}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("Motivo de la anulación")).toBeInTheDocument();
    expect(screen.queryByText("Nota de crédito")).not.toBeInTheDocument();
  });

  it("un comprobante vivo no enseña filas de anulación vacías", () => {
    render(<InvoiceDetailDialog invoice={base} onClose={() => {}} />);
    expect(screen.queryByText("Anulado el")).not.toBeInTheDocument();
    expect(screen.queryByText("Motivo de la anulación")).not.toBeInTheDocument();
  });
});
