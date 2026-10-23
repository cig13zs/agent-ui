import * as React from "react"
import { RotateCcw } from "lucide-react"
import { AgentRunCard } from "@/registry/agent-ui/components/agent-run-card"
import { ApprovalPrompt } from "@/registry/agent-ui/components/approval-prompt"
import { DiffSummary } from "@/registry/agent-ui/components/diff-summary"
import { SubagentTree } from "@/registry/agent-ui/components/subagent-tree"
import { ToolTimeline } from "@/registry/agent-ui/components/tool-timeline"
import { UsageMeter } from "@/registry/agent-ui/components/usage-meter"
import { useAgentRun, type AgentRun } from "@/registry/agent-ui/hooks/use-agent-run"
import { useScriptPlayer, type ScriptPlayer } from "@/src/demo/player"

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ")
}

export function useDemoRun(options: { autoApproveMs?: number | null; loop?: boolean; speed?: number } = {}) {
  const run = useAgentRun()
  const player = useScriptPlayer(run.dispatch, {
    autoApproveMs: options.autoApproveMs === undefined ? 3200 : options.autoApproveMs,
    loop: options.loop ?? true,
    loopDelayMs: 5000,
    speed: options.speed,
  })
  return { run, player }
}

/** Keeps a scroll container pinned to the bottom while new rows arrive, unless the reader scrolled up. */
function useStickToBottom<T extends HTMLElement>(dep: unknown) {
  const ref = React.useRef<T>(null)
  const pinned = React.useRef(true)
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const onScroll = () => {
      pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
    }
    el.addEventListener("scroll", onScroll, { passive: true })
    return () => el.removeEventListener("scroll", onScroll)
  }, [])
  React.useEffect(() => {
    const el = ref.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
  }, [dep])
  return ref
}

export function Panel({
  title,
  meta,
  children,
  className,
  bodyClassName,
  bodyRef,
}: {
  title: string
  meta?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
  bodyRef?: React.Ref<HTMLDivElement>
}) {
  return (
    <section aria-label={title} className={cx("flex min-h-0 min-w-0 flex-col rounded-xl border bg-card shadow-sm", className)}>
      <header className="flex h-10 shrink-0 items-center justify-between border-b px-4">
        <h3 className="text-[13px] font-medium">{title}</h3>
        {meta && <span className="font-mono text-xs text-muted-foreground tabular-nums">{meta}</span>}
      </header>
      <div ref={bodyRef} className={cx("min-h-0 flex-1 overflow-auto p-3", bodyClassName)}>
        {children}
      </div>
    </section>
  )
}

export function CardWithApproval({ run, player, className }: { run: AgentRun; player: ScriptPlayer; className?: string }) {
  const pending = run.approval
  const last = run.state.approvals.at(-1)
  return (
    <AgentRunCard
      {...run.card}
      className={className}
      onPause={() => player.pause()}
      onResume={() => player.resume()}
      onStop={() => player.stop()}
      onOpen={() => document.getElementById("tool-calls")?.scrollIntoView({ behavior: "smooth", block: "center" })}
    >
      {pending ? (
        <ApprovalPrompt
          key={pending.id}
          command={pending.command}
          cwd={pending.cwd}
          risk={pending.risk}
          reason={pending.reason}
          title={pending.title}
          onDecision={(d) => player.decide(pending.id, d)}
        />
      ) : last?.decision && (run.state.steps.findLast((s) => s.status === "running")?.startedAt ?? Infinity) <= last.requestedAt ? (
        <ApprovalPrompt command={last.command} decision={last.decision} />
      ) : null}
    </AgentRunCard>
  )
}

export function RunConsole({
  className,
  autoApproveMs,
  loop,
}: {
  className?: string
  autoApproveMs?: number | null
  loop?: boolean
}) {
  const { run, player } = useDemoRun({ autoApproveMs, loop })
  const timelineRef = useStickToBottom<HTMLDivElement>(run.timeline.length + (run.timeline.at(-1)?.output?.length ?? 0))
  const finished = player.state === "finished" || player.state === "stopped"
  const additions = run.files.reduce((n, f) => n + f.additions, 0)
  const deletions = run.files.reduce((n, f) => n + f.deletions, 0)

  return (
    <div className={cx("dot-grid rounded-2xl border bg-stage p-2.5 sm:p-4", className)}>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 px-1">
        <span className="inline-flex items-center gap-2 font-mono text-xs text-muted-foreground">
          <span
            aria-hidden
            className={cx(
              "size-2 rounded-full",
              finished ? "bg-muted-foreground/50" : "bg-emerald-500 motion-safe:animate-pulse",
            )}
          />
          run_8f2c
        </span>
        <span className="rounded-full border px-2 py-px text-[11px] text-muted-foreground">simulated run</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden sm:contents">
            <UsageMeter variant="compact" {...run.usage} />
          </span>
          <button
            type="button"
            onClick={() => player.start()}
            className="inline-flex h-7 items-center gap-1.5 rounded-full border bg-card px-2.5 text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RotateCcw aria-hidden className="size-3" /> Replay
          </button>
        </div>
      </div>

      <div className="grid gap-2.5 sm:gap-3 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-2.5 sm:gap-3 lg:col-span-5">
          <CardWithApproval run={run} player={player} />
          <UsageMeter {...run.usage} />
        </div>
        <div className="flex min-w-0 flex-col gap-2.5 sm:gap-3 lg:col-span-7">
          <Panel
            title="Tool calls"
            meta={`${run.timeline.length} calls`}
            className="h-[22rem]"
            bodyRef={timelineRef}
          >
            <div id="tool-calls">
              <ToolTimeline items={run.timeline} expandErrors />
            </div>
          </Panel>
          <div className="grid gap-2.5 sm:gap-3 md:grid-cols-2 [&>*]:min-w-0">
            <Panel title="Subagents" className="h-[15.5rem]" bodyClassName="p-2">
              {run.subagents.length ? (
                <SubagentTree nodes={run.subagents} />
              ) : (
                <p className="px-2 py-1 text-xs text-muted-foreground">None yet.</p>
              )}
            </Panel>
            <div className="h-[15.5rem] min-h-0">
              {run.files.length ? (
                <DiffSummary files={run.files} className="h-full" />
              ) : (
                <Panel title="Changes" meta={`+${additions} −${deletions}`} className="h-full">
                  <p className="px-1 text-xs text-muted-foreground">No edits yet.</p>
                </Panel>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
