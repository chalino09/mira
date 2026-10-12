-- Cycle lifecycle, late captures, tenant isolation and history preservation.
-- Run against the complete migration chain. All fixtures are rolled back.
begin;
insert into auth.users (id,email,raw_user_meta_data) values
 ('cc100000-0000-0000-0000-000000000001','cycle-owner@example.test','{}'),
 ('cc100000-0000-0000-0000-000000000002','cycle-manager@example.test','{}'),
 ('cc100000-0000-0000-0000-000000000003','cycle-outsider@example.test','{}');
insert into public.companies (id,name) values ('cc200000-0000-0000-0000-000000000001','Cycle company A'),('cc200000-0000-0000-0000-000000000002','Cycle company B');
insert into public.company_members (company_id,user_id,role,status) values
 ('cc200000-0000-0000-0000-000000000001','cc100000-0000-0000-0000-000000000001','owner','active'),
 ('cc200000-0000-0000-0000-000000000001','cc100000-0000-0000-0000-000000000002','manager','active'),
 ('cc200000-0000-0000-0000-000000000002','cc100000-0000-0000-0000-000000000003','owner','active');
insert into public.greenhouses (id,company_id,name,crop_id,crop_variety,transplant_date,plants_count,manager_user_id) values
 ('cc300000-0000-0000-0000-000000000001','cc200000-0000-0000-0000-000000000001','Already finished','7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1','Old variety',current_date-200,10000,'cc100000-0000-0000-0000-000000000002'),
 ('cc300000-0000-0000-0000-000000000002','cc200000-0000-0000-0000-000000000001','Still producing','7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1','Other variety',current_date-100,9000,null),
 ('cc300000-0000-0000-0000-000000000003','cc200000-0000-0000-0000-000000000002','Other company','7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1','Private variety',current_date-100,8000,null);
