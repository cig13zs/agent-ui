import * as React from "react"
import { AgentRunCard, type AgentRunStatus } from "@/registry/agent-ui/components/agent-run-card"
import { ApprovalPrompt, type ApprovalChoice } from "@/registry/agent-ui/components/approval-prompt"
import { DiffSummary } from "@/registry/agent-ui/components/diff-summary"
import { SubagentTree, type Subagent } from "@/registry/agent-ui/components/subagent-tree"
import { ToolTimeline, type ToolCall } from "@/registry/agent-ui/components/tool-timeline"
import { UsageMeter } from "@/registry/agent-ui/components/usage-meter"
import cardSrc from "@/registry/agent-ui/components/agent-run-card.tsx?raw"
import approvalSrc from "@/registry/agent-ui/components/approval-prompt.tsx?raw"
import diffSrc from "@/registry/agent-ui/components/diff-summary.tsx?raw"
import treeSrc from "@/registry/agent-ui/components/subagent-tree.tsx?raw"
import timelineSrc from "@/registry/agent-ui/components/tool-timeline.tsx?raw"
import usageSrc from "@/registry/agent-ui/components/usage-meter.tsx?raw"

export interface Example {
  id: string
  name: string
  blurb: string
  source: string
  usage: string
  variants: Array<{ label: string; render: () => React.ReactNode }>
}

function useMountTime() {
  const [t] = React.useState(() => Date.now())
  return t
}

const doneSteps = [
  { id: "1", label: "Read 12 files", kind: "read" as const, durationMs: 1900 },
  { id: "2", label: "Found 4 call sites", kind: "search" as const, durationMs: 1500 },
  { id: "3", label: "Edited src/billing/invoice.ts", kind: "edit" as const, durationMs: 2500 },
]

function CardExample({ status }: { status: AgentRunStatus }) {
  const t = useMountTime()
  const [state, setState] = React.useState<AgentRunStatus>(status)
  const current =
    state === "waiting-approval" ? "Agent wants to run a command" : state === "done" || state === "failed" ? undefined : "Updating 5 test files"
  const steps =
    state === "done"
      ? [
          ...doneSteps,
          { id: "4", label: "Updated 5 test files", kind: "edit" as const, durationMs: 3100 },
          { id: "5", label: "48 tests pass", kind: "run" as const, durationMs: 6400 },
          { id: "6", label: "Wrote the summary", kind: "other" as const, durationMs: 1200 },
        ]
      : state === "failed"
        ? [...doneSteps, { id: "4", label: "npm test exited with 1", kind: "run" as const, durationMs: 4200, status: "failed" as const }]
        : doneSteps
  return (
    <AgentRunCard
      className="w-full max-w-md"
      status={state}
      currentStep={current}
      title="Fix rounding in invoice totals"
      model="claude-opus-5-5"
      step={state === "done" ? 6 : 4}
      totalSteps={6}
      startedAt={t - 72_000}
      endedAt={state === "running" || state === "waiting-approval" ? undefined : t - 4_000}
      steps={steps}
      error={state === "failed" ? "credit-note.test.ts: expected -0 to be 0" : undefined}
      onPause={() => setState("paused")}
      onResume={() => setState("running")}
      onStop={() => setState("failed")}
      onOpen={() => {}}
    >
      {state === "waiting-approval" && (
        <ApprovalPrompt command="rm -rf dist" risk="high" onDecision={(d) => setState(d === "deny" ? "failed" : "running")} />
      )}
    </AgentRunCard>
  )
}

const timelineItems = (t: number): ToolCall[] => [
  { id: "1", kind: "read", title: "Read", target: "src/billing/invoice.ts", status: "done", durationMs: 420, output: "142 lines" },
  { id: "2", kind: "search", title: "Search", target: "toFixed\\(2\\)", status: "done", durationMs: 700, output: "src/billing/invoice.ts:40\nsrc/billing/invoice.ts:87\nsrc/billing/credit-note.ts:17\nsrc/reports/revenue.ts:131" },
  { id: "3", kind: "web", title: "Fetch", target: "developer.mozilla.org/…/Number/toFixed", status: "done", durationMs: 1300 },
  { id: "4", kind: "edit", title: "Edit", target: "src/billing/invoice.ts", status: "done", durationMs: 660, output: "+3 −3" },
  {
    id: "5",
    kind: "run",
    title: "Run",
    target: "npm test -- billing",
    status: "error",
    durationMs: 1120,
    error: "1 failed: credit-note keeps zero credit notes at 0",
    output: " ❯ tests/billing/credit-note.test.ts (9 tests | 1 failed)\n   × keeps zero credit notes at 0\n     → expected -0 to be 0",
  },
  { id: "6", kind: "run", title: "Run", target: "npm test", status: "running", startedAt: t - 1800 },
]

