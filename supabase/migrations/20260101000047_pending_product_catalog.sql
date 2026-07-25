-- mira - 47 Pending product catalog
-- Ejecutar despues de 46_work_evidence_and_operational_alerts.sql.
-- Agrega los productos pendientes sin duplicar variantes con espacios o puntuacion.
-- INTEGUZAM y FUNGIZUM son productos distintos; FUNGIZUM ya existe en el catalogo base.

with source_products(name) as (
  values
    ('DECIS FORTE'),
    ('ELMIPIND'),
    ('TENIGO'),
    ('PEPTON'),
    ('PLAST BORO'),
    ('PLAST MOLIBDENO'),
    ('PLAST ENGORDE'),
    ('INTEGUZAM')
)
insert into public.products (company_id, name, composition)
select company.id, source.name, null
from public.companies company
cross join source_products source
where not exists (
  select 1
  from public.products product
  where product.company_id = company.id
    and regexp_replace(lower(trim(product.name)), '[^a-z0-9]+', '', 'g') =
        regexp_replace(lower(trim(source.name)), '[^a-z0-9]+', '', 'g')
);
