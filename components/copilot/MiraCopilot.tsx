"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ActivitySquare, Command, Eye, MessageCircle, Plus, Send, Sparkles, X } from "lucide-react";
import { PortalMark } from "@/components/brand/MiraBrand";
import { Button } from "@/components/ui/Button";
import {
  copilotSeverityClass,
  copilotSeverityLabel,
  buildCopilotBrief,
  insightFromSuggestedAction,
  managerMessageForInsight,
  type CopilotChatMessage,
  type CopilotInsight
} from "@/lib/mira-copilot";
import { cn } from "@/lib/utils";

type CopilotAction = (insight: CopilotInsight) => void;

const thinkingMessages = [
  "Leyendo la operacion...",
  "Buscando memoria relevante...",
  "Cruzando senales del invernadero...",
  "Preparando una respuesta corta..."
];

function SeverityPill({ severity, dark = false }: { severity: CopilotInsight["severity"]; dark?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
        dark ? "border-white/15 bg-white/10 text-white/80" : copilotSeverityClass(severity)
      )}
    >
      {copilotSeverityLabel(severity)}
    </span>
  );
}

function EvidenceList({ insight, dark = false }: { insight: CopilotInsight; dark?: boolean }) {
  return (
    <div className={cn("mt-3 grid gap-2 border-t pt-3", dark ? "border-white/10" : "border-app-border")}>
      {insight.evidence.slice(0, 3).map((entry) => (
        <div key={`${insight.id}-${entry.label}`} className="grid grid-cols-[92px_minmax(0,1fr)] gap-2 text-xs leading-5">
          <span className={dark ? "text-white/45" : "text-app-muted"}>{entry.label}</span>
          <span className={cn("min-w-0 break-words", dark ? "text-white/80" : "text-app-text")}>{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

function BriefEvidenceList({
  evidence,
  dark = false
}: {
  evidence: Array<{ label: string; value: string }>;
  dark?: boolean;
}) {
  if (!evidence.length) return null;

  return (
    <div className={cn("mt-3 grid gap-2 border-t pt-3", dark ? "border-white/10" : "border-app-border")}>
      {evidence.map((entry, index) => (
        <div key={`${entry.label}-${index}`} className="grid grid-cols-[92px_minmax(0,1fr)] gap-2 text-xs leading-5">
          <span className={dark ? "text-white/45" : "text-app-muted"}>{entry.label}</span>
          <span className={cn("min-w-0 break-words", dark ? "text-white/80" : "text-app-text")}>{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

function MiraThinkingBubble({ message }: { message: string }) {
  return (
    <article className="mr-8 rounded-lg border border-[#294231] bg-[#102016] px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">Mira</p>
      <div className="mt-3 flex items-center gap-3">
        <span className="relative flex h-8 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
          <span className="absolute inset-0 rounded-xl bg-[#B7E0C1]/10 blur-md" />
          <PortalMark animated className="relative h-5 w-9 text-[#B7E0C1]" />
        </span>
        <span className="text-sm leading-6 text-white/65">{message}</span>
      </div>
    </article>
  );
}

export function MiraCopilotCommand({
  insightCount,
  onOpen
}: {
  insightCount: number;
  onOpen: () => void;
}) {
  return (
    <button
      className="group flex h-10 min-w-0 flex-1 items-center justify-between gap-3 rounded-xl border border-[#1F3429] bg-[#0D0D0D] px-3 text-left text-white shadow-[0_14px_40px_rgba(13,13,13,0.18)] transition hover:border-[#315B43] hover:bg-[#111713] md:max-w-[520px]"
      onClick={onOpen}
      type="button"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="relative flex h-6 w-9 shrink-0 items-center justify-center">
          <span className="absolute inset-0 rounded-full bg-app-green/20 blur-md transition group-hover:bg-app-green/30" />
          <PortalMark animated className="relative h-5 w-8 text-[#B7E0C1]" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-xs font-semibold tracking-[0.14em]">Mira Copilot</span>
          <span className="block truncate text-[10px] text-white/55">Pregunta, prioriza o prepara una acción</span>
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span className="hidden h-2 w-2 rounded-full bg-[#B7E0C1] shadow-[0_0_16px_rgba(183,224,193,0.75)] sm:block" />
        <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] font-semibold text-white/70">
          {insightCount}
        </span>
      </span>
    </button>
  );
}

export function MiraCopilotPanel({
  chatMessages = [],
  insights,
  isRunning,
  onClose,
  onCreateTask,
  onDismissChatAction,
  onOpenOperations,
  onPrepareMessage,
  onRun,
  onSendMessage,
  open
}: {
  chatMessages?: CopilotChatMessage[];
  insights: CopilotInsight[];
  isRunning?: boolean;
  onClose: () => void;
  onCreateTask?: CopilotAction;
  onDismissChatAction?: (actionId: string) => void;
  onOpenOperations?: () => void;
  onPrepareMessage?: CopilotAction;
  onRun?: () => void;
  onSendMessage?: (message: string) => Promise<void> | void;
  open: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [thinkingIndex, setThinkingIndex] = useState(0);

  useEffect(() => {
    if (!isRunning) {
      setThinkingIndex(0);
      return;
    }

    const timer = window.setInterval(() => {
      setThinkingIndex((current) => (current + 1) % thinkingMessages.length);
    }, 1800);

    return () => window.clearInterval(timer);
  }, [isRunning]);

  if (!open) return null;

  const brief = buildCopilotBrief(insights);
  const primary = brief.primaryInsight;
  const supportingInsights = insights
    .filter((insight) => insight.id !== primary?.id && insight.id !== "copilot-clear")
    .slice(0, 3);
  const visibleChatMessages = chatMessages.slice(-6);
  const hasChat = visibleChatMessages.length > 0;

  const submitCommand = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) {
      onRun?.();
      return;
    }
    setDraft("");
    await onSendMessage?.(text);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm">
      <aside className="ml-auto flex h-full w-full max-w-[500px] flex-col border-l border-[#243127] bg-[#0D0D0D] text-white shadow-2xl">
        <header className="border-b border-white/10 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                  <PortalMark animated className="h-5 w-9 text-[#B7E0C1]" />
                </span>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">Command layer</p>
                  <h2 className="mt-1 text-xl font-light tracking-normal text-white">Mira Copilot</h2>
                </div>
              </div>
              <p className="mt-3 max-w-md text-xs leading-5 text-white/55">
                Leo la operación y te digo qué merece atención.
              </p>
            </div>
            <button
              aria-label="Cerrar Mira Copilot"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 text-white/60 transition hover:bg-white/10 hover:text-white"
              onClick={onClose}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {!hasChat ? (
            <>
              <section className="border-b border-white/10 pb-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">Lectura de Mira</p>
                    <p className="mt-2 text-sm text-white/65">{brief.title}</p>
                  </div>
                  <SeverityPill dark severity={brief.severity} />
                </div>
              </section>

              <article className="mt-4 rounded-lg border border-white/10 bg-white/[0.035] px-4 py-4">
                <p className="text-base leading-7 text-white">{brief.summary}</p>
                <p className="mt-4 text-sm leading-6 text-[#B7E0C1]">{brief.recommendation}</p>
                <p className="mt-3 text-xs leading-5 text-white/45">{brief.actionHint}</p>

                <details className="group mt-4">
                  <summary className="flex cursor-pointer list-none items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50 transition hover:text-white">
                    <Eye className="h-3.5 w-3.5" />
                    Ver evidencia
                  </summary>
                  <BriefEvidenceList dark evidence={brief.evidence} />
                </details>

                {primary ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      className="h-8 rounded-lg border-white/10 bg-white/[0.06] px-2 text-xs text-white hover:bg-white/10"
                      icon={<MessageCircle className="h-3.5 w-3.5" />}
                      onClick={() => onPrepareMessage?.(primary)}
                      type="button"
                      variant="secondary"
                    >
                      Preparar mensaje
                    </Button>
                    <Button
                      className="h-8 rounded-lg border-white/10 bg-white/[0.06] px-2 text-xs text-white hover:bg-white/10"
                      icon={<Plus className="h-3.5 w-3.5" />}
                      onClick={() => onCreateTask?.(primary)}
                      type="button"
                      variant="secondary"
                    >
                      Crear seguimiento
                    </Button>
                  </div>
                ) : null}
              </article>
            </>
          ) : null}

          {visibleChatMessages.length ? (
            <section className={cn("border-white/10", hasChat ? "border-t pt-4" : "mt-5 border-t pt-4")}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Conversacion</p>
              <div className="mt-3 grid gap-3">
                {visibleChatMessages.map((message) => (
                  <article
                    className={cn(
                      "rounded-lg border px-3 py-3",
                      message.role === "user"
                        ? "ml-8 border-white/10 bg-white/[0.04]"
                        : "mr-8 border-[#294231] bg-[#102016]"
                    )}
                    key={message.id}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
                      {message.role === "user" ? "Tu" : "Mira"}
                      {message.source === "deterministic" ? " · Local" : ""}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-white/75">{message.content}</p>

                    {message.evidence.length ? (
                      <details className="group mt-3">
                        <summary className="flex cursor-pointer list-none items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 transition hover:text-white">
                          <Eye className="h-3.5 w-3.5" />
                          Ver evidencia
                        </summary>
                        <BriefEvidenceList dark evidence={message.evidence.slice(0, 5)} />
                      </details>
                    ) : null}

                    {message.suggestedActions.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {message.suggestedActions.map((action) => {
                          const insight = insightFromSuggestedAction(action);
                          if (action.kind === "message") {
                            return (
                              <Button
                                className="h-8 rounded-lg border-white/10 bg-white/[0.06] px-2 text-xs text-white hover:bg-white/10"
                                icon={<MessageCircle className="h-3.5 w-3.5" />}
                                key={action.id}
                                onClick={() => onPrepareMessage?.(insight)}
                                type="button"
                                variant="secondary"
                              >
                                Preparar mensaje
                              </Button>
                            );
                          }
                          if (action.kind === "task") {
                            return (
                              <Button
                                className="h-8 rounded-lg border-white/10 bg-white/[0.06] px-2 text-xs text-white hover:bg-white/10"
                                icon={<Plus className="h-3.5 w-3.5" />}
                                key={action.id}
                                onClick={() => onCreateTask?.(insight)}
                                type="button"
                                variant="secondary"
                              >
                                Crear seguimiento
                              </Button>
                            );
                          }
                          return (
                            <Button
                              className="h-8 rounded-lg border-white/10 bg-white/[0.06] px-2 text-xs text-white hover:bg-white/10"
                              icon={<X className="h-3.5 w-3.5" />}
                              key={action.id}
                              onClick={() => onDismissChatAction?.(action.id)}
                              type="button"
                              variant="secondary"
                            >
                              Descartar
                            </Button>
                          );
                        })}
                      </div>
                    ) : null}
                  </article>
                ))}
                {isRunning ? <MiraThinkingBubble message={thinkingMessages[thinkingIndex]} /> : null}
              </div>
            </section>
          ) : null}

          {!hasChat && supportingInsights.length ? (
            <section className="mt-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Tambien vi</p>
              <div className="mt-3 grid gap-2">
                {supportingInsights.map((insight) => (
                  <div className="flex items-start justify-between gap-3 border-t border-white/10 pt-3" key={insight.id}>
                    <p className="text-xs leading-5 text-white/55">{insight.detail}</p>
                    <SeverityPill dark severity={insight.severity} />
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <footer className="border-t border-white/10 px-5 py-4">
          <form className="flex items-center gap-2 border border-white/10 bg-white/[0.04] px-3 py-2" onSubmit={submitCommand}>
            <Command className="h-4 w-4 shrink-0 text-[#B7E0C1]" />
            <input
              className="h-9 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/35"
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Pregunta por pendientes, clima o seguimiento"
              value={draft}
            />
            <button
              aria-label="Analizar con Mira Copilot"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#B7E0C1] text-[#0D0D0D] transition hover:bg-white"
              disabled={isRunning}
              type="submit"
            >
              {isRunning ? <ActivitySquare className="h-4 w-4 animate-pulse" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
          {onOpenOperations ? (
            <button
              className="mt-3 flex w-full items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/50 transition hover:text-white"
              onClick={onOpenOperations}
              type="button"
            >
              <ActivitySquare className="h-3.5 w-3.5" />
              Abrir operación
            </button>
          ) : null}
        </footer>
      </aside>
    </div>
  );
}

export function CopilotPulseBand({
  insights,
  onOpenCopilot,
}: {
  insights: CopilotInsight[];
  onCreateTask?: CopilotAction;
  onOpenCopilot: () => void;
  onPrepareMessage?: CopilotAction;
}) {
  const brief = buildCopilotBrief(insights);

  return (
    <section className="border-y border-[#17251D] bg-[#0D0D0D] px-4 py-4 text-white">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <span className="relative mt-1 flex h-8 w-11 shrink-0 items-center justify-center">
            <span className="absolute inset-0 rounded-xl bg-[#B7E0C1]/10 blur-md" />
            <PortalMark animated className="relative h-5 w-9 text-[#B7E0C1]" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">Mira Copilot</p>
              <SeverityPill dark severity={brief.severity} />
            </div>
            <p className="mt-2 max-w-4xl text-sm font-medium leading-6 text-white/78">{brief.summary}</p>
            <p className="mt-2 max-w-3xl text-xs leading-5 text-[#B7E0C1]">{brief.recommendation}</p>
          </div>
        </div>
        <Button
          className="h-8 shrink-0 rounded-lg border-white/10 bg-white/[0.06] px-3 text-xs text-white hover:bg-white/10"
          icon={<Sparkles className="h-3.5 w-3.5" />}
          onClick={onOpenCopilot}
          variant="secondary"
        >
          Revisar
        </Button>
      </div>
    </section>
  );
}

export function CopilotInlineSuggestions({
  insights
}: {
  insights: CopilotInsight[];
  onCreateTask?: CopilotAction;
  onDismiss?: CopilotAction;
  onPrepareMessage?: CopilotAction;
}) {
  const visible = insights.filter((insight) => insight.sourceType === "operation").slice(0, 2);
  if (!visible.length) return null;
  const brief = buildCopilotBrief(visible);

  return (
    <section className="border-b border-app-border py-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#1F3429] bg-[#0D0D0D] text-[#B7E0C1]">
          <PortalMark animated className="h-4 w-6" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-app-muted">Mira</p>
          <p className="mt-1 text-sm leading-6 text-app-text">{brief.summary}</p>
          <p className="mt-1 text-xs leading-5 text-app-muted">{brief.recommendation}</p>
        </div>
      </div>
    </section>
  );
}

export function previewManagerMessage(insight: CopilotInsight) {
  return managerMessageForInsight(insight);
}
