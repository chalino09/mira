-- mira - 09 Manager experience
-- Ejecutar después de 08_operational_planning.sql.
-- Exige un perfil identificable y limita datos administrativos para managers.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    new.email
  )
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();
  return new;
end;
$$;

drop policy if exists "company_members_select_member" on public.company_members;
create policy "company_members_select_member"
on public.company_members for select
to authenticated
using (
  public.can_manage_company(company_id)
  or user_id = auth.uid()
);

drop policy if exists "greenhouses_insert_writer" on public.greenhouses;
create policy "greenhouses_insert_writer"
on public.greenhouses for insert
to authenticated
with check (public.can_manage_company(company_id));

drop policy if exists "greenhouses_update_writer" on public.greenhouses;
create policy "greenhouses_update_writer"
on public.greenhouses for update
to authenticated
using (public.can_manage_company(company_id))
with check (public.can_manage_company(company_id));

drop policy if exists "products_insert_writer" on public.products;
create policy "products_insert_writer"
on public.products for insert
to authenticated
with check (public.can_manage_company(company_id));

drop policy if exists "products_update_writer" on public.products;
create policy "products_update_writer"
on public.products for update
to authenticated
using (public.can_manage_company(company_id))
with check (public.can_manage_company(company_id));

drop policy if exists "cost_records_select_member" on public.cost_records;
create policy "cost_records_select_member"
on public.cost_records for select
to authenticated
using (public.can_manage_company(company_id));

drop policy if exists "cost_records_insert_writer" on public.cost_records;
create policy "cost_records_insert_writer"
on public.cost_records for insert
to authenticated
with check (public.can_manage_company(company_id));

drop policy if exists "cost_records_update_writer" on public.cost_records;
create policy "cost_records_update_writer"
on public.cost_records for update
to authenticated
using (public.can_manage_company(company_id))
with check (public.can_manage_company(company_id));
