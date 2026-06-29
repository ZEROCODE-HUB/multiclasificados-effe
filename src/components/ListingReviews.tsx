import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Lock, MessageSquareQuote } from "lucide-react";
import { toast } from "sonner";
import { StarRating, StarInput } from "@/components/StarRating";
import { useSession } from "@/hooks/useSession";
import {
  fetchReviews,
  fetchReviewEligibility,
  fetchSellerInfo,
  createReview,
  type ReviewRow,
  type ReviewEligibility,
} from "@/lib/reviews";

export function ListingReviews({
  listingId,
  isOwner = false,
  onChange,
}: {
  listingId: string;
  isOwner?: boolean;
  onChange?: () => void;
}) {
  const session = useSession();
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [ownerId, setOwnerId] = useState("");
  const [elig, setElig] = useState<ReviewEligibility>({
    hasAccepted: false,
    alreadyReviewed: false,
    canReview: false,
  });
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    fetchReviews(listingId).then(setReviews);
    fetchSellerInfo(listingId).then((info) => info && setOwnerId(info.ownerId));
    if (session) fetchReviewEligibility(listingId).then(setElig);
  }, [listingId, session]);

  useEffect(() => {
    load();
  }, [load]);

  const avg = reviews.length
    ? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length
    : 0;

  const submit = async () => {
    if (rating < 1) {
      toast.error("Selecciona una calificación de 1 a 5 estrellas.");
      return;
    }
    setSubmitting(true);
    try {
      await createReview(listingId, ownerId, rating, comment);
      toast.success("¡Reseña publicada!");
      setRating(0);
      setComment("");
      load();
      onChange?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo publicar la reseña.");
    } finally {
      setSubmitting(false);
    }
  };

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" });

  return (
    <section>
      <h2 className="text-xs uppercase tracking-[0.2em] font-bold text-secondary mb-3">Reseñas</h2>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <h3 className="text-2xl font-bold text-foreground">Opiniones de usuarios</h3>
        <div className="flex items-center gap-3">
          <span className="text-3xl font-extrabold text-primary">{avg.toFixed(1)}</span>
          <div>
            <StarRating value={avg} size={16} />
            <p className="text-xs text-muted-foreground mt-0.5">
              {reviews.length} reseña{reviews.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      </div>

      {/* Formulario / estado de elegibilidad (el dueño no reseña su propio aviso) */}
      {session && !isOwner && elig.canReview && (
        <div className="bg-card border border-border p-5 mb-6 space-y-3">
          <Label className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Tu calificación</Label>
          <StarInput value={rating} onChange={setRating} />
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Cuenta tu experiencia con este anunciante…"
            rows={3}
            maxLength={500}
          />
          <div className="flex justify-end">
            <Button onClick={submit} disabled={submitting} className="gap-2">
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <MessageSquareQuote size={14} />}
              Publicar reseña
            </Button>
          </div>
        </div>
      )}

      {session && !isOwner && !elig.canReview && (
        <div className="bg-muted/30 border border-border p-4 mb-6 flex items-start gap-3 text-sm text-muted-foreground">
          <Lock size={16} className="text-secondary mt-0.5 shrink-0" />
          <p>
            {elig.alreadyReviewed
              ? "Ya dejaste una reseña para este aviso. ¡Gracias!"
              : "Solo puedes reseñar si tu postulación a este aviso fue aceptada."}
          </p>
        </div>
      )}

      {/* Lista de reseñas */}
      {reviews.length === 0 ? (
        <div className="border border-dashed border-border py-12 text-center">
          <p className="text-muted-foreground text-sm">Aún no hay reseñas para este aviso.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map((r) => (
            <div key={r.id} className="bg-card border border-border p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm shrink-0">
                  {r.reviewer_initials || (r.reviewer_name ?? "U").slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="font-semibold text-foreground">{r.reviewer_name ?? "Usuario"}</p>
                    <span className="text-xs text-muted-foreground">{fmtDate(r.created_at)}</span>
                  </div>
                  <div className="mt-1"><StarRating value={r.rating} size={13} /></div>
                  {r.comment && <p className="text-sm text-foreground/85 mt-2 leading-relaxed">{r.comment}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
