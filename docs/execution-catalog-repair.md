# Reparación del catálogo al confirmar actividades

La versión desplegada de `create_operational_task_with_staff` y `update_operational_task_with_staff` descartaba `productId`, aunque el código local ya lo conservaba. La sincronización rechazaba los materiales sin vínculo al combinarlos con productos nuevos, y el cliente mostraba un mensaje genérico.

La migración `20260904000100_execution_catalog_repair.sql`:

- Actualiza las dos funciones de planeación y rechaza identificadores de otra empresa.
- Recupera vínculos únicamente en actividades abiertas, por nombre único dentro de la misma empresa. No cambia dosis, fechas, estados ni registros técnicos históricos.
- Resuelve materiales antiguos en la sincronización y exige selección explícita ante nombres ambiguos.
- Agrega `complete_nutrition_execution` y `complete_application_execution`: revisión, materiales y cierre se guardan en una transacción. Las RPC anteriores siguen disponibles para clientes existentes.
- Conserva los materiales anteriores y los aplicados en `task_updates.metadata` para auditoría. Un intento fallido revierte también ese evento.
- Limita el consumo automático de nutriciones y aplicaciones a materiales con registro técnico, excluyendo productos omitidos.

El cliente recupera vínculos únicos al abrir el formulario, exige productos seleccionados y conserva el borrador mientras la ventana está abierta, incluso durante actualizaciones de datos.

## Despliegue

Aplicar esta migración antes de publicar el cliente. En instalaciones con SQL manual antiguo, revisar el esquema y aplicar solo esta reparación; no ejecutar indiscriminadamente todas las migraciones marcadas como pendientes. Registrar la versión aplicada en `supabase_migrations.schema_migrations`.

## Validación

`supabase/tests/execution_catalog_repair.sql` prueba planeación, edición, material antiguo más producto nuevo, sustitución, omisión, inventario, reversión de errores, reintentos, nombres ambiguos y aislamiento entre empresas. Usa datos ficticios y termina con rollback.

La corrección no registra como realizada ninguna actividad existente: su operador debe confirmar los datos reales y guardar.
