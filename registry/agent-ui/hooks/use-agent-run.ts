import * as React from "react"

/* ------------------------------------------------------------------ */
/* Event schema                                                        */
/* ------------------------------------------------------------------ */

export type ToolKind = "read" | "search" | "edit" | "run" | "web" | "task" | "other"
export type RunStatus = "idle" | "running" | "paused" | "waiting-approval" | "done" | "failed"
export type RiskLevel = "low" | "medium" | "high"
export type ApprovalDecision = "allow-once" | "allow-always" | "deny"

/**
 * Every event may carry `at` (epoch ms). When it is missing, the hook stamps
 * the time it first saw the event.
 */
type Stamp = { at?: number }

export type AgentEvent = Stamp &
  (
    | { type: "run.start"; runId?: string; title?: string; model?: string; totalSteps?: number }
    | { type: "run.pause" }
    | { type: "run.resume" }
    | { type: "run.end"; status?: "done" | "failed"; error?: string }
    | { type: "step.start"; id?: string; label: string; kind?: ToolKind }
    | { type: "step.end"; id?: string; status?: "done" | "failed"; summary?: string }
    | {
        type: "tool.start"
        id: string
        title: string
        kind?: ToolKind
        name?: string
        target?: string
        input?: unknown
        subagentId?: string
      }
    | { type: "tool.delta"; id: string; output: string }
    | { type: "tool.end"; id: string; status?: "done" | "error"; output?: string; error?: string; summary?: string }
    | {
        type: "approval.request"
        id: string
        title?: string
        command?: string
        diff?: string
        risk?: RiskLevel
        reason?: string
        cwd?: string
        toolId?: string
      }
    | { type: "approval.resolve"; id: string; decision: ApprovalDecision }
    | { type: "subagent.start"; id: string; name: string; task?: string; parentId?: string }
    | { type: "subagent.update"; id: string; activity?: string; tokens?: number }
    | { type: "subagent.end"; id: string; status?: "done" | "failed"; summary?: string }
    | {
        type: "usage"
        inputTokens?: number
        outputTokens?: number
        cacheReadTokens?: number
        cacheWriteTokens?: number
        costUsd?: number
        /** "add" (default) adds to the running totals, "set" replaces them. */
        mode?: "add" | "set"
      }
    | { type: "limit"; used: number; max: number; resetsAt?: number; label?: string }
    | {
        type: "file.change"
        path: string
        additions: number
        deletions: number
        status?: FileStatus
        diff?: string
      }
  )

export type FileStatus = "added" | "modified" | "deleted" | "renamed"

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

export interface StepState {
  id: string
  label: string
  kind?: ToolKind
  status: "running" | "done" | "failed"
  startedAt: number
  endedAt?: number
}

export interface ToolState {
  id: string
  kind: ToolKind
  name?: string
  title: string
  target?: string
  input?: unknown
  subagentId?: string
  status: "running" | "done" | "error"
  output?: string
  error?: string
  summary?: string
  startedAt: number
  endedAt?: number
}

export interface ApprovalState {
  id: string
  title?: string
  command?: string
  diff?: string
  risk: RiskLevel
  reason?: string
  cwd?: string
  toolId?: string
  decision?: ApprovalDecision
  requestedAt: number
}

export interface SubagentState {
  id: string
  name: string
  task?: string
  parentId?: string
  status: "running" | "done" | "failed"
  activity?: string
  summary?: string
  tokens?: number
  toolCount: number
  startedAt: number
  endedAt?: number
}

export interface FileChangeState {
  path: string
  additions: number
  deletions: number
  status: FileStatus
  diff?: string
}

export interface AgentRunState {
  runId?: string
  title?: string
  model?: string
  status: RunStatus
  totalSteps?: number
  startedAt?: number
  endedAt?: number
  pausedAt?: number
  pausedMs: number
  error?: string
  steps: StepState[]
  tools: ToolState[]
  approvals: ApprovalState[]
  subagents: SubagentState[]
  files: FileChangeState[]
  usage: {
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
    costUsd?: number
  }
  limit?: { used: number; max: number; resetsAt?: number; label?: string }
}

