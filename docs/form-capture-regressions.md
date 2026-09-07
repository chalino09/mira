# Regresión de capturas y borradores

Estos escenarios comprueban que una actualización de datos o una interacción con un selector no borre una captura abierta. Usar registros ficticios en un entorno de prueba.

## Teclado y cierres

1. Abrir un registro, escribir notas y abrir el calendario. Pulsar Escape desde el selector: debe cerrar solo el calendario, devolver el foco a su botón y conservar las notas.
2. Repetir con el selector de hora.
3. Buscar un producto y elegirlo con flechas y Enter: debe seleccionar el producto sin enviar el formulario. Escape debe cerrar solo las sugerencias.
4. Hacer clic fuera de una ventana con formulario: debe permanecer abierta. Cerrar o Cancelar siguen siendo acciones explícitas para abandonar la captura.
5. En un diálogo informativo sin formulario, el clic fuera debe seguir cerrándolo, salvo que indique lo contrario mediante `closeOnBackdrop`.

## Renovación de datos

1. En Nueva actividad semanal, capturar fecha, encargados, productos, dosis, unidades y parámetros técnicos. Esperar al menos dos actualizaciones de 30 segundos. Todos los valores deben conservarse.
2. Editar comprador, cajas, precio y desglose de una venta de cosecha. Renovar la colección de cosechas con objetos nuevos del mismo identificador: debe conservar el borrador.
3. Corregir una cosecha, cambiar comisión y flete, y renovar sus datos: el desglose debe conservarse.
4. Modificar un campo numérico no controlado y cambiar su `defaultValue` desde el componente padre: debe conservar lo escrito, igual que un input nativo. Para cambiar el valor intencionalmente durante una captura, usar `value`; para abrir otra entidad, cambiar la `key` del formulario.
5. Cerrar y volver a abrir una captura, o cambiar explícitamente a otro registro: debe inicializarse con los datos correspondientes y no heredar el borrador anterior.

## Guardado lento o fallido

En los registros manuales de `RecordModal`, simular una respuesta lenta al guardar. Cerrar, Cancelar y Escape no deben abandonar el formulario durante la petición. Si falla, los datos deben seguir disponibles y los controles deben permitir corregir y reintentar.

## Venta con calidades vacías

Capturar 10 cajas de primera a $100 por caja, sin cajas de segunda ni tercera, con $1 de comisión, $2 de flete y $3 de empaque por caja. Debe permitir guardar y mostrar una venta neta de $940. Las calidades sin cajas no deben exigir un precio para cubrir esos gastos. Si se vende una caja de segunda a $5 con los mismos gastos, debe rechazarla: los gastos superan el precio de una calidad que sí se está vendiendo.

La conservación descrita aplica mientras la captura permanece abierta. Recargar toda la página, navegar fuera o cerrar explícitamente no guarda un borrador persistente.
