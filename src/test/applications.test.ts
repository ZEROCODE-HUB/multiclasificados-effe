import { describe, it, expect, vi, beforeEach } from "vitest";

// Estado mutable que controla el mock de supabase por test.
const state: {
  user: { id: string } | null;
  listingOwner: string | null;
  uploadError: unknown;
  insertError: { code?: string } | null;
  updateError: unknown;
  signed: { data: { signedUrl: string } | null; error: unknown };
  ownerRows: unknown[];
  profiles: unknown[];
  // capturas
  uploadedPath: string | null;
  uploadedFile: File | null;
  inserted: Record<string, unknown> | null;
  removed: string[];
  updated: Record<string, unknown> | null;
} = {
  user: { id: "u1" },
  listingOwner: "owner-x",
  uploadError: null,
  insertError: null,
  updateError: null,
  signed: { data: { signedUrl: "https://signed/cv" }, error: null },
  ownerRows: [],
  profiles: [],
  uploadedPath: null,
  uploadedFile: null,
  inserted: null,
  removed: [],
  updated: null,
};

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => {
      if (table === "listing_cards") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: state.listingOwner ? { owner_id: state.listingOwner } : null,
              }),
            }),
          }),
        };
      }
      if (table === "job_applications") {
        return {
          insert: (row: Record<string, unknown>) => {
            state.inserted = row;
            return Promise.resolve({ error: state.insertError });
          },
          select: () => ({
            // fetchApplicationsForOwner: .select(...).order(...)
            order: async () => ({ data: state.ownerRows, error: null }),
            // fetchMyApplication: .select(...).eq().eq().maybeSingle()
            eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
          }),
          update: (patch: Record<string, unknown>) => {
            state.updated = patch;
            return { eq: async () => ({ error: state.updateError }) };
          },
        };
      }
      if (table === "public_profiles") {
        return { select: () => ({ in: async () => ({ data: state.profiles }) }) };
      }
      return {};
    },
    storage: {
      from: () => ({
        upload: async (path: string, file: File) => {
          state.uploadedPath = path;
          state.uploadedFile = file;
          return { error: state.uploadError };
        },
        remove: async (paths: string[]) => {
          state.removed.push(...paths);
          return { error: null };
        },
        createSignedUrl: async () => state.signed,
      }),
    },
  },
}));

import {
  applyToListing,
  fetchApplicationsForOwner,
  getCvSignedUrl,
  updateApplicationStatus,
  STATUS_LABEL,
  STATUS_FLOW,
} from "@/lib/applications";

const pdf = (name = "cv.pdf") =>
  new File([new Uint8Array([1, 2, 3])], name, { type: "application/pdf" });

beforeEach(() => {
  state.user = { id: "u1" };
  state.listingOwner = "owner-x";
  state.uploadError = null;
  state.insertError = null;
  state.updateError = null;
  state.signed = { data: { signedUrl: "https://signed/cv" }, error: null };
  state.ownerRows = [];
  state.profiles = [];
  state.uploadedPath = null;
  state.uploadedFile = null;
  state.inserted = null;
  state.removed = [];
  state.updated = null;
});

describe("STATUS_LABEL — estados de seguimiento del candidato", () => {
  it("incluye los estados pedidos con sus etiquetas en español", () => {
    expect(STATUS_LABEL.pending).toBe("Recibido");
    expect(STATUS_LABEL.reviewed).toBe("En revisión");
    expect(STATUS_LABEL.interview).toBe("En entrevista");
    expect(STATUS_LABEL.accepted).toBe("Aceptada");
    expect(STATUS_LABEL.rejected).toBe("Rechazada");
  });
  it("el flujo va de Recibido a estado final e incluye En entrevista", () => {
    expect(STATUS_FLOW).toEqual(["pending", "reviewed", "interview", "accepted", "rejected"]);
  });
});

