"use client"

import * as React from "react"

export interface UsageLimit {
  /** Amount used in the current window, in any unit (tokens, requests, dollars). */
  used: number
  max: number
  /** Epoch ms when the window resets. Drives a live countdown. */
  resetsAt?: number
  /** e.g. "5-hour limit". */
  label?: string
}

export interface UsageMeterProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Input tokens billed at the full rate (not served from cache). */
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  costUsd?: number
  limit?: UsageLimit
  variant?: "compact" | "expanded"
  title?: string
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ")
}

export function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2)}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}k`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(Math.round(n))
}

export function formatCost(usd: number) {
  if (usd > 0 && usd < 0.01) return "<$0.01"
  return `$${usd.toFixed(2)}`
}

export function formatCountdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`
  if (m > 0) return `${m}m ${String(s % 60).padStart(2, "0")}s`
  return `${s}s`
}

function useNow(active: boolean) {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])
  return now
}

function limitTone(pct: number) {
  if (pct >= 90) return { bar: "bg-red-500", text: "text-red-600 dark:text-red-400", stroke: "stroke-red-500" }
  if (pct >= 70) return { bar: "bg-amber-500", text: "text-amber-600 dark:text-amber-400", stroke: "stroke-amber-500" }
  return { bar: "bg-foreground/80", text: "text-foreground", stroke: "stroke-foreground/80" }
}

function Ring({ pct, className }: { pct: number; className?: string }) {
  const r = 6
  const c = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={cx("size-4 -rotate-90", className)}>
      <circle cx="8" cy="8" r={r} fill="none" strokeWidth="2.5" className="stroke-muted" />
      <circle
        cx="8"
        cy="8"
        r={r}
        fill="none"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.min(pct, 100) / 100)}
        className={cx(limitTone(pct).stroke, "transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none")}
      />
    </svg>
  )
}

const parts = [
  { key: "inputTokens", label: "Input", swatch: "bg-foreground/70" },
  { key: "cacheReadTokens", label: "Cache read", swatch: "bg-sky-500" },
  { key: "cacheWriteTokens", label: "Cache write", swatch: "bg-sky-500/40" },
  { key: "outputTokens", label: "Output", swatch: "bg-emerald-500" },
] as const

export function UsageMeter({
  inputTokens,
  outputTokens,
  cacheReadTokens = 0,
  cacheWriteTokens = 0,
  costUsd,
  limit,
  variant = "expanded",
  title = "Usage",
  className,
  ...props
}: UsageMeterProps) {
  const now = useNow(limit?.resetsAt !== undefined)
  const values = { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens }
  const total = inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens
  const promptTotal = inputTokens + cacheReadTokens + cacheWriteTokens
  const hitRate = promptTotal > 0 ? Math.round((cacheReadTokens / promptTotal) * 100) : 0
  const pct = limit && limit.max > 0 ? Math.min(100, (limit.used / limit.max) * 100) : undefined
  const resetIn = limit?.resetsAt !== undefined ? limit.resetsAt - now : undefined
  const tone = pct !== undefined ? limitTone(pct) : undefined

  if (variant === "compact") {
    return (
      <div
        role="group"
        aria-label={title}
        className={cx(
          "inline-flex h-7 items-center gap-2 rounded-full border border-border bg-card px-2.5 text-xs text-card-foreground",
          className,
        )}
        {...props}
      >
        {pct !== undefined && (
          <span
            role="meter"
            aria-label={limit?.label ?? "Limit used"}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pct)}
            className="inline-flex items-center gap-1.5"
          >
            <Ring pct={pct} />
            <span className={cx("font-mono font-medium tabular-nums", tone?.text)}>{Math.round(pct)}%</span>
          </span>
        )}
        {pct !== undefined && <span aria-hidden className="h-3 w-px bg-border" />}
        <span className="font-mono tabular-nums">
          {formatTokens(total)} <span className="text-muted-foreground">tok</span>
        </span>
        {costUsd !== undefined && (
          <>
            <span aria-hidden className="h-3 w-px bg-border" />
            <span className="font-mono tabular-nums">{formatCost(costUsd)}</span>
          </>
        )}
        {resetIn !== undefined && (
          <>
            <span aria-hidden className="h-3 w-px bg-border" />
            <span className="text-muted-foreground">
              resets in <span className="font-mono tabular-nums">{formatCountdown(resetIn)}</span>
            </span>
          </>
        )}
      </div>
    )
  }

  return (
    <section
      aria-label={title}
      className={cx("rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm", className)}
      {...props}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium">{title}</h3>
        {costUsd !== undefined && (
          <span className="font-mono text-lg leading-none font-semibold tabular-nums" aria-label={`Cost ${formatCost(costUsd)}`}>
            {formatCost(costUsd)}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        <span className="font-mono tabular-nums text-foreground">{formatTokens(total)}</span> tokens
        {promptTotal > 0 && (
          <>
            {" "}
            · <span className="font-mono tabular-nums text-foreground">{hitRate}%</span> of input from cache
          </>
        )}
      </p>

      <div aria-hidden className="mt-3 flex h-2 gap-0.5 overflow-hidden rounded-full bg-muted">
        {total > 0 &&
          parts.map((p) =>
            values[p.key] > 0 ? (
              <span
                key={p.key}
                className={cx("h-full transition-[flex-grow] duration-700 ease-out motion-reduce:transition-none", p.swatch)}
                style={{ flexGrow: values[p.key], flexBasis: 0 }}
              />
            ) : null,
          )}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        {parts.map((p) => (
          <div key={p.key} className="flex items-center gap-2">
            <span aria-hidden className={cx("size-2 shrink-0 rounded-sm", p.swatch)} />
            <dt className="text-muted-foreground">{p.label}</dt>
            <dd className="ml-auto font-mono tabular-nums">{formatTokens(values[p.key])}</dd>
          </div>
        ))}
      </dl>

      {limit && pct !== undefined && (
        <div className="mt-4 border-t border-border pt-3">
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-muted-foreground">{limit.label ?? "Limit"}</span>
            <span className={cx("font-mono font-medium tabular-nums", tone?.text)}>{Math.round(pct)}% used</span>
          </div>
          <div
            role="meter"
            aria-label={limit.label ?? "Limit used"}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pct)}
            className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div
              className={cx("h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none", tone?.bar)}
              style={{ width: `${pct}%` }}
            />
          </div>
          {resetIn !== undefined && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              Resets in <span className="font-mono tabular-nums text-foreground">{formatCountdown(resetIn)}</span>
            </p>
          )}
        </div>
      )}
    </section>
  )
}
