import { describeTool, type AgentEvent, type ToolKind } from "@/registry/agent-ui/hooks/use-agent-run"

/*
 * Raw Claude Messages API stream adapter. Feed it every event from
 * `client.messages.stream(...)` (or the parsed SSE `data:` payloads) and
 * dispatch what it returns. You run the tools yourself, so report each
 * result with `toolResult`.
 *
 *   const claude = createAnthropicAdapter({ pricing: { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 } })
 *   run.dispatch(claude.start({ title: "Fix the invoice rounding bug" }))
 *   for await (const event of stream) run.dispatch(claude.push(event))
 *   run.dispatch(claude.toolResult(id, { output }))
 */

/** The subset of stream events this adapter reads. */
export type AnthropicStreamEvent =
  | {
      type: "message_start"
      message: { id: string; model?: string; usage?: AnthropicUsage }
    }
  | {
      type: "content_block_start"
      index: number
      content_block: { type: string; id?: string; name?: string; input?: unknown; tool_use_id?: string; content?: unknown }
    }
  | { type: "content_block_delta"; index: number; delta: { type: string; partial_json?: string; text?: string } }
  | { type: "content_block_stop"; index: number }
  | { type: "message_delta"; delta: { stop_reason?: string | null }; usage?: AnthropicUsage }
  | { type: "message_stop" }
  | { type: "ping" }
  | { type: "error"; error?: { type?: string; message?: string } }

export interface AnthropicUsage {
  input_tokens?: number | null
  output_tokens?: number | null
  cache_read_input_tokens?: number | null
  cache_creation_input_tokens?: number | null
}

/** Dollars per million tokens. */
export interface Pricing {
  input: number
  output: number
  cacheRead?: number
  cacheWrite?: number
}

export interface AnthropicAdapterOptions {
  pricing?: Pricing
  describe?: (toolName: string, input: unknown) => { kind: ToolKind; title: string; target?: string }
  now?: () => number
}

type Block = { kind: "tool" | "server_tool"; id: string; name: string; json: string; input?: unknown }

export function createAnthropicAdapter(options: AnthropicAdapterOptions = {}) {
  const now = options.now ?? Date.now
  const describe = options.describe ?? describeTool
  const blocks = new Map<number, Block>()
  let model: string | undefined
  let messageOutput = 0

  const cost = (u: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number }) => {
    const p = options.pricing
    if (!p) return undefined
    return (
      ((u.input ?? 0) * p.input +
        (u.output ?? 0) * p.output +
        (u.cacheRead ?? 0) * (p.cacheRead ?? p.input) +
        (u.cacheWrite ?? 0) * (p.cacheWrite ?? p.input)) /
      1_000_000
    )
  }

  function start(meta: { title?: string; totalSteps?: number; model?: string } = {}): AgentEvent {
    model = meta.model ?? model
    return { type: "run.start", at: now(), title: meta.title, totalSteps: meta.totalSteps, model }
  }

  function push(event: AnthropicStreamEvent): AgentEvent[] {
    const at = now()
    switch (event.type) {
      case "message_start": {
        messageOutput = event.message.usage?.output_tokens ?? 0
        model = event.message.model ?? model
        const u = event.message.usage
        if (!u) return []
        const usage = {
          input: u.input_tokens ?? 0,
          cacheRead: u.cache_read_input_tokens ?? 0,
          cacheWrite: u.cache_creation_input_tokens ?? 0,
          output: messageOutput,
        }
        return [
          {
            type: "usage",
            at,
            inputTokens: usage.input,
            cacheReadTokens: usage.cacheRead,
            cacheWriteTokens: usage.cacheWrite,
            outputTokens: usage.output,
            costUsd: cost(usage),
          },
        ]
      }
      case "content_block_start": {
        const b = event.content_block
        if ((b.type === "tool_use" || b.type === "server_tool_use") && b.id && b.name) {
          blocks.set(event.index, { kind: b.type === "tool_use" ? "tool" : "server_tool", id: b.id, name: b.name, json: "" })
          return []
        }
        // Server tool results (web search, web fetch, code execution) close their call.
        if (b.type.endsWith("_tool_result") && b.tool_use_id) {
          const failed =
            typeof b.content === "object" && b.content !== null && !Array.isArray(b.content) && "error_code" in b.content
          return [
            {
              type: "tool.end",
              at,
              id: b.tool_use_id,
              status: failed ? "error" : "done",
              error: failed ? String((b.content as { error_code: unknown }).error_code) : undefined,
            },
          ]
        }
        return []
      }
      case "content_block_delta": {
        const block = blocks.get(event.index)
        if (block && event.delta.type === "input_json_delta") block.json += event.delta.partial_json ?? ""
        return []
      }
      case "content_block_stop": {
        const block = blocks.get(event.index)
        if (!block) return []
        blocks.delete(event.index)
        let input: unknown
        try {
          input = block.json ? JSON.parse(block.json) : {}
        } catch {
          input = block.json
        }
        return [{ type: "tool.start", at, id: block.id, name: block.name, input, ...describe(block.name, input) }]
      }
      case "message_delta": {
        const total = event.usage?.output_tokens ?? messageOutput
        const added = Math.max(0, total - messageOutput)
        messageOutput = total
        return added ? [{ type: "usage", at, outputTokens: added, costUsd: cost({ output: added }) }] : []
      }
      case "error":
        return [{ type: "run.end", at, status: "failed", error: event.error?.message ?? "Stream error" }]
      default:
        return []
    }
  }

  function toolResult(toolUseId: string, result: { output?: string; error?: string }): AgentEvent {
    return {
      type: "tool.end",
      at: now(),
      id: toolUseId,
      status: result.error ? "error" : "done",
      output: result.output,
      error: result.error,
    }
  }

  function end(error?: string): AgentEvent {
    return { type: "run.end", at: now(), status: error ? "failed" : "done", error }
  }

  return { start, push, toolResult, end }
}