function TimelineExample({ streaming }: { streaming: boolean }) {
  const t = useMountTime()
  const all = timelineItems(t)
  const [tick, setTick] = React.useState({ count: streaming ? 1 : all.length, at: t })
  React.useEffect(() => {
    if (!streaming) return
    const id = setInterval(() => setTick((s) => ({ count: s.count >= all.length + 3 ? 1 : s.count + 1, at: Date.now() })), 900)
    return () => clearInterval(id)
  }, [streaming, all.length])
  const items = all
    .slice(0, Math.min(tick.count, all.length))
    .map((it, i, list) =>
      i === list.length - 1 && tick.count <= all.length && it.status !== "running"
        ? { ...it, status: "running" as const, durationMs: undefined, startedAt: tick.at }
        : it,
    )
  return <ToolTimeline className="w-full max-w-lg" items={streaming ? items : all} />
}

function ApprovalExample({ risk, diff }: { risk: "low" | "medium" | "high"; diff?: boolean }) {
  const [decision, setDecision] = React.useState<ApprovalChoice>()
  return (
    <div className="flex w-full max-w-md flex-col gap-2">
      {diff ? (
        <ApprovalPrompt
          risk={risk}
          path="src/billing/invoice.ts"
          reason="toFixed rounds 1.005 down; this swaps in roundHalfUp."
          diff={"@@ -40,3 +40,3 @@\n   const subtotal = sum(lines)\n-  return Number((subtotal + tax).toFixed(2))\n+  return roundHalfUp(subtotal + tax, 2)\n"}
          decision={decision}
          onDecision={setDecision}
        />
      ) : (
        <ApprovalPrompt
          risk={risk}
          cwd="~/acme/billing"
          command={risk === "high" ? "rm -rf dist" : risk === "medium" ? "npm install decimal.js@10" : "npm test -- billing"}
          reason={
            risk === "high"
              ? "Stale build output shadows the new round.ts in the test run."
              : risk === "medium"
                ? "Adds a dependency to package.json."
                : "Read-only: runs the billing tests."
          }
          decision={decision}
          onDecision={setDecision}
        />
      )}
      {decision && (
        <button type="button" onClick={() => setDecision(undefined)} className="self-start text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">
          Ask again
        </button>
      )}
    </div>
  )
}

function treeNodes(t: number): Subagent[] {
  return [
    { id: "a", name: "explorer", status: "done", summary: "3 report paths round the total twice", toolCount: 9, tokens: 11_600, durationMs: 14_000 },
    {
      id: "b",
      name: "test-writer",
      status: "running",
      activity: "Editing tests/billing/credit-note.test.ts",
      toolCount: 6,
      tokens: 5_400,
      startedAt: t - 21_000,
      children: [
        { id: "b1", name: "fixture-builder", status: "done", summary: "12 fixtures, 4 hit the bug", toolCount: 3, durationMs: 6_000 },
        { id: "b2", name: "snapshot-check", status: "running", activity: "Running vitest -u", toolCount: 1, startedAt: t - 4_000 },
      ],
    },
    { id: "c", name: "reviewer", status: "waiting", activity: "Waiting for test-writer", toolCount: 2, tokens: 3_900 },
    { id: "d", name: "docs-writer", status: "failed", summary: "CHANGELOG.md is locked by another run", toolCount: 1, durationMs: 2_000 },
    { id: "e", name: "release-notes", status: "queued", task: "Draft the release note" },
  ]
}

function TreeExample({ collapsed }: { collapsed?: boolean }) {
  const t = useMountTime()
  return <SubagentTree className="w-full max-w-lg" nodes={treeNodes(t)} defaultCollapsed={collapsed ? ["b"] : []} />
}

function UsageExample({ variant, hot }: { variant: "compact" | "expanded"; hot?: boolean }) {
  const t = useMountTime()
  return (
    <UsageMeter
      className={variant === "expanded" ? "w-full max-w-sm" : undefined}
      variant={variant}
      inputTokens={42_300}
      outputTokens={12_290}
      cacheReadTokens={373_000}
      cacheWriteTokens={24_800}
      costUsd={0.61}
      limit={{ used: hot ? 93 : 66, max: 100, label: "5-hour limit", resetsAt: t + (hot ? 23 * 60_000 : 2 * 3_600_000 + 14 * 60_000) }}
    />
  )
}

const files = [
  {
    path: "src/billing/round.ts",
    additions: 10,
    deletions: 0,
    status: "added" as const,
    diff: "@@ -0,0 +1,6 @@\n+export function roundHalfUp(value: number, digits: number) {\n+  const factor = 10 ** digits\n+  const shifted = Math.abs(value) * factor\n+  const rounded = Math.round(Number(shifted.toPrecision(15)))\n+  return (Math.sign(value) * rounded) / factor\n+}\n",
  },
  {
    path: "src/billing/invoice.ts",
    additions: 3,
    deletions: 3,
    diff: "@@ -38,6 +38,6 @@ export function invoiceTotal(lines: Line[], opts: TotalOpts) {\n   const subtotal = lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0)\n-  const tax = subtotal * opts.taxRate\n-  return Number((subtotal + tax).toFixed(2))\n+  const tax = roundHalfUp(subtotal * opts.taxRate, 2)\n+  return roundHalfUp(subtotal + tax, 2)\n }\n",
  },
  { path: "tests/billing/invoice.test.ts", additions: 8, deletions: 0 },
  { path: "tests/reports/revenue.test.ts", additions: 21, deletions: 4 },
  { path: "src/billing/legacy-round.ts", additions: 0, deletions: 31, status: "deleted" as const },
]

