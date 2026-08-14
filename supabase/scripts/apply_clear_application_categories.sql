-- MIRA · Categorías evidentes por producto (20 productos exactos)
-- No modifica actividades. No reemplaza categorías existentes.

with company_context as (
  select company.id as company_id
  from public.companies company
  where lower(trim(company.name)) = lower('Mercadia Ag')
    and (
      select count(*) from public.companies matching
      where lower(trim(matching.name)) = lower('Mercadia Ag')
    ) = 1
), mapping(product_id, expected_name, category) as (
  values
    ('7246196f-1082-4470-9eae-df579b57a8f0'::uuid, 'AMINOSHOT', 'bioestimulante'::public.application_category),
    ('52b85cc6-1e04-41e0-b1e4-c0a329957eac'::uuid, 'BMo PLUS', 'fertilizante'::public.application_category),
    ('433d830a-3404-4a58-a734-3bd4067ab228'::uuid, 'DECIS', 'insecticida'::public.application_category),
    ('63b33f74-d944-4e5b-8198-f9cc1add15df'::uuid, 'NEW LEVERAGE', 'insecticida'::public.application_category),
    ('a97b736b-6582-461c-8fac-d3df93a2a643'::uuid, 'NITROGENO SUPREME', 'fertilizante'::public.application_category),
    ('e1dccabd-ae68-4c7c-89cd-c6b15e9b6617'::uuid, 'PLAS + ESTRES', 'bioestimulante'::public.application_category),
    ('95f46313-dd26-45b5-af39-7dc08e7f9148'::uuid, 'PLAST MOLIBDENO', 'fertilizante'::public.application_category),
    ('78616222-93ad-4b83-8ce4-76388e31835a'::uuid, 'SUPRA B', 'fertilizante'::public.application_category),
    ('9e948c0e-1666-426c-a553-2a81202e97f8'::uuid, 'DECIS FORTE', 'insecticida'::public.application_category),
    ('cf139b85-3452-46dc-92f7-f9b8ab8e45d6'::uuid, 'DIAZINON', 'insecticida'::public.application_category),
    ('3d1886fc-36c7-4ba3-bb70-c291b0d6100c'::uuid, 'EXALT', 'insecticida'::public.application_category),
    ('0bf34468-78ae-4f0f-a6fb-158c1bef5bca'::uuid, 'FIERRO SUPREME', 'corrector'::public.application_category),
    ('4d56a242-479b-4bd3-9f7e-f7c29f1d3f35'::uuid, 'LIVING X7 EDDHA', 'corrector'::public.application_category),
    ('517078f5-afe0-4aa5-b0ac-2858f6209362'::uuid, 'MG SUPREME', 'corrector'::public.application_category),
    ('383545c5-d133-4fc7-a9d7-33b647ae8827'::uuid, 'NATURAL SOAP', 'insecticida'::public.application_category),
    ('2a191d80-e3be-4045-b8cf-802e1d3a6f28'::uuid, 'PLAS+ BROTACION VERDE', 'bioestimulante'::public.application_category),
    ('3b04ce0a-d95c-46a6-9b9f-8fcb10262393'::uuid, 'ROOT BOOST', 'microorganismos'::public.application_category),
    ('1f83dd27-6115-49af-a027-58b45b4b763f'::uuid, 'SPINOSINAS 4X', 'insecticida'::public.application_category),
    ('c062aad7-9e18-4bcf-a86c-669f1db77a1a'::uuid, 'SUPRA ROOT', 'regulador_crecimiento'::public.application_category),
    ('92d302e4-872e-4f09-8e79-bf36eacb5eb4'::uuid, 'SUPRA START', 'fertilizante'::public.application_category)
), updated as (
  update public.products product
  set category = mapping.category, updated_at = now()
  from mapping
  join company_context context on true
  where product.id = mapping.product_id
    and product.company_id = context.company_id
    and lower(trim(product.name)) = lower(trim(mapping.expected_name))
    and product.category is null
  returning product.id, product.name, product.category
)
select
  count(*)::integer as productos_actualizados,
  jsonb_agg(jsonb_build_object(
    'product_id', id,
    'producto', name,
    'categoria', category
  ) order by name) as detalle
from updated;
