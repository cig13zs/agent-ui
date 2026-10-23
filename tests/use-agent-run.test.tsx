import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import {
  describeTool,
  initialAgentRunState,
  reduceAgentRun,
  selectCard,
  selectSubagents,
  selectTimeline,
  useAgentRun,
  type AgentEvent,
} from "@/registry/agent-ui/hooks/use-agent-run"
import { buildScript } from "@/src/demo/script"

const reduce = (events: AgentEvent[]) => events.reduce(reduceAgentRun, initialAgentRunState)

describe("reduceAgentRun", () => {
  it("starts a run and tracks steps with summaries", () => {
    const s = reduce([
      { type: "run.start", at: 0, title: "Fix rounding", model: "m", totalSteps: 3 },
      { type: "step.start", at: 100, label: "Reading", kind: "read" },
      { type: "step.end", at: 2000, summary: "Read 12 files" },
      { type: "step.start", at: 2100, label: "Searching", kind: "search" },
    ])
    expect(s.status).toBe("running")
    const card = selectCard(s)
    expect(card.currentStep).toBe("Searching")
    expect(card.step).toBe(2)
    expect(card.totalSteps).toBe(3)
    expect(card.steps).toEqual([{ id: "step-1", label: "Read 12 files", kind: "read", status: "done", durationMs: 1900 }])
  })

  it("closes the running step when the next one starts", () => {
    const s = reduce([
      { type: "run.start", at: 0 },
      { type: "step.start", at: 0, label: "A" },
      { type: "step.start", at: 500, label: "B" },
    ])
    expect(s.steps.map((x) => x.status)).toEqual(["done", "running"])
    expect(s.steps[0].endedAt).toBe(500)
  })

  it("moves to waiting-approval and back", () => {
    let s = reduce([
      { type: "run.start", at: 0 },
      { type: "approval.request", at: 10, id: "a1", command: "rm -rf dist", risk: "high" },
    ])
    expect(s.status).toBe("waiting-approval")
    expect(selectCard(s).currentStep).toBe("Waiting for approval")
    s = reduceAgentRun(s, { type: "approval.resolve", at: 20, id: "a1", decision: "deny" })
    expect(s.status).toBe("running")
    expect(s.approvals[0].decision).toBe("deny")
  })

  it("shifts the clock by time spent paused", () => {
    let s = reduce([
      { type: "run.start", at: 1000 },
      { type: "run.pause", at: 5000 },
    ])
    expect(s.status).toBe("paused")
    expect(selectCard(s).endedAt).toBe(5000)
    s = reduceAgentRun(s, { type: "run.resume", at: 8000 })
    const card = selectCard(s)
    expect(s.status).toBe("running")
    expect(card.startedAt).toBe(4000)
    expect(card.endedAt).toBeUndefined()
  })

  it("resumes into waiting-approval when an approval is still open", () => {
    const s = reduce([
      { type: "run.start", at: 0 },
      { type: "approval.request", at: 1, id: "a" },
      { type: "run.pause", at: 2 },
      { type: "run.resume", at: 3 },
    ])
    expect(s.status).toBe("waiting-approval")
  })

  it("streams tool output and closes running tools on run.end", () => {
    const s = reduce([
      { type: "run.start", at: 0 },
      { type: "tool.start", at: 0, id: "t1", kind: "run", title: "Run", target: "npm test" },
      { type: "tool.delta", id: "t1", output: "a\n" },
      { type: "tool.delta", id: "t1", output: "b" },
      { type: "tool.start", at: 10, id: "t2", kind: "read", title: "Read" },
      { type: "tool.end", at: 50, id: "t2", error: "ENOENT" },
      { type: "run.end", at: 100, status: "failed", error: "boom" },
    ])
    const [t1, t2] = selectTimeline(s)
    expect(t1.output).toBe("a\nb")
    expect(t1.status).toBe("error")
    expect(t1.durationMs).toBe(100)
    expect(t2.status).toBe("error")
    expect(t2.error).toBe("ENOENT")
    expect(s.status).toBe("failed")
    expect(selectCard(s).error).toBe("boom")
  })

  it("ignores a duplicate tool.start", () => {
    const s = reduce([
      { type: "tool.start", at: 0, id: "t1", title: "Read" },
      { type: "tool.start", at: 5, id: "t1", title: "Read again" },
    ])
    expect(s.tools).toHaveLength(1)
    expect(s.tools[0].title).toBe("Read")
  })

  it("derives the card from tool calls when no steps are sent", () => {
    const s = reduce([
      { type: "run.start", at: 0 },
      { type: "tool.start", at: 0, id: "t1", kind: "read", title: "Read" },
      { type: "tool.end", at: 300, id: "t1", summary: "Read 3 files" },
      { type: "tool.start", at: 300, id: "t2", kind: "edit", title: "Edit" },
    ])
    const card = selectCard(s)
    expect(card.steps).toEqual([{ id: "t1", label: "Read 3 files", kind: "read", status: "done", durationMs: 300 }])
    expect(card.currentStep).toBe("Edit")
    expect(card.step).toBe(2)
  })

  it("adds and sets usage", () => {
    let s = reduce([
      { type: "usage", inputTokens: 100, outputTokens: 10, costUsd: 0.5 },
      { type: "usage", inputTokens: 50, cacheReadTokens: 900, costUsd: 0.25 },
    ])
    expect(s.usage).toEqual({ inputTokens: 150, outputTokens: 10, cacheReadTokens: 900, cacheWriteTokens: 0, costUsd: 0.75 })
    s = reduceAgentRun(s, { type: "usage", mode: "set", inputTokens: 1, costUsd: 0.1 })
    expect(s.usage.inputTokens).toBe(1)
    expect(s.usage.outputTokens).toBe(10)
    expect(s.usage.costUsd).toBe(0.1)
  })

  it("keeps the limit across run.start", () => {
    const s = reduce([
      { type: "limit", used: 5, max: 10 },
      { type: "run.start", at: 0 },
    ])
    expect(s.limit).toEqual({ used: 5, max: 10, resetsAt: undefined, label: undefined })
  })

  it("upserts file changes by path", () => {
    const s = reduce([
      { type: "file.change", path: "a.ts", additions: 1, deletions: 0 },
      { type: "file.change", path: "b.ts", additions: 2, deletions: 0, status: "added" },
      { type: "file.change", path: "a.ts", additions: 4, deletions: 2 },
    ])
    expect(s.files.map((f) => [f.path, f.additions, f.status])).toEqual([
      ["a.ts", 4, "modified"],
      ["b.ts", 2, "added"],
    ])
  })

  it("nests subagents and counts their tool calls", () => {
    const s = reduce([
      { type: "subagent.start", at: 0, id: "s1", name: "explorer" },
      { type: "subagent.start", at: 0, id: "s2", name: "child", parentId: "s1" },
      { type: "tool.start", at: 10, id: "t1", title: "Read", subagentId: "s2" },
      { type: "subagent.end", at: 1000, id: "s2", summary: "ok" },
    ])
    const tree = selectSubagents(s)
    expect(tree).toHaveLength(1)
    expect(tree[0].children[0]).toMatchObject({ name: "child", status: "done", toolCount: 1, durationMs: 1000, summary: "ok" })
    expect(selectTimeline(s)).toHaveLength(0)
  })

  it("plays the demo script to a finished run", () => {
    const events: AgentEvent[] = []
    for (const beat of buildScript(0)) {
      if ("event" in beat) events.push(beat.event)
      if ("gate" in beat) events.push({ type: "approval.resolve", id: beat.gate, decision: "allow-once" })
    }
    let t = 0
    const s = events.reduce((acc, e) => reduceAgentRun(acc, { ...e, at: (t += 100) }), initialAgentRunState)
    const card = selectCard(s)
    expect(s.status).toBe("done")
    expect(card.steps).toHaveLength(6)
    expect(card.step).toBe(6)
    expect(s.tools.every((tool) => tool.status !== "running")).toBe(true)
    expect(s.subagents.every((a) => a.status === "done")).toBe(true)
  })
})

