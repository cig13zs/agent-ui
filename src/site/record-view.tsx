import * as React from "react"
import { ApprovalPrompt } from "@/registry/agent-ui/components/approval-prompt"
import { DiffSummary } from "@/registry/agent-ui/components/diff-summary"
import { SubagentTree } from "@/registry/agent-ui/components/subagent-tree"
import { ToolTimeline } from "@/registry/agent-ui/components/tool-timeline"
import { UsageMeter } from "@/registry/agent-ui/components/usage-meter"
import { CardWithApproval, Panel, RunConsole, useDemoRun } from "./run-console"

/*
 * Bare views for scripts/record-media.mjs. Each one renders a single piece
 * inside #stage, driven by the same scripted run as the landing page.
 * Open /agent-ui/?record=<view> to look at one by hand.
 */

const AUTO_APPROVE_MS = 2200

function Stage({ width, children, pad = 28 }: { width: number; children: React.ReactNode; pad?: number }) {
  return (
    <div id="stage" className="dot-grid bg-stage" style={{ width, padding: pad }}>
      {children}
    </div>
  )
}

function Single({ view }: { view: string }) {
  const { run, player } = useDemoRun({ autoApproveMs: AUTO_APPROVE_MS, loop: false })
  const last = run.state.approvals.at(-1)
  const lastDiff = [...run.files].reverse().find((f) => f.diff)

  switch (view) {
    case "agent-run-card":
      return (
        <Stage width={520}>
          <div style={{ minHeight: 470 }}>
            <CardWithApproval run={run} player={player} />
          </div>
        </Stage>
      )
    case "tool-timeline":
      return (
        <Stage width={600}>
          <Panel title="Tool calls" meta={`${run.timeline.length} calls`} className="h-[440px]">
            <ToolTimeline items={run.timeline.slice(-8)} />
          </Panel>
        </Stage>
      )
    case "approval-prompt":
      return (
        <Stage width={520}>
          <div style={{ minHeight: 210 }}>
            {last && (
              <ApprovalPrompt
                key={last.id}
                command={last.command}
                cwd={last.cwd}
                risk={last.risk}
                reason={last.reason}
                decision={last.decision}
                onDecision={(d) => player.decide(last.id, d)}
              />
            )}
          </div>
        </Stage>
      )
    case "subagent-tree":
      return (
        <Stage width={560}>
          <Panel title="Subagents" className="h-[250px]" bodyClassName="p-2">
            <SubagentTree nodes={run.subagents} />
          </Panel>
        </Stage>
      )
    case "usage-meter":
      return (
        <Stage width={440}>
          <div className="flex flex-col items-start gap-3">
            <UsageMeter variant="compact" {...run.usage} />
            <UsageMeter {...run.usage} className="w-full" />
          </div>
        </Stage>
      )
    case "diff-summary":
      return (
        <Stage width={600}>
          <div style={{ minHeight: 470 }}>
            <DiffSummary
              key={lastDiff?.path ?? "none"}
              files={run.files}
              defaultExpanded={lastDiff ? [lastDiff.path] : []}
            />
          </div>
        </Stage>
      )
    default:
      return <p>Unknown view {view}</p>
  }
}

function Vertical() {
  const { run, player } = useDemoRun({ autoApproveMs: AUTO_APPROVE_MS, loop: false })
  return (
    <div id="stage" className="dot-grid flex flex-col gap-3 bg-stage" style={{ width: 540, height: 960, padding: "28px 20px" }}>
      <div className="flex items-end justify-between px-1">
        <div>
          <p className="font-mono text-[11px] text-muted-foreground">open source · React · shadcn</p>
          <p className="mt-1 text-[26px] leading-none font-semibold tracking-[-0.03em]">agent-ui</p>
        </div>
        <UsageMeter variant="compact" {...run.usage} />
      </div>
      <CardWithApproval run={run} player={player} />
      <Panel title="Tool calls" meta={`${run.timeline.length} calls`} className="min-h-0 flex-1">
        <ToolTimeline items={run.timeline.slice(-6)} />
      </Panel>
      <div className="grid shrink-0 grid-cols-1 gap-3">
        <Panel title="Subagents" className="h-[176px]" bodyClassName="p-2">
          <SubagentTree nodes={run.subagents} showSummary={false} />
        </Panel>
      </div>
      <p className="text-center font-mono text-[12px] text-muted-foreground">cig13zs.github.io/agent-ui</p>
    </div>
  )
}

export default function RecordView({ view }: { view: string }) {
  React.useEffect(() => {
    document.documentElement.classList.add("dark")
    document.body.style.background = "transparent"
  }, [])
  if (view === "hero") {
    return (
      <div id="stage" className="bg-background" style={{ width: 1200, padding: 24 }}>
        <RunConsole autoApproveMs={AUTO_APPROVE_MS} loop={false} />
      </div>
    )
  }
  if (view === "vertical") return <Vertical />
  return <Single view={view} />
}