export const initialAgentRunState: AgentRunState = {
  status: "idle",
  pausedMs: 0,
  steps: [],
  tools: [],
  approvals: [],
  subagents: [],
  files: [],
  usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
}

function patch<T extends { id: string }>(list: T[], id: string, fn: (item: T) => T): T[] {
  const i = list.findIndex((item) => item.id === id)
  if (i === -1) return list
  const next = list.slice()
  next[i] = fn(list[i])
  return next
}

function settle(state: AgentRunState): RunStatus {
  if (state.status === "done" || state.status === "failed" || state.status === "paused") return state.status
  return state.approvals.some((a) => !a.decision) ? "waiting-approval" : "running"
}

/**
 * Pure reducer. Safe to run on a server or in a worker; the hook is a thin
 * wrapper around it.
 */
export function reduceAgentRun(state: AgentRunState, event: AgentEvent): AgentRunState {
  const at = event.at ?? 0
  switch (event.type) {
    case "run.start":
      return {
        ...initialAgentRunState,
        runId: event.runId,
        title: event.title,
        model: event.model,
        totalSteps: event.totalSteps,
        status: "running",
        startedAt: at,
        limit: state.limit,
      }
    case "run.pause":
      if (state.status === "done" || state.status === "failed" || state.pausedAt !== undefined) return state
      return { ...state, status: "paused", pausedAt: at }
    case "run.resume": {
      if (state.pausedAt === undefined) return state
      const next = { ...state, pausedMs: state.pausedMs + (at - state.pausedAt), pausedAt: undefined, status: "running" as RunStatus }
      return { ...next, status: settle(next) }
    }
    case "run.end": {
      const status = event.status ?? "done"
      const close = <T extends { status: string; endedAt?: number }>(item: T): T =>
        item.status === "running" ? { ...item, status: status === "failed" ? "failed" : "done", endedAt: at } : item
      return {
        ...state,
        status,
        error: event.error,
        endedAt: at,
        pausedMs: state.pausedAt !== undefined ? state.pausedMs + (at - state.pausedAt) : state.pausedMs,
        pausedAt: undefined,
        steps: state.steps.map(close),
        tools: state.tools.map((t) => (t.status === "running" ? { ...t, status: status === "failed" ? "error" : "done", endedAt: at } : t)),
        subagents: state.subagents.map(close),
      }
    }
    case "step.start": {
      const steps = state.steps.map((s) => (s.status === "running" ? { ...s, status: "done" as const, endedAt: at } : s))
      const id = event.id ?? `step-${steps.length + 1}`
      steps.push({ id, label: event.label, kind: event.kind, status: "running", startedAt: at })
      return { ...state, steps }
    }
    case "step.end": {
      const target = event.id ?? [...state.steps].reverse().find((s) => s.status === "running")?.id
      if (!target) return state
      return {
        ...state,
        steps: patch(state.steps, target, (s) => ({ ...s, label: event.summary ?? s.label, status: event.status ?? "done", endedAt: at })),
      }
    }
    case "tool.start": {
      if (state.tools.some((t) => t.id === event.id)) return state
      const tool: ToolState = {
        id: event.id,
        kind: event.kind ?? "other",
        name: event.name,
        title: event.title,
        target: event.target,
        input: event.input,
        subagentId: event.subagentId,
        status: "running",
        startedAt: at,
      }
      const subagents = event.subagentId
        ? patch(state.subagents, event.subagentId, (s) => ({ ...s, toolCount: s.toolCount + 1, activity: event.title }))
        : state.subagents
      return { ...state, tools: [...state.tools, tool], subagents }
    }
    case "tool.delta":
      return { ...state, tools: patch(state.tools, event.id, (t) => ({ ...t, output: (t.output ?? "") + event.output })) }
    case "tool.end":
      return {
        ...state,
        tools: patch(state.tools, event.id, (t) => ({
          ...t,
          status: event.status ?? (event.error ? "error" : "done"),
          output: event.output ?? t.output,
          error: event.error,
          summary: event.summary,
          endedAt: at,
        })),
      }
    case "approval.request": {
      const approval: ApprovalState = {
        id: event.id,
        title: event.title,
        command: event.command,
        diff: event.diff,
        risk: event.risk ?? "medium",
        reason: event.reason,
        cwd: event.cwd,
        toolId: event.toolId,
        requestedAt: at,
      }
      const next = { ...state, approvals: [...state.approvals.filter((a) => a.id !== event.id), approval] }
      return { ...next, status: settle(next) }
    }
    case "approval.resolve": {
      const next = { ...state, approvals: patch(state.approvals, event.id, (a) => ({ ...a, decision: event.decision })) }
      return { ...next, status: settle(next) }
    }
    case "subagent.start":
      if (state.subagents.some((s) => s.id === event.id)) return state
      return {
        ...state,
        subagents: [
          ...state.subagents,
          { id: event.id, name: event.name, task: event.task, parentId: event.parentId, status: "running", toolCount: 0, startedAt: at },
        ],
      }
    case "subagent.update":
      return {
        ...state,
        subagents: patch(state.subagents, event.id, (s) => ({
          ...s,
          activity: event.activity ?? s.activity,
          tokens: event.tokens ?? s.tokens,
        })),
      }
    case "subagent.end":
      return {
        ...state,
        subagents: patch(state.subagents, event.id, (s) => ({
          ...s,
          status: event.status ?? "done",
          summary: event.summary,
          activity: undefined,
          endedAt: at,
        })),
      }
    case "usage": {
      const u = state.usage
      const set = event.mode === "set"
      const pick = (prev: number, value?: number) => (value === undefined ? prev : set ? value : prev + value)
      const cost =
        event.costUsd === undefined ? u.costUsd : set ? event.costUsd : (u.costUsd ?? 0) + event.costUsd
      return {
        ...state,
        usage: {
          inputTokens: pick(u.inputTokens, event.inputTokens),
          outputTokens: pick(u.outputTokens, event.outputTokens),
          cacheReadTokens: pick(u.cacheReadTokens, event.cacheReadTokens),
          cacheWriteTokens: pick(u.cacheWriteTokens, event.cacheWriteTokens),
          costUsd: cost,
        },
      }
    }
    case "limit":
      return { ...state, limit: { used: event.used, max: event.max, resetsAt: event.resetsAt, label: event.label } }
    case "file.change": {
      const change: FileChangeState = {
        path: event.path,
        additions: event.additions,
        deletions: event.deletions,
        status: event.status ?? "modified",
        diff: event.diff,
      }
      const i = state.files.findIndex((f) => f.path === event.path)
      const files = state.files.slice()
      if (i === -1) files.push(change)
      else files[i] = change
      return { ...state, files }
    }
    default:
      return state
  }
}