select set_config('request.jwt.claim.sub','cc100000-0000-0000-0000-000000000001',true);
set local role authenticated;
do $$
declare old_cycle uuid; new_cycle uuid; old_cost uuid; pending_cost uuid; task_id uuid; record_id uuid; result jsonb;
begin
 select id into strict old_cycle from public.crop_cycles where greenhouse_id='cc300000-0000-0000-0000-000000000001' and status='active';
 insert into public.cost_records (company_id,greenhouse_id,category,amount,occurred_at)
 values ('cc200000-0000-0000-0000-000000000001','cc300000-0000-0000-0000-000000000001','mantenimiento',100,current_date-5) returning id into old_cost;
 if (select crop_cycle_id from public.cost_records where id=old_cost) is distinct from old_cycle then raise exception 'New capture was not assigned to its active cycle'; end if;
 begin
  perform public.close_greenhouse_cycle(old_cycle,null);
  raise exception 'Unconfirmed cycle was closed';
 exception when others then if sqlerrm <> 'Confirma los datos antes de finalizar el ciclo.' then raise; end if; end;
 begin
  perform public.close_greenhouse_cycle(old_cycle,null,true,(select updated_at-interval '1 second' from public.crop_cycles where id=old_cycle));
  raise exception 'Stale reviewed snapshot was closed';
 exception when others then if sqlerrm <> 'Los datos cambiaron. Vuelve a revisar el ciclo antes de finalizarlo.' then raise; end if; end;
 begin
  update public.crop_cycles set status='closed' where id=old_cycle;
  raise exception 'Direct close bypassed confirmation';
 exception when others then if sqlerrm <> 'Confirma los datos antes de finalizar el ciclo.' then raise; end if; end;
 perform public.close_greenhouse_cycle(old_cycle,null,true,(select updated_at from public.crop_cycles where id=old_cycle));
 if (select count(*) from public.crop_cycle_close_audit where crop_cycle_id=old_cycle and action='closed' and actor_id=auth.uid() and confirmed_snapshot->>'variety'='Old variety') <> 1 then raise exception 'Confirmed close snapshot was not audited'; end if;
 begin
  update public.crop_cycles set variety='Overwrite' where id=old_cycle;
  raise exception 'Closed snapshot was edited directly';
 exception when others then if sqlerrm <> 'Los datos de un ciclo finalizado no se pueden editar.' then raise; end if; end;
 begin
  perform public.update_greenhouse_cycle_details(old_cycle,'7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1','Overwrite',current_date-200,10000);
  raise exception 'Closed snapshot was edited by RPC';
 exception when others then if sqlerrm <> 'Los datos de un ciclo finalizado no se pueden editar.' then raise; end if; end;
 begin
  update public.crop_cycles set status='active' where id=old_cycle;
  raise exception 'Closed cycle was reopened';
 exception when others then if sqlerrm <> 'Los datos de un ciclo finalizado no se pueden editar.' then raise; end if; end;
 begin
  update public.crop_cycles set ended_at=current_date-15 where id=old_cycle;
  raise exception 'Direct correction bypassed audit';
 exception when others then if sqlerrm <> 'Ajusta el cierre con un motivo para conservar la auditoría.' then raise; end if; end;
 begin
  delete from public.crop_cycle_close_audit where crop_cycle_id=old_cycle;
  raise exception 'Audit was deleted';
 exception when insufficient_privilege then null; end;
 begin
  update public.crop_cycle_close_audit set actor_name='Forged';
  raise exception 'Audit was edited';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.crop_cycle_close_audit select * from public.crop_cycle_close_audit;
  raise exception 'Audit was forged';
 exception when insufficient_privilege then null; end;
 if (select status from public.crop_cycles where id=old_cycle)<>'closed' or (select ended_at from public.crop_cycles where id=old_cycle) is not null then raise exception 'Unknown close must be supported without inventing a date'; end if;
 if (select status from public.crop_cycles where greenhouse_id='cc300000-0000-0000-0000-000000000002') <> 'active' then raise exception 'Closing one greenhouse affected another'; end if;
 insert into public.cost_records (company_id,greenhouse_id,category,amount,occurred_at)
 values ('cc200000-0000-0000-0000-000000000001','cc300000-0000-0000-0000-000000000001','mantenimiento',75,current_date-4) returning id into pending_cost;
 if (select crop_cycle_id from public.cost_records where id=pending_cost) is not null then raise exception 'Unknown historical boundary must remain pending'; end if;
 new_cycle := public.start_greenhouse_cycle('cc300000-0000-0000-0000-000000000001','7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1','New variety',current_date,12000);
 if (select variety from public.crop_cycles where id=old_cycle)<>'Old variety' or (select plants_count from public.crop_cycles where id=old_cycle)<>10000 then raise exception 'Starting a cycle overwrote history'; end if;
 if (select crop_variety from public.greenhouses where id='cc300000-0000-0000-0000-000000000001')<>'New variety' then raise exception 'Operational context was not updated'; end if;
 update public.cost_records set notes='Late correction' where id=old_cost;
 if (select crop_cycle_id from public.cost_records where id=old_cost) is distinct from old_cycle then raise exception 'Editing an old capture moved it to the new cycle'; end if;
 perform public.assign_records_to_cycle(old_cycle,'cost_records',array[pending_cost]);
 if (select crop_cycle_id from public.cost_records where id=pending_cost) is distinct from old_cycle then raise exception 'Manual assignment failed'; end if;
 result := public.create_unplanned_work('cc200000-0000-0000-0000-000000000001','cc300000-0000-0000-0000-000000000001','cosecha','Late harvest',current_date-3,jsonb_build_object('cropCycleId',old_cycle));
 task_id := (result->>'workId')::uuid;
 insert into public.cost_records (company_id,greenhouse_id,category,amount,occurred_at,source_work_id) values ('cc200000-0000-0000-0000-000000000001','cc300000-0000-0000-0000-000000000001','mantenimiento',25,current_date,task_id) returning id into old_cost;
 if (select crop_cycle_id from public.cost_records where id=old_cost) is distinct from old_cycle then raise exception 'Work-derived cost did not inherit the source cycle'; end if;
 result := public.complete_harvest_task(target_task_id=>task_id,target_occurred_at=>current_date-3,target_kilograms=>200,target_box_count=>10,target_box_weight_kg=>20,target_first_quality_boxes=>10,target_first_quality_price=>100);
 record_id := (result->>'recordId')::uuid;
 if (select crop_cycle_id from public.harvest_records where id=record_id) is distinct from old_cycle then raise exception 'Technical completion did not inherit explicit source cycle'; end if;
 perform public.upsert_harvest_sale(target_harvest_record_id=>record_id,target_buyer_name=>'Cycle test buyer',target_occurred_at=>current_date,target_lines=>'[{"quality":"Primera","boxCount":10,"grossPricePerBox":100}]');
 result := public.get_cycle_operational_aggregates('cc200000-0000-0000-0000-000000000001','cc300000-0000-0000-0000-000000000001',null,null,old_cycle);
 if (result->>'totalCost')::numeric <> 200 or (result->>'totalHarvestKg')::numeric <> 200 then raise exception 'Scoped totals mixed cycles or omitted late captures: %',result; end if;
 result := public.get_cycle_operational_aggregates('cc200000-0000-0000-0000-000000000001','cc300000-0000-0000-0000-000000000001',null,null,new_cycle);
 if (result->>'totalCost')::numeric <> 0 or (result->>'totalHarvestKg')::numeric <> 0 then raise exception 'New cycle includes historical totals'; end if;
 begin
  perform public.start_greenhouse_cycle('cc300000-0000-0000-0000-000000000001','7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1','Duplicate',current_date,1000);
  raise exception 'Unexpected duplicate active cycle';
 exception when others then if sqlerrm <> 'Finaliza el ciclo actual antes de iniciar otro.' then raise; end if; end;
 begin
  perform public.assign_records_to_cycle(old_cycle,'cost_records',array['cc900000-0000-0000-0000-000000000009'::uuid]);
  raise exception 'Unexpected assignment of inaccessible row';
 exception when others then if sqlerrm <> 'Algunos registros no pertenecen a este invernadero.' then raise; end if; end;
 begin
  perform public.assign_records_to_cycle(old_cycle,'company_members',array[old_cost]);
  raise exception 'Unexpected assignment table';
 exception when others then if sqlerrm <> 'Tipo de registro inválido.' then raise; end if; end;
 begin
  perform public.adjust_greenhouse_cycle_close(old_cycle,current_date-15,' ',(select updated_at from public.crop_cycles where id=old_cycle));
  raise exception 'Missing correction reason accepted';
 exception when others then if sqlerrm <> 'Escribe un motivo de entre 5 y 1000 caracteres.' then raise; end if; end;
 begin
  perform public.adjust_greenhouse_cycle_close(old_cycle,current_date,'Fecha confirmada con encargado',(select updated_at from public.crop_cycles where id=old_cycle));
  raise exception 'Correction overlaps next cycle';
 exception when others then if sqlerrm <> 'El cierre debe ser anterior al inicio del siguiente ciclo.' then raise; end if; end;
 perform public.adjust_greenhouse_cycle_close(old_cycle,current_date-15,'Fecha confirmada con encargado',(select updated_at from public.crop_cycles where id=old_cycle));
 if (select count(*) from public.crop_cycle_close_audit where crop_cycle_id=old_cycle)<>2 then raise exception 'Adjustment audit missing or failed actions were audited'; end if;
 if not exists(select 1 from public.crop_cycle_close_audit where crop_cycle_id=old_cycle and action='close_adjusted' and previous_end is null and new_end=current_date-15 and reason='Fecha confirmada con encargado' and actor_id=auth.uid()) then raise exception 'Adjustment did not preserve before/after/reason/actor'; end if;
 if (select confirmed_snapshot->>'ended_at' from public.crop_cycle_close_audit where crop_cycle_id=old_cycle and action='closed') is not null then raise exception 'Adjustment rewrote original confirmed snapshot'; end if;
 begin
  perform public.adjust_greenhouse_cycle_close(old_cycle,current_date-16,'Corrección concurrente',(select updated_at-interval '1 second' from public.crop_cycles where id=old_cycle));
  raise exception 'Stale correction accepted';
 exception when others then if sqlerrm <> 'El cierre cambió. Vuelve a revisar el ciclo.' then raise; end if; end;
 perform public.adjust_greenhouse_cycle_close(old_cycle,null,'La fecha requiere verificación',(select updated_at from public.crop_cycles where id=old_cycle));
 if (select count(*) from public.crop_cycle_close_audit where crop_cycle_id=old_cycle and previous_end=current_date-15 and new_end is null)<>1 then raise exception 'Unknown date correction was not audited'; end if;
 perform public.adjust_greenhouse_cycle_close(old_cycle,current_date-15,'Fecha confirmada con encargado',(select updated_at from public.crop_cycles where id=old_cycle));
 if (select ended_at from public.crop_cycles where id=old_cycle)<>current_date-15 then raise exception 'Confirming an unknown close failed'; end if;
 -- A real audit in an unassigned area must remain invisible to its manager.
 perform public.close_greenhouse_cycle((select id from public.crop_cycles where greenhouse_id='cc300000-0000-0000-0000-000000000002'),current_date,true,(select updated_at from public.crop_cycles where greenhouse_id='cc300000-0000-0000-0000-000000000002'));
