-- =====================================================================
-- 0021_review_cards.sql — Vista pública de reseñas con datos del autor
-- (nombre/iniciales), para poder mostrarlas en el detalle. (idempotente)
-- Las reseñas son contenido público de un aviso.
-- =====================================================================

create or replace view public.review_cards as
  select
    r.id,
    r.listing_id,
    r.reviewer_id,
    r.reviewee_id,
    r.rating,
    r.comment,
    r.created_at,
    p.full_name as reviewer_name,
    p.initials  as reviewer_initials,
    p.avatar_url as reviewer_avatar
  from public.reviews r
  join public.profiles p on p.id = r.reviewer_id;

grant select on public.review_cards to anon, authenticated;
