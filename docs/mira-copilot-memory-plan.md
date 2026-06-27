# Mira Copilot: memoria operativa y AI explicable

## Objetivo

Mira Copilot debe sentirse como un solo copiloto operativo, no como varios agentes sueltos ni como un boton comun. Su valor real viene de tres capas:

- Leer datos confiables de la plataforma.
- Recordar patrones por empresa, invernadero, cultivo y seccion.
- Preparar acciones con aprobacion humana antes de ejecutar.

## Estado actual

La primera version ya deja preparada la capa visual y de comando:

- Command bar premium en el Topbar.
- Panel lateral de Mira Copilot.
- Pulso de hoy en Inicio.
- Sugerencias inline en Operacion.
- SQL `25_mira_copilot.sql` para guardar ejecuciones, insights, tareas sugeridas y mensajes preparados.
- Edge Function `mira-copilot` para analizar datos y regresar prioridades.

Esta version todavia no debe verse como la AI completa. Es la base para que Mira empiece a leer, guardar y explicar.

## Siguiente etapa: memoria

Agregar memoria para que Mira no solo analice lo de hoy, sino que compare contra historial.

Tablas sugeridas:

- `copilot_memory`: aprendizajes por empresa, invernadero o modulo.
- `copilot_weekly_summaries`: resumen semanal por area.
- `copilot_entity_notes`: memoria por cultivo, seccion, plaga, trabajador, lote o actividad.
- `copilot_decisions`: sugerencias aprobadas, rechazadas y resultado posterior.

Ejemplos de memoria:

- "En Hectarea 1, el deschuponado suele retrasarse los martes."
- "La Seccion 2 tuvo mas alertas despues de humedad alta."
- "Este cultivo responde mejor cuando nutricion y clima se revisan juntos."

## Tools internas

El usuario solo ve Mira Copilot. Internamente Mira usa tools por modulo:

- Operacion Tool: tareas vencidas, tareas de ayer, responsables, bloqueos y cumplimiento.
- Clima Tool: cruza `weather_snapshots` con riesgos y actividades sensibles.
- Laboratorio Tool: interpreta estudios tecnicos y detecta anomalias.
- Nutricion Tool: compara planes, aplicaciones y respuesta del cultivo.
- Costos Tool: detecta desviaciones de gasto.
- Produccion Tool: analiza rendimiento por cultivo, invernadero y seccion.
- Telegram Tool: prepara mensajes aprobables.
- Reportes Tool: genera resumen diario o semanal.

## Flujo ideal

1. Mira recibe una pregunta o se ejecuta el pulso diario.
2. Lee datos recientes.
3. Busca memoria historica relevante.
4. Compara lo actual contra patrones anteriores.
5. Genera insights con evidencia.
6. Prepara acciones posibles.
7. Pide aprobacion antes de crear tareas, mandar mensajes o cambiar datos.
8. Guarda lo que paso para aprender del resultado.

## AI explicable

Si el owner no entiende que hace Mira, los demas tampoco. La experiencia debe explicar cada sugerencia con esta estructura:

- Que detecto.
- Por que importa.
- De donde salio el dato.
- Que accion propone.
- Que pasara si apruebas.

Ejemplo:

**Que detecte:** Actividad de ayer sin completar.  
**Evidencia:** Deschuponado en Hectarea 1 aparece como pendiente desde 2026-06-24.  
**Riesgo:** Puede atrasar el seguimiento operativo de la seccion.  
**Acciones:** preparar mensaje al encargado o crear tarea de seguimiento.  
**Control:** Mira no ejecuta nada sin aprobacion owner/admin.

## Ajuste visual necesario

La interfaz debe dejar de mostrar solo botones como `Mensaje` o `Tarea`. Debe mostrar acciones con consecuencia clara:

- `Preparar mensaje`
- `Crear borrador de tarea`
- `Descartar sugerencia`
- `Ver evidencia`
- `Aprobar y crear`
- `Aprobar y enviar`

Tambien debe separar estados:

- Detectado: Mira encontro algo.
- Preparado: Mira creo un borrador.
- Aprobado: owner/admin acepto.
- Ejecutado: la accion ya se realizo.
- Descartado: el usuario rechazo la recomendacion.

## Orden recomendado

1. Correr `25_mira_copilot.sql`.
2. Desplegar la funcion `mira-copilot`.
3. Agregar memoria operativa.
4. Mejorar el panel para que cada insight tenga evidencia y consecuencias.
5. Conectar clima y laboratorio como primeros modulos inteligentes.
6. Agregar resumen semanal automatico.
7. Habilitar aprobacion real para crear tareas.
8. Habilitar Telegram real solo despues de aprobacion.

## Principio de producto

Mira Copilot no debe sentirse como un chat pegado a la plataforma. Debe sentirse como una capa de mando que entiende la operacion, recuerda el historial, prepara decisiones y siempre explica antes de actuar.
