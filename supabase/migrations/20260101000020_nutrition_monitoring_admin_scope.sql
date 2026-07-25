-- mira - 20 Nutrition monitoring admin scope
-- Ejecutar después de 19_telegram_operational_sessions.sql.
-- Restringe el módulo de monitoreo nutrimental a owner/admin.

drop policy if exists "nutrition_monitoring_events_select_scoped" on public.nutrition_monitoring_events;
drop policy if exists "nutrition_monitoring_events_select_managerial" on public.nutrition_monitoring_events;
create policy "nutrition_monitoring_events_select_managerial"
on public.nutrition_monitoring_events for select
to authenticated
using (public.can_manage_company(company_id));

drop policy if exists "nutrition_monitoring_events_insert_scoped" on public.nutrition_monitoring_events;
drop policy if exists "nutrition_monitoring_events_insert_managerial" on public.nutrition_monitoring_events;
create policy "nutrition_monitoring_events_insert_managerial"
on public.nutrition_monitoring_events for insert
to authenticated
with check (public.can_manage_company(company_id));

drop policy if exists "nutrition_monitoring_events_update_scoped" on public.nutrition_monitoring_events;
drop policy if exists "nutrition_monitoring_events_update_managerial" on public.nutrition_monitoring_events;
create policy "nutrition_monitoring_events_update_managerial"
on public.nutrition_monitoring_events for update
to authenticated
using (public.can_manage_company(company_id))
with check (public.can_manage_company(company_id));

drop policy if exists "nutrition_monitoring_events_delete_owner_admin" on public.nutrition_monitoring_events;
drop policy if exists "nutrition_monitoring_events_delete_managerial" on public.nutrition_monitoring_events;
create policy "nutrition_monitoring_events_delete_managerial"
on public.nutrition_monitoring_events for delete
to authenticated
using (public.can_manage_company(company_id));

drop policy if exists "nutrition_monitoring_values_select_scoped" on public.nutrition_monitoring_values;
drop policy if exists "nutrition_monitoring_values_select_managerial" on public.nutrition_monitoring_values;
create policy "nutrition_monitoring_values_select_managerial"
on public.nutrition_monitoring_values for select
to authenticated
using (public.can_manage_company(company_id));

drop policy if exists "nutrition_monitoring_values_insert_scoped" on public.nutrition_monitoring_values;
drop policy if exists "nutrition_monitoring_values_insert_managerial" on public.nutrition_monitoring_values;
create policy "nutrition_monitoring_values_insert_managerial"
on public.nutrition_monitoring_values for insert
to authenticated
with check (public.can_manage_company(company_id));

drop policy if exists "nutrition_monitoring_values_update_scoped" on public.nutrition_monitoring_values;
drop policy if exists "nutrition_monitoring_values_update_managerial" on public.nutrition_monitoring_values;
create policy "nutrition_monitoring_values_update_managerial"
on public.nutrition_monitoring_values for update
to authenticated
using (public.can_manage_company(company_id))
with check (public.can_manage_company(company_id));

drop policy if exists "nutrition_monitoring_observations_select_scoped" on public.nutrition_monitoring_observations;
drop policy if exists "nutrition_monitoring_observations_select_managerial" on public.nutrition_monitoring_observations;
create policy "nutrition_monitoring_observations_select_managerial"
on public.nutrition_monitoring_observations for select
to authenticated
using (public.can_manage_company(company_id));

drop policy if exists "nutrition_monitoring_observations_insert_scoped" on public.nutrition_monitoring_observations;
drop policy if exists "nutrition_monitoring_observations_insert_managerial" on public.nutrition_monitoring_observations;
create policy "nutrition_monitoring_observations_insert_managerial"
on public.nutrition_monitoring_observations for insert
to authenticated
with check (public.can_manage_company(company_id));

drop policy if exists "nutrition_monitoring_observations_update_scoped" on public.nutrition_monitoring_observations;
drop policy if exists "nutrition_monitoring_observations_update_managerial" on public.nutrition_monitoring_observations;
create policy "nutrition_monitoring_observations_update_managerial"
on public.nutrition_monitoring_observations for update
to authenticated
using (public.can_manage_company(company_id))
with check (public.can_manage_company(company_id));
