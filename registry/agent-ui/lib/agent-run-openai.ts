import { describeTool, type AgentEvent, type ToolKind } from "@/registry/agent-ui/hooks/use-agent-run"

/*
 * OpenAI stream adapter. Accepts both Chat Completions chunks
 * (`stream: true`, with `stream_options: { include_usage: true }` for usage)
 * and Responses API events. You run the tools, so report each result with
 * `toolResult`.
 *
 *   const openai = createOpenAIAdapter()
 *   run.dispatch(openai.start({ title: "Summarise the failing tests" }))
 *   for await (const chunk of stream) run.dispatch(openai.push(chunk))
 */

export interface ChatCompletionChunk {
  object?: "chat.completion.chunk"
  model?: string
  choices?: Array<{
    index: number
    delta?: {
      tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }>
    }
    finish_reason?: string | null
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    prompt_tokens_details?: { cached_tokens?: number }
  } | null
}

export interface ResponsesEvent {
  type: string
  item?: { type: string; id?: string; call_id?: string; name?: string; arguments?: string; status?: string; action?: unknown }
  response?: {
    model?: string
    usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } }
    error?: { message?: string } | null
  }
}

export interface OpenAIAdapterOptions {
  /** Dollars per million tokens. */
  pricing?: { input: number; output: number; cacheRead?: number }
  describe?: (toolName: string, input: unknown) => { kind: ToolKind; title: string; target?: string }
  now?: () => number
}

function parse(json: string | undefined): unknown {
  if (!json) return {}
  try {
    return JSON.parse(json)
  } catch {
    return json
  }
}

export function createOpenAIAdapter(options: OpenAIAdapterOptions = {}) {
  const now = options.now ?? Date.now
  const describe = options.describe ?? describeTool
  const pending = new Map<number, { id: string; name: string; args: string }>()
  let model: string | undefined

  const usageEvent = (prompt: number, cached: number, completion: number): AgentEvent => {
    const p = options.pricing
    const input = Math.max(0, prompt - cached)
    return {
      type: "usage",
      at: now(),
      inputTokens: input,
      cacheReadTokens: cached,
      outputTokens: completion,
      costUsd: p ? (input * p.input + cached * (p.cacheRead ?? p.input) + completion * p.output) / 1_000_000 : undefined,
    }
  }

  const startTool = (id: string, name: string, args: string | undefined): AgentEvent => {
    const input = parse(args)
    return { type: "tool.start", at: now(), id, name, input, ...describe(name, input) }
  }

  function start(meta: { title?: string; totalSteps?: number; model?: string } = {}): AgentEvent {
    model = meta.model ?? model
    return { type: "run.start", at: now(), title: meta.title, totalSteps: meta.totalSteps, model }
  }

  function push(input: ChatCompletionChunk | ResponsesEvent): AgentEvent[] {
    if ("type" in input && typeof input.type === "string") return pushResponses(input as ResponsesEvent)
    return pushChat(input as ChatCompletionChunk)
  }

  function pushChat(chunk: ChatCompletionChunk): AgentEvent[] {
    const out: AgentEvent[] = []
    model = chunk.model ?? model
    for (const choice of chunk.choices ?? []) {
      for (const call of choice.delta?.tool_calls ?? []) {
        const entry = pending.get(call.index) ?? { id: "", name: "", args: "" }
        if (call.id) entry.id = call.id
        if (call.function?.name) entry.name += call.function.name
        if (call.function?.arguments) entry.args += call.function.arguments
        pending.set(call.index, entry)
      }
      if (choice.finish_reason) {
        for (const entry of pending.values()) if (entry.id) out.push(startTool(entry.id, entry.name, entry.args))
        pending.clear()
      }
    }
    if (chunk.usage) {
      const cached = chunk.usage.prompt_tokens_details?.cached_tokens ?? 0
      out.push(usageEvent(chunk.usage.prompt_tokens ?? 0, cached, chunk.usage.completion_tokens ?? 0))
    }
    return out
  }

  function pushResponses(event: ResponsesEvent): AgentEvent[] {
    const item = event.item
    switch (event.type) {
      case "response.created":
        model = event.response?.model ?? model
        return []
      case "response.output_item.added":
        if (item?.type === "web_search_call" && item.id) {
          return [{ type: "tool.start", at: now(), id: item.id, kind: "web", title: "Search the web", name: "web_search" }]
        }
        return []
      case "response.output_item.done":
        if (item?.type === "function_call" && item.call_id && item.name) return [startTool(item.call_id, item.name, item.arguments)]
        if (item?.type === "web_search_call" && item.id) {
          return [{ type: "tool.end", at: now(), id: item.id, status: item.status === "failed" ? "error" : "done" }]
        }
        return []
      case "response.completed": {
        const u = event.response?.usage
        if (!u) return []
        return [usageEvent(u.input_tokens ?? 0, u.input_tokens_details?.cached_tokens ?? 0, u.output_tokens ?? 0)]
      }
      case "response.failed":
        return [{ type: "run.end", at: now(), status: "failed", error: event.response?.error?.message ?? "Response failed" }]
      default:
        return []
    }
  }

  function toolResult(callId: string, result: { output?: string; error?: string }): AgentEvent {
    return { type: "tool.end", at: now(), id: callId, status: result.error ? "error" : "done", output: result.output, error: result.error }
  }

  function end(error?: string): AgentEvent {
    return { type: "run.end", at: now(), status: error ? "failed" : "done", error }
  }

  return { start, push, toolResult, end }
}