end $$;
reset role;
select set_config('request.jwt.claim.sub','cc100000-0000-0000-0000-000000000003',true);
set local role authenticated;
do $$
declare c public.crop_cycles;
begin
 select * into strict c from public.crop_cycles where greenhouse_id='cc300000-0000-0000-0000-000000000003';
 perform public.close_greenhouse_cycle(c.id,current_date,true,c.updated_at);
 if (select count(*) from public.crop_cycle_close_audit)<>1 then raise exception 'Outsider can read another tenant audit'; end if;
 begin
  perform public.adjust_greenhouse_cycle_close((select id from public.crop_cycles where greenhouse_id='cc300000-0000-0000-0000-000000000001'),null,'Cross company correction',null);
  raise exception 'Outsider adjusted another tenant close';
 exception when others then if sqlerrm <> 'No tienes permiso para ajustar este cierre.' then raise; end if; end;
end $$;
reset role;
do $$ begin
 if has_table_privilege('anon','public.crop_cycle_close_audit','SELECT') or has_table_privilege('authenticated','public.crop_cycle_close_audit','INSERT') or has_table_privilege('authenticated','public.crop_cycle_close_audit','UPDATE') or has_table_privilege('authenticated','public.crop_cycle_close_audit','DELETE') then raise exception 'Audit privileges permit unauthenticated reads or client writes'; end if;
 if has_function_privilege('anon','public.adjust_greenhouse_cycle_close(uuid,date,text,timestamptz)','EXECUTE') or has_function_privilege('authenticated','cycle_internal.audit_cycle_close()','EXECUTE') then raise exception 'Audit functions have excessive privileges'; end if;
