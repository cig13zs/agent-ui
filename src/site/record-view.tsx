import * as React from "react"
import { ApprovalPrompt, type ApprovalChoice } from "@/registry/agent-ui/components/approval-prompt"
import { DiffSummary } from "@/registry/agent-ui/components/diff-summary"
import { SubagentTree } from "@/registry/agent-ui/components/subagent-tree"
import { ToolTimeline } from "@/registry/agent-ui/components/tool-timeline"
import { UsageMeter } from "@/registry/agent-ui/components/usage-meter"
import { CardWithApproval, Panel, RunConsole, useDemoRun, useStickToBottom } from "./run-console"

/*
 * Bare views for scripts/record-media.mjs. Each one renders a single piece
 * inside #stage, driven by the same scripted run as the landing page.
 * Open /agent-ui/?record=<view> to look at one by hand.
 */

const AUTO_APPROVE_MS = 2200
const SPEED = Number(new URLSearchParams(window.location.search).get("speed") ?? 1) || 1

function Stage({ width, children, pad = 28, status }: { width: number; children: React.ReactNode; pad?: number; status?: string }) {
  return (
    <div id="stage" data-run={status} className="dot-grid bg-stage" style={{ width, padding: pad }}>
      {children}
    </div>
  )
}

type ReelItem = {
  props: React.ComponentProps<typeof ApprovalPrompt>
  choice: ApprovalChoice
  button: RegExp
}

const reel: ReelItem[] = [
  {
    props: { command: "rm -rf dist", cwd: "~/acme/billing", risk: "high", reason: "Stale build output shadows the new round.ts." },
    choice: "deny",
    button: /^Deny/,
  },
  {
    props: { command: "npm install decimal.js@10", cwd: "~/acme/billing", risk: "medium", reason: "Adds a dependency to package.json." },
    choice: "allow-always",
    button: /^Always allow/,
  },
  {
    props: {
      risk: "low",
      path: "src/billing/invoice.ts",
      reason: "Swaps toFixed for roundHalfUp.",
      diff: "@@ -40,3 +40,3 @@\n   const subtotal = sum(lines)\n-  return Number((subtotal + tax).toFixed(2))\n+  return roundHalfUp(subtotal + tax, 2)\n",
    },
    choice: "allow-once",
    button: /^Allow once/,
  },
]

/** Three prompts answered by a pointer, one per risk level. */
function ApprovalReel() {
  const stageRef = React.useRef<HTMLDivElement>(null)
  const [index, setIndex] = React.useState(0)
  const [decision, setDecision] = React.useState<ApprovalChoice>()
  const [cursor, setCursor] = React.useState({ x: 440, y: 250, down: false })
  const item = reel[index % reel.length]

  React.useEffect(() => {
    const timers: Array<ReturnType<typeof setTimeout>> = []
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms))
    at(700, () => {
      const stage = stageRef.current
      const target = stage && [...stage.querySelectorAll("button")].find((b) => item.button.test(b.textContent ?? ""))
      if (!stage || !target) return
      const s = stage.getBoundingClientRect()
      const r = target.getBoundingClientRect()
      setCursor({ x: r.left - s.left + r.width / 2, y: r.top - s.top + r.height / 2 + 2, down: false })
    })
    at(1500, () => setCursor((c) => ({ ...c, down: true })))
    at(1650, () => {
      setCursor((c) => ({ ...c, down: false }))
      setDecision(item.choice)
    })
    at(2900, () => {
      setDecision(undefined)
      setIndex((i) => i + 1)
      setCursor((c) => ({ ...c, x: c.x + 30, y: 230 }))
    })
    return () => timers.forEach(clearTimeout)
  }, [index, item])

  return (
    <Stage width={520}>
      <div ref={stageRef} className="relative" style={{ height: 300 }}>
        <ApprovalPrompt key={index} {...item.props} decision={decision} />
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="pointer-events-none absolute top-0 left-0 size-6 drop-shadow-[0_2px_4px_rgba(0,0,0,.5)]"
          style={{
            transform: `translate(${cursor.x - 4}px, ${cursor.y - 3}px) scale(${cursor.down ? 0.82 : 1})`,
            transition: "transform 750ms cubic-bezier(.3,.7,.2,1)",
          }}
        >
          <path d="M5 3l14 8-6 1.5L10 19z" fill="white" stroke="black" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      </div>
    </Stage>
  )
}

function Single({ view }: { view: string }) {
  const { run, player } = useDemoRun({ autoApproveMs: AUTO_APPROVE_MS, loop: false, speed: SPEED })
  const timelineRef = useStickToBottom<HTMLDivElement>(run.timeline.length + (run.timeline.at(-1)?.output?.length ?? 0))
  const lastDiff = [...run.files].reverse().find((f) => f.diff)

  switch (view) {
    case "agent-run-card":
      return (
        <Stage status={run.state.status} width={520}>
          <div style={{ height: 520 }}>
            <CardWithApproval run={run} player={player} />
          </div>
        </Stage>
      )
    case "tool-timeline":
      return (
        <Stage status={run.state.status} width={600}>
          <Panel title="Tool calls" meta={`${run.timeline.length} calls`} className="h-[440px]" bodyRef={timelineRef}>
            <ToolTimeline items={run.timeline} />
          </Panel>
        </Stage>
      )
    case "approval-prompt":
      return <ApprovalReel />
    case "subagent-tree":
      return (
        <Stage status={run.state.status} width={560}>
          <Panel title="Subagents" className="h-[250px]" bodyClassName="p-2">
            <SubagentTree nodes={run.subagents} />
          </Panel>
        </Stage>
      )
    case "usage-meter":
      return (
        <Stage status={run.state.status} width={440}>
          <div className="flex flex-col items-start gap-3" style={{ height: 312 }}>
            <UsageMeter variant="compact" {...run.usage} />
            <UsageMeter {...run.usage} className="w-full" />
          </div>
        </Stage>
      )
    case "diff-summary":
      return (
        <Stage status={run.state.status} width={600}>
          <div style={{ height: 470 }}>
            <DiffSummary
              key={lastDiff?.path ?? "none"}
              className="max-h-full"
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
  const { run, player } = useDemoRun({ autoApproveMs: AUTO_APPROVE_MS, loop: false, speed: SPEED })
  const timelineRef = useStickToBottom<HTMLDivElement>(run.timeline.length + (run.timeline.at(-1)?.output?.length ?? 0))
  return (
    <div
      id="stage"
      data-run={run.state.status}
      className="dot-grid flex flex-col gap-3 bg-stage"
      style={{ width: 540, height: 960, padding: "28px 20px" }}
    >
      <div className="flex items-end justify-between px-1">
        <div>
          <p className="font-mono text-[11px] text-muted-foreground">open source · React · shadcn</p>
          <p className="mt-1 text-[26px] leading-none font-semibold tracking-[-0.03em]">agent-ui</p>
        </div>
        <UsageMeter variant="compact" {...run.usage} />
      </div>
      <CardWithApproval run={run} player={player} />
      <Panel title="Tool calls" meta={`${run.timeline.length} calls`} className="min-h-0 flex-1" bodyRef={timelineRef}>
        <ToolTimeline items={run.timeline} />
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
        <RunConsole autoApproveMs={AUTO_APPROVE_MS} loop={false} speed={SPEED} />
      </div>
    )
  }
  if (view === "vertical") return <Vertical />
  return <Single view={view} />
}
