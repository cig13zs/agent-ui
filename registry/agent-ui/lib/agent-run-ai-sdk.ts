import { describeTool, type AgentEvent, type RiskLevel, type ToolKind } from "@/registry/agent-ui/hooks/use-agent-run"

/*
 * Vercel AI SDK adapter. Turns the `messages` array from `useChat` into
 * agent-ui events. Structural types only, so it does not import `ai`.
 *
 *   const adapter = useMemo(() => createAISDKAdapter(), [])
 *   const { messages, status } = useChat()
 *   const events = useMemo(() => adapter.toEvents(messages, status), [adapter, messages, status])
 *   const run = useAgentRun({ events })
 */

export interface AISDKPart {
  type: string
  text?: string
  toolCallId?: string
  toolName?: string
  state?: string
  input?: unknown
  output?: unknown
  errorText?: string
  approval?: { id: string; approved?: boolean; reason?: string }
}

export interface AISDKMessage {
  id: string
  role: "system" | "user" | "assistant"
  parts: AISDKPart[]
  metadata?: unknown
}

export type AISDKChatStatus = "submitted" | "streaming" | "ready" | "error"

export interface AISDKAdapterOptions {
  model?: string
  totalSteps?: number
  describe?: (toolName: string, input: unknown) => { kind: ToolKind; title: string; target?: string }
  /** Risk level for tool calls that ask for approval. Default "medium". */
  risk?: (toolName: string, input: unknown) => RiskLevel
  /** Read token usage from your message metadata. Defaults to `metadata.usage`. */
  usage?: (message: AISDKMessage) =>
    | { inputTokens?: number; outputTokens?: number; cachedInputTokens?: number; costUsd?: number }
    | undefined
  now?: () => number
}

function toText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function defaultUsage(message: AISDKMessage) {
  const meta = message.metadata as { usage?: Record<string, number> } | undefined
  return meta?.usage
}

export function createAISDKAdapter(options: AISDKAdapterOptions = {}) {
  const now = options.now ?? Date.now
  const describe = options.describe ?? describeTool
  const seen = new Map<string, number>()
  const time = (key: string) => {
    let t = seen.get(key)
    if (t === undefined) {
      t = now()
      seen.set(key, t)
    }
    return t
  }

  function toEvents(messages: readonly AISDKMessage[], status?: AISDKChatStatus): AgentEvent[] {
    if (messages.length === 0) return []
    const firstUser = messages.find((m) => m.role === "user")
    const title = firstUser?.parts.find((p) => p.type === "text")?.text?.split("\n")[0]?.slice(0, 120)
    const events: AgentEvent[] = [
      { type: "run.start", at: time(`run:${messages[0].id}`), title, model: options.model, totalSteps: options.totalSteps },
    ]

    let input = 0
    let output = 0
    let cached = 0
    let cost: number | undefined

    for (const message of messages) {
      if (message.role !== "assistant") continue
      for (const part of message.parts) {
        const isTool = part.type.startsWith("tool-") || part.type === "dynamic-tool"
        if (!isTool || !part.toolCallId) continue
        const id = part.toolCallId
        const name = part.toolName ?? part.type.replace(/^tool-/, "")
        const info = describe(name, part.input)
        events.push({ type: "tool.start", id, name, input: part.input, ...info, at: time(`start:${id}`) })

        if (part.approval && part.state === "approval-requested") {
          events.push({
            type: "approval.request",
            id: part.approval.id,
            toolId: id,
            title: `Agent wants to use ${name}`,
            command: info.kind === "run" ? info.target : undefined,
            risk: options.risk?.(name, part.input) ?? "medium",
            at: time(`approval:${part.approval.id}`),
          })
        }
        if (part.approval && part.approval.approved !== undefined) {
          events.push({
            type: "approval.request",
            id: part.approval.id,
            toolId: id,
            title: `Agent wants to use ${name}`,
            at: time(`approval:${part.approval.id}`),
          })
          events.push({
            type: "approval.resolve",
            id: part.approval.id,
            decision: part.approval.approved ? "allow-once" : "deny",
            at: time(`resolve:${part.approval.id}`),
          })
        }

        if (part.state === "output-available") {
          events.push({ type: "tool.end", id, status: "done", output: toText(part.output), at: time(`end:${id}`) })
        } else if (part.state === "output-error") {
          events.push({ type: "tool.end", id, status: "error", error: part.errorText ?? "Tool failed", at: time(`end:${id}`) })
        } else if (part.state === "output-denied") {
          events.push({ type: "tool.end", id, status: "error", error: "Denied", at: time(`end:${id}`) })
        }
      }

      const usage = (options.usage ?? defaultUsage)(message)
      if (usage) {
        const cachedIn = usage.cachedInputTokens ?? 0
        input += Math.max(0, (usage.inputTokens ?? 0) - cachedIn)
        cached += cachedIn
        output += usage.outputTokens ?? 0
        if (usage.costUsd !== undefined) cost = (cost ?? 0) + usage.costUsd
      }
    }

    if (input || output || cached || cost !== undefined) {
      events.push({ type: "usage", mode: "set", inputTokens: input, outputTokens: output, cacheReadTokens: cached, costUsd: cost })
    }

    const lastId = messages[messages.length - 1].id
    if (status === "ready" && messages[messages.length - 1].role === "assistant") {
      events.push({ type: "run.end", status: "done", at: time(`done:${lastId}`) })
    } else if (status === "error") {
      events.push({ type: "run.end", status: "failed", error: "The request failed", at: time(`error:${lastId}`) })
    }
    return events
  }

  return { toEvents }
}
