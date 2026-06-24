-- mira - 18 Assigned task greenhouse visibility
-- Ejecutar después de 17_nutrition_monitoring.sql.
-- Permite que un encargado vea el nombre del invernadero de actividades que tiene asignadas.

drop policy if exists "greenhouses_select_scoped" on public.greenhouses;
create policy "greenhouses_select_scoped"
on public.greenhouses for select
to authenticated
using (
  public.can_manage_company(company_id)
  or manager_user_id = auth.uid()
  or exists (
    select 1
    from public.tasks task
    join public.task_assignments assignment
      on assignment.task_id = task.id
     and assignment.company_id = task.company_id
    where task.company_id = greenhouses.company_id
      and task.greenhouse_id = greenhouses.id
      and assignment.user_id = auth.uid()
  )
);
