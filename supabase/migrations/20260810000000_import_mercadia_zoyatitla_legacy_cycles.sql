-- Importación única: Mercadia AG / Zoyatitla / ciclos Villa 2025 y Strogton 2026.
-- Fuente: PRODUCCION ZOYATTLA.xlsx. No es un motor de importación.
-- Decisiones confirmadas: cajas de 20 kg, ventas cobradas, servicio fumigadora 2026-03-11.
-- Las 127 cajas de Villa y 69 cajas de Strogton sin precio quedan como cosecha pendiente de venta.

begin;

do $$
declare
  target_company_id uuid;
  target_greenhouse_id uuid;
  tomato_id uuid;
  active_cycle_id uuid;
begin
  select company.id, greenhouse.id
    into target_company_id, target_greenhouse_id
  from public.companies company
  join public.greenhouses greenhouse on greenhouse.company_id = company.id
  where company.slug = 'mercadia-ag'
    and public.route_slug(greenhouse.name) = 'zoyatitla'
    and greenhouse.is_active
  limit 1;

  if target_company_id is null or target_greenhouse_id is null then
    raise exception 'mercadia_zoyatitla_not_found';
  end if;

  select id into tomato_id from public.crops where slug = 'jitomate' limit 1;
  if tomato_id is null then
    raise exception 'jitomate_crop_not_found';
  end if;

  if not exists (
    select 1 from public.crop_cycles
    where company_id = target_company_id and greenhouse_id = target_greenhouse_id
      and variety = 'Villa' and transplant_date = '2025-07-30'
  ) then
    insert into public.crop_cycles (
      company_id, greenhouse_id, crop_id, variety, transplant_date, stem_count,
      status, started_at, ended_at, notes
    ) values (
      target_company_id, target_greenhouse_id, tomato_id, 'Villa', '2025-07-30', 2,
      'closed', '2025-07-30', '2025-11-12', 'Ciclo histórico importado desde PRODUCCION ZOYATTLA.xlsx'
    );
  end if;

  select id into active_cycle_id from public.crop_cycles
  where company_id = target_company_id and greenhouse_id = target_greenhouse_id and status = 'active'
  limit 1;

  if active_cycle_id is null then
    insert into public.crop_cycles (
      company_id, greenhouse_id, crop_id, variety, transplant_date, stem_count,
      status, started_at, notes
    ) values (
      target_company_id, target_greenhouse_id, tomato_id, 'Strogton', '2026-04-20', 2,
      'active', '2026-04-20', 'Ciclo histórico importado desde PRODUCCION ZOYATTLA.xlsx'
    );
  end if;
end;
$$;

