"use client"

import * as React from "react"
import { Check, ChevronRight, CircleDashed, X } from "lucide-react"

export type SubagentStatus = "queued" | "running" | "waiting" | "done" | "failed"

export interface Subagent {
  id: string
  name: string
  /** What it was asked to do. */
  task?: string
  status: SubagentStatus
  /** What it is doing right now. Shown while running. */
  activity?: string
  /** One line result. Shown once done. */
  summary?: string
  toolCount?: number
  tokens?: number
  /** Epoch ms. Drives a live timer while running. */
  startedAt?: number
  durationMs?: number
  children?: Subagent[]
}

export interface SubagentTreeProps extends React.HTMLAttributes<HTMLDivElement> {
  nodes: Subagent[]
  /** Ids that start collapsed. Everything else starts open. */
  defaultCollapsed?: string[]
  /** Count of running / done / failed above the tree. Default true. */
  showSummary?: boolean
  label?: string
}

const tone: Record<SubagentStatus, string> = {
  queued: "text-muted-foreground",
  running: "text-sky-600 dark:text-sky-400",
  waiting: "text-amber-600 dark:text-amber-400",
  done: "text-emerald-600 dark:text-emerald-400",
  failed: "text-red-600 dark:text-red-400",
}

const statusWord: Record<SubagentStatus, string> = {
  queued: "queued",
  running: "running",
  waiting: "waiting",
  done: "done",
  failed: "failed",
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ")
}

function formatDuration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`
}

function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`
  return String(n)
}

function useNow(active: boolean) {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (!active) return
    const tick = () => setNow(Date.now())
    const first = setTimeout(tick, 0)
    const id = setInterval(tick, 1000)
    return () => {
      clearTimeout(first)
      clearInterval(id)
    }
  }, [active])
  return now
}

function StatusGlyph({ status }: { status: SubagentStatus }) {
  const cls = cx("size-3.5", tone[status])
  if (status === "running")
    return (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden className={cx(cls, "motion-safe:animate-spin")}>
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
        <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    )
  if (status === "done") return <Check aria-hidden className={cls} />
  if (status === "failed") return <X aria-hidden className={cls} />
  if (status === "waiting") return <span aria-hidden className={cx("size-2 rounded-full bg-current motion-safe:animate-pulse", tone.waiting)} />
  return <CircleDashed aria-hidden className={cls} />
}

type Flat = { node: Subagent; depth: number; parent?: string }

function walk(nodes: Subagent[], out: Subagent[] = []) {
  for (const n of nodes) {
    out.push(n)
    if (n.children) walk(n.children, out)
  }
  return out
}

