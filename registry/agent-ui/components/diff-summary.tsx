"use client"

import * as React from "react"
import { ChevronRight } from "lucide-react"

export type FileChangeStatus = "added" | "modified" | "deleted" | "renamed"

export interface FileChange {
  path: string
  additions: number
  deletions: number
  status?: FileChangeStatus
  /** Unified diff for this file. Rows without one are not expandable. */
  diff?: string
}

export interface DiffSummaryProps extends React.HTMLAttributes<HTMLElement> {
  files: FileChange[]
  title?: string
  /** Paths expanded on first render. */
  defaultExpanded?: string[]
  /** Lines shown before the diff box scrolls. Default 14. */
  maxDiffLines?: number
}

const statusBadge: Record<FileChangeStatus, { letter: string; label: string; cls: string }> = {
  added: { letter: "A", label: "Added", cls: "text-emerald-700 bg-emerald-500/10 dark:text-emerald-300" },
  modified: { letter: "M", label: "Modified", cls: "text-amber-700 bg-amber-500/10 dark:text-amber-300" },
  deleted: { letter: "D", label: "Deleted", cls: "text-red-700 bg-red-500/10 dark:text-red-300" },
  renamed: { letter: "R", label: "Renamed", cls: "text-sky-700 bg-sky-500/10 dark:text-sky-300" },
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ")
}

/** Five blocks split between green and red, the way GitHub shows a diffstat. */
function Blocks({ additions, deletions, className }: { additions: number; deletions: number; className?: string }) {
  const total = additions + deletions
  const green = total === 0 ? 0 : Math.round((additions / total) * 5)
  const red = total === 0 ? 0 : Math.min(5 - green, Math.max(deletions > 0 ? 1 : 0, Math.round((deletions / total) * 5)))
  return (
    <span aria-hidden className={cx("inline-flex gap-px", className)}>
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={cx(
            "size-2 rounded-[2px]",
            i < green ? "bg-emerald-500" : i < green + red ? "bg-red-500" : "bg-muted-foreground/25",
          )}
        />
      ))}
    </span>
  )
}

type Line = { kind: "add" | "del" | "ctx" | "hunk"; text: string; oldNo?: number; newNo?: number }

export function parseUnifiedDiff(diff: string): Line[] {
  const out: Line[] = []
  let oldNo = 0
  let newNo = 0
  for (const raw of diff.replace(/\n$/, "").split("\n")) {
    if (raw.startsWith("diff ") || raw.startsWith("index ") || raw.startsWith("--- ") || raw.startsWith("+++ ")) continue
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(raw)
    if (hunk) {
      oldNo = Number(hunk[1])
      newNo = Number(hunk[2])
      out.push({ kind: "hunk", text: raw })
    } else if (raw.startsWith("+")) out.push({ kind: "add", text: raw.slice(1), newNo: newNo++ })
    else if (raw.startsWith("-")) out.push({ kind: "del", text: raw.slice(1), oldNo: oldNo++ })
    else if (!raw.startsWith("\\")) out.push({ kind: "ctx", text: raw.slice(1), oldNo: oldNo++, newNo: newNo++ })
  }
  return out
}

function MiniDiff({ diff, maxLines }: { diff: string; maxLines: number }) {
  const lines = React.useMemo(() => parseUnifiedDiff(diff), [diff])
  return (
    <div
      tabIndex={0}
      role="region"
      aria-label="Diff"
      style={{ maxHeight: `${maxLines * 1.25 + 0.5}rem` }}
      className="overflow-auto border-t border-border bg-muted/30 py-1 font-mono text-xs leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      <div className="w-max min-w-full">
        {lines.map((l, i) =>
          l.kind === "hunk" ? (
            <div key={i} className="px-3 py-0.5 text-[11px] whitespace-pre text-sky-700 opacity-80 dark:text-sky-300">
              {l.text}
            </div>
          ) : (
            <div
              key={i}
              className={cx("flex", l.kind === "add" && "bg-emerald-500/10", l.kind === "del" && "bg-red-500/10")}
            >
              <span className="w-10 shrink-0 pr-1.5 text-right text-muted-foreground/60 tabular-nums select-none">{l.oldNo ?? ""}</span>
              <span className="w-9 shrink-0 pr-2 text-right text-muted-foreground/60 tabular-nums select-none">{l.newNo ?? ""}</span>
              <span
                className={cx(
                  "pr-4 whitespace-pre",
                  l.kind === "add" && "text-emerald-800 dark:text-emerald-200",
                  l.kind === "del" && "text-red-800 dark:text-red-200",
                  l.kind === "ctx" && "text-muted-foreground",
                )}
              >
                <span className="mr-2 select-none opacity-60">{l.kind === "add" ? "+" : l.kind === "del" ? "-" : " "}</span>
                {l.text}
              </span>
            </div>
          ),
        )}
      </div>
    </div>
  )
}

