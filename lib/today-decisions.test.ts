import assert from "node:assert/strict";
import test from "node:test";
import { buildTodayDecisions } from "./today-decisions.ts";
import type { CurrentUser, Greenhouse, PestAlert, Task } from "../types/index.ts";

const greenhouse = {
  id: "greenhouse-1",
  name: "Norte"
} as Greenhouse;

const owner: CurrentUser = {
  id: "owner-1",
  fullName: "Emilio Pérez",
  email: "emilio@example.com",
  role: "owner"
};

const manager: CurrentUser = {
  ...owner,
  id: "manager-1",
  role: "manager"
};

function task(patch: Partial<Task>): Task {
  return {
    id: "task-1",
    greenhouseId: greenhouse.id,
    type: "Mantenimiento",
    title: "Revisar bomba",
    date: "2026-07-28",
    time: "09:00",
    status: "Pendiente",
    responsible: "Emilio Pérez",
    ...patch
  };
}

test("prioritizes approvals for owner roles", () => {
  const decisions = buildTodayDecisions({
    tasks: [
      task({ id: "today", status: "Pendiente" }),
      task({ id: "approval", status: "Completada" }),
      task({ id: "blocked", status: "Bloqueada" })
    ],
    alerts: [],
    greenhouses: [greenhouse],
    currentUser: owner,
    today: "2026-07-28"
  });

  assert.deepEqual(decisions.map((decision) => decision.kind), [
    "approval",
    "blocked-work",
    "assigned-work"
  ]);
});

test("does not show approval decisions to managers", () => {
  const decisions = buildTodayDecisions({
    tasks: [task({ status: "Completada" })],
    alerts: [],
    greenhouses: [greenhouse],
    currentUser: manager,
    today: "2026-07-28"
  });

  assert.equal(decisions.length, 0);
});

test("only exposes actionable work due today or earlier", () => {
  const decisions = buildTodayDecisions({
    tasks: [
      task({ id: "future", date: "2026-07-29" }),
      task({ id: "today", date: "2026-07-28" }),
      task({ id: "closed", date: "2026-07-27", status: "Verificada" })
    ],
    alerts: [],
    greenhouses: [greenhouse],
    currentUser: manager,
    today: "2026-07-28"
  });

  assert.deepEqual(decisions.map((decision) => decision.sourceId), ["today"]);
});

test("elevates severe pest cases as operational exceptions", () => {
  const alert = {
    id: "pest-1",
    greenhouseId: greenhouse.id,
    problem: "Mosca blanca",
    severity: "Alta",
    zone: "Sector 2",
    detectedAt: "2026-07-27",
    action: "",
    followUp: "",
    caseStatus: "Revisión requerida"
  } satisfies PestAlert;

  const decisions = buildTodayDecisions({
    tasks: [],
    alerts: [alert],
    greenhouses: [greenhouse],
    currentUser: manager,
    today: "2026-07-28"
  });

  assert.equal(decisions[0]?.kind, "pest-exception");
  assert.equal(decisions[0]?.primaryAction.type, "open-pest");
});
