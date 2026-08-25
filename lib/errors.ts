type ErrorLike = {
  message?: string;
  code?: string;
};

const knownMessages: Record<string, string> = {
  "Invalid login credentials": "Correo o contraseña incorrectos.",
  "Email not confirmed": "Confirma el correo antes de entrar.",
  "User already registered": "Ese correo ya tiene cuenta. Entra con tu contraseña.",
  "A user with this email address has already been registered": "Ese correo ya tiene cuenta. Entra con tu contraseña.",
  "Password should be at least 6 characters": "Usa una contraseña más larga.",
  missing_supabase_client: "No se pudo conectar con Supabase.",
  work_schema_update_required: "La base de datos está desactualizada para operar actividades. Aplica la migración 53 y vuelve a intentarlo.",
  not_authenticated: "Tu sesión expiró. Vuelve a iniciar sesión.",
  not_allowed: "Tu rol no permite hacer este cambio.",
  invalid_email: "Revisa el correo del usuario.",
  member_not_found: "No encontramos ese miembro.",
  last_owner_required: "Debe quedar al menos un owner activo.",
  full_name_required: "Escribe tu nombre.",
  company_name_required: "Escribe el nombre de la empresa.",
  greenhouse_name_required: "Escribe el nombre de la primera área productiva.",
  crop_required: "Selecciona un cultivo activo.",
  crop_variety_required: "Escribe la variedad del cultivo.",
  tomato_variety_required: "Escribe la variedad del cultivo.",
  full_name_too_long: "Tu nombre es demasiado largo.",
  company_name_too_long: "El nombre de la empresa es demasiado largo.",
  greenhouse_name_too_long: "El nombre del área productiva es demasiado largo.",
  location_too_long: "La ubicación es demasiado larga.",
  precise_location_required: "Confirma la latitud y longitud del área productiva.",
  latitude_invalid: "La latitud debe estar entre -90 y 90.",
  longitude_invalid: "La longitud debe estar entre -180 y 180.",
  location_accuracy_invalid: "La precisión de ubicación no es válida.",
  task_not_found: "No encontramos esa actividad.",
  plan_not_found: "No encontramos esa planeación semanal.",
  task_title_required: "Escribe el título de la actividad.",
  task_outside_week: "La actividad debe quedar dentro de la semana seleccionada.",
  crew_size_invalid: "La cantidad de personas no puede ser negativa.",
  invalid_assignee: "Uno de los encargados ya no está activo o no tiene rol manager.",
  assignee_required: "Selecciona al menos un encargado.",
  invalid_task_status: "Ese cambio de estado no es válido.",
  invalid_work_transition: "Esa actividad no puede pasar a ese estado.",
  invalid_work_payload: "Los datos de ejecución de la actividad no son válidos.",
  invalid_work_occurred_at: "La fecha real de la actividad no es válida.",
  technical_completion_required: "Esta actividad requiere sus datos técnicos antes de completarse.",
  work_verification_requires_different_supervisor: "Esta actividad la completaste tú. Para evitar aprobar tu propio trabajo, debe verificarla otro admin u owner.",
  work_completion_note_required: "Describe qué realizaste antes de enviar la actividad a verificación.",
  technical_work_requires_reopen: "Las actividades técnicas deben reabrirse con un motivo para corregir su registro.",
  work_completion_undo_expired: "Ya pasó el tiempo disponible para deshacer esta finalización.",
  work_reopen_reason_required: "Escribe el motivo para reabrir la actividad.",
  inventory_item_name_required: "Escribe el nombre del artículo.",
  invalid_inventory_product: "El producto seleccionado ya no está disponible en el catálogo.",
  inventory_unit_required: "Indica la unidad base del artículo.",
  inventory_quantity_required: "Indica una cantidad mayor a cero.",
  inventory_receipt_quantity_invalid: "La entrada debe tener una cantidad positiva.",
  inventory_consumption_quantity_invalid: "El consumo debe tener una cantidad positiva.",
  inventory_insufficient_stock: "No hay existencias suficientes en el almacén central.",
  inventory_unit_cost_invalid: "El costo unitario no es válido.",
  inventory_unit_mismatch: "La unidad no coincide con la configurada para el artículo.",
  inventory_adjustment_reason_required: "Escribe el motivo del ajuste.",
  inventory_reversal_reason_required: "Escribe el motivo de la reversión.",
  inventory_movement_not_found: "No encontramos ese movimiento de inventario.",
  resource_rate_invalid: "La tarifa del recurso no es válida.",
  resource_unit_mismatch: "La unidad no coincide con la tarifa configurada.",
  blocked_reason_required: "Escribe el motivo del bloqueo.",
  telegram_not_configured: "Telegram todavía no está configurado en Supabase.",
  manager_membership_required: "Solo un manager activo puede conectar Telegram.",
  telegram_link_failed: "No se pudo generar el enlace de Telegram.",
  telegram_disconnect_failed: "No se pudo desconectar Telegram.",
  telegram_dispatch_failed: "No se pudieron enviar las actividades a Telegram.",
  surface_m2_invalid: "La superficie no puede ser negativa.",
  plants_count_invalid: "El número de plantas no puede ser negativo.",
  beds_count_invalid: "El número de camas no puede ser negativo.",
  transplant_date_invalid: "La fecha de trasplante no puede estar en el futuro.",
  harvest_box_count_required: "Captura una cantidad mayor a cero en Cajas totales.",
  harvest_box_reconciliation_required: "Las cajas de 1ra, 2da, 3ra y merma deben sumar exactamente las Cajas totales.",
  harvest_record_not_found: "No encontramos la cosecha que quieres corregir.",
  harvest_date_required: "Indica la fecha de la cosecha.",
  harvest_box_weight_required: "Indica un peso por caja mayor a cero.",
  harvest_change_note_required: "Escribe el motivo de la corrección.",
  harvest_values_invalid: "Revisa que las cajas y precios no sean negativos.",
  sale_buyer_required: "Escribe el nombre del comprador.",
  sale_date_required: "Indica la fecha de la venta.",
  sale_lines_required: "Agrega las cajas vendidas por calidad.",
  sale_boxes_required: "Registra al menos una caja vendida.",
  sale_boxes_exceed_harvest: "Las cajas vendidas no pueden superar las cajas cosechadas de esa calidad.",
  sale_deductions_exceed_price: "Los gastos por caja no pueden superar el precio de venta.",
  harvest_sale_special_lines_require_review: "Esta venta tiene conceptos especiales y necesita revisión antes de editarse."
};

const knownCodes: Record<string, string> = {
  "23505": "Ese registro ya existe.",
  "23503": "El registro está relacionado con otro dato que no existe o no está disponible.",
  "42501": "No tienes permisos para hacer este cambio."
};

export function appErrorMessage(error: unknown, fallback = "Ocurrió un error. Intenta de nuevo.") {
  if (!error) return fallback;

  const errorLike = error as ErrorLike;
  if (errorLike.code && knownCodes[errorLike.code]) {
    return knownCodes[errorLike.code];
  }

  const message = error instanceof Error ? error.message : errorLike.message;
  if (!message) return fallback;

  return knownMessages[message] ?? fallback;
}
