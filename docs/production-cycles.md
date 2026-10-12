# Ciclos de producción por invernadero

En **Áreas productivas → Ver ciclos**, cada invernadero conserva su historial de ciclos. La ruta anterior `/greenhouses/<id>/cycles/current` continúa funcionando; la ruta de historial es `/greenhouses/<id>/cycles`.

Owners y admins pueden editar el ciclo activo, finalizarlo, iniciar otro y asignar registros. Antes del cierre deben revisar y confirmar sus datos. Los ciclos finalizados conservan sus datos de cultivo bloqueados, también mediante SQL/RPC; no se pueden reabrir. Los encargados consultan únicamente las áreas permitidas por las políticas existentes.

«Ajustar cierre» permite corregir únicamente la fecha, con motivo obligatorio. «Historial del cierre» muestra la fecha anterior y la nueva, el responsable, la hora y el motivo. La auditoría conserva una copia de los datos confirmados al cerrar; los usuarios de la aplicación no pueden editar, borrar ni insertar eventos. Los ciclos que ya estaban finalizados no reciben auditorías ficticias: se registran sus próximos ajustes. Una versión desactualizada del ciclo requiere volver a revisarlo antes de cerrar o ajustar.

La lista muestra el ciclo activo o el último ciclo registrado, su estado y su inicio. Los filtros permiten consultar todas las áreas, las que tienen ciclo activo y las que no lo tienen. El buscador admite nombre del área y variedad. «Nuevo ciclo» abre directamente el formulario cuando no hay activo.

El menú de cada área contiene «Datos del área», «Editar área» (owner/admin) y «Abrir operación». La ficha lateral y las métricas repetidas se reemplazan por un resumen de cantidad de áreas y superficie. La información física se consulta bajo demanda; los datos del cultivo y el detalle agronómico se consultan dentro del ciclo. Para un ciclo cerrado con fecha conocida, el detalle DDT se calcula al cierre.

## Fechas pendientes e historial

- El cierre es manual por invernadero, sin duración obligatoria ni cierre general de la empresa.
- «Fecha de cierre por confirmar» guarda el ciclo finalizado con `ended_at = null` y permite iniciar el siguiente. Confirmar la fecha después no mueve registros ya asignados.
- El trasplante de un ciclo nuevo también puede quedar pendiente. Las fechas desconocidas no se rellenan con fechas ficticias.
- La migración conserva los ciclos importados. Solo crea un ciclo inicial en áreas sin ningún ciclo registrado.
- Los registros históricos sin ciclo identificado permanecen pendientes. Las sugerencias por fecha requieren selección y confirmación manual.
- Las capturas nuevas admiten un ciclo explícito, incluyendo uno finalizado. Sin selección, solo se infiere el ciclo cuando las fechas permiten una pertenencia inequívoca. La actividad de origen transmite su ciclo a los resultados técnicos y costos derivados.
- Las ventas se agrupan a través de su cosecha. Asignar una cosecha mueve también sus ventas en consultas y totales, sin reescribir ventas.

## Consultas

La pantalla de ciclos muestra resultados por ciclo y registros paginados de cosecha, gastos, actividades, riego, nutrición, aplicaciones, plagas, monitoreo y laboratorio. Los totales se calculan en PostgreSQL y no se limitan a la página visible.

Cosechas, sanidad y las vistas de costos del inventario permiten filtrar un ciclo o los registros pendientes, seleccionando primero un invernadero. Los reportes y agregados de esas vistas respetan el mismo filtro.

Editar el área modifica nombre, ubicación, superficie y encargado. Los datos productivos se editan únicamente en el ciclo activo; iniciar otro conserva el anterior. El bloqueo se aplica a la ficha del cultivo: las capturas tardías y la asignación de registros históricos continúan disponibles.

## Instalación y verificación

Aplicar `supabase/migrations/20261011002815_greenhouse_cycles.sql` y después `supabase/migrations/20261011013441_lock_closed_cycles_and_audit.sql` antes de desplegar la interfaz. Son transaccionales y conservan las políticas de lectura por área. La segunda añade auditoría de solo lectura y funciones privadas de trigger; únicamente el trigger puede añadir eventos con el actor autenticado.

Pruebas: `npm run lint`, `npm run typecheck`, `npm test` y `supabase/tests/greenhouse_cycles.sql` contra una base de pruebas con la cadena completa de migraciones. La prueba SQL revierte sus fixtures y verifica cierres sin fecha, independencia de áreas, preservación histórica, capturas tardías, agregados por ciclo y rechazo de cambios sin permisos.
