-- Moderación de denuncias: ver la conversación entre reportante y reportado.
-- 1) admin_list_reports ahora expone también el id del reportante (reporter_id).
-- 2) admin_conversation_between(a, b): mensajes entre dos usuarios, solo staff.

drop function if exists public.admin_list_reports();
create function public.admin_list_reports()
returns table(
  id uuid, target_type text, reason text, category text, status text, action_taken text,
  reporter text, reported text, reporter_id uuid, reported_id uuid,
  listing_id uuid, listing_title text, assigned_to uuid, assignee text, created_at timestamptz
)
language sql security definer set search_path to 'public' as $$
  select
    r.id, r.target_type::text, r.reason, r.category, r.status::text, r.action_taken,
    rep.full_name as reporter,
    coalesce(tu.full_name, lo.full_name) as reported,
    r.reported_by as reporter_id,
    coalesce(r.target_user_id, lo.id) as reported_id,
    r.listing_id, l.title as listing_title,
    r.assigned_to, asg.full_name as assignee,
    r.created_at
  from public.reports r
  left join public.profiles rep on rep.id = r.reported_by
  left join public.profiles tu  on tu.id  = r.target_user_id
  left join public.listings  l  on l.id   = r.listing_id
  left join public.profiles lo  on lo.id  = l.owner_id
  left join public.profiles asg on asg.id = r.assigned_to
  where public.is_staff(auth.uid())
  order by
    case r.status when 'open' then 0 when 'reviewing' then 1 else 2 end,
    r.created_at desc;
$$;
grant execute on function public.admin_list_reports() to authenticated;

-- Todos los mensajes intercambiados entre dos usuarios (en cualquiera de sus
-- conversaciones), en orden cronológico. SECURITY DEFINER + guard is_staff.
create or replace function public.admin_conversation_between(p_a uuid, p_b uuid)
returns table(
  id uuid, conversation_id uuid, sender_id uuid, sender_name text,
  body text, status text, created_at timestamptz, listing_title text
)
language sql security definer set search_path to 'public' as $$
  select m.id, m.conversation_id, m.sender_id, p.full_name as sender_name,
         m.body, m.status::text, m.created_at, l.title as listing_title
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  left join public.profiles p on p.id = m.sender_id
  left join public.listings l on l.id = c.listing_id
  where public.is_staff(auth.uid())
    and (
      (c.buyer_id = p_a and c.seller_id = p_b) or
      (c.buyer_id = p_b and c.seller_id = p_a)
    )
  order by m.created_at asc;
$$;
grant execute on function public.admin_conversation_between(uuid, uuid) to authenticated;
