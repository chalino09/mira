export function greetingForNow(date = new Date()) {
  const hour = date.getHours();

  if (hour >= 5 && hour < 12) {
    return "Buen día";
  }

  if (hour >= 12 && hour < 19) {
    return "Buenas tardes";
  }

  return "Buenas noches";
}

export function overviewDateLabel(date = new Date()) {
  return new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric"
  })
    .format(date)
    .replace(/\sde\s/g, " DE ")
    .replace(",", ",")
    .toUpperCase();
}

export function startOfIsoWeek(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  const day = start.getDay() || 7;
  start.setDate(start.getDate() - day + 1);
  return start;
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function weekOfYear(date = new Date()) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);

  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function monthShortLabel(date: Date) {
  const label = new Intl.DateTimeFormat("es-MX", { month: "short" })
    .format(date)
    .replace(".", "");

  return label.charAt(0).toUpperCase() + label.slice(1);
}
