type ErrorLike = {
  message?: string;
  code?: string;
};

const knownMessages: Record<string, string> = {
  "Invalid login credentials": "Email o password incorrectos.",
  "Email not confirmed": "Confirma el correo antes de entrar.",
  missing_supabase_client: "No se pudo conectar con Supabase.",
  not_authenticated: "Tu sesión expiró. Vuelve a iniciar sesión.",
  not_allowed: "Tu rol no permite hacer este cambio.",
  invalid_email: "Revisa el correo del usuario.",
  member_not_found: "No encontramos ese miembro.",
  last_owner_required: "Debe quedar al menos un owner activo.",
  full_name_required: "Escribe tu nombre.",
  company_name_required: "Escribe el nombre de la empresa.",
  greenhouse_name_required: "Escribe el nombre del primer invernadero.",
  tomato_variety_required: "Escribe la variedad de tomate.",
  full_name_too_long: "Tu nombre es demasiado largo.",
  company_name_too_long: "El nombre de la empresa es demasiado largo.",
  greenhouse_name_too_long: "El nombre del invernadero es demasiado largo.",
  location_too_long: "La ubicación es demasiado larga.",
  precise_location_required: "Confirma la latitud y longitud del invernadero.",
  latitude_invalid: "La latitud debe estar entre -90 y 90.",
  longitude_invalid: "La longitud debe estar entre -180 y 180.",
  location_accuracy_invalid: "La precisión de ubicación no es válida.",
  surface_m2_invalid: "La superficie no puede ser negativa.",
  plants_count_invalid: "El número de plantas no puede ser negativo.",
  beds_count_invalid: "El número de camas no puede ser negativo.",
  transplant_date_invalid: "La fecha de trasplante no puede estar en el futuro."
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
