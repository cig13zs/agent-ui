import { describe, expect, it } from "vitest"
import { initialAgentRunState, reduceAgentRun, selectCard, type AgentEvent } from "@/registry/agent-ui/hooks/use-agent-run"
import { createAISDKAdapter, type AISDKMessage } from "@/registry/agent-ui/lib/agent-run-ai-sdk"
import { createAnthropicAdapter, type AnthropicStreamEvent } from "@/registry/agent-ui/lib/agent-run-anthropic"
import { createOpenAIAdapter } from "@/registry/agent-ui/lib/agent-run-openai"

const clock = () => {
  let t = 0
  return () => (t += 10)
}
const reduce = (events: AgentEvent[]) => events.reduce(reduceAgentRun, initialAgentRunState)

describe("Claude stream adapter", () => {
  it("turns a tool_use block into tool.start with a parsed input and tracks usage", () => {
    const claude = createAnthropicAdapter({ now: clock(), pricing: { input: 4, output: 20, cacheRead: 0.2 } })
    const stream: AnthropicStreamEvent[] = [
      {
        type: "message_start",
        message: { id: "msg_1", model: "claude-opus-5-5", usage: { input_tokens: 1000, cache_read_input_tokens: 9000, output_tokens: 1 } },
      },
      { type: "content_block_start", index: 0, content_block: { type: "text" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Let me look." } },
      { type: "content_block_stop", index: 0 },
      { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "toolu_1", name: "bash", input: {} } },
      { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"comm' } },
      { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: 'and":"npm test"}' } },
      { type: "content_block_stop", index: 1 },
      { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 51 } },
      { type: "message_stop" },
    ]
    const events = [claude.start({ title: "t" }), ...stream.flatMap((e) => claude.push(e))]
    events.push(claude.toolResult("toolu_1", { output: "48 passed" }))
    const state = reduce(events)
    expect(state.tools).toHaveLength(1)
    expect(state.tools[0]).toMatchObject({ id: "toolu_1", kind: "run", title: "Run", target: "npm test", status: "done", output: "48 passed" })
    expect(state.tools[0].input).toEqual({ command: "npm test" })
    expect(state.usage.inputTokens).toBe(1000)
    expect(state.usage.cacheReadTokens).toBe(9000)
    expect(state.usage.outputTokens).toBe(51)
    expect(state.usage.costUsd).toBeCloseTo((1000 * 4 + 9000 * 0.2 + 51 * 20) / 1e6, 10)
  })

  it("closes server tool calls from their result blocks", () => {
    const claude = createAnthropicAdapter({ now: clock() })
    const events = [
      { type: "content_block_start", index: 0, content_block: { type: "server_tool_use", id: "srv_1", name: "web_search" } },
      { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"query":"toFixed rounding"}' } },
      { type: "content_block_stop", index: 0 },
      { type: "content_block_start", index: 1, content_block: { type: "web_search_tool_result", tool_use_id: "srv_1", content: [] } },
    ].flatMap((e) => claude.push(e as AnthropicStreamEvent))
    const state = reduce(events)
    expect(state.tools[0]).toMatchObject({ kind: "web", target: "toFixed rounding", status: "done" })
  })

  it("maps a stream error to a failed run", () => {
    const claude = createAnthropicAdapter({ now: clock() })
    const state = reduce([claude.start(), ...claude.push({ type: "error", error: { message: "overloaded" } })])
    expect(state.status).toBe("failed")
    expect(state.error).toBe("overloaded")
  })
})

describe("OpenAI stream adapter", () => {
  it("assembles Chat Completions tool call deltas", () => {
    const openai = createOpenAIAdapter({ now: clock() })
    const chunks = [
      { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "read_file", arguments: '{"pa' } }] } }] },
      { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: 'th":"a.ts"}' } }] } }] },
      { choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] },
      { choices: [], usage: { prompt_tokens: 500, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 400 } } },
    ]
    const state = reduce([openai.start(), ...chunks.flatMap((c) => openai.push(c))])
    expect(state.tools[0]).toMatchObject({ id: "call_1", kind: "read", target: "a.ts", status: "running" })
    expect(state.usage).toMatchObject({ inputTokens: 100, cacheReadTokens: 400, outputTokens: 20 })
  })

  it("reads Responses API function calls and web search", () => {
    const openai = createOpenAIAdapter({ now: clock() })
    const events = [
      { type: "response.output_item.added", item: { type: "web_search_call", id: "ws_1" } },
      { type: "response.output_item.done", item: { type: "web_search_call", id: "ws_1", status: "completed" } },
      { type: "response.output_item.done", item: { type: "function_call", call_id: "c1", name: "run_shell", arguments: '{"cmd":"ls"}' } },
      { type: "response.completed", response: { usage: { input_tokens: 10, output_tokens: 5 } } },
    ].flatMap((e) => openai.push(e))
    events.push(openai.toolResult("c1", { error: "permission denied" }))
    const state = reduce(events)
    expect(state.tools.map((t) => [t.kind, t.status])).toEqual([
      ["web", "done"],
      ["run", "error"],
    ])
    expect(state.tools[1].target).toBe("ls")
    expect(state.usage.outputTokens).toBe(5)
  })
})

describe("AI SDK adapter", () => {
  const messages: AISDKMessage[] = [
    { id: "u1", role: "user", parts: [{ type: "text", text: "Fix the rounding bug\nmore detail" }] },
    {
      id: "a1",
      role: "assistant",
      metadata: { usage: { inputTokens: 1200, outputTokens: 80, cachedInputTokens: 1000 } },
      parts: [
        { type: "step-start" },
        { type: "tool-readFile", toolCallId: "c1", state: "output-available", input: { path: "src/a.ts" }, output: { lines: 3 } },
        { type: "tool-runCommand", toolCallId: "c2", state: "output-error", input: { command: "npm test" }, errorText: "exit 1" },
        {
          type: "dynamic-tool",
          toolName: "deleteFiles",
          toolCallId: "c3",
          state: "approval-requested",
          input: { path: "dist" },
          approval: { id: "ap1" },
        },
      ],
    },
  ]

  it("maps tool parts, approvals and usage", () => {
    const adapter = createAISDKAdapter({ now: clock(), risk: () => "high" })
    const state = reduce(adapter.toEvents(messages, "streaming"))
    expect(state.title).toBe("Fix the rounding bug")
    expect(state.tools.map((t) => [t.id, t.kind, t.status])).toEqual([
      ["c1", "read", "done"],
      ["c2", "run", "error"],
      ["c3", "edit", "running"],
    ])
    expect(state.tools[0].output).toContain('"lines": 3')
    expect(state.status).toBe("waiting-approval")
    expect(state.approvals[0]).toMatchObject({ id: "ap1", risk: "high", toolId: "c3" })
    expect(state.usage).toMatchObject({ inputTokens: 200, cacheReadTokens: 1000, outputTokens: 80 })
  })

  it("keeps first-seen times stable across calls and ends on ready", () => {
    const adapter = createAISDKAdapter({ now: clock() })
    const first = reduce(adapter.toEvents(messages, "streaming"))
    const second = reduce(adapter.toEvents(messages, "ready"))
    expect(second.tools[0].startedAt).toBe(first.tools[0].startedAt)
    expect(second.status).toBe("done")
    expect(selectCard(second).endedAt).toBeDefined()
  })

  it("returns nothing for an empty conversation", () => {
    expect(createAISDKAdapter().toEvents([])).toEqual([])
  })
})
