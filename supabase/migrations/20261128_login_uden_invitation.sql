-- Andelshavere, hvis mail står i andelshaverlisten (andel_kontakter), kan logge ind uden invitation (Christian 28/11 2026).
-- Kun bekræftede mails, kun aktive andele, ikke interne pladser (900/901) eller test (999).
create or replace function public.claim_invites()
 returns integer language plpgsql security definer set search_path to 'public'
as $function$
declare n integer; m integer := 0; em text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null or em = '' then return 0; end if;
  if exists (select 1 from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null) then
    insert into public.members (andel_id, email, name, role)
    select k.andel_id, em, coalesce(nullif(trim(k.navn), ''), em), 'ejer'
      from public.andel_kontakter k join public.andele a on a.id = k.andel_id
     where lower(trim(k.mail)) = em and a.aktiv and a.lejlighed not in ('900', '901', '999')
       and not exists (select 1 from public.members x where x.andel_id = k.andel_id and lower(x.email) = em)
    on conflict do nothing;
    get diagnostics m = row_count;
  end if;
  update public.members set user_id = auth.uid() where user_id is null and lower(email) = em;
  get diagnostics n = row_count;
  return n;
end $function$;