export function DiffSummary({
  files,
  title = "Changes",
  defaultExpanded = [],
  maxDiffLines = 14,
  className,
  ...props
}: DiffSummaryProps) {
  const [open, setOpen] = React.useState<Set<string>>(() => new Set(defaultExpanded))
  const baseId = React.useId()
  const additions = files.reduce((n, f) => n + f.additions, 0)
  const deletions = files.reduce((n, f) => n + f.deletions, 0)

  return (
    <section
      aria-label={title}
      className={cx("flex flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm", className)}
      {...props}
    >
      <header className="flex shrink-0 items-center gap-3 px-4 py-3">
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="text-xs text-muted-foreground">
          {files.length} {files.length === 1 ? "file" : "files"}
        </span>
        <span className="ml-auto flex items-center gap-2 font-mono text-xs tabular-nums">
          <span className="text-emerald-600 dark:text-emerald-400">+{additions}</span>
          <span className="text-red-600 dark:text-red-400">−{deletions}</span>
          <Blocks additions={additions} deletions={deletions} />
        </span>
      </header>
      <ul className="min-h-0 flex-1 overflow-auto border-t border-border">
        {files.map((f, i) => {
          const status = statusBadge[f.status ?? "modified"]
          const slash = f.path.lastIndexOf("/")
          const dir = slash >= 0 ? f.path.slice(0, slash + 1) : ""
          const name = slash >= 0 ? f.path.slice(slash + 1) : f.path
          const expanded = open.has(f.path)
          const panelId = `${baseId}-${i}`
          const row = (
            <>
              <span className="flex size-3.5 shrink-0 items-center justify-center text-muted-foreground">
                {f.diff && (
                  <ChevronRight
                    aria-hidden
                    className={cx("size-3.5 transition-transform duration-200 motion-reduce:transition-none", expanded && "rotate-90")}
                  />
                )}
              </span>
              <span
                title={status.label}
                className={cx("flex size-4 shrink-0 items-center justify-center rounded font-mono text-[10px] font-semibold", status.cls)}
              >
                <span aria-hidden>{status.letter}</span>
                <span className="sr-only">{status.label}</span>
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-[13px]" title={f.path}>
                <span className="text-muted-foreground">{dir}</span>
                <span className="text-foreground">{name}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2 font-mono text-xs tabular-nums">
                {f.additions > 0 && <span className="text-emerald-600 dark:text-emerald-400">+{f.additions}</span>}
                {f.deletions > 0 && <span className="text-red-600 dark:text-red-400">−{f.deletions}</span>}
                <Blocks additions={f.additions} deletions={f.deletions} className="hidden sm:inline-flex" />
              </span>
            </>
          )
          return (
            <li key={f.path} className="border-b border-border last:border-b-0 motion-safe:animate-[agent-ui-in_260ms_ease-out_both]">
              {f.diff ? (
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  onClick={() =>
                    setOpen((prev) => {
                      const next = new Set(prev)
                      if (next.has(f.path)) next.delete(f.path)
                      else next.add(f.path)
                      return next
                    })
                  }
                  className="flex w-full items-center gap-2.5 px-4 py-2 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                >
                  {row}
                </button>
              ) : (
                <div className="flex items-center gap-2.5 px-4 py-2">{row}</div>
              )}
              {f.diff && (
                <div id={panelId} hidden={!expanded}>
                  {expanded && <MiniDiff diff={f.diff} maxLines={maxDiffLines} />}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
