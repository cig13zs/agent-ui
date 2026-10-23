"use client"

import * as React from "react"
import {
  ArrowUpRight,
  Check,
  CircleCheck,
  CircleX,
  FileText,
  Globe,
  Hourglass,
  Network,
  Pause,
  Pencil,
  Play,
  Search,
  ShieldAlert,
  Square,
  SquareTerminal,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react"

export type AgentRunStatus = "idle" | "running" | "paused" | "waiting-approval" | "done" | "failed"
export type AgentStepKind = "read" | "search" | "edit" | "run" | "web" | "task" | "other"

export interface AgentRunStep {
  id: string
  label: string
  kind?: AgentStepKind
  durationMs?: number
  status?: "done" | "failed"
}

export interface AgentRunCardProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  status: AgentRunStatus
  /** What the agent is doing right now, e.g. "Updating 5 test files". */
  currentStep?: string
  /** The task the run was given. Shown under the current step. */
  title?: string
  model?: string
  /** 1-based index of the step in progress. */
  step?: number
  totalSteps?: number
  /** Epoch ms. The card ticks a live timer from here while the run is active. */
  startedAt?: number
  /** Epoch ms. Stops the timer (paused, done, failed). */
  endedAt?: number
  /** Completed steps, oldest first. */
  steps?: AgentRunStep[]
  /** How many completed steps to show before folding the rest. Default 4. */
  maxSteps?: number
  error?: string
  onPause?: () => void
  onResume?: () => void
  onStop?: () => void
  onOpen?: () => void
  /** Renders "Open run" as a link instead of a button. */
  openHref?: string
  /** Rendered under the progress bar, e.g. an <ApprovalPrompt />. */
  children?: React.ReactNode
}

const kindIcon: Record<AgentStepKind, LucideIcon> = {
  read: FileText,
  search: Search,
  edit: Pencil,
  run: SquareTerminal,
  web: Globe,
  task: Network,
  other: Wrench,
}

const statusMeta: Record<AgentRunStatus, { label: string; tone: string; bar: string }> = {
  idle: { label: "Queued", tone: "text-muted-foreground", bar: "bg-muted-foreground/60" },
  running: { label: "Running", tone: "text-sky-600 dark:text-sky-400", bar: "bg-sky-500 dark:bg-sky-400" },
  paused: { label: "Paused", tone: "text-muted-foreground", bar: "bg-muted-foreground/70" },
  "waiting-approval": {
    label: "Needs approval",
    tone: "text-amber-600 dark:text-amber-400",
    bar: "bg-amber-500 dark:bg-amber-400",
  },
  done: { label: "Done", tone: "text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500" },
  failed: { label: "Failed", tone: "text-red-600 dark:text-red-400", bar: "bg-red-500" },
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ")
}

