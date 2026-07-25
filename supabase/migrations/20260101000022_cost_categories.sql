-- mira - 22 Cost categories
-- Ejecutar después de 21_technical_lab_studies.sql.

alter type public.cost_category add value if not exists 'refrescos';
alter type public.cost_category add value if not exists 'renta';
alter type public.cost_category add value if not exists 'gasolina';