/* ------------------------------------------------------------------ */
/* Selectors: state -> component props                                 */
/* ------------------------------------------------------------------ */

export interface RunStep {
  id: string
  label: string
  kind?: ToolKind
  durationMs?: number
  status?: "done" | "failed"
}

export interface AgentRunCardData {
  status: RunStatus
  title?: string
  currentStep?: string
  step?: number
  totalSteps?: number
  model?: string
  /** Start of the run, shifted forward by time spent paused. */
  startedAt?: number
  /** Set when the clock should stand still: paused, finished or failed. */
  endedAt?: number
  steps: RunStep[]
  error?: string
}

export interface TimelineItem {
  id: string
  kind: ToolKind
  title: string
  target?: string
  status: "running" | "done" | "error"
  startedAt: number
  durationMs?: number
  output?: string
  error?: string
}

export interface SubagentNode {
  id: string
  name: string
  task?: string
  status: "running" | "done" | "failed"
  activity?: string
  summary?: string
  toolCount: number
  tokens?: number
  startedAt: number
  durationMs?: number
  children: SubagentNode[]
}

export interface UsageData {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  costUsd?: number
  limit?: { used: number; max: number; resetsAt?: number; label?: string }
}

export function selectCard(state: AgentRunState): AgentRunCardData {
  const pending = state.approvals.find((a) => !a.decision)
  const usesSteps = state.steps.length > 0
  const topTools = state.tools.filter((t) => !t.subagentId)
  const steps: RunStep[] = usesSteps
    ? state.steps
        .filter((s) => s.status !== "running")
        .map((s) => ({
          id: s.id,
          label: s.label,
          kind: s.kind,
          status: s.status === "failed" ? "failed" : "done",
          durationMs: s.endedAt !== undefined ? s.endedAt - s.startedAt : undefined,
        }))
    : topTools
        .filter((t) => t.status !== "running")
        .map((t) => ({
          id: t.id,
          label: t.summary ?? t.title,
          kind: t.kind,
          status: t.status === "error" ? "failed" : "done",
          durationMs: t.endedAt !== undefined ? t.endedAt - t.startedAt : undefined,
        }))
  const running = usesSteps
    ? state.steps.find((s) => s.status === "running")?.label
    : [...topTools].reverse().find((t) => t.status === "running")?.title
  const active = running !== undefined && state.status !== "done" && state.status !== "failed"
  const step = steps.length + (active ? 1 : 0)
  return {
    status: state.status,
    title: state.title,
    model: state.model,
    currentStep: pending ? "Waiting for approval" : running,
    step: step || undefined,
    totalSteps: state.totalSteps !== undefined ? Math.max(state.totalSteps, step) : undefined,
    startedAt: state.startedAt !== undefined ? state.startedAt + state.pausedMs : undefined,
    endedAt: state.endedAt ?? state.pausedAt,
    steps,
    error: state.error,
  }
}

