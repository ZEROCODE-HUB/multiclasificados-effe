// REQ-06: postulaciones a avisos (estados: Pendiente, En Revisión, Aceptada, Rechazada).
import { supabase } from "@/lib/supabase";

export type ApplicationStatus = "pending" | "reviewed" | "accepted" | "rejected";

export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  pending: "Pendiente",
  reviewed: "En revisión",
  accepted: "Aceptada",
  rejected: "Rechazada",
};

export async function applyToListing(listingId: string, message: string): Promise<void> {
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
  const { error } = await supabase.from("job_applications").insert({
    listing_id: listingId,
    applicant_id: user.id,
    message: message.trim() || null,
  });
  if (error) throw error;
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
  status: ApplicationStatus;
  created_at: string;
  listing_title: string;
  applicant_name: string;
}

// Postulaciones recibidas en los avisos del anunciante actual.
export async function fetchApplicationsForOwner(): Promise<OwnerApplication[]> {
  try {
    const { data, error } = await supabase
      .from("job_applications")
      .select("id, listing_id, applicant_id, message, status, created_at, listings(title)")
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
      status: r.status,
      created_at: r.created_at,
      listing_title: r.listings?.title ?? "Aviso",
      applicant_name: names.get(r.applicant_id) ?? "Postulante",
    }));
  } catch {
    return [];
  }
}

export async function updateApplicationStatus(id: string, status: ApplicationStatus): Promise<void> {
  const { error } = await supabase.from("job_applications").update({ status }).eq("id", id);
  if (error) throw error;
}
