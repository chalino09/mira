import type { Task } from "@/types";
import { addDays, monthShortLabel, startOfIsoWeek } from "@/lib/date";
import { cn } from "@/lib/utils";

const weeks = 18;
const futureWeeks = 1;
const daysPerWeek = 7;

type ActivityTone = 0 | 1 | 2 | 3 | 4 | "blocked";

const toneClass: Record<ActivityTone, string> = {
  0: "bg-white",
  1: "bg-[#E8F1E8]",
  2: "bg-[#CFE3D0]",
  3: "bg-[#8FAF93]",
  4: "bg-app-green",
  blocked: "bg-app-red"
};

function toLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function activityTone(taskCount: number, hasBlockedTask: boolean): ActivityTone {
  if (hasBlockedTask) return "blocked";
  if (taskCount >= 4) return 4;
  if (taskCount === 3) return 3;
  if (taskCount === 2) return 2;
  if (taskCount === 1) return 1;
  return 0;
}

export function CalendarContributionGrid({ tasks }: { tasks: Task[] }) {
  const currentWeekStart = startOfIsoWeek();
  const pastWeeks = weeks - futureWeeks - 1;
  const startDate = addDays(currentWeekStart, -pastWeeks * daysPerWeek);
  const endDate = addDays(currentWeekStart, (futureWeeks + 1) * daysPerWeek - 1);
  const startIso = toLocalDateKey(startDate);
  const endIso = toLocalDateKey(endDate);
  const visibleTasks = tasks.filter((task) => task.date >= startIso && task.date <= endIso);
  const taskCountByDate = visibleTasks.reduce<Record<string, number>>((acc, task) => {
    acc[task.date] = (acc[task.date] ?? 0) + 1;
    return acc;
  }, {});
  const blockedDates = new Set(
    visibleTasks.filter((task) => task.status === "Bloqueada").map((task) => task.date)
  );
  const today = toLocalDateKey(new Date());
  const completedCount = visibleTasks.filter((task) => task.status === "Completada").length;
  const activeDayCount = Object.keys(taskCountByDate).length;

  const days = Array.from({ length: weeks * daysPerWeek }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    const iso = toLocalDateKey(date);
    const taskCount = taskCountByDate[iso] ?? 0;
    return {
      iso,
      day: date.getDate(),
      taskCount,
      tone: activityTone(taskCount, blockedDates.has(iso))
    };
  });
  const monthLabels = Array.from({ length: weeks }, (_, weekIndex) => {
    const weekDate = addDays(startDate, weekIndex * daysPerWeek);
    const previousWeekDate = weekIndex > 0 ? addDays(startDate, (weekIndex - 1) * daysPerWeek) : null;

    if (weekIndex > 0 && previousWeekDate && weekDate.getMonth() === previousWeekDate.getMonth()) {
      return "";
    }

    return monthShortLabel(weekDate);
  });

  return (
    <section className="border-y border-app-border py-7">
      <div className="mb-7 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-app-muted">
            Ritmo operativo
          </p>
          <h2 className="mt-3 text-3xl font-light tracking-normal text-app-text sm:text-4xl">
            18 semanas de trabajo, de un vistazo
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-app-muted">
            Carga programada y estado diario de la operación.
          </p>
        </div>
        <div className="grid grid-cols-3 border-y border-app-border sm:min-w-[360px]">
          {[
            ["Programadas", visibleTasks.length],
            ["Completadas", completedCount],
            ["Días activos", activeDayCount]
          ].map(([label, value], index) => (
            <div key={label} className={cn("py-3", index > 0 && "border-l border-app-border pl-4", index === 0 && "pr-4")}>
              <p className="text-2xl font-light text-app-text">{value}</p>
              <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-app-muted">{label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="pb-2">
        <div
          className="mb-2 grid gap-1 pl-8 text-[10px] font-semibold uppercase tracking-[0.16em] text-app-muted sm:gap-1.5 sm:pl-10"
          style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` }}
        >
          {monthLabels.map((label, index) => (
            <span key={`${label}-${index}`}>{label}</span>
          ))}
        </div>
        <div className="grid grid-cols-[24px_1fr] gap-2 sm:grid-cols-[32px_1fr]">
          <div className="grid grid-rows-7 gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-app-muted sm:gap-1.5">
            {["L", "", "M", "", "V", "", "D"].map((label, index) => (
              <span key={`${label}-${index}`} className="flex aspect-square w-full items-center">
                {label}
              </span>
            ))}
          </div>
          <div
            className="grid grid-flow-col grid-rows-7 gap-1 sm:gap-1.5"
            style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` }}
          >
            {days.map((day) => (
              <span
                key={day.iso}
                aria-label={`${day.iso}: ${day.taskCount} actividades`}
                className={cn(
                  "aspect-square w-full border border-app-border transition duration-150 hover:z-10 hover:scale-110 hover:border-app-text",
                  toneClass[day.tone],
                  day.iso === today && "ring-2 ring-app-text ring-offset-1"
                )}
                title={`${day.iso} · ${day.taskCount} ${day.taskCount === 1 ? "actividad" : "actividades"}`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-app-muted">
        <div className="flex items-center gap-2">
          <span>Menos</span>
          {[0, 1, 2, 3, 4].map((tone) => (
            <span
              key={tone}
              className={cn("h-3 w-3 border border-app-border", toneClass[tone as 0 | 1 | 2 | 3 | 4])}
            />
          ))}
          <span>Más</span>
        </div>
        <span className="flex items-center gap-2"><span className="h-3 w-3 border border-app-border bg-app-red" /> Bloqueada</span>
        <span className="flex items-center gap-2"><span className="h-3 w-3 border border-app-text bg-white" /> Hoy</span>
      </div>
    </section>
  );
}
