alter type public.cost_category add value if not exists 'preparacion_terreno_maquinaria';
alter type public.cost_category add value if not exists 'analisis_laboratorio';
alter type public.cost_category add value if not exists 'material_vegetal';
alter type public.cost_category add value if not exists 'polinizacion';

do $$
begin
  if to_regclass('public.harvest_sales') is not null then
    alter table public.harvest_sales add column if not exists packaging_amount numeric(14,2) not null default 0;
  end if;
  if to_regclass('public.harvest_sale_lines') is not null then
    alter table public.harvest_sale_lines add column if not exists packaging_per_box numeric(14,4) not null default 0;
  end if;
end;
$$;
