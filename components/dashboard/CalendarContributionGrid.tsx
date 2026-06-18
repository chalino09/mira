import type { Task } from "@/types";
import { addDays, monthShortLabel, startOfIsoWeek } from "@/lib/date";
import { cn } from "@/lib/utils";

const weeks = 18;
const daysPerWeek = 7;

type ActivityTone = 0 | 1 | 2 | 3 | 4 | "alert";

const toneClass: Record<ActivityTone, string> = {
  0: "bg-white/70",
  1: "bg-[#E8F1E8]",
  2: "bg-[#CFE3D0]",
  3: "bg-[#8FAF93]",
  4: "bg-app-green",
  alert: "bg-app-amber"
};

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function activityTone(taskCount: number, hasInProgressTask: boolean): ActivityTone {
  if (hasInProgressTask) return "alert";
  if (taskCount > 1) return 4;
  if (taskCount === 1) return 3;
  return 0;
}

export function CalendarContributionGrid({ tasks }: { tasks: Task[] }) {
  const currentWeekStart = startOfIsoWeek();
  const startDate = addDays(currentWeekStart, -(weeks - 1) * daysPerWeek);
  const taskCountByDate = tasks.reduce<Record<string, number>>((acc, task) => {
    acc[task.date] = (acc[task.date] ?? 0) + 1;
    return acc;
  }, {});
  const inProgressDates = new Set(
    tasks.filter((task) => task.status === "En progreso").map((task) => task.date)
  );

  const days = Array.from({ length: weeks * daysPerWeek }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    const iso = toIsoDate(date);
    const taskCount = taskCountByDate[iso] ?? 0;
    return {
      iso,
      day: date.getDate(),
      tone: activityTone(taskCount, inProgressDates.has(iso))
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
    <section className="mb-10 border-y border-app-border py-6">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-app-muted">
            Ritmo operativo
          </p>
          <h2 className="mt-3 text-3xl font-light tracking-normal text-app-text">
            Actividad agrícola por día
          </h2>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-app-muted">
          <span>Menos</span>
          {[0, 1, 2, 3, 4].map((tone) => (
            <span
              key={tone}
              className={cn(
                "h-3 w-3 border border-app-border",
                toneClass[tone as 0 | 1 | 2 | 3 | 4]
              )}
            />
          ))}
          <span>Más</span>
        </div>
      </div>

      <div className="overflow-x-auto pb-1">
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
                  aria-label={`${day.iso}: actividad ${day.tone}`}
                  className={cn(
                    "h-4 w-4 border border-app-border transition hover:scale-110 hover:border-app-green",
                    toneClass[day.tone]
                  )}
                  title={`${day.iso} · día ${day.day}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