export function formatElapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`
}

export function formatStepDuration(ms: number) {
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return formatElapsed(ms)
}

function useNow(active: boolean, interval = 1000) {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), interval)
    return () => clearInterval(id)
  }, [active, interval])
  return now
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden className={cx("size-5 motion-safe:animate-spin", className)}>
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.25" />
      <path d="M18 10a8 8 0 0 0-8-8" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
    </svg>
  )
}

function StatusIcon({ status }: { status: AgentRunStatus }) {
  const tone = statusMeta[status].tone
  switch (status) {
    case "running":
      return <Spinner className={tone} />
    case "paused":
      return <Pause aria-hidden className={cx("size-5", tone)} />
    case "waiting-approval":
      return <ShieldAlert aria-hidden className={cx("size-5", tone)} />
    case "done":
      return <CircleCheck aria-hidden className={cx("size-5", tone)} />
    case "failed":
      return <CircleX aria-hidden className={cx("size-5", tone)} />
    default:
      return <Hourglass aria-hidden className={cx("size-5", tone)} />
  }
}

const buttonBase =
  "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-3.5"

export function AgentRunCard({
  status,
  currentStep,
  title,
  model,
  step,
  totalSteps,
  startedAt,
  endedAt,
  steps = [],
  maxSteps = 4,
  error,
  onPause,
  onResume,
  onStop,
  onOpen,
  openHref,
  children,
  className,
  ...props
}: AgentRunCardProps) {
  const live = endedAt === undefined && startedAt !== undefined && (status === "running" || status === "waiting-approval")
  const now = useNow(live)
  const elapsed = startedAt !== undefined ? (endedAt ?? now) - startedAt : undefined
  const meta = statusMeta[status]
  const finished = status === "done" || status === "failed"

  const headline =
    currentStep ??
    (status === "done" ? (title ?? "Run finished") : status === "failed" ? "Run failed" : status === "idle" ? "Starting" : title ?? meta.label)

  const shown = steps.slice(-maxSteps)
  const hidden = steps.length - shown.length
  const segments = totalSteps && totalSteps > 0 ? Math.min(totalSteps, 24) : 0
  const completed = status === "done" ? segments : Math.max(0, Math.min(segments, (step ?? 1) - 1))

  return (
    <section
      aria-label={title ? `Agent run: ${title}` : "Agent run"}
      data-status={status}
      className={cx(
        "rounded-xl border border-border bg-card text-card-foreground shadow-sm",
        "motion-safe:animate-[agent-ui-in_320ms_cubic-bezier(.2,.8,.2,1)_both]",
        className,
      )}
      {...props}
    >
      <div className="flex items-start gap-3 px-4 pt-4">
        <span className="mt-px flex size-5 shrink-0 items-center justify-center">
          <StatusIcon status={status} />
        </span>
        <div className="min-w-0 flex-1">
          <p role="status" aria-live="polite" className="sr-only">
            {`${meta.label}: ${headline}`}
          </p>
          <p
            aria-hidden
            className={cx(
              "truncate text-[15px] leading-5 font-medium",
              status === "running" &&
                "motion-safe:animate-[agent-ui-shimmer_2.4s_linear_infinite] motion-safe:bg-[linear-gradient(90deg,var(--color-foreground)_0%,var(--color-foreground)_40%,var(--color-muted-foreground)_50%,var(--color-foreground)_60%,var(--color-foreground)_100%)] motion-safe:bg-[length:200%_100%] motion-safe:bg-clip-text motion-safe:text-transparent",
            )}
          >
            {headline}
          </p>
          <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <span className={cx("shrink-0 font-medium", meta.tone)}>{meta.label}</span>
            {title && currentStep && (
              <>
                <span aria-hidden className="text-border">/</span>
                <span className="truncate">{title}</span>
              </>
            )}
            {model && (
              <span className="ml-auto shrink-0 rounded border border-border px-1.5 py-px font-mono text-[11px] leading-4">
                {model}
              </span>
            )}
          </div>
        </div>
        {elapsed !== undefined && (
          <time
            className="shrink-0 pt-px font-mono text-[13px] tabular-nums text-muted-foreground"
            dateTime={`PT${Math.max(0, Math.floor(elapsed / 1000))}S`}
            aria-label={`Elapsed ${formatElapsed(elapsed)}`}
          >
            {formatElapsed(elapsed)}
          </time>
        )}
      </div>

      {(segments > 0 || step) && (
        <div className="px-4 pt-3.5">
          <div className="mb-1.5 flex items-baseline justify-between text-xs text-muted-foreground">
            <span>
              {segments > 0 ? (
                <>
                  Step <span className="font-medium text-foreground tabular-nums">{Math.min(step ?? 0, totalSteps!)}</span> of{" "}
                  <span className="tabular-nums">{totalSteps}</span>
                </>
              ) : (
                <>
                  Step <span className="font-medium text-foreground tabular-nums">{step}</span>
                </>
              )}
            </span>
            {segments > 0 && <span className="tabular-nums">{Math.round((completed / segments) * 100)}%</span>}
          </div>
          <div
            role="progressbar"
            aria-label="Run progress"
            aria-valuemin={0}
            aria-valuemax={segments || undefined}
            aria-valuenow={segments ? completed : undefined}
            aria-valuetext={segments ? `Step ${Math.min(step ?? 0, totalSteps!)} of ${totalSteps}` : `Step ${step}`}
            className="flex h-1.5 gap-1"
          >
            {segments > 0 ? (
              Array.from({ length: segments }, (_, i) => {
                const isCurrent = status !== "done" && status !== "idle" && i === completed
                return (
                  <span key={i} className="relative flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className={cx(
                        "absolute inset-0 origin-left rounded-full transition-transform duration-500 ease-out motion-reduce:transition-none",
                        status === "done" ? meta.bar : "bg-foreground/80",
                        i < completed ? "scale-x-100" : "scale-x-0",
                      )}
                    />
                    {isCurrent && (
                      <span
                        className={cx(
                          "absolute inset-y-0 left-0 rounded-full",
                          meta.bar,
                          status === "running" && "w-full motion-safe:animate-[agent-ui-fill_1.6s_ease-in-out_infinite] motion-reduce:w-1/2",
                          status === "failed" && "w-full",
                          (status === "paused" || status === "waiting-approval") && "w-1/2",
                        )}
                      />
                    )}
                  </span>
                )
              })
            ) : (
              <span className="relative flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  className={cx(
                    "absolute inset-y-0 w-1/3 rounded-full",
                    meta.bar,
                    !finished && "motion-safe:animate-[agent-ui-indeterminate_1.4s_ease-in-out_infinite]",
                    finished && "w-full",
                  )}
                />
              </span>
            )}
          </div>
        </div>
      )}

      {children && <div className="px-4 pt-3.5">{children}</div>}

      {status === "failed" && error && (
        <p className="mx-4 mt-3.5 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 font-mono text-xs leading-5 text-red-700 dark:text-red-300">
          {error}
        </p>
      )}

      {steps.length > 0 && (
        <ol aria-label="Completed steps" className="mt-3.5 border-t border-border px-2 py-2">
          {hidden > 0 && (
            <li className="px-2 py-1 text-xs text-muted-foreground">
              {hidden} earlier {hidden === 1 ? "step" : "steps"}
            </li>
          )}
          {shown.map((s) => {
            const Icon = kindIcon[s.kind ?? "other"]
            const failed = s.status === "failed"
            return (
              <li
                key={s.id}
                className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] motion-safe:animate-[agent-ui-in_260ms_ease-out_both]"
              >
                {failed ? (
                  <X aria-label="Failed" className="size-3.5 shrink-0 text-red-500" />
                ) : (
                  <Check aria-label="Done" className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                )}
                <Icon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                <span className={cx("min-w-0 flex-1 truncate", failed ? "text-red-700 dark:text-red-300" : "text-foreground/90")}>
                  {s.label}
                </span>
                {s.durationMs !== undefined && (
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    {formatStepDuration(s.durationMs)}
                  </span>
                )}
              </li>
            )
          })}
        </ol>
      )}

      {(onPause || onResume || onStop || onOpen || openHref) && (
        <div className={cx("flex items-center gap-2 px-4 py-3", "border-t border-border")}>
          {!finished && status === "paused" && onResume && (
            <button type="button" onClick={onResume} className={cx(buttonBase, "bg-primary text-primary-foreground hover:bg-primary/90")}>
              <Play aria-hidden /> Resume
            </button>
          )}
          {!finished && status !== "paused" && onPause && (
            <button type="button" onClick={onPause} className={cx(buttonBase, "border border-border bg-transparent hover:bg-muted")}>
              <Pause aria-hidden /> Pause
            </button>
          )}
          {!finished && onStop && (
            <button
              type="button"
              onClick={onStop}
              className={cx(buttonBase, "border border-border bg-transparent text-red-600 hover:bg-red-500/10 dark:text-red-400")}
            >
              <Square aria-hidden className="fill-current" /> Stop
            </button>
          )}
          {openHref ? (
            <a href={openHref} className={cx(buttonBase, "ml-auto text-muted-foreground hover:bg-muted hover:text-foreground")}>
              Open run <ArrowUpRight aria-hidden />
            </a>
          ) : (
            onOpen && (
              <button
                type="button"
                onClick={onOpen}
                className={cx(buttonBase, "ml-auto text-muted-foreground hover:bg-muted hover:text-foreground")}
              >
                Open run <ArrowUpRight aria-hidden />
              </button>
            )
          )}
        </div>
      )}
    </section>
  )
}
