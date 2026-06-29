-- =====================================================================
-- 0013_reviews.sql — REQ-07: reseñas 1-5 SOLO con postulación aprobada,
-- y recálculo del promedio del usuario reseñado (idempotente)
-- =====================================================================

create table if not exists public.reviews (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings (id) on delete cascade,
  reviewer_id uuid not null references public.profiles (id) on delete cascade,
  reviewee_id uuid not null references public.profiles (id) on delete cascade,
  rating      int  not null check (rating between 1 and 5),
  comment     text,
  created_at  timestamptz not null default now(),
  unique (listing_id, reviewer_id)
);
create index if not exists reviews_reviewee_idx on public.reviews (reviewee_id);

-- Regla estricta: solo se puede reseñar si el reviewer tiene una postulación
-- ACEPTADA en ese aviso.
create or replace function public.enforce_review_eligibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.reviewer_id = new.reviewee_id then
    raise exception 'No puedes reseñarte a ti mismo';
  end if;
  if not exists (
    select 1 from public.job_applications a
    where a.listing_id = new.listing_id
      and a.applicant_id = new.reviewer_id
      and a.status = 'accepted'
  ) then
    raise exception 'Solo puedes reseñar si tu postulación fue aceptada en este aviso';
  end if;
  return new;
end;
$$;

drop trigger if exists reviews_eligibility on public.reviews;
create trigger reviews_eligibility
  before insert on public.reviews
  for each row execute function public.enforce_review_eligibility();

-- Recalcula el promedio (profiles.rating) del usuario reseñado.
create or replace function public.recalc_user_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := coalesce(new.reviewee_id, old.reviewee_id);
begin
  update public.profiles
  set rating = coalesce(
    (select round(avg(rating)::numeric, 1) from public.reviews where reviewee_id = v_user),
    0
  )
  where id = v_user;
  return null;
end;
$$;

drop trigger if exists reviews_recalc on public.reviews;
create trigger reviews_recalc
  after insert or update or delete on public.reviews
  for each row execute function public.recalc_user_rating();

-- ---------- RLS ----------
alter table public.reviews enable row level security;
drop policy if exists "reviews_select_all" on public.reviews;
create policy "reviews_select_all" on public.reviews for select using (true);
drop policy if exists "reviews_insert_own" on public.reviews;
create policy "reviews_insert_own" on public.reviews for insert with check (reviewer_id = auth.uid());
drop policy if exists "reviews_update_own" on public.reviews;
create policy "reviews_update_own" on public.reviews for update using (reviewer_id = auth.uid());
drop policy if exists "reviews_delete_own_or_staff" on public.reviews;
create policy "reviews_delete_own_or_staff" on public.reviews for delete
  using (reviewer_id = auth.uid() or public.is_staff(auth.uid()));