describe("describeTool", () => {
  it.each([
    ["Read", { file_path: "src/a.ts" }, "read", "src/a.ts"],
    ["Grep", { pattern: "foo" }, "search", "foo"],
    ["str_replace_based_edit_tool", { path: "b.ts" }, "edit", "b.ts"],
    ["bash", { command: "ls -la" }, "run", "ls -la"],
    ["web_search", { query: "vitest" }, "web", "vitest"],
    ["WebFetch", { url: "https://x.dev" }, "web", "https://x.dev"],
    ["Task", { description: "explore" }, "task", "explore"],
    ["get_weather", {}, "other", undefined],
  ] as const)("%s", (name, input, kind, target) => {
    const d = describeTool(name, input)
    expect(d.kind).toBe(kind)
    expect(d.target).toBe(target)
  })
})

describe("useAgentRun", () => {
  it("dispatches single events and arrays, and resets", () => {
    let now = 1000
    const { result } = renderHook(() => useAgentRun({ now: () => now }))
    act(() => result.current.dispatch({ type: "run.start", title: "x" }))
    expect(result.current.card.startedAt).toBe(1000)
    now = 1500
    act(() =>
      result.current.dispatch([
        { type: "tool.start", id: "t", title: "Read", kind: "read" },
        { type: "file.change", path: "a", additions: 1, deletions: 0 },
      ]),
    )
    expect(result.current.timeline[0].startedAt).toBe(1500)
    expect(result.current.files).toHaveLength(1)
    act(() => result.current.reset())
    expect(result.current.state.status).toBe("idle")
  })

  it("rebuilds state from a controlled events array with stable stamps", () => {
    let now = 10
    const start: AgentEvent = { type: "run.start" }
    const tool: AgentEvent = { type: "tool.start", id: "t", title: "Read" }
    const { result, rerender } = renderHook(({ events }) => useAgentRun({ events, now: () => now }), {
      initialProps: { events: [start] as AgentEvent[] },
    })
    expect(result.current.card.startedAt).toBe(10)
    now = 20
    rerender({ events: [start, tool] })
    expect(result.current.card.startedAt).toBe(10)
    expect(result.current.timeline[0].startedAt).toBe(20)
  })

  it("consumes an async iterable", async () => {
    const { result } = renderHook(() => useAgentRun())
    async function* source(): AsyncIterable<AgentEvent> {
      yield { type: "run.start", at: 0 }
      yield { type: "run.end", at: 10 }
    }
    await act(() => result.current.consume(source()))
    expect(result.current.state.status).toBe("done")
  })
})
