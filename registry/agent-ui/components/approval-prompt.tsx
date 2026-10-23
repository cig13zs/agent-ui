"use client"

import * as React from "react"
import { Check, Copy, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react"

export type ApprovalRisk = "low" | "medium" | "high"
export type ApprovalChoice = "allow-once" | "allow-always" | "deny"

export interface ApprovalPromptProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  /** Defaults to "Agent wants to run a command" or "Agent wants to edit a file". */
  title?: string
  /** Shell command to preview. */
  command?: string
  /** Unified diff to preview, for edits. */
  diff?: string
  /** File the diff applies to. */
  path?: string
  /** Working directory shown before the command. */
  cwd?: string
  risk?: ApprovalRisk
  /** One line on why the agent wants this. */
  reason?: string
  /** Once set, the prompt collapses into a resolved line. */
  decision?: ApprovalChoice
  onDecision?: (decision: ApprovalChoice) => void
  /** Offer "Always allow". Off by default for high risk. */
  allowAlways?: boolean
  /** Y / A / N while focus is inside the prompt. Default true. */
  shortcuts?: boolean
  /** Move focus to the safest button when the prompt mounts. */
  autoFocus?: boolean
}

const riskStyle: Record<ApprovalRisk, { label: string; frame: string; badge: string; icon: string }> = {
  low: {
    label: "Low risk",
    frame: "border-border",
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    icon: "text-emerald-600 dark:text-emerald-400",
  },
  medium: {
    label: "Medium risk",
    frame: "border-amber-500/40",
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    icon: "text-amber-600 dark:text-amber-400",
  },
  high: {
    label: "High risk",
    frame: "border-red-500/50",
    badge: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
    icon: "text-red-600 dark:text-red-400",
  },
}

const decisionText: Record<ApprovalChoice, string> = {
  "allow-once": "Allowed once",
  "allow-always": "Always allowed",
  deny: "Denied",
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ")
}

function DiffPreview({ diff }: { diff: string }) {
  const lines = diff.replace(/\n$/, "").split("\n")
  return (
    <pre className="max-h-56 overflow-auto py-1.5 font-mono text-xs leading-5" tabIndex={0}>
      {lines.map((line, i) => {
        const tone = line.startsWith("+++") || line.startsWith("---")
          ? "text-muted-foreground"
          : line.startsWith("+")
            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            : line.startsWith("-")
              ? "bg-red-500/10 text-red-700 dark:text-red-300"
              : line.startsWith("@@")
                ? "text-sky-700 dark:text-sky-300"
                : "text-muted-foreground"
        return (
          <span key={i} className={cx("block px-3", tone)}>
            {line || " "}
          </span>
        )
      })}
    </pre>
  )
}

const btn =
  "inline-flex h-8 items-center gap-2 rounded-md px-3 text-[13px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:opacity-50"

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="hidden rounded border border-current/25 px-1 font-mono text-[10px] leading-4 opacity-70 sm:inline">
      {children}
    </kbd>
  )
}