with target as (
  select company.id as company_id, greenhouse.id as greenhouse_id
  from public.companies company
  join public.greenhouses greenhouse on greenhouse.company_id = company.id
  where company.slug = 'mercadia-ag' and public.route_slug(greenhouse.name) = 'zoyatitla' and greenhouse.is_active
), legacy_costs (
  occurred_at, quantity, unit, concept, unit_price, amount, category, legacy_group, source_reference
) as (
values
  ('2026-03-21'::date, 1, 'LOTE', 'TRABAJO DE YUNTA', 5000, 5000, 'mantenimiento'::public.cost_category, 'teza', 'zoyatitla-legacy:trabajo-terreno:3'),
  ('2026-04-22'::date, 2, 'CAJAS', 'ABEJORROS', 2225, 4450, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:abejorros:2'),
  ('2026-04-20'::date, 9088, 'PIEZA', 'PLANTULA DOBLE TALLO STROGTON', 5.8, 52710.4, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:plantula:5'),
  ('2026-03-21'::date, 1, 'LOTE', 'ANTICIPO DE LUZ', 711.5, 711.5, 'energia'::public.cost_category, 'teza', 'zoyatitla-legacy:electricidad:2'),
  ('2026-03-26'::date, 1, 'LOTE', 'ARREGLO DE LUZ   (MARCOS CORTES)', 200, 200, 'energia'::public.cost_category, 'teza', 'zoyatitla-legacy:electricidad:3'),
  ('2025-07-03'::date, 1, 'LOTE', 'LUZ', 329, 329, 'energia'::public.cost_category, 'teza', 'zoyatitla-legacy:electricidad:4'),
  ('2026-03-14'::date, 1, 'LOTE', 'NOMINA', 1433, 1433, 'mano_obra'::public.cost_category, 'teza', 'zoyatitla-legacy:nomina:3'),
  ('2026-03-21'::date, 1, 'LOTE', 'NOMINA', 2150, 2150, 'mano_obra'::public.cost_category, 'teza', 'zoyatitla-legacy:nomina:4'),
  ('2026-03-28'::date, 1, 'LOTE', 'NOMINA', 3250, 3250, 'mano_obra'::public.cost_category, 'teza', 'zoyatitla-legacy:nomina:5'),
  ('2026-04-02'::date, 1, 'LOTE', 'NOMINA', 3584, 3584, 'mano_obra'::public.cost_category, 'teza', 'zoyatitla-legacy:nomina:6'),
  ('2026-04-11'::date, 1, 'LOTE', 'NOMINA', 2267, 2267, 'mano_obra'::public.cost_category, 'teza', 'zoyatitla-legacy:nomina:7'),
  ('2026-04-18'::date, 1, 'LOTE', 'NOMINA', 2850, 2850, 'mano_obra'::public.cost_category, 'teza', 'zoyatitla-legacy:nomina:8'),
  ('2026-04-25'::date, 1, 'LOTE', 'NOMINA', 2700, 2700, 'mano_obra'::public.cost_category, 'teza', 'zoyatitla-legacy:nomina:9'),
  ('2026-05-02'::date, 1, 'LOTE', 'NOMINA', 5812, 5812, 'mano_obra'::public.cost_category, 'teza', 'zoyatitla-legacy:nomina:10'),
  ('2026-05-08'::date, 1, 'LOTE', 'NOMINA', 5650, 5650, 'mano_obra'::public.cost_category, 'teza', 'zoyatitla-legacy:nomina:11'),
  ('2026-05-15'::date, 1, 'LOTE', 'NOMINA', 3115, 3115, 'mano_obra'::public.cost_category, 'teza', 'zoyatitla-legacy:nomina:12'),
  ('2026-05-23'::date, 1, 'LOTE', 'NOMINA', 5650, 5650, 'mano_obra'::public.cost_category, 'teza', 'zoyatitla-legacy:nomina:13'),
  ('2026-05-27'::date, 1, 'LOTE', 'NOMINA', 4958, 4958, 'mano_obra'::public.cost_category, 'teza', 'zoyatitla-legacy:nomina:14'),
  ('2026-06-06'::date, 1, 'LOTE', 'NOMINA', 5563, 5563, 'mano_obra'::public.cost_category, 'teza', 'zoyatitla-legacy:nomina:15'),
  ('2026-06-20'::date, 1, 'LOTE', 'NOMINA', 4690, 4690, 'mano_obra'::public.cost_category, 'teza', 'zoyatitla-legacy:nomina:16'),
  ('2026-06-27'::date, 1, 'LOTE', 'NOMINA', 7300, 7300, 'mano_obra'::public.cost_category, 'teza', 'zoyatitla-legacy:nomina:17'),
  ('2026-07-04'::date, 1, 'LOTE', 'NOMINA', 8500, 8500, 'mano_obra'::public.cost_category, 'teza', 'zoyatitla-legacy:nomina:18'),
  ('2026-07-11'::date, 1, 'LOTE', 'NOMINA', 11500, 11500, 'mano_obra'::public.cost_category, 'teza', 'zoyatitla-legacy:nomina:19'),
  ('2026-07-17'::date, 1, 'LOTE', 'NOMINA', 5075, 5075, 'mano_obra'::public.cost_category, 'teza', 'zoyatitla-legacy:nomina:20'),
  ('2026-07-25'::date, 1, 'LOTE', 'NOMINA', 15300, 15300, 'mano_obra'::public.cost_category, 'teza', 'zoyatitla-legacy:nomina:21'),
  ('2026-08-01'::date, 1, 'LOTE', 'NOMINA', 7558, 7558, 'mano_obra'::public.cost_category, 'teza', 'zoyatitla-legacy:nomina:22'),
  ('2026-03-11'::date, 1, 'LOTE', 'SERVICIO FUMIGADORA', 874, 874, 'mantenimiento'::public.cost_category, 'teza', 'zoyatitla-legacy:servicio-fumigadora:2'),
  ('2026-03-11'::date, 1, 'LOTE', 'REPARACION DE PLASTICO ZOYATITLA', 800, 800, 'mantenimiento'::public.cost_category, 'teza', 'zoyatitla-legacy:reparacion-invernadero:3'),
  ('2026-03-11'::date, 1, 'LOTE', 'COLOCACION PLASTICO 6.20 X 80 M', 2700, 2700, 'mantenimiento'::public.cost_category, 'teza', 'zoyatitla-legacy:reparacion-invernadero:4'),
  ('2026-04-02'::date, 1, 'LOTE', 'GASOLINA', 125, 125, 'gasolina'::public.cost_category, 'teza', 'zoyatitla-legacy:gasolina:3'),
  ('2026-04-21'::date, 1, 'LOTE', 'GASOLINA', 185.83, 185.83, 'gasolina'::public.cost_category, 'teza', 'zoyatitla-legacy:gasolina:4'),
  ('2026-05-01'::date, 20, 'LITRO', 'GASOLINA', 24, 480, 'gasolina'::public.cost_category, 'teza', 'zoyatitla-legacy:gasolina:5'),
  ('2026-05-08'::date, 20, 'LITRO', 'GASOLINA', 24, 480, 'gasolina'::public.cost_category, 'teza', 'zoyatitla-legacy:gasolina:6'),
  ('2026-05-16'::date, 6.666, 'LITRO', 'GASOLINA', 24, 159.98, 'gasolina'::public.cost_category, 'teza', 'zoyatitla-legacy:gasolina:7'),
  ('2026-05-26'::date, 9.5, 'LITRO', 'GASOLINA', 24, 228, 'gasolina'::public.cost_category, 'teza', 'zoyatitla-legacy:gasolina:8'),
  ('2026-06-04'::date, 11.46, 'LITRO', 'GASOLINA', 24, 275.04, 'gasolina'::public.cost_category, 'teza', 'zoyatitla-legacy:gasolina:9'),
  ('2026-06-18'::date, 21.473, 'LITRO', 'GASOLINA', 24, 515.35, 'gasolina'::public.cost_category, 'teza', 'zoyatitla-legacy:gasolina:10'),
  ('2026-07-03'::date, 20, 'LITRO', 'GASOLINA', 24, 480, 'gasolina'::public.cost_category, 'teza', 'zoyatitla-legacy:gasolina:11'),
  ('2026-07-10'::date, 20, 'LITRO', 'GASOLINA', 24, 480, 'gasolina'::public.cost_category, 'teza', 'zoyatitla-legacy:gasolina:12'),
  ('2026-07-18'::date, 22.676, 'LITRO', 'GASOLINA', 24, 544.22, 'gasolina'::public.cost_category, 'teza', 'zoyatitla-legacy:gasolina:13'),
  ('2026-07-25'::date, 22.515, 'LITRO', 'GASOLINA', 23.984011, 540, 'gasolina'::public.cost_category, 'teza', 'zoyatitla-legacy:gasolina:14'),
  ('2026-03-11'::date, 2, 'BULTO', 'ROCA POTASICA 50 KG', 271, 542, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:2'),
  ('2026-03-11'::date, 2, 'BULTO', 'LEONARDITA 25 KG', 195, 390, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:3'),
  ('2026-03-11'::date, 2, 'BULTO', 'MAGNESITA 25 KG', 143, 286, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:4'),
  ('2026-03-11'::date, 5, 'BULTO', 'SULFATO DE CALCIO 50 KG', 197, 985, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:5'),
  ('2026-03-11'::date, 4, 'BULTO', 'ROCA FOSFORICA 25 KG', 165, 660, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:6'),
  ('2026-03-11'::date, 8, 'BULTO', 'DOLOMITA 25 KG', 102, 816, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:7'),
  ('2026-03-11'::date, 5, 'BULTO', 'DOLOMITA 25 KG', 102, 510, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:8'),
  ('2026-03-11'::date, 1, 'BULTO', 'ZEOFERT 25 KG', 193, 193, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:9'),
  ('2026-04-07'::date, 1, 'PIEZA', 'VOLTAN 1 KG', 585.65, 585.65, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:10'),
  ('2026-04-07'::date, 2, 'PIEZA', 'APOLO 1 KG', 998.75, 1997.5, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:11'),
  ('2026-04-07'::date, 1, 'PIEZA', 'SUPRA ROOT 1 5 L', 1385.5, 1385.5, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:12'),
  ('2026-04-07'::date, 1, 'PIEZA', 'PLAS + STRES 1 L', 501.5, 501.5, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:13'),
  ('2026-04-07'::date, 5, 'PIEZA', 'PEPTON 1 KG', 505.75, 2528.75, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:14'),
  ('2026-04-07'::date, 1, 'PIEZA', 'BIO ROOT 1 L', 392.03, 392.03, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:15'),
  ('2026-04-10'::date, 1, 'BULTO', 'SOP 25 KG', 562, 562, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:16'),
  ('2026-04-10'::date, 1, 'BULTO', 'MAP 25 KG', 831, 831, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:17'),
  ('2026-04-10'::date, 1, 'BULTO', 'SULMAG 50 KG', 360, 360, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:18'),
  ('2026-04-10'::date, 1, 'BULTO', 'NCA 25 KG', 333, 333, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:19'),
  ('2026-04-10'::date, 1, 'BULTO', 'NKS 25 KG', 702, 702, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:20'),
  ('2026-04-21'::date, 1, 'PIEZA', 'COMODORO 5 L', 3655, 3655, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:21'),
  ('2026-04-21'::date, 1, 'PIEZA', 'EDAFOS 1 L', 1062.5, 1062.5, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:22'),
  ('2026-04-21'::date, 2, 'PIEZA', 'APOLO 1 KG', 1196.5, 2393, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:23'),
  ('2026-04-21'::date, 1, 'PIEZA', 'POWER MIX 1 L', 389.3, 389.3, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:24'),
  ('2026-04-21'::date, 1, 'PIEZA', 'NKS 25 KG', 702, 702, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:25'),
  ('2026-04-21'::date, 1, 'PIEZA', 'SOP 25 KG', 562, 562, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:26'),
  ('2026-04-21'::date, 1, 'PIEZA', 'MAP 25 KG', 831, 831, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:27'),
  ('2026-04-21'::date, 1, 'PIEZA', 'PLAS + BORO 1 L', 250.75, 250.75, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:28'),
  ('2026-04-21'::date, 1, 'PIEZA', 'SULMAG 50 KG', 360, 360, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:29'),
  ('2026-04-21'::date, 1, 'PIEZA', 'NCA 25 KG', 333, 333, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:30'),
  ('2026-04-21'::date, 1, 'PIEZA', 'KONTRA S-3 1 L', 425, 425, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:31'),
  ('2026-04-21'::date, 1, 'PIEZA', 'XP- 1 1 L', 395.25, 395.25, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:32'),
  ('2026-04-24'::date, 1, 'PIEZA', 'AGRIBAT 20 L', 2540, 2540, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:33'),
  ('2026-04-24'::date, 2, 'PIEZA', 'BIOEVES 1 L', 463.25, 926.5, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:34'),
  ('2026-04-24'::date, 3, 'PIEZA', 'BIO ROOT 1 L', 348.5, 1045.5, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:35'),
  ('2026-05-07'::date, 1, 'BULTO', 'MAP 25 KG', 831, 831, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:36'),
  ('2026-05-07'::date, 1, 'BULTO', 'FOSFONITRATO PACIFEX 25 KG', 385, 385, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:37'),
  ('2026-05-07'::date, 1, 'BULTO', 'NCA 25 KG', 333, 333, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:38'),
  ('2026-05-08'::date, 1, 'PIEZA', 'SIVANTO 1 L', 1700, 1700, 'agroinsumos'::public.cost_category, 'quimico', 'zoyatitla-legacy:insumo:39'),
  ('2026-05-08'::date, 4, 'PIEZA', 'ALFA 250 ML', 220, 880, 'agroinsumos'::public.cost_category, 'quimico', 'zoyatitla-legacy:insumo:40'),
  ('2026-05-16'::date, 1, 'PIEZA', 'POWER MIX 1 L', 389.3, 389.3, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:41'),
  ('2026-05-16'::date, 1, 'PIEZA', 'SUPRA HORMONAL 1 L', 774.35, 774.35, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:42'),
  ('2026-05-16'::date, 1, 'PIEZA', 'AGRIBAT 1 L', 140.25, 140.25, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:43'),
  ('2026-05-16'::date, 1, 'PIEZA', 'PLAS+ BORO 1 L', 250.75, 250.75, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:44'),
  ('2026-05-16'::date, 1, 'PIEZA', 'LIVING X6 FE 1 KG', 239.7, 239.7, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:45'),
  ('2026-05-16'::date, 1, 'PIEZA', 'LIVING X6 ZN 1 KG', 365.5, 365.5, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:46'),
  ('2026-05-16'::date, 1, 'PIEZA', 'FULVIPOWER 95 1 KG', 240.55, 240.55, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:47'),
  ('2026-05-16'::date, 1, 'PIEZA', 'ORTHO P FLORACION 1 L', 354.45, 354.45, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:48'),
  ('2026-05-16'::date, 1, 'PIEZA', 'XP -1 1 L', 395.25, 395.25, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:49'),
  ('2026-05-16'::date, 1, 'PIEZA', 'BIO ROOT 1 L', 348.5, 348.5, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:50'),
  ('2026-05-16'::date, 1, 'PIEZA', 'LARREA CITRIC 1 L', 338.3, 338.3, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:51'),
  ('2026-05-16'::date, 1, 'PIEZA', 'AGRIBAT 5 L', 654.5, 654.5, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:52'),
  ('2026-05-27'::date, 1, 'PIEZA', 'STRIKE 1 KG', 400, 400, 'agroinsumos'::public.cost_category, 'quimico', 'zoyatitla-legacy:insumo:53'),
  ('2026-05-27'::date, 1, 'BULTO', 'MKP 25 KG', 1041, 1041, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:54'),
  ('2026-05-27'::date, 1, 'BULTO', 'SULMAG 50 KG', 360, 360, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:55'),
  ('2026-05-27'::date, 1, 'BULTO', 'NCA 25 KG', 333, 333, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:56'),
  ('2026-05-30'::date, 2, 'PIEZA', 'POWER MIX 1 L', 389.3, 778.6, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:57'),
  ('2026-05-30'::date, 1, 'BULTO', 'NKS 25 KG', 702, 702, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:58'),
  ('2026-05-30'::date, 2, 'BULTO', 'NCA 25 KG', 333, 666, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:59'),
  ('2026-05-30'::date, 20, 'LITRO', 'SUPRA ENGORDE', 204.85, 4097, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:60'),
  ('2026-05-30'::date, 1, 'PIEZA', 'GRAMMIT 1 KG', 1420.35, 1420.35, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:61'),
  ('2026-05-30'::date, 1, 'PIEZA', 'SUPRA ROOT 1 L', 351.9, 351.9, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:62'),
  ('2026-05-30'::date, 1, 'PIEZA', 'PEPTON 1 KG', 505.75, 505.75, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:63'),
  ('2026-05-30'::date, 1, 'PIEZA', 'FULVIPOWER 95 1 KG', 240.55, 240.55, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:64'),
  ('2026-05-30'::date, 1, 'PIEZA', 'K-45 SP 1 L', 195.5, 195.5, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:65'),
  ('2026-05-30'::date, 1, 'PIEZA', 'LARREA CITRIC 1 L', 338.3, 338.3, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:66'),
  ('2026-06-01'::date, 1, 'PIEZA', 'SUPRA ROOT 5 L', 1661.75, 1661.75, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:67'),
  ('2026-06-01'::date, 1, 'PIEZA', 'FULVIPOWER 95 1 KG', 240.55, 240.55, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:68'),
  ('2026-06-04'::date, 1, 'PIEZA', 'AGRIBAT 5 L', 654.5, 654.5, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:69'),
  ('2026-06-04'::date, 2, 'PIEZA', 'PECTA CA 1 L', 268.6, 537.2, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:70'),
  ('2026-06-04'::date, 1, 'PIEZA', 'ALFA 250 ML', 220, 220, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:71'),
  ('2026-06-04'::date, 1, 'PIEZA', 'K-3', 340, 340, 'agroinsumos'::public.cost_category, 'quimico', 'zoyatitla-legacy:insumo:72'),
  ('2026-06-04'::date, 6, 'PIEZA', 'SUPRA CA 1 L', 227.8, 1366.8, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:73'),
  ('2026-06-04'::date, 1, 'PIEZA', 'SILEX 1 L', 306, 306, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:74'),
  ('2026-06-04'::date, 1, 'PIEZA', 'NKS 25 KG', 702, 702, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:75'),
  ('2026-06-04'::date, 1, 'PIEZA', 'SOP 25 KG', 562, 562, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:76'),
  ('2026-06-04'::date, 2, 'PIEZA', 'LIVING X6 1 KG', 239.7, 479.4, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:77'),
  ('2026-06-04'::date, 2, 'PIEZA', 'LIVING 1KG', 365.5, 731, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:78'),
  ('2026-06-04'::date, 1, 'PIEZA', 'POTASIO SUPREME 1 L', 306, 306, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:79'),
  ('2026-06-04'::date, 1, 'PIEZA', 'ACIDO NITRICO  20 L', 445.22, 445.22, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:80'),
  ('2026-06-04'::date, 1, 'PIEZA', 'XP-1 1 L', 395.25, 395.25, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:81'),
  ('2026-06-10'::date, 1, 'BULTO', 'NKS 25 KG', 659, 659, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:82'),
  ('2026-06-10'::date, 1, 'BULTO', 'SOP 25 KG', 528, 528, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:83'),
  ('2026-06-10'::date, 1, 'BULTO', 'MKP 25 KG', 977, 977, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:84'),
  ('2026-06-10'::date, 1, 'BULTO', 'SULMAG 50 KG', 360, 360, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:85'),
  ('2026-06-11'::date, 1, 'PIEZA', 'LARREA CITRIC 1 L', 338.3, 338.3, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:86'),
  ('2026-06-11'::date, 1, 'PIEZA', 'ALFA 250 ML', 250, 250, 'agroinsumos'::public.cost_category, 'quimico', 'zoyatitla-legacy:insumo:87'),
  ('2026-06-12'::date, 2, 'BULTO', 'NCA 25 KG', 307, 614, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:88'),
  ('2026-06-12'::date, 1, 'PIEZA', 'PECTA CA 1 L', 280.5, 280.5, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:89'),
  ('2026-06-16'::date, 20, 'LITRO', 'SUPRA ENGORDE 1 L', 204.85, 4097, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:90'),
  ('2026-06-16'::date, 1, 'PIEZA', 'XP -1 1 L', 395.25, 395.25, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:91'),
  ('2026-06-18'::date, 1, 'PIEZA', 'SULFAMIN 45', 285, 285, 'agroinsumos'::public.cost_category, 'quimico', 'zoyatitla-legacy:insumo:92'),
  ('2026-06-19'::date, 2, 'BULTO', 'NKS 25 KG', 684, 1368, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:93'),
  ('2026-06-19'::date, 1, 'BULTO', 'SULMAG 50 KG', 360, 360, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:94'),
  ('2026-06-19'::date, 1, 'PIEZA', 'Q-VIRUS 1 L', 672.35, 672.35, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:95'),
  ('2026-06-19'::date, 1, 'PIEZA', 'KONTRA S-3 1 L', 446.25, 446.25, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:96'),
  ('2026-06-19'::date, 1, 'BULTO', 'MKP 25 KG', 977, 977, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:97'),
  ('2026-06-19'::date, 1, 'PIEZA', 'PLAS + MOLIBDENO 1 L', 484.5, 484.5, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:98'),
  ('2026-06-19'::date, 1, 'PIEZA', 'LARREA CITRIC 1 L', 338.3, 338.3, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:99'),
  ('2026-06-26'::date, 1, 'PIEZA', 'LEW LEVERANGE', 330, 330, 'agroinsumos'::public.cost_category, 'quimico', 'zoyatitla-legacy:insumo:100'),
  ('2026-06-26'::date, 1, 'PIEZA', 'BIO SILIK', 250, 250, 'agroinsumos'::public.cost_category, 'quimico', 'zoyatitla-legacy:insumo:101'),
  ('2026-06-26'::date, 1, 'PIEZA', 'K-3', 350, 350, 'agroinsumos'::public.cost_category, 'quimico', 'zoyatitla-legacy:insumo:102'),
  ('2026-06-26'::date, 1, 'PIEZA', 'FIXOPIR', 285, 285, 'agroinsumos'::public.cost_category, 'quimico', 'zoyatitla-legacy:insumo:103'),
  ('2026-06-27'::date, 1, 'PIEZA', 'PLAS + ENGORDE 1 L', 722.5, 722.5, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:104'),
  ('2026-06-29'::date, 1, 'BULTO', 'NKS 25 KG', 659, 659, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:105'),
  ('2026-06-29'::date, 1, 'BULTO', 'SOP 25 KG', 528, 528, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:106'),
  ('2026-06-29'::date, 2, 'BULTO', 'NCA 25 KG', 319, 638, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:107'),
  ('2026-06-29'::date, 1, 'PIEZA', 'XP-1 1 L', 395.25, 395.25, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:108'),
  ('2026-07-03'::date, 1, 'PIEZA', 'METANIL', 360, 360, 'agroinsumos'::public.cost_category, 'quimico', 'zoyatitla-legacy:insumo:109'),
  ('2026-07-07'::date, 1, 'BULTO', 'SOP 25 KG', 528, 528, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:110'),
  ('2026-07-07'::date, 1, 'BULTO', 'MKP 25 KG', 977, 977, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:111'),
  ('2026-07-14'::date, 1, 'PIEZA', 'CUNTRATIZON 1 KG', 360, 360, 'agroinsumos'::public.cost_category, 'quimico', 'zoyatitla-legacy:insumo:112'),
  ('2026-07-14'::date, 20, 'PIEZA', 'SUPRA ENGORDE 1 L', 204.85, 4097, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:113'),
  ('2026-07-14'::date, 1, 'BULTO', 'NKS 25 KG', 659, 659, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:114'),
  ('2026-07-14'::date, 1, 'BULTO', 'SULMAG 50 KG', 360, 360, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:115'),
  ('2026-07-14'::date, 1, 'BULTO', 'NCA 25 KG', 307, 307, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:116'),
  ('2026-07-14'::date, 1, 'PIEZA', 'BORAX 1 LKG', 32, 32, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:117'),
  ('2026-07-14'::date, 1, 'BULTO', 'SULMAG 50 KG', 360, 360, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:118'),
  ('2026-07-14'::date, 1, 'BULTO', 'FOSFONITRATO PACIFEX 25 KG', 378, 378, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:119'),
  ('2026-07-14'::date, 1, 'PIEZA', 'LIVING X6 FE 1 KG', 239.7, 239.7, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:120'),
  ('2026-07-14'::date, 1, 'PIEZA', 'KONTRA S-3 1 L', 446.25, 446.25, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:121'),
  ('2026-07-14'::date, 1, 'PIEZA', 'LIVING X7 1 KG', 365.5, 365.5, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:122'),
  ('2026-07-14'::date, 1, 'PIEZA', 'FOSFI K 1 L', 338.3, 338.3, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:123'),
  ('2026-07-14'::date, 1, 'PIEZA', 'FOSFI ZN 1 L', 357, 357, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:124'),
  ('2026-07-15'::date, 1, 'PIEZA', 'AGRIBAT 5 L', 654.5, 654.5, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:125'),
  ('2026-07-16'::date, 1, 'PIEZA', 'NEW LEVERANGE 1 L', 330, 330, 'agroinsumos'::public.cost_category, 'quimico', 'zoyatitla-legacy:insumo:126'),
  ('2026-07-16'::date, 1, 'PIEZA', 'Q-VIRUS 1 L', 672.35, 672.35, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:127'),
  ('2026-07-16'::date, 1, 'PIEZA', 'LIVING ZN EDDHA 1 KG', 365.5, 365.5, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:128'),
  ('2026-07-16'::date, 1, 'PIEZA', 'XP-1 1 L', 395.25, 395.25, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:129'),
  ('2026-07-16'::date, 1, 'BULTO', 'NITRATO MAGNESIO 25 KG', 425, 425, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:130'),
  ('2026-07-16'::date, 2, 'PIEZA', 'SUPRA ROOT 1 L', 351.9, 703.8, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:131'),
  ('2026-07-16'::date, 1, 'BULTO', 'SOP 25 KG', 528, 528, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:132'),
  ('2026-07-16'::date, 1, 'BULTO', 'MKP 25 KG', 977, 977, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:133'),
  ('2026-07-16'::date, 1, 'BULTO', 'SULMAG 50 KG', 360, 360, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:134'),
  ('2026-07-16'::date, 1, 'BULTO', 'NCA 25 KG', 307, 307, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:135'),
  ('2026-07-16'::date, 2, 'PIEZA', 'AMINOSHO 500 G', 272, 544, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:136'),
  ('2026-07-16'::date, 1, 'PIEZA', 'FULVIPOWER 95 1 KG', 240.55, 240.55, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:137'),
  ('2026-07-16'::date, 2, 'BULTO', 'NCA 25 KG', 307, 614, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:138'),
  ('2026-07-16'::date, 1, 'BULTO', 'SOP 25 KG', 528, 528, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:139'),
  ('2026-07-16'::date, 3, 'PIEZA', 'PEPTON 1 KG', 505.75, 1517.25, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:140'),
  ('2026-07-16'::date, 1, 'PIEZA', 'AGRIBAT 5 L', 654.5, 654.5, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:141'),
  ('2026-07-16'::date, 1, 'PIEZA', 'FULVIPOWER 95 1 KG', 240.55, 240.55, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:142'),
  ('2026-07-16'::date, 1, 'PIEZA', 'VEGETAL OIL 1 L', 174.25, 174.25, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:143'),
  ('2026-07-16'::date, 1, 'PIEZA', 'COBREX 4 G 1 L', 289, 289, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:144'),
  ('2026-07-16'::date, 2, 'PIEZA', 'BIO ROOT 1 L', 348.5, 697, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:145'),
  ('2026-07-16'::date, 1, 'PIEZA', 'BIOA AK 1 L', 329.8, 329.8, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:146'),
  ('2026-07-16'::date, 1, 'BULTO', 'NKS 25 KG', 659, 659, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:147'),
  ('2026-07-16'::date, 2, 'BULTO', 'SOP 25 KG', 528, 1056, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:148'),
  ('2026-07-16'::date, 1, 'BULTO', 'MKP 25 KG', 977, 977, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:149'),
  ('2026-07-16'::date, 1, 'BULTO', 'SULMAG 50 KG', 360, 360, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:150'),
  ('2026-07-16'::date, 1, 'BULTO', 'NCA 25 KG', 307, 307, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:151'),
  ('2026-07-21'::date, 2, 'PIEZA', 'ELIMPLAN', 250, 500, 'agroinsumos'::public.cost_category, 'quimico', 'zoyatitla-legacy:insumo:152'),
  ('2026-07-21'::date, 1, 'PIEZA', 'EXALT 100 ML', 275, 275, 'agroinsumos'::public.cost_category, 'quimico', 'zoyatitla-legacy:insumo:153'),
  ('2026-07-24'::date, 2, 'BULTO', 'NKS 25 KG', 659, 1318, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:154'),
  ('2026-07-24'::date, 1, 'BULTO', 'NITRATO MAGNESIO 25 KG', 425, 425, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:155'),
  ('2026-07-24'::date, 1, 'BULTO', 'NCA 25 KG', 307, 307, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:156'),
  ('2026-07-24'::date, 1, 'PIEZA', 'RE. BUILDER 5 L', 1416.1, 1416.1, 'agroinsumos'::public.cost_category, 'quimico', 'zoyatitla-legacy:insumo:157'),
  ('2026-07-24'::date, 1, 'PIEZA', 'ROOT BOOTS 5 L', 952, 952, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:158'),
  ('2026-07-24'::date, 2, 'BULTO', 'NKS 25 KG', 684, 1368, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:159'),
  ('2026-07-24'::date, 2, 'BULTO', 'SOP 25 KG', 528, 1056, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:160'),
  ('2026-07-24'::date, 1, 'BULTO', 'MKP 25 KG', 977, 977, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:161'),
  ('2026-07-24'::date, 2, 'BULTO', 'SULMAG 50 KG', 360, 720, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:162'),
  ('2026-07-24'::date, 1, 'BULTO', 'NCA 25 KG', 307, 307, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:163'),
  ('2026-07-24'::date, 1, 'PIEZA', 'AMINOSHO 500 G', 272, 272, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:164'),
  ('2026-07-24'::date, 1, 'PIEZA', 'BIO POW 1 L', 518.5, 518.5, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:165'),
  ('2026-07-24'::date, 1, 'PIEZA', 'NATURAL SOAP 1 L', 231.2, 231.2, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:166'),
  ('2026-07-24'::date, 1, 'PIEZA', 'MKP 25 KG', 977, 977, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:167'),
  ('2026-07-24'::date, 1, 'BULTO', 'NCA 25 KG', 307, 307, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:168'),
  ('2026-07-24'::date, 2, 'BULTO', 'NKS 25 KG', 684, 1368, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:169'),
  ('2026-07-24'::date, 2, 'BULTO', 'SULMAG 50 KG', 360, 720, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:170'),
  ('2026-07-24'::date, 2, 'BULTO', 'SOP 25 KG', 528, 1056, 'fertilizantes'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:171'),
  ('2026-07-24'::date, 1, 'PIEZA', 'BIO POW 1 L', 518.5, 518.5, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:172'),
  ('2026-07-24'::date, 1, 'PIEZA', 'NATURAL SOAP 1 L', 231.2, 231.2, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:173'),
  ('2026-07-24'::date, 1, 'PIEZA', 'AMINOSHO 500 G', 272, 272, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:174'),
  ('2026-07-25'::date, 1, 'PIEZA', 'PLEO', 1050, 1050, 'agroinsumos'::public.cost_category, 'quimico', 'zoyatitla-legacy:insumo:175'),
  ('2026-07-29'::date, 20, 'PIEZA', 'SUPRA ENGORDE 1 L', 192.8, 3856, 'agroinsumos'::public.cost_category, 'teza', 'zoyatitla-legacy:insumo:176'),
  ('2026-03-14'::date, 3, 'PIEZA', 'REFRESCO 3 L', 40, 120, 'refrescos'::public.cost_category, 'teza', 'zoyatitla-legacy:refresco:2'),
  ('2026-03-21'::date, 4, 'PIEZA', 'REFRESCO 3 L', 40, 160, 'refrescos'::public.cost_category, 'teza', 'zoyatitla-legacy:refresco:3'),
  ('2026-03-28'::date, 1, 'LOTE', 'REFRESCOS  3 L', 100, 100, 'refrescos'::public.cost_category, 'teza', 'zoyatitla-legacy:refresco:4'),
  ('2026-04-02'::date, 2, 'PIEZA', 'REFRESCO 3 L', 40, 80, 'refrescos'::public.cost_category, 'teza', 'zoyatitla-legacy:refresco:5'),
  ('2026-04-11'::date, 3, 'PIEZA', 'REFRESCO 3 L', 40, 120, 'refrescos'::public.cost_category, 'teza', 'zoyatitla-legacy:refresco:6'),
  ('2026-04-18'::date, 2, 'PIEZA', 'REFRESCOS  3 L', 40, 80, 'refrescos'::public.cost_category, 'teza', 'zoyatitla-legacy:refresco:7'),
  ('2026-04-28'::date, 2, 'PIEZA', 'REFRESCO 3 L', 40, 80, 'refrescos'::public.cost_category, 'teza', 'zoyatitla-legacy:refresco:8'),
  ('2026-05-02'::date, 6, 'PIEZA', 'REFRESCO 3 L', 40, 240, 'refrescos'::public.cost_category, 'teza', 'zoyatitla-legacy:refresco:9'),
  ('2026-05-30'::date, 3, 'PIEZA', 'REFRESCO 3 L', 40, 120, 'refrescos'::public.cost_category, 'teza', 'zoyatitla-legacy:refresco:10'),
  ('2026-06-06'::date, 3, 'PIEZA', 'REFRESCO 3 L', 40, 120, 'refrescos'::public.cost_category, 'teza', 'zoyatitla-legacy:refresco:11'),
  ('2026-06-13'::date, 6, 'PIEZA', 'REFRESCO 3 L', 40, 240, 'refrescos'::public.cost_category, 'teza', 'zoyatitla-legacy:refresco:12'),
  ('2026-06-20'::date, 5, 'PIEZA', 'REFRESCO 3 L', 40, 200, 'refrescos'::public.cost_category, 'teza', 'zoyatitla-legacy:refresco:13'),
  ('2026-06-27'::date, 9, 'PIEZA', 'REFRESCO 3 L', 40, 360, 'refrescos'::public.cost_category, 'teza', 'zoyatitla-legacy:refresco:14'),
  ('2026-07-04'::date, 12, 'PIEZA', 'REFRESCO 3 L', 40, 480, 'refrescos'::public.cost_category, 'teza', 'zoyatitla-legacy:refresco:15'),
  ('2026-07-09'::date, 16, 'PIEZA', 'REFRESCO 3 L', 45, 720, 'refrescos'::public.cost_category, 'teza', 'zoyatitla-legacy:refresco:16'),
  ('2026-03-31'::date, 1, 'PIEZA', 'VALVULA PARA FUMIGADORA', 80, 80, 'mantenimiento'::public.cost_category, 'prestamo', 'zoyatitla-legacy:material:2'),
  ('2026-03-31'::date, 50, 'PIEZA', 'PIJA HEX PUNTA BROCA 1"', 0.9048, 45.24, 'mantenimiento'::public.cost_category, 'teza', 'zoyatitla-legacy:material:3'),
  ('2026-03-31'::date, 14, 'METRO', 'CABLE ACERO DE 1/8"', 9.001429, 126.02, 'mantenimiento'::public.cost_category, 'teza', 'zoyatitla-legacy:material:4'),
  ('2026-04-21'::date, 4, 'METRO', 'CINTA POLYPARCHS', 20.99, 83.96, 'mantenimiento'::public.cost_category, 'teza', 'zoyatitla-legacy:material:5'),
  ('2026-04-24'::date, 2, 'PIEZA', 'RAFIA NEGRA CAL. DE 4.5 KG', 313, 626, 'plasticos'::public.cost_category, 'teza', 'zoyatitla-legacy:material:6'),
  ('2026-04-29'::date, 62.5, 'METRO', 'PLASTICO LECHOSO DE 6.20', 106.08192, 6630.12, 'plasticos'::public.cost_category, 'teza', 'zoyatitla-legacy:material:7'),
  ('2026-04-30'::date, 2, 'ROLLO', 'RAFIA NEGRA CAL. DE 4.5 KG', 313, 626, 'plasticos'::public.cost_category, 'teza', 'zoyatitla-legacy:material:8'),
  ('2026-05-07'::date, 90, 'METRO', 'PLASTICO LECHOSO DE 6.20', 97.996778, 8819.71, 'plasticos'::public.cost_category, 'teza', 'zoyatitla-legacy:material:9'),
  ('2026-05-13'::date, 3, 'KILO', 'ALAMBRE CAL. 12', 44.993333, 134.98, 'mantenimiento'::public.cost_category, 'teza', 'zoyatitla-legacy:material:10'),
  ('2026-05-13'::date, 7.5, 'KILO', 'ALAMBRE CAL. 10', 44.996, 337.47, 'mantenimiento'::public.cost_category, 'teza', 'zoyatitla-legacy:material:11'),
  ('2026-05-16'::date, 1, 'PIEZA', 'MANOMETRO WADE RAIN GLICERINA', 189, 189, 'mantenimiento'::public.cost_category, 'teza', 'zoyatitla-legacy:material:12'),
  ('2026-05-16'::date, 1, 'PIEZA', 'CAMLOCK ALUMINIO A 2" MACHO', 81.9, 81.9, 'mantenimiento'::public.cost_category, 'teza', 'zoyatitla-legacy:material:13'),
  ('2026-05-16'::date, 1, 'PIEZA', 'BOQUILLA DOBLE NEGRA HYUNDAI', 116.37, 116.37, 'mantenimiento'::public.cost_category, 'teza', 'zoyatitla-legacy:material:14'),
  ('2026-05-27'::date, 3, 'PIEZA', 'CODO SANITARIO 45 X 4"', 22.003333, 66.01, 'mantenimiento'::public.cost_category, 'teza', 'zoyatitla-legacy:material:15'),
  ('2026-05-27'::date, 1, 'PIEZA', 'CODO SANITARIO 90 X 4"', 23.11, 23.11, 'mantenimiento'::public.cost_category, 'teza', 'zoyatitla-legacy:material:16'),
  ('2026-06-11'::date, 1, 'PIEZA', 'EXPRIMIDOR', 26, 26, 'mantenimiento'::public.cost_category, 'prestamo', 'zoyatitla-legacy:material:17'),
  ('2026-03-26'::date, 1, 'ROLLO', 'ZIGZAG 10 KG', 492, 492, 'plasticos'::public.cost_category, 'teza', 'zoyatitla-legacy:material:18'),
  ('2026-03-26'::date, 58, 'METRO', 'PLASTICO LECHOSO DE 6.20', 77.00069, 4466.04, 'plasticos'::public.cost_category, 'teza', 'zoyatitla-legacy:material:19'),
  ('2026-06-10'::date, 1, 'ROLLO', 'ZIGZAG 10 KG', 492, 492, 'plasticos'::public.cost_category, 'teza', 'zoyatitla-legacy:material:20'),
  ('2026-06-10'::date, 50, 'METRO', 'PLASTICO LECHOSO 25% DE 6.20', 101.9988, 5099.94, 'plasticos'::public.cost_category, 'teza', 'zoyatitla-legacy:material:21'),
  ('2026-06-18'::date, 2, 'BULTOS', 'SALVADO PARA BIOLOGICOS', 47.5, 95, 'agroinsumos'::public.cost_category, 'prestamo', 'zoyatitla-legacy:material:22'),
  ('2026-06-18'::date, 1, 'LOTE', 'LACTEOS PARA BIOLOGICOS', 62.5, 62.5, 'agroinsumos'::public.cost_category, 'prestamo', 'zoyatitla-legacy:material:23'),
  ('2026-06-27'::date, 2, 'LITRO', 'ALCOHOL', 11.75, 23.5, 'mantenimiento'::public.cost_category, 'prestamo', 'zoyatitla-legacy:material:24'),
  ('2026-06-29'::date, 1, 'PIEZA', 'HARINA  MICROORGANISMOS', 13.5, 13.5, 'agroinsumos'::public.cost_category, 'prestamo', 'zoyatitla-legacy:material:25'),
  ('2026-07-01'::date, 1, 'PIEZA', 'SUJETADOR TRUPER MICROORGANISMOS', 94, 94, 'agroinsumos'::public.cost_category, 'prestamo', 'zoyatitla-legacy:material:26'),
  ('2026-07-03'::date, 1, 'PIEZA', 'MICROORGANISMOS', 271, 271, 'agroinsumos'::public.cost_category, 'prestamo', 'zoyatitla-legacy:material:27'),
  ('2026-07-04'::date, 1, 'LOTE', 'MATERIAL PARA TRAMPAS', 371, 371, 'mantenimiento'::public.cost_category, 'prestamo', 'zoyatitla-legacy:material:28'),
  ('2026-07-04'::date, 1, 'PIEZA', 'LECHE PARA MICROORGANISMOS', 27.25, 27.25, 'agroinsumos'::public.cost_category, 'prestamo', 'zoyatitla-legacy:material:29'),
  ('2026-07-18'::date, 10, 'LITRO', 'AGUA Y ARINA DE AZUCAR', 149.25, 1492.5, 'mantenimiento'::public.cost_category, 'prestamo', 'zoyatitla-legacy:material:30'),
  ('2026-07-21'::date, 1, 'PIEZA', 'YEE DE BRONCE', 100, 100, 'mantenimiento'::public.cost_category, 'prestamo', 'zoyatitla-legacy:material:31'),
  ('2026-07-21'::date, 1, 'PIEZA', 'MICROORGANISMOS', 47.5, 47.5, 'agroinsumos'::public.cost_category, 'prestamo', 'zoyatitla-legacy:material:32'),
  ('2026-07-24'::date, 6, 'PIEZA', 'US DE 1 3/4"', 8.55, 51.3, 'mantenimiento'::public.cost_category, 'teza', 'zoyatitla-legacy:material:33'),
  ('2026-07-24'::date, 100, 'PIEZA', 'PIJA HEX PUNTA BROCA 1"', 0.9048, 90.48, 'mantenimiento'::public.cost_category, 'teza', 'zoyatitla-legacy:material:34'),
  ('2026-07-24'::date, 30, 'PIEZA', 'NUDOS DE 1/4"', 7.203333, 216.1, 'mantenimiento'::public.cost_category, 'teza', 'zoyatitla-legacy:material:35'),
  ('2026-07-24'::date, 3, 'PIEZA', 'AR GALV. CAL. 14 DE 1 1/2"', 472, 1416, 'mantenimiento'::public.cost_category, 'teza', 'zoyatitla-legacy:material:36'),
  ('2026-07-24'::date, 6, 'PIEZA', 'US DE 1 1/2"', 8.55, 51.3, 'mantenimiento'::public.cost_category, 'teza', 'zoyatitla-legacy:material:37'),
  ('2026-07-25'::date, 1, 'PIEZA', 'MICROORGANISMOS', 57, 57, 'agroinsumos'::public.cost_category, 'prestamo', 'zoyatitla-legacy:material:38')
)
insert into public.cost_records (
  company_id, greenhouse_id, category, amount, occurred_at, notes, origin,
  quantity, unit, unit_price, legacy_group, source_reference
)
select
  target.company_id, target.greenhouse_id, legacy_costs.category, round(legacy_costs.amount, 2),
  legacy_costs.occurred_at, 'Importación histórica Zoyatitla. Fuente: ' || legacy_costs.source_reference,
  'manual'::public.cost_origin, legacy_costs.quantity, legacy_costs.unit, legacy_costs.unit_price,
  legacy_costs.legacy_group, legacy_costs.source_reference
from legacy_costs cross join target
on conflict (company_id, source_reference) where source_reference is not null do update set
  greenhouse_id = excluded.greenhouse_id, category = excluded.category, amount = excluded.amount,
  occurred_at = excluded.occurred_at, notes = excluded.notes, quantity = excluded.quantity,
  unit = excluded.unit, unit_price = excluded.unit_price, legacy_group = excluded.legacy_group,
  updated_at = now();

with target as (
  select company.id as company_id, greenhouse.id as greenhouse_id
  from public.companies company
  join public.greenhouses greenhouse on greenhouse.company_id = company.id
  where company.slug = 'mercadia-ag' and public.route_slug(greenhouse.name) = 'zoyatitla' and greenhouse.is_active
), legacy_harvests (
  cycle_year, cut_number, occurred_at, source_reference, title, kilograms, box_count,
  first_boxes, second_boxes, third_boxes, first_price, second_price, third_price,
  net_amount, buyer_name, notes
) as (
values
  (2025, 1, '2025-10-21'::date, 'zoyatitla-legacy:cosecha:villa-2025-corte-1', 'Cosecha histórica · villa 2025 corte 1', 740, 37, 37, 0, 0, 180, 0, 0, 6660, 'ING. GLORIA', 'Venta cobrada.'),
  (2025, 2, '2025-10-28'::date, 'zoyatitla-legacy:cosecha:villa-2025-corte-2', 'Cosecha histórica · villa 2025 corte 2', 2060, 103, 82, 11, 3, 140, 120, 90, 13350, 'MARCOS', 'Venta cobrada. Incluye 7 cajas de papel.'),
  (2025, 3, '2025-11-05'::date, 'zoyatitla-legacy:cosecha:villa-2025-corte-3', 'Cosecha histórica · villa 2025 corte 3', 2560, 128, 99, 15, 4, 155, 135, 105, 18190, 'MARCOS', 'Venta cobrada. Incluye 10 cajas de papel.'),
  (2025, 4, '2025-11-12'::date, 'zoyatitla-legacy:cosecha:villa-2025-corte-4', 'Cosecha histórica · villa 2025 corte 4', 2640, 132, 97, 21, 4, 180, 0, 0, 900, 'GUSTAVO', 'Venta cobrada de 5 cajas a Gustavo. Quedan 127 cajas sin precio o comprador registrado, incluyendo 10 cajas de papel.'),
  (2026, 1, '2026-06-16'::date, 'zoyatitla-legacy:cosecha:strogton-2026-corte-1', 'Cosecha histórica · strogton 2026 corte 1', 640, 32, 25, 5, 2, 230, 200, 150, 5450, 'JUAN', 'Venta cobrada. Comisión y flete de $25 por caja.'),
  (2026, 2, '2026-06-23'::date, 'zoyatitla-legacy:cosecha:strogton-2026-corte-2', 'Cosecha histórica · strogton 2026 corte 2', 2800, 140, 118, 20, 2, 190, 150, 120, 19360, 'JUAN', 'Venta cobrada. Comisión $25/caja y flete $20/caja.'),
  (2026, 3, '2026-07-03'::date, 'zoyatitla-legacy:cosecha:strogton-2026-corte-3', 'Cosecha histórica · strogton 2026 corte 3', 5900, 295, 210, 80, 5, 165, 140, 100, 33075, 'JUAN', 'Venta cobrada. Comisión $25/caja y flete $20/caja.'),
  (2026, 4, '2026-07-10'::date, 'zoyatitla-legacy:cosecha:strogton-2026-corte-4', 'Cosecha histórica · strogton 2026 corte 4', 7100, 355, 230, 109, 16, 200, 160, 130, 49545, 'JUAN', 'Venta cobrada. Comisión $25/caja y flete $20/caja.'),
  (2026, 5, '2026-07-23'::date, 'zoyatitla-legacy:cosecha:strogton-2026-corte-5', 'Cosecha histórica · strogton 2026 corte 5', 14420, 721, 470, 243, 8, 127, 127, 127, 82804, 'CESAR', 'Venta cobrada de 652 cajas a Cesar. Quedan 69 cajas de Juan sin precio registrado.')
)
insert into public.tasks (
  id, company_id, greenhouse_id, type, title, scheduled_date, status, notes,
  technical_plan, origin, occurred_at, completed_at, verified_at
)
select
  md5(legacy_harvests.source_reference)::uuid, target.company_id, target.greenhouse_id,
  'cosecha'::public.task_type, legacy_harvests.title, legacy_harvests.occurred_at,
  'verificada'::public.task_status, legacy_harvests.notes || ' Fuente: ' || legacy_harvests.source_reference,
  jsonb_build_object('source', 'historical_excel_import', 'reference', legacy_harvests.source_reference, 'cycle_year', legacy_harvests.cycle_year),
  'migrated'::public.work_origin, legacy_harvests.occurred_at::timestamptz,
  legacy_harvests.occurred_at::timestamptz, legacy_harvests.occurred_at::timestamptz
from legacy_harvests cross join target
on conflict (id) do update set
  company_id = excluded.company_id, greenhouse_id = excluded.greenhouse_id, type = excluded.type,
  title = excluded.title, scheduled_date = excluded.scheduled_date, status = excluded.status,
  notes = excluded.notes, technical_plan = excluded.technical_plan, origin = excluded.origin,
  occurred_at = excluded.occurred_at, completed_at = excluded.completed_at,
  verified_at = excluded.verified_at, updated_at = now();

with target as (
  select company.id as company_id, greenhouse.id as greenhouse_id
  from public.companies company
  join public.greenhouses greenhouse on greenhouse.company_id = company.id
  where company.slug = 'mercadia-ag' and public.route_slug(greenhouse.name) = 'zoyatitla' and greenhouse.is_active
), legacy_harvests (
  occurred_at, source_reference, kilograms, box_count, first_boxes, second_boxes, third_boxes,
  first_price, second_price, third_price, net_amount, buyer_name, notes
) as (
values
  ('2025-10-21'::date, 'zoyatitla-legacy:cosecha:villa-2025-corte-1', 740, 37, 37, 0, 0, 180, 0, 0, 6660, 'ING. GLORIA', 'Venta cobrada.'),
  ('2025-10-28'::date, 'zoyatitla-legacy:cosecha:villa-2025-corte-2', 2060, 103, 82, 11, 3, 140, 120, 90, 13350, 'MARCOS', 'Venta cobrada. Incluye 7 cajas de papel.'),
  ('2025-11-05'::date, 'zoyatitla-legacy:cosecha:villa-2025-corte-3', 2560, 128, 99, 15, 4, 155, 135, 105, 18190, 'MARCOS', 'Venta cobrada. Incluye 10 cajas de papel.'),
  ('2025-11-12'::date, 'zoyatitla-legacy:cosecha:villa-2025-corte-4', 2640, 132, 97, 21, 4, 180, 0, 0, 900, 'GUSTAVO', 'Venta cobrada de 5 cajas a Gustavo. Quedan 127 cajas sin precio o comprador registrado, incluyendo 10 cajas de papel.'),
  ('2026-06-16'::date, 'zoyatitla-legacy:cosecha:strogton-2026-corte-1', 640, 32, 25, 5, 2, 230, 200, 150, 5450, 'JUAN', 'Venta cobrada. Comisión y flete de $25 por caja.'),
  ('2026-06-23'::date, 'zoyatitla-legacy:cosecha:strogton-2026-corte-2', 2800, 140, 118, 20, 2, 190, 150, 120, 19360, 'JUAN', 'Venta cobrada. Comisión $25/caja y flete $20/caja.'),
  ('2026-07-03'::date, 'zoyatitla-legacy:cosecha:strogton-2026-corte-3', 5900, 295, 210, 80, 5, 165, 140, 100, 33075, 'JUAN', 'Venta cobrada. Comisión $25/caja y flete $20/caja.'),
  ('2026-07-10'::date, 'zoyatitla-legacy:cosecha:strogton-2026-corte-4', 7100, 355, 230, 109, 16, 200, 160, 130, 49545, 'JUAN', 'Venta cobrada. Comisión $25/caja y flete $20/caja.'),
  ('2026-07-23'::date, 'zoyatitla-legacy:cosecha:strogton-2026-corte-5', 14420, 721, 470, 243, 8, 127, 127, 127, 82804, 'CESAR', 'Venta cobrada de 652 cajas a Cesar. Quedan 69 cajas de Juan sin precio registrado.')
)
insert into public.harvest_records (
  company_id, greenhouse_id, source_task_id, occurred_at, kilograms, box_count, box_weight_kg,
  first_quality_kg, second_quality_kg, third_quality_kg, merma_kg,
  first_quality_boxes, second_quality_boxes, third_quality_boxes, merma_boxes,
  first_quality_price, second_quality_price, third_quality_price, estimated_price,
  destination, notes
)
select
  target.company_id, target.greenhouse_id, md5(legacy_harvests.source_reference)::uuid,
  legacy_harvests.occurred_at, legacy_harvests.kilograms, legacy_harvests.box_count, 20,
  legacy_harvests.first_boxes * 20, legacy_harvests.second_boxes * 20, legacy_harvests.third_boxes * 20, 0,
  legacy_harvests.first_boxes, legacy_harvests.second_boxes, legacy_harvests.third_boxes, 0,
  legacy_harvests.first_price, legacy_harvests.second_price, legacy_harvests.third_price,
  round(legacy_harvests.net_amount, 2), legacy_harvests.buyer_name,
  legacy_harvests.notes || ' Fuente: ' || legacy_harvests.source_reference
from legacy_harvests cross join target
on conflict on constraint harvest_records_source_task_unique do update set
  company_id = excluded.company_id, greenhouse_id = excluded.greenhouse_id,
  occurred_at = excluded.occurred_at, kilograms = excluded.kilograms, box_count = excluded.box_count,
  box_weight_kg = excluded.box_weight_kg, first_quality_kg = excluded.first_quality_kg,
  second_quality_kg = excluded.second_quality_kg, third_quality_kg = excluded.third_quality_kg,
  merma_kg = excluded.merma_kg, first_quality_boxes = excluded.first_quality_boxes,
  second_quality_boxes = excluded.second_quality_boxes, third_quality_boxes = excluded.third_quality_boxes,
  merma_boxes = excluded.merma_boxes, first_quality_price = excluded.first_quality_price,
  second_quality_price = excluded.second_quality_price, third_quality_price = excluded.third_quality_price,
  estimated_price = excluded.estimated_price, destination = excluded.destination, notes = excluded.notes,
  updated_at = now();

with target as (
  select company.id as company_id, greenhouse.id as greenhouse_id
  from public.companies company
  join public.greenhouses greenhouse on greenhouse.company_id = company.id
  where company.slug = 'mercadia-ag' and public.route_slug(greenhouse.name) = 'zoyatitla' and greenhouse.is_active
), legacy_sales (
  cut_number, occurred_at, harvest_reference, buyer_name, gross_amount, commission_amount,
  freight_amount, net_amount, source_reference
) as (
values
  (1, '2025-10-21'::date, 'zoyatitla-legacy:cosecha:villa-2025-corte-1', 'ING. GLORIA', 6660, 0, 0, 6660, 'zoyatitla-legacy:venta:villa-2025-corte-1-gloria'),
  (2, '2025-10-28'::date, 'zoyatitla-legacy:cosecha:villa-2025-corte-2', 'MARCOS', 13350, 0, 0, 13350, 'zoyatitla-legacy:venta:villa-2025-corte-2-marcos'),
  (3, '2025-11-05'::date, 'zoyatitla-legacy:cosecha:villa-2025-corte-3', 'MARCOS', 18190, 0, 0, 18190, 'zoyatitla-legacy:venta:villa-2025-corte-3-marcos'),
  (4, '2025-11-12'::date, 'zoyatitla-legacy:cosecha:villa-2025-corte-4', 'GUSTAVO', 900, 0, 0, 900, 'zoyatitla-legacy:venta:villa-2025-corte-4-gustavo'),
  (1, '2026-06-16'::date, 'zoyatitla-legacy:cosecha:strogton-2026-corte-1', 'JUAN', 7050, 800, 800, 5450, 'zoyatitla-legacy:venta:strogton-2026-corte-1-juan'),
  (2, '2026-06-23'::date, 'zoyatitla-legacy:cosecha:strogton-2026-corte-2', 'JUAN', 25660, 3500, 2800, 19360, 'zoyatitla-legacy:venta:strogton-2026-corte-2-juan'),
  (3, '2026-07-03'::date, 'zoyatitla-legacy:cosecha:strogton-2026-corte-3', 'JUAN', 46350, 7375, 5900, 33075, 'zoyatitla-legacy:venta:strogton-2026-corte-3-juan'),
  (4, '2026-07-10'::date, 'zoyatitla-legacy:cosecha:strogton-2026-corte-4', 'JUAN', 65520, 8875, 7100, 49545, 'zoyatitla-legacy:venta:strogton-2026-corte-4-juan'),
  (5, '2026-07-23'::date, 'zoyatitla-legacy:cosecha:strogton-2026-corte-5', 'CESAR', 82804, 0, 0, 82804, 'zoyatitla-legacy:venta:strogton-2026-corte-5-cesar')
)
insert into public.harvest_sales (
  company_id, greenhouse_id, harvest_record_id, cut_number, buyer_name, occurred_at,
  gross_amount, commission_amount, freight_amount, net_amount, payment_status, paid_at, source_reference, notes
)
select
  target.company_id, target.greenhouse_id, harvest.id, legacy_sales.cut_number,
  legacy_sales.buyer_name, legacy_sales.occurred_at, round(legacy_sales.gross_amount, 2),
  round(legacy_sales.commission_amount, 2), round(legacy_sales.freight_amount, 2), round(legacy_sales.net_amount, 2),
  'paid', legacy_sales.occurred_at, legacy_sales.source_reference, 'Importación histórica de venta cobrada.'
from legacy_sales cross join target
join public.harvest_records harvest on harvest.source_task_id = md5(legacy_sales.harvest_reference)::uuid
on conflict (company_id, source_reference) do update set
  greenhouse_id = excluded.greenhouse_id, harvest_record_id = excluded.harvest_record_id,
  cut_number = excluded.cut_number, buyer_name = excluded.buyer_name, occurred_at = excluded.occurred_at,
  gross_amount = excluded.gross_amount, commission_amount = excluded.commission_amount,
  freight_amount = excluded.freight_amount, net_amount = excluded.net_amount,
  payment_status = excluded.payment_status, paid_at = excluded.paid_at, notes = excluded.notes, updated_at = now();

with legacy_lines (
  sale_reference, quality_label, box_count, gross_unit_price, commission_per_box,
  freight_per_box, net_unit_price, gross_amount, net_amount, source_reference
) as (
values
  ('zoyatitla-legacy:venta:villa-2025-corte-1-gloria', 'primeras', 37, 180, 0, 0, 180, 6660, 6660, 'zoyatitla-legacy:venta:villa-2025-corte-1-gloria:primeras'),
  ('zoyatitla-legacy:venta:villa-2025-corte-2-marcos', 'primeras', 82, 140, 0, 0, 140, 11480, 11480, 'zoyatitla-legacy:venta:villa-2025-corte-2-marcos:primeras'),
  ('zoyatitla-legacy:venta:villa-2025-corte-2-marcos', 'segundas', 11, 120, 0, 0, 120, 1320, 1320, 'zoyatitla-legacy:venta:villa-2025-corte-2-marcos:segundas'),
  ('zoyatitla-legacy:venta:villa-2025-corte-2-marcos', 'terceras', 3, 90, 0, 0, 90, 270, 270, 'zoyatitla-legacy:venta:villa-2025-corte-2-marcos:terceras'),
  ('zoyatitla-legacy:venta:villa-2025-corte-2-marcos', 'papel', 7, 40, 0, 0, 40, 280, 280, 'zoyatitla-legacy:venta:villa-2025-corte-2-marcos:papel'),
  ('zoyatitla-legacy:venta:villa-2025-corte-3-marcos', 'primeras', 99, 155, 0, 0, 155, 15345, 15345, 'zoyatitla-legacy:venta:villa-2025-corte-3-marcos:primeras'),
  ('zoyatitla-legacy:venta:villa-2025-corte-3-marcos', 'segundas', 15, 135, 0, 0, 135, 2025, 2025, 'zoyatitla-legacy:venta:villa-2025-corte-3-marcos:segundas'),
  ('zoyatitla-legacy:venta:villa-2025-corte-3-marcos', 'terceras', 4, 105, 0, 0, 105, 420, 420, 'zoyatitla-legacy:venta:villa-2025-corte-3-marcos:terceras'),
  ('zoyatitla-legacy:venta:villa-2025-corte-3-marcos', 'papel', 10, 40, 0, 0, 40, 400, 400, 'zoyatitla-legacy:venta:villa-2025-corte-3-marcos:papel'),
  ('zoyatitla-legacy:venta:villa-2025-corte-4-gustavo', 'primeras', 5, 180, 0, 0, 180, 900, 900, 'zoyatitla-legacy:venta:villa-2025-corte-4-gustavo:primeras'),
  ('zoyatitla-legacy:venta:strogton-2026-corte-1-juan', 'primeras', 25, 230, 25, 25, 180, 5750, 4500, 'zoyatitla-legacy:venta:strogton-2026-corte-1-juan:primeras'),
  ('zoyatitla-legacy:venta:strogton-2026-corte-1-juan', 'segundas', 5, 200, 25, 25, 150, 1000, 750, 'zoyatitla-legacy:venta:strogton-2026-corte-1-juan:segundas'),
  ('zoyatitla-legacy:venta:strogton-2026-corte-1-juan', 'terceras', 2, 150, 25, 25, 100, 300, 200, 'zoyatitla-legacy:venta:strogton-2026-corte-1-juan:terceras'),
  ('zoyatitla-legacy:venta:strogton-2026-corte-2-juan', 'primeras', 118, 190, 25, 20, 145, 22420, 17110, 'zoyatitla-legacy:venta:strogton-2026-corte-2-juan:primeras'),
  ('zoyatitla-legacy:venta:strogton-2026-corte-2-juan', 'segundas', 20, 150, 25, 20, 105, 3000, 2100, 'zoyatitla-legacy:venta:strogton-2026-corte-2-juan:segundas'),
  ('zoyatitla-legacy:venta:strogton-2026-corte-2-juan', 'terceras', 2, 120, 25, 20, 75, 240, 150, 'zoyatitla-legacy:venta:strogton-2026-corte-2-juan:terceras'),
  ('zoyatitla-legacy:venta:strogton-2026-corte-3-juan', 'primeras', 210, 165, 25, 20, 120, 34650, 25200, 'zoyatitla-legacy:venta:strogton-2026-corte-3-juan:primeras'),
  ('zoyatitla-legacy:venta:strogton-2026-corte-3-juan', 'segundas', 80, 140, 25, 20, 95, 11200, 7600, 'zoyatitla-legacy:venta:strogton-2026-corte-3-juan:segundas'),
  ('zoyatitla-legacy:venta:strogton-2026-corte-3-juan', 'terceras', 5, 100, 25, 20, 55, 500, 275, 'zoyatitla-legacy:venta:strogton-2026-corte-3-juan:terceras'),
  ('zoyatitla-legacy:venta:strogton-2026-corte-4-juan', 'primeras', 230, 200, 25, 20, 155, 46000, 35650, 'zoyatitla-legacy:venta:strogton-2026-corte-4-juan:primeras'),
  ('zoyatitla-legacy:venta:strogton-2026-corte-4-juan', 'segundas', 109, 160, 25, 20, 115, 17440, 12535, 'zoyatitla-legacy:venta:strogton-2026-corte-4-juan:segundas'),
  ('zoyatitla-legacy:venta:strogton-2026-corte-4-juan', 'terceras', 16, 130, 25, 20, 85, 2080, 1360, 'zoyatitla-legacy:venta:strogton-2026-corte-4-juan:terceras'),
  ('zoyatitla-legacy:venta:strogton-2026-corte-5-cesar', 'primeras-rallado', 92, 127, 0, 0, 127, 11684, 11684, 'zoyatitla-legacy:venta:strogton-2026-corte-5-cesar:primeras-rallado'),
  ('zoyatitla-legacy:venta:strogton-2026-corte-5-cesar', 'segundas-rallado', 104, 127, 0, 0, 127, 13208, 13208, 'zoyatitla-legacy:venta:strogton-2026-corte-5-cesar:segundas-rallado'),
  ('zoyatitla-legacy:venta:strogton-2026-corte-5-cesar', 'terceras-rallado', 8, 127, 0, 0, 127, 1016, 1016, 'zoyatitla-legacy:venta:strogton-2026-corte-5-cesar:terceras-rallado'),
  ('zoyatitla-legacy:venta:strogton-2026-corte-5-cesar', 'primeras-rojos', 328, 127, 0, 0, 127, 41656, 41656, 'zoyatitla-legacy:venta:strogton-2026-corte-5-cesar:primeras-rojos'),
  ('zoyatitla-legacy:venta:strogton-2026-corte-5-cesar', 'segundas-rojos', 120, 127, 0, 0, 127, 15240, 15240, 'zoyatitla-legacy:venta:strogton-2026-corte-5-cesar:segundas-rojos')
)
insert into public.harvest_sale_lines (
  sale_id, quality_label, box_count, box_weight_kg, kilograms, gross_unit_price,
  commission_per_box, freight_per_box, net_unit_price, gross_amount, net_amount, source_reference
)
select
  sale.id, legacy_lines.quality_label, legacy_lines.box_count, 20, legacy_lines.box_count * 20,
  legacy_lines.gross_unit_price, legacy_lines.commission_per_box, legacy_lines.freight_per_box,
  legacy_lines.net_unit_price, round(legacy_lines.gross_amount, 2), round(legacy_lines.net_amount, 2),
  legacy_lines.source_reference
from legacy_lines join public.harvest_sales sale on sale.source_reference = legacy_lines.sale_reference
on conflict (source_reference) do update set
  sale_id = excluded.sale_id, quality_label = excluded.quality_label, box_count = excluded.box_count,
  box_weight_kg = excluded.box_weight_kg, kilograms = excluded.kilograms,
  gross_unit_price = excluded.gross_unit_price, commission_per_box = excluded.commission_per_box,
  freight_per_box = excluded.freight_per_box, net_unit_price = excluded.net_unit_price,
  gross_amount = excluded.gross_amount, net_amount = excluded.net_amount;

do $$
declare
  target_company_id uuid;
  target_greenhouse_id uuid;
  cost_count integer;
  cost_total numeric;
  harvest_count integer;
  sale_count integer;
  sale_line_count integer;
  sale_total numeric;
begin
  select company.id, greenhouse.id into target_company_id, target_greenhouse_id
  from public.companies company
  join public.greenhouses greenhouse on greenhouse.company_id = company.id
  where company.slug = 'mercadia-ag' and public.route_slug(greenhouse.name) = 'zoyatitla' and greenhouse.is_active
  limit 1;

  select count(*), coalesce(sum(amount), 0) into cost_count, cost_total
  from public.cost_records
  where company_id = target_company_id and source_reference like 'zoyatitla-legacy:%';
  if cost_count <> 268 or round(cost_total, 2) <> 340522.62 then
    raise exception 'zoyatitla_cost_reconciliation_failed: count %, total %', cost_count, cost_total;
  end if;

  select count(*) into harvest_count
  from public.harvest_records harvest
  join public.tasks task on task.id = harvest.source_task_id
  where harvest.company_id = target_company_id
    and task.technical_plan->>'reference' like 'zoyatitla-legacy:cosecha:%';
  if harvest_count <> 9 then
    raise exception 'zoyatitla_harvest_reconciliation_failed: %', harvest_count;
  end if;

  select count(*), coalesce(sum(net_amount), 0) into sale_count, sale_total
  from public.harvest_sales
  where company_id = target_company_id and source_reference like 'zoyatitla-legacy:%';
  if sale_count <> 9 or round(sale_total, 2) <> 229334.00 then
    raise exception 'zoyatitla_sale_reconciliation_failed: count %, total %', sale_count, sale_total;
  end if;

  select count(*) into sale_line_count
  from public.harvest_sale_lines where source_reference like 'zoyatitla-legacy:%';
  if sale_line_count <> 27 then
    raise exception 'zoyatitla_sale_line_reconciliation_failed: %', sale_line_count;
  end if;
end;
$$;

commit;
