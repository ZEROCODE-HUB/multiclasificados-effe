// REQ-06: postulaciones a empleos.
// Flujo: el postulante sube su CV en PDF al postular; el dueño del aviso lo
// recibe en su panel y actualiza el estado de seguimiento del candidato
// (Recibido → En revisión → En entrevista → Aceptada / Rechazada).
import { supabase } from "@/lib/supabase";

export type ApplicationStatus =
  | "pending"
  | "reviewed"
  | "interview"
  | "accepted"
  | "rejected";

// Etiquetas visibles del estado de la postulación (español).
export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  pending: "Recibido",
  reviewed: "En revisión",
  interview: "En entrevista",
  accepted: "Aceptada",
  rejected: "Rechazada",
};

// Orden lógico del seguimiento (para pintar el flujo de izquierda a derecha).
export const STATUS_FLOW: ApplicationStatus[] = [
  "pending",
  "reviewed",
  "interview",
  "accepted",
  "rejected",
];

const CV_BUCKET = "cvs";
const MAX_CV_BYTES = 5 * 1024 * 1024; // 5 MB (el bucket también lo limita)

// Sube el CV (PDF) del postulante al bucket privado y devuelve la ruta guardada
// (que queda en job_applications.cv_url y sirve para generar el enlace firmado).
async function uploadCv(userId: string, listingId: string, file: File): Promise<string> {
  if (file.type !== "application/pdf") {
    throw new Error("El CV debe estar en formato PDF.");
  }
  if (file.size > MAX_CV_BYTES) {
    throw new Error("El PDF no puede superar los 5 MB.");
  }
  const path = `${userId}/${listingId}-${Date.now()}.pdf`;
  const { error } = await supabase.storage
    .from(CV_BUCKET)
    .upload(path, file, { contentType: "application/pdf", upsert: false });
  if (error) throw new Error("No se pudo subir el PDF. Intenta nuevamente.");
  return path;
}

// Postula a un aviso de empleo. El CV en PDF es obligatorio.
export async function applyToListing(
  listingId: string,
  message: string,
  cvFile: File
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Debes iniciar sesión para postular.");
  // El dueño del aviso no puede postularse a su propia publicación.
  const { data: owner } = await supabase
    .from("listing_cards")
    .select("owner_id")
    .eq("id", listingId)
    .maybeSingle();
  if (owner?.owner_id === user.id) {
    throw new Error("No puedes postular a tu propio aviso.");
  }

  const cvUrl = await uploadCv(user.id, listingId, cvFile);

  const { error } = await supabase.from("job_applications").insert({
    listing_id: listingId,
    applicant_id: user.id,
    message: message.trim() || null,
    cv_url: cvUrl,
  });
  if (error) {
    // Si el registro falla (p. ej. ya postulaste antes), no dejar el PDF huérfano.
    await supabase.storage.from(CV_BUCKET).remove([cvUrl]);
    if ((error as { code?: string }).code === "23505") {
      throw new Error("Ya postulaste a este aviso.");
    }
    throw error;
  }
}

// Estado de la postulación del usuario actual a un aviso (o null si no postuló).
export async function fetchMyApplication(listingId: string): Promise<ApplicationStatus | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("job_applications")
    .select("status")
    .eq("listing_id", listingId)
    .eq("applicant_id", user.id)
    .maybeSingle();
  return (data?.status as ApplicationStatus) ?? null;
}

export interface OwnerApplication {
  id: string;
  listing_id: string;
  applicant_id: string;
  message: string | null;
  cv_url: string | null;
  status: ApplicationStatus;
  created_at: string;
  listing_title: string;
  applicant_name: string;
}

// Postulaciones recibidas en los avisos del anunciante actual.
export async function fetchApplicationsForOwner(): Promise<OwnerApplication[]> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];
    // EFFE-038: filtrar SOLO las postulaciones a avisos PROPIOS. La RLS de
    // job_applications deja ver además las que el propio usuario hizo como
    // candidato (applicant_id = auth.uid()); sin este filtro, un anunciante que
    // también postuló a algún empleo veía su propia postulación mezclada aquí,
    // como si fuera un candidato a revisar. El inner join a `listings` + el
    // filtro por owner_id acota a lo que de verdad es "recibido en mis avisos".
    const { data, error } = await supabase
      .from("job_applications")
      .select("id, listing_id, applicant_id, message, cv_url, status, created_at, listings!inner(title, owner_id)")
      .eq("listings.owner_id", user.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const rows = data ?? [];

    // Nombres de postulantes desde la vista pública de perfiles.
    const ids = [...new Set(rows.map((r: { applicant_id: string }) => r.applicant_id))];
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: profs } = await supabase
        .from("public_profiles")
        .select("id, full_name")
        .in("id", ids);
      (profs ?? []).forEach((p: { id: string; full_name: string }) => names.set(p.id, p.full_name));
    }

    return rows.map((r: any) => ({
      id: r.id,
      listing_id: r.listing_id,
      applicant_id: r.applicant_id,
      message: r.message,
      cv_url: r.cv_url,
      status: r.status,
      created_at: r.created_at,
      listing_title: r.listings?.title ?? "Aviso",
      applicant_name: names.get(r.applicant_id) ?? "Postulante",
    }));
  } catch {
    return [];
  }
}

// Genera un enlace firmado (temporal) para descargar/ver el CV del postulante.
// Requiere que el usuario sea el dueño del aviso (o el propio postulante/staff).
export async function getCvSignedUrl(cvUrl: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(CV_BUCKET)
    .createSignedUrl(cvUrl, 300); // 5 minutos
  if (error) return null;
  return data?.signedUrl ?? null;
}

export async function updateApplicationStatus(id: string, status: ApplicationStatus): Promise<void> {
  const { error } = await supabase.from("job_applications").update({ status }).eq("id", id);
  if (error) throw error;
}