export function ApprovalPrompt({
  title,
  command,
  diff,
  path,
  cwd,
  risk = "medium",
  reason,
  decision,
  onDecision,
  allowAlways,
  shortcuts = true,
  autoFocus = false,
  className,
  onKeyDown,
  ...props
}: ApprovalPromptProps) {
  const style = riskStyle[risk]
  const showAlways = allowAlways ?? risk !== "high"
  const heading = title ?? (diff && !command ? "Agent wants to edit a file" : "Agent wants to run a command")
  const headingId = React.useId()
  const safeRef = React.useRef<HTMLButtonElement>(null)
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    if (autoFocus && !decision) safeRef.current?.focus()
  }, [autoFocus, decision])

  React.useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => setCopied(false), 1400)
    return () => clearTimeout(id)
  }, [copied])

  const decide = (d: ApprovalChoice) => onDecision?.(d)

  const handleKey = (e: React.KeyboardEvent<HTMLElement>) => {
    onKeyDown?.(e)
    if (!shortcuts || decision || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
    const target = e.target as HTMLElement
    if (target.closest("input, textarea, [contenteditable=true]")) return
    const key = e.key.toLowerCase()
    if (key === "y") decide("allow-once")
    else if (key === "a" && showAlways) decide("allow-always")
    else if (key === "n" || key === "escape") decide("deny")
    else return
    e.preventDefault()
  }

  if (decision) {
    const denied = decision === "deny"
    const Icon = denied ? ShieldX : ShieldCheck
    return (
      <section
        aria-labelledby={headingId}
        data-decision={decision}
        className={cx(
          "flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2 text-[13px] text-card-foreground",
          className,
        )}
        {...props}
      >
        <Icon aria-hidden className={cx("size-4 shrink-0", denied ? "text-red-500" : "text-emerald-600 dark:text-emerald-400")} />
        <span id={headingId} className="font-medium">
          {decisionText[decision]}
        </span>
        {(command || path) && <code className="min-w-0 truncate font-mono text-xs text-muted-foreground">{command ?? path}</code>}
      </section>
    )
  }

  return (
    <section
      role="alertdialog"
      aria-modal="false"
      aria-labelledby={headingId}
      data-risk={risk}
      onKeyDown={handleKey}
      className={cx(
        "overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm",
        "motion-safe:animate-[agent-ui-in_280ms_cubic-bezier(.2,.8,.2,1)_both]",
        style.frame,
        className,
      )}
      {...props}
    >
      <div className="flex items-start gap-2.5 px-3.5 pt-3">
        <ShieldAlert aria-hidden className={cx("mt-0.5 size-4 shrink-0", style.icon)} />
        <div className="min-w-0 flex-1">
          <h3 id={headingId} className="text-sm leading-5 font-medium">
            {heading}
          </h3>
          {reason && <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{reason}</p>}
        </div>
        <span className={cx("shrink-0 rounded-full border px-2 py-px text-[11px] font-medium", style.badge)}>{style.label}</span>
      </div>

      {command && (
        <div className="mx-3.5 mt-2.5 flex items-start gap-2 rounded-md border border-border bg-muted/50 py-2 pr-1.5 pl-3">
          <code className="min-w-0 flex-1 font-mono text-[13px] leading-5 break-words">
            {cwd && <span className="text-muted-foreground select-none">{cwd} </span>}
            <span className="text-muted-foreground select-none">$ </span>
            {command}
          </code>
          <button
            type="button"
            aria-label={copied ? "Copied" : "Copy command"}
            onClick={() => {
              void navigator.clipboard?.writeText(command).then(() => setCopied(true), () => {})
            }}
            className="shrink-0 rounded p-1 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {copied ? <Check aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />}
          </button>
        </div>
      )}

      {diff && (
        <div className="mx-3.5 mt-2.5 overflow-hidden rounded-md border border-border bg-muted/30">
          {path && (
            <div className="border-b border-border px-3 py-1.5 font-mono text-xs text-muted-foreground">{path}</div>
          )}
          <DiffPreview diff={diff} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 px-3.5 py-3">
        <button
          type="button"
          ref={risk === "high" ? undefined : safeRef}
          onClick={() => decide("allow-once")}
          className={cx(btn, "bg-primary text-primary-foreground hover:bg-primary/90")}
        >
          Allow once <Kbd>Y</Kbd>
        </button>
        {showAlways && (
          <button type="button" onClick={() => decide("allow-always")} className={cx(btn, "border border-border hover:bg-muted")}>
            Always allow <Kbd>A</Kbd>
          </button>
        )}
        <button
          type="button"
          ref={risk === "high" ? safeRef : undefined}
          onClick={() => decide("deny")}
          className={cx(
            btn,
            "ml-auto border",
            risk === "high"
              ? "border-red-500/40 text-red-700 hover:bg-red-500/10 dark:text-red-300"
              : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          Deny <Kbd>N</Kbd>
        </button>
      </div>
    </section>
  )
}