export function selectTimeline(state: AgentRunState): TimelineItem[] {
  return state.tools
    .filter((t) => !t.subagentId)
    .map((t) => ({
      id: t.id,
      kind: t.kind,
      title: t.title,
      target: t.target,
      status: t.status,
      startedAt: t.startedAt,
      durationMs: t.endedAt !== undefined ? t.endedAt - t.startedAt : undefined,
      output: t.output,
      error: t.error,
    }))
}

export function selectSubagents(state: AgentRunState): SubagentNode[] {
  const nodes = new Map<string, SubagentNode>()
  for (const s of state.subagents) {
    nodes.set(s.id, {
      id: s.id,
      name: s.name,
      task: s.task,
      status: s.status,
      activity: s.activity,
      summary: s.summary,
      toolCount: s.toolCount,
      tokens: s.tokens,
      startedAt: s.startedAt,
      durationMs: s.endedAt !== undefined ? s.endedAt - s.startedAt : undefined,
      children: [],
    })
  }
  const roots: SubagentNode[] = []
  for (const s of state.subagents) {
    const node = nodes.get(s.id)!
    const parent = s.parentId ? nodes.get(s.parentId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

export function selectUsage(state: AgentRunState): UsageData {
  return { ...state.usage, limit: state.limit }
}

export function selectApproval(state: AgentRunState): ApprovalState | null {
  return state.approvals.find((a) => !a.decision) ?? null
}

/* ------------------------------------------------------------------ */
/* Hook                                                                */
/* ------------------------------------------------------------------ */

export interface UseAgentRunOptions {
  /**
   * Controlled mode: the full list of events so far. The state is rebuilt
   * from it on change, which suits adapters that derive events from a
   * message list. Leave it out to push events with `dispatch` instead.
   */
  events?: readonly AgentEvent[]
  /** Clock used to stamp events without `at`. Defaults to Date.now. */
  now?: () => number
}

export interface AgentRun {
  state: AgentRunState
  dispatch: (event: AgentEvent | readonly AgentEvent[]) => void
  reset: () => void
  /** Reads events from an async iterable until it ends or the signal aborts. */
  consume: (source: AsyncIterable<AgentEvent>, signal?: AbortSignal) => Promise<void>
  card: AgentRunCardData
  timeline: TimelineItem[]
  approval: ApprovalState | null
  subagents: SubagentNode[]
  usage: UsageData
  files: FileChangeState[]
}

const firstSeen = new WeakMap<object, number>()

function stamp(event: AgentEvent, now: () => number): AgentEvent {
  if (event.at !== undefined) return event
  let at = firstSeen.get(event)
  if (at === undefined) {
    at = now()
    firstSeen.set(event, at)
  }
  return { ...event, at }
}

type Action = { type: "events"; events: readonly AgentEvent[] } | { type: "reset" }

function hookReducer(state: AgentRunState, action: Action): AgentRunState {
  if (action.type === "reset") return initialAgentRunState
  return action.events.reduce(reduceAgentRun, state)
}

export function useAgentRun(options: UseAgentRunOptions = {}): AgentRun {
  const { events, now = Date.now } = options
  const [pushed, send] = React.useReducer(hookReducer, initialAgentRunState)

  const controlled = React.useMemo(
    () => (events ? events.reduce((s, e) => reduceAgentRun(s, stamp(e, now)), initialAgentRunState) : null),
    [events, now],
  )
  const state = controlled ?? pushed

  const dispatch = React.useCallback(
    (input: AgentEvent | readonly AgentEvent[]) => {
      const list = (Array.isArray(input) ? input : [input]) as readonly AgentEvent[]
      send({ type: "events", events: list.map((e) => stamp(e, now)) })
    },
    [now],
  )
  const reset = React.useCallback(() => send({ type: "reset" }), [])
  const consume = React.useCallback(
    async (source: AsyncIterable<AgentEvent>, signal?: AbortSignal) => {
      for await (const event of source) {
        if (signal?.aborted) break
        dispatch(event)
      }
    },
    [dispatch],
  )

  return React.useMemo(
    () => ({
      state,
      dispatch,
      reset,
      consume,
      card: selectCard(state),
      timeline: selectTimeline(state),
      approval: selectApproval(state),
      subagents: selectSubagents(state),
      usage: selectUsage(state),
      files: state.files,
    }),
    [state, dispatch, reset, consume],
  )
}

/* ------------------------------------------------------------------ */
/* Tool naming, shared by the adapters                                 */
/* ------------------------------------------------------------------ */

const kindPatterns: Array<[ToolKind, RegExp]> = [
  ["edit", /edit|write|patch|replace|create_file|apply|insert|update_file|str_replace|delete|remove|rename|move|mkdir/i],
  ["web", /web|fetch|browse|http|url|scrape/i],
  ["read", /read|view|cat|open_file|get_file/i],
  ["search", /grep|search|find|glob|list|ls\b|lookup|query/i],
  ["run", /bash|shell|exec|run|terminal|command|python|code_interpreter/i],
  ["task", /task|agent|delegate|spawn/i],
]

const kindVerb: Record<ToolKind, string> = {
  read: "Read",
  search: "Search",
  edit: "Edit",
  run: "Run",
  web: "Fetch",
  task: "Delegate",
  other: "Call",
}

function pickString(input: unknown, keys: string[]): string | undefined {
  if (!input || typeof input !== "object") return undefined
  const record = input as Record<string, unknown>
  for (const key of keys) {
    const value = record[key]
    if (typeof value === "string" && value) return value
  }
  return undefined
}

/**
 * Best guess at a tool's kind, title and target from its name and input.
 * Pass your own `describe` to an adapter when your tool names are unusual.
 */
export function describeTool(name: string, input?: unknown): { kind: ToolKind; title: string; target?: string } {
  const kind = kindPatterns.find(([, re]) => re.test(name))?.[0] ?? "other"
  const target =
    kind === "run"
      ? pickString(input, ["command", "cmd", "code", "script"])
      : kind === "web"
        ? pickString(input, ["url", "query", "q"])
        : kind === "search"
          ? pickString(input, ["pattern", "query", "q", "glob", "path"])
          : kind === "task"
            ? pickString(input, ["description", "prompt", "task"])
            : pickString(input, ["path", "file_path", "filePath", "file", "filename", "target_file"])
  return { kind, title: kind === "other" ? name : kindVerb[kind], target }
}