end $$;
select set_config('request.jwt.claim.sub','cc100000-0000-0000-0000-000000000002',true);
set local role authenticated;
do $$
declare cycle_id uuid;
begin
 if exists (select 1 from public.crop_cycle_close_audit where greenhouse_id in ('cc300000-0000-0000-0000-000000000003','cc300000-0000-0000-0000-000000000002')) then raise exception 'Manager can read out-of-scope audit'; end if;
 if not exists (select 1 from public.crop_cycle_close_audit where greenhouse_id='cc300000-0000-0000-0000-000000000001') then raise exception 'Assigned manager cannot read audit'; end if;
 if exists (select 1 from public.crop_cycles where greenhouse_id='cc300000-0000-0000-0000-000000000003') then raise exception 'Manager can read another company cycle'; end if;
 if exists (select 1 from public.crop_cycles where greenhouse_id='cc300000-0000-0000-0000-000000000002') then raise exception 'Manager can read an unassigned greenhouse'; end if;
 select id into strict cycle_id from public.crop_cycles where greenhouse_id='cc300000-0000-0000-0000-000000000001' and status='active';
 begin
  perform public.close_greenhouse_cycle(cycle_id,null);
  raise exception 'Manager may not close cycles';
 exception when others then if sqlerrm <> 'No tienes permiso para administrar ciclos.' then raise; end if; end;
 begin
  update public.crop_cycles set variety='Unauthorized' where id=cycle_id;
  if found then raise exception 'Manager may not update cycle snapshots'; end if;
 end;
 begin
  perform public.adjust_greenhouse_cycle_close((select id from public.crop_cycles where greenhouse_id='cc300000-0000-0000-0000-000000000001' and status='closed'),current_date-10,'Unauthorized correction',null);
  raise exception 'Manager adjusted close';
 exception when others then if sqlerrm <> 'No tienes permiso para ajustar este cierre.' then raise; end if; end;
 perform public.get_greenhouse_cycle_totals('cc300000-0000-0000-0000-000000000001');
end $$;
reset role;
rollback;