export function SubagentTree({
  nodes,
  defaultCollapsed = [],
  showSummary = true,
  label = "Subagents",
  className,
  ...props
}: SubagentTreeProps) {
  const [collapsed, setCollapsed] = React.useState<Set<string>>(() => new Set(defaultCollapsed))
  const [focusId, setFocusId] = React.useState<string | null>(null)
  const refs = React.useRef(new Map<string, HTMLLIElement>())

  const all = React.useMemo(() => walk(nodes), [nodes])
  const now = useNow(all.some((n) => n.status === "running" && n.startedAt !== undefined))

  const visible = React.useMemo(() => {
    const out: Flat[] = []
    const visit = (list: Subagent[], depth: number, parent?: string) => {
      for (const node of list) {
        out.push({ node, depth, parent })
        if (node.children?.length && !collapsed.has(node.id)) visit(node.children, depth + 1, node.id)
      }
    }
    visit(nodes, 0)
    return out
  }, [nodes, collapsed])

  const activeId = focusId && visible.some((v) => v.node.id === focusId) ? focusId : visible[0]?.node.id

  const counts = all.reduce(
    (acc, n) => {
      acc[n.status] = (acc[n.status] ?? 0) + 1
      return acc
    },
    {} as Partial<Record<SubagentStatus, number>>,
  )

  const move = (id: string | undefined) => {
    if (!id) return
    setFocusId(id)
    refs.current.get(id)?.focus()
  }

  const toggle = (id: string, open?: boolean) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      const isOpen = !prev.has(id)
      if (open ?? !isOpen) next.delete(id)
      else next.add(id)
      return next
    })

  const onKeyDown = (e: React.KeyboardEvent, flat: Flat) => {
    const i = visible.findIndex((v) => v.node.id === flat.node.id)
    const hasKids = Boolean(flat.node.children?.length)
    const isOpen = hasKids && !collapsed.has(flat.node.id)
    switch (e.key) {
      case "ArrowDown":
        move(visible[i + 1]?.node.id)
        break
      case "ArrowUp":
        move(visible[i - 1]?.node.id)
        break
      case "Home":
        move(visible[0]?.node.id)
        break
      case "End":
        move(visible[visible.length - 1]?.node.id)
        break
      case "ArrowRight":
        if (hasKids && !isOpen) toggle(flat.node.id, true)
        else if (isOpen) move(flat.node.children![0].id)
        break
      case "ArrowLeft":
        if (isOpen) toggle(flat.node.id, false)
        else move(flat.parent)
        break
      case "Enter":
      case " ":
        if (hasKids) toggle(flat.node.id)
        break
      default:
        return
    }
    e.preventDefault()
  }

  const renderNodes = (list: Subagent[], depth: number, parent?: string): React.ReactNode =>
    list.map((node) => {
      const hasKids = Boolean(node.children?.length)
      const isOpen = hasKids && !collapsed.has(node.id)
      const duration = node.durationMs ?? (node.status === "running" && node.startedAt !== undefined ? now - node.startedAt : undefined)
      const line = node.status === "running" || node.status === "waiting" ? node.activity : node.summary
      const flat: Flat = { node, depth, parent }
      return (
        <li
          key={node.id}
          role="treeitem"
          aria-expanded={hasKids ? isOpen : undefined}
          aria-level={depth + 1}
          aria-label={`${node.name}, ${statusWord[node.status]}${line ? `, ${line}` : ""}`}
          tabIndex={activeId === node.id ? 0 : -1}
          ref={(el) => {
            if (el) refs.current.set(node.id, el)
            else refs.current.delete(node.id)
          }}
          onKeyDown={(e) => {
            if (e.target === e.currentTarget) onKeyDown(e, flat)
          }}
          onFocus={(e) => {
            if (e.target === e.currentTarget) setFocusId(node.id)
          }}
          className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:animate-[agent-ui-in_260ms_ease-out_both]"
        >
          <div
            className="group flex items-center gap-2 rounded-md py-1.5 pr-2 hover:bg-muted/50"
            style={{ paddingLeft: `${depth * 20 + 4}px` }}
            onClick={() => {
              setFocusId(node.id)
              if (hasKids) toggle(node.id)
            }}
          >
            <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
              {hasKids && (
                <ChevronRight
                  aria-hidden
                  className={cx("size-3.5 transition-transform duration-200 motion-reduce:transition-none", isOpen && "rotate-90")}
                />
              )}
            </span>
            <span className="flex size-4 shrink-0 items-center justify-center">
              <StatusGlyph status={node.status} />
            </span>
            <span className="flex min-w-0 flex-1 items-baseline gap-2">
              <span className="shrink-0 font-mono text-[13px] font-medium text-foreground">{node.name}</span>
              {line && (
                <span
                  className={cx(
                    "min-w-0 truncate text-xs",
                    node.status === "failed" ? "text-red-700 dark:text-red-300" : "text-muted-foreground",
                  )}
                >
                  {line}
                </span>
              )}
              {!line && node.task && <span className="min-w-0 truncate text-xs text-muted-foreground/80">{node.task}</span>}
            </span>
            <span className="flex shrink-0 items-center gap-2 font-mono text-[11px] tabular-nums text-muted-foreground">
              {node.toolCount !== undefined && node.toolCount > 0 && (
                <span>
                  {node.toolCount} {node.toolCount === 1 ? "tool" : "tools"}
                </span>
              )}
              {node.tokens !== undefined && <span className="hidden sm:inline">{formatTokens(node.tokens)} tok</span>}
              {duration !== undefined && (
                <span className={node.status === "running" ? tone.running : undefined}>{formatDuration(duration)}</span>
              )}
            </span>
          </div>
          {hasKids && isOpen && (
            <ul
              role="group"
              className="relative before:absolute before:top-0 before:bottom-2 before:left-[var(--guide)] before:w-px before:bg-border"
              style={{ "--guide": `${depth * 20 + 11}px` } as React.CSSProperties}
            >
              {renderNodes(node.children!, depth + 1, node.id)}
            </ul>
          )}
        </li>
      )
    })

  return (
    <div className={cx("flex flex-col gap-2", className)} {...props}>
      {showSummary && all.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-muted-foreground" aria-live="polite">
          <span className="font-medium text-foreground">
            {all.length} {all.length === 1 ? "subagent" : "subagents"}
          </span>
          {(["running", "waiting", "done", "failed", "queued"] as const).map((s) =>
            counts[s] ? (
              <span key={s} className="inline-flex items-center gap-1.5">
                <span aria-hidden className={cx("size-1.5 rounded-full bg-current", tone[s])} />
                {counts[s]} {statusWord[s]}
              </span>
            ) : null,
          )}
        </div>
      )}
      <ul role="tree" aria-label={label} className="flex flex-col">
        {renderNodes(nodes, 0)}
      </ul>
    </div>
  )
}