export const examples: Example[] = [
  {
    id: "agent-run-card",
    name: "AgentRunCard",
    blurb: "The run at a glance: what it is doing now, how long it has been going, which step of how many, and what it already finished. Pause, stop and open are plain callbacks.",
    source: cardSrc,
    usage: `<AgentRunCard
  status="running"
  currentStep="Updating 5 test files"
  title="Fix rounding in invoice totals"
  model="claude-opus-5-5"
  step={4}
  totalSteps={6}
  startedAt={run.startedAt}
  steps={[{ id: "1", label: "Read 12 files", kind: "read", durationMs: 1900 }]}
  onPause={pause}
  onStop={stop}
  openHref={\`/runs/\${run.id}\`}
/>`,
    variants: [
      { label: "Running", render: () => <CardExample status="running" /> },
      { label: "Paused", render: () => <CardExample status="paused" /> },
      { label: "Needs approval", render: () => <CardExample status="waiting-approval" /> },
      { label: "Done", render: () => <CardExample status="done" /> },
      { label: "Failed", render: () => <CardExample status="failed" /> },
    ],
  },
  {
    id: "tool-timeline",
    name: "ToolTimeline",
    blurb: "Every tool call as it streams in, with an icon for reads, searches, edits, commands and web fetches. Rows with output expand; failed calls open on their own.",
    source: timelineSrc,
    usage: `<ToolTimeline
  items={[
    { id: "1", kind: "read", title: "Read", target: "src/billing/invoice.ts", status: "done", durationMs: 420 },
    { id: "2", kind: "run", title: "Run", target: "npm test", status: "running", startedAt: Date.now() },
  ]}
/>`,
    variants: [
      { label: "Streaming", render: () => <TimelineExample streaming /> },
      { label: "With an error", render: () => <TimelineExample streaming={false} /> },
    ],
  },
  {
    id: "approval-prompt",
    name: "ApprovalPrompt",
    blurb: "The agent asks before it does something you might regret. Risk level sets the styling and the defaults: high-risk commands cannot be always-allowed. Y, A and N work while focus is inside.",
    source: approvalSrc,
    usage: `<ApprovalPrompt
  command="rm -rf dist"
  cwd="~/acme/billing"
  risk="high"
  reason="Stale build output shadows the new round.ts."
  onDecision={(decision) => respond(approvalId, decision)}
/>`,
    variants: [
      { label: "High risk", render: () => <ApprovalExample risk="high" /> },
      { label: "Medium", render: () => <ApprovalExample risk="medium" /> },
      { label: "Low", render: () => <ApprovalExample risk="low" /> },
      { label: "File edit", render: () => <ApprovalExample risk="medium" diff /> },
    ],
  },
  {
    id: "subagent-tree",
    name: "SubagentTree",
    blurb: "Parallel subagents and the ones they spawned, each with a live status line and timer. It is a real ARIA tree: arrow keys move, left and right fold.",
    source: treeSrc,
    usage: `<SubagentTree
  nodes={[
    { id: "a", name: "explorer", status: "done", summary: "3 report paths round twice" },
    { id: "b", name: "test-writer", status: "running", activity: "Editing invoice.test.ts",
      startedAt, children: [{ id: "b1", name: "fixture-builder", status: "done" }] },
  ]}
/>`,
    variants: [
      { label: "Live", render: () => <TreeExample /> },
      { label: "Collapsed", render: () => <TreeExample collapsed /> },
    ],
  },
  {
    id: "usage-meter",
    name: "UsageMeter",
    blurb: "Tokens in and out, how much came from cache, what it cost, and how close you are to the rate limit with a live reset countdown. A pill for headers, a card for side panels.",
    source: usageSrc,
    usage: `<UsageMeter
  variant="compact"
  inputTokens={42_300}
  outputTokens={12_290}
  cacheReadTokens={373_000}
  costUsd={0.61}
  limit={{ used: 66, max: 100, label: "5-hour limit", resetsAt }}
/>`,
    variants: [
      { label: "Expanded", render: () => <UsageExample variant="expanded" /> },
      { label: "Compact", render: () => <UsageExample variant="compact" /> },
      { label: "Near the limit", render: () => <UsageExample variant="expanded" hot /> },
    ],
  },
  {
    id: "diff-summary",
    name: "DiffSummary",
    blurb: "What the run changed, file by file, with counts and diffstat blocks. Click a row to read the hunk with line numbers.",
    source: diffSrc,
    usage: `<DiffSummary
  files={[
    { path: "src/billing/round.ts", additions: 10, deletions: 0, status: "added", diff },
    { path: "src/billing/invoice.ts", additions: 3, deletions: 3, diff },
  ]}
/>`,
    variants: [
      { label: "Changes", render: () => <DiffSummary className="w-full max-w-lg" files={files} defaultExpanded={["src/billing/invoice.ts"]} /> },
      { label: "Collapsed", render: () => <DiffSummary className="w-full max-w-lg" files={files} /> },
    ],
  },
]
