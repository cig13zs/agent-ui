"use client"

import * as React from "react"
import { ChevronRight, FileText, Globe, Network, Pencil, Search, SquareTerminal, TriangleAlert, Wrench, type LucideIcon } from "lucide-react"

export type ToolCallKind = "read" | "search" | "edit" | "run" | "web" | "task" | "other"

export interface ToolCall {
  id: string
  kind: ToolCallKind
  /** Short verb phrase: "Read", "Search", "Edit", "Run tests". */
  title: string
  /** What the tool acted on: a path, a query, a command, a URL. */
  target?: string
  status: "running" | "done" | "error"
  /** Epoch ms. Used for a live duration while the call runs. */
  startedAt?: number
  durationMs?: number
  /** Shown when the row is expanded. */
  output?: string
  error?: string
}

export interface ToolTimelineProps extends React.HTMLAttributes<HTMLOListElement> {
  items: ToolCall[]
  /** Ids expanded on first render. */
  defaultExpanded?: string[]
  /** Open rows that end in an error automatically. Default true. */
  expandErrors?: boolean
  /** Lines of output shown before the box scrolls. Default 12. */
  maxOutputLines?: number
}

const icons: Record<ToolCallKind, LucideIcon> = {
  read: FileText,
  search: Search,
  edit: Pencil,
  run: SquareTerminal,
  web: Globe,
  task: Network,
  other: Wrench,
}

const kindLabel: Record<ToolCallKind, string> = {
  read: "Read",
  search: "Search",
  edit: "Edit",
  run: "Command",
  web: "Web",
  task: "Subagent",
  other: "Tool",
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ")
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`
}

function useNow(active: boolean) {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (!active) return
    const tick = () => setNow(Date.now())
    const first = setTimeout(tick, 0)
    const id = setInterval(tick, 100)
    return () => {
      clearTimeout(first)
      clearInterval(id)
    }
  }, [active])
  return now
}

export function ToolTimeline({
  items,
  defaultExpanded = [],
  expandErrors = true,
  maxOutputLines = 12,
  className,
  ...props
}: ToolTimelineProps) {
  const [open, setOpen] = React.useState<Record<string, boolean>>(() =>
    Object.fromEntries(defaultExpanded.map((id) => [id, true])),
  )
  const anyRunning = items.some((t) => t.status === "running" && t.startedAt !== undefined)
  const now = useNow(anyRunning)
  const baseId = React.useId()

  return (
    <ol aria-label="Tool calls" className={cx("relative flex flex-col", className)} {...props}>
      {items.map((item, index) => {
        const Icon = icons[item.kind] ?? Wrench
        const isError = item.status === "error"
        const isRunning = item.status === "running"
        const expanded = open[item.id] ?? (expandErrors && isError)
        const hasDetails = Boolean(item.output || item.error)
        const panelId = `${baseId}-${item.id}`
        const duration =
          item.durationMs ?? (isRunning && item.startedAt !== undefined ? now - item.startedAt : undefined)
        const last = index === items.length - 1

        const row = (
          <>
            <span
              className={cx(
                "relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border bg-card",
                isError
                  ? "border-red-500/40 text-red-600 dark:text-red-400"
                  : isRunning
                    ? "border-sky-500/50 text-sky-600 dark:text-sky-400"
                    : "border-border text-muted-foreground",
              )}
            >
              {isRunning && (
                <span
                  aria-hidden
                  className="absolute -inset-px rounded-full border-2 border-transparent border-t-sky-500 motion-safe:animate-spin dark:border-t-sky-400"
                />
              )}
              <Icon aria-hidden className="size-3.5" />
            </span>
            <span className="flex min-w-0 flex-1 items-baseline gap-2 py-1">
              <span className="sr-only">{kindLabel[item.kind] ?? "Tool"}:</span>
              <span className={cx("shrink-0 text-[13px] font-medium", isError ? "text-red-700 dark:text-red-300" : "text-foreground")}>
                {item.title}
              </span>
              {item.target && (
                <span className="min-w-0 truncate font-mono text-xs text-muted-foreground" title={item.target}>
                  {item.target}
                </span>
              )}
            </span>
            <span className="flex shrink-0 items-center gap-1.5 py-1">
              {isError && <TriangleAlert aria-label="Error" className="size-3.5 text-red-500" />}
              <span className="sr-only">{isRunning ? "Running" : isError ? "Failed" : "Done"}</span>
              {duration !== undefined && (
                <span
                  className={cx("font-mono text-xs tabular-nums", isRunning ? "text-sky-600 dark:text-sky-400" : "text-muted-foreground")}
                >
                  {formatDuration(duration)}
                </span>
              )}
              {hasDetails && (
                <ChevronRight
                  aria-hidden
                  className={cx(
                    "size-3.5 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none",
                    expanded && "rotate-90",
                  )}
                />
              )}
            </span>
          </>
        )

        return (
          <li
            key={item.id}
            className="relative motion-safe:animate-[agent-ui-in_260ms_cubic-bezier(.2,.8,.2,1)_both]"
          >
            {!last && <span aria-hidden className="absolute top-8 bottom-0 left-[13.5px] w-px bg-border" />}
            {hasDetails ? (
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => setOpen((o) => ({ ...o, [item.id]: !expanded }))}
                className="flex w-full items-start gap-3 rounded-md pr-1 pb-2 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
              >
                {row}
              </button>
            ) : (
              <div className="flex items-start gap-3 pr-1 pb-2">{row}</div>
            )}
            {hasDetails && (
              <div
                id={panelId}
                role="region"
                aria-label={`${item.title} details`}
                hidden={!expanded}
                className="pb-3 pl-10"
              >
                {item.error && (
                  <p className="mb-1.5 rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 font-mono text-xs leading-5 text-red-700 dark:text-red-300">
                    {item.error}
                  </p>
                )}
                {item.output && (
                  <pre
                    tabIndex={0}
                    style={{ maxHeight: `${maxOutputLines * 1.25 + 1}rem` }}
                    className="overflow-auto rounded-md border border-border bg-muted/40 px-2.5 py-2 font-mono text-xs leading-5 whitespace-pre-wrap text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {item.output}
                  </pre>
                )}
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}
