import type { Task } from "@/types";
import { addDays, monthShortLabel, startOfIsoWeek } from "@/lib/date";
import { cn } from "@/lib/utils";

const weeks = 18;
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

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
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
  const startDate = addDays(currentWeekStart, -(weeks - 1) * daysPerWeek);
  const endDate = addDays(currentWeekStart, daysPerWeek - 1);
  const startIso = toIsoDate(startDate);
  const endIso = toIsoDate(endDate);
  const visibleTasks = tasks.filter((task) => task.date >= startIso && task.date <= endIso);
  const taskCountByDate = visibleTasks.reduce<Record<string, number>>((acc, task) => {
    acc[task.date] = (acc[task.date] ?? 0) + 1;
    return acc;
  }, {});
  const blockedDates = new Set(
    visibleTasks.filter((task) => task.status === "Bloqueada").map((task) => task.date)
  );
  const today = toIsoDate(new Date());
  const completedCount = visibleTasks.filter((task) => task.status === "Completada").length;
  const activeDayCount = Object.keys(taskCountByDate).length;

  const days = Array.from({ length: weeks * daysPerWeek }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    const iso = toIsoDate(date);
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

      <div className="overflow-x-auto pb-2">
        <div className="min-w-[760px]">
          <div
            className="mb-2 grid gap-1.5 pl-10 text-[10px] font-semibold uppercase tracking-[0.16em] text-app-muted"
            style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` }}
          >
            {monthLabels.map((label, index) => (
              <span key={`${label}-${index}`}>{label}</span>
            ))}
          </div>
          <div className="grid grid-cols-[32px_1fr] gap-2">
            <div className="grid grid-rows-7 gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-app-muted">
              {["L", "", "M", "", "V", "", "D"].map((label, index) => (
                <span key={`${label}-${index}`} className="flex h-4 items-center">
                  {label}
                </span>
              ))}
            </div>
            <div className="grid grid-flow-col grid-rows-7 gap-1.5">
              {days.map((day, index) => (
                <span
                  key={day.iso}
                  aria-label={`${day.iso}: ${day.taskCount} actividades`}
                  className={cn(
                    "h-4 w-4 border border-app-border transition duration-150 hover:z-10 hover:scale-125 hover:border-app-text",
                    toneClass[day.tone],
                    day.iso === today && "ring-2 ring-app-text ring-offset-1"
                  )}
                  title={`${day.iso} · ${day.taskCount} ${day.taskCount === 1 ? "actividad" : "actividades"}`}
                />
              ))}
            </div>
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