describe("applyToListing — postular con CV en PDF", () => {
  it("sube el PDF y guarda la postulación con cv_url y mensaje", async () => {
    await applyToListing("L1", "  hola  ", pdf());
    // ruta: <uid>/<listingId>-<ts>.pdf
    expect(state.uploadedPath).toMatch(/^u1\/L1-\d+\.pdf$/);
    expect(state.inserted).toMatchObject({
      listing_id: "L1",
      applicant_id: "u1",
      message: "hola", // recortado
      cv_url: state.uploadedPath,
    });
  });

  it("mensaje vacío se guarda como null", async () => {
    await applyToListing("L1", "   ", pdf());
    expect(state.inserted?.message).toBeNull();
  });

  it("rechaza archivos que no son PDF (sin subir ni insertar)", async () => {
    const txt = new File(["x"], "cv.txt", { type: "text/plain" });
    await expect(applyToListing("L1", "", txt)).rejects.toThrow(/PDF/i);
    expect(state.uploadedPath).toBeNull();
    expect(state.inserted).toBeNull();
  });

  it("rechaza PDF mayor a 5 MB", async () => {
    const big = new File([new ArrayBuffer(6 * 1024 * 1024)], "big.pdf", { type: "application/pdf" });
    await expect(applyToListing("L1", "", big)).rejects.toThrow(/5 MB/);
    expect(state.uploadedPath).toBeNull();
  });

  it("no permite postular a tu propio aviso (antes de subir nada)", async () => {
    state.listingOwner = "u1"; // el dueño es el propio usuario
    await expect(applyToListing("L1", "", pdf())).rejects.toThrow(/tu propio aviso/i);
    expect(state.uploadedPath).toBeNull();
    expect(state.inserted).toBeNull();
  });

  it("exige sesión iniciada", async () => {
    state.user = null;
    await expect(applyToListing("L1", "", pdf())).rejects.toThrow(/iniciar sesión/i);
  });

  it("si ya postulaste (23505) avisa y borra el PDF huérfano", async () => {
    state.insertError = { code: "23505" };
    await expect(applyToListing("L1", "", pdf())).rejects.toThrow(/Ya postulaste/i);
    expect(state.removed).toContain(state.uploadedPath);
  });

  it("si falla la subida, no inserta la postulación", async () => {
    state.uploadError = { message: "boom" };
    await expect(applyToListing("L1", "", pdf())).rejects.toThrow(/subir el PDF/i);
    expect(state.inserted).toBeNull();
  });
});

describe("fetchApplicationsForOwner — postulaciones recibidas", () => {
  it("mapea cv_url, título del aviso y nombre del postulante", async () => {
    state.ownerRows = [
      {
        id: "a1",
        listing_id: "L1",
        applicant_id: "p1",
        message: "hola",
        cv_url: "p1/L1-1.pdf",
        status: "pending",
        created_at: "2026-01-01",
        listings: { title: "Vacante QA" },
      },
    ];
    state.profiles = [{ id: "p1", full_name: "Ana Pérez" }];
    const rows = await fetchApplicationsForOwner();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "a1",
      cv_url: "p1/L1-1.pdf",
      listing_title: "Vacante QA",
      applicant_name: "Ana Pérez",
      status: "pending",
    });
  });
});

describe("getCvSignedUrl — enlace firmado del CV", () => {
  it("devuelve el signedUrl cuando existe", async () => {
    expect(await getCvSignedUrl("p1/L1.pdf")).toBe("https://signed/cv");
  });
  it("devuelve null si hay error", async () => {
    state.signed = { data: null, error: { message: "denied" } };
    expect(await getCvSignedUrl("p1/L1.pdf")).toBeNull();
  });
});

describe("updateApplicationStatus — cambio de estado por el anunciante", () => {
  it("actualiza al estado 'interview' (En entrevista)", async () => {
    await updateApplicationStatus("a1", "interview");
    expect(state.updated).toEqual({ status: "interview" });
  });
});
