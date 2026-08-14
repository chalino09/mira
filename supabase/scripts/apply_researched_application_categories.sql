-- MIRA · Categorías confirmadas mediante investigación pública (9 productos)
-- No modifica actividades, no reemplaza categorías existentes y deja intacto el producto "1".

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
    ('2a972a8c-fcb8-455d-b9cf-469ffb4d2cb6'::uuid, 'Q VIRUS', 'regulador_crecimiento'::public.application_category),
    ('51a64913-cc37-4b6d-a0de-671d77834ae9'::uuid, 'STRIKE', 'fungicida'::public.application_category),
    ('94e8046b-77b1-49a1-8ce2-2a89e9e5505d'::uuid, 'AMBIOS XPR', 'fungicida'::public.application_category),
    ('5852652f-6849-4298-bfdb-360cfc8eef97'::uuid, 'QU-4', 'fungicida'::public.application_category),
    ('f3c11d53-e241-4a60-86ad-f7f4daa935ff'::uuid, 'BETAGLI', 'bioestimulante'::public.application_category),
    ('39330b2f-5ef0-442f-8083-44b061f3cda3'::uuid, 'BIO POW', 'insecticida'::public.application_category),
    ('8b215421-de43-4791-b7fe-1a2bf5dca3c7'::uuid, 'COMODORO', 'nematicida'::public.application_category),
    ('cf61bfb0-3e1e-41fc-9bf9-f1ee7c08b560'::uuid, 'ESTREPA', 'insecticida'::public.application_category),
    ('6db32c09-6991-45dc-b4af-2772c8fb5d11'::uuid, 'K3', 'fungicida'::public.application_category)
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
