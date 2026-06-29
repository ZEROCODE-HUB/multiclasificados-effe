// REQ-07: reseñas (1-5). Solo puede reseñar quien tenga una postulación
// ACEPTADA en el aviso (lo valida un trigger en la BD).
import { supabase } from "@/lib/supabase";

export interface ReviewRow {
  id: string;
  listing_id: string;
  reviewer_id: string;
  reviewee_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  reviewer_name: string | null;
  reviewer_initials: string | null;
}

export async function fetchReviews(listingId: string): Promise<ReviewRow[]> {
  try {
    const { data, error } = await supabase
      .from("review_cards")
      .select("*")
      .eq("listing_id", listingId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as ReviewRow[];
  } catch {
    return [];
  }
}

// Datos del vendedor (dueño del aviso) + su rating real.
export async function fetchSellerInfo(
  listingId: string
): Promise<{ ownerId: string; rating: number } | null> {
  try {
    const { data } = await supabase
      .from("listing_cards")
      .select("owner_id, advertiser_rating")
      .eq("id", listingId)
      .maybeSingle();
    if (!data) return null;
    return { ownerId: data.owner_id as string, rating: Number(data.advertiser_rating) || 0 };
  } catch {
    return null;
  }
}

export interface ReviewEligibility {
  hasAccepted: boolean;
  alreadyReviewed: boolean;
  canReview: boolean;
}

export async function fetchReviewEligibility(listingId: string): Promise<ReviewEligibility> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { hasAccepted: false, alreadyReviewed: false, canReview: false };

  const [{ data: apps }, { data: mine }] = await Promise.all([
    supabase.from("job_applications").select("status").eq("listing_id", listingId).eq("applicant_id", user.id),
    supabase.from("review_cards").select("id").eq("listing_id", listingId).eq("reviewer_id", user.id),
  ]);

  const hasAccepted = (apps ?? []).some((a: { status: string }) => a.status === "accepted");
  const alreadyReviewed = (mine ?? []).length > 0;
  return { hasAccepted, alreadyReviewed, canReview: hasAccepted && !alreadyReviewed };
}

export async function createReview(
  listingId: string,
  revieweeId: string,
  rating: number,
  comment: string
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Debes iniciar sesión.");
  const { error } = await supabase.from("reviews").insert({
    listing_id: listingId,
    reviewer_id: user.id,
    reviewee_id: revieweeId,
    rating,
    comment: comment.trim() || null,
  });
  if (error) throw error;
}
