export const eventRows: Array<[string, string]> = [
  ["run.start", "title? model? totalSteps? runId?"],
  ["run.pause / run.resume", ""],
  ["run.end", "status?: done | failed, error?"],
  ["step.start", "label, kind?, id?"],
  ["step.end", "summary?, status?, id?"],
  ["tool.start", "id, title, kind?, target?, name?, input?, subagentId?"],
  ["tool.delta", "id, output (appended)"],
  ["tool.end", "id, status?, output?, error?, summary?"],
  ["approval.request", "id, command?, diff?, risk?, reason?, cwd?, title?"],
  ["approval.resolve", "id, decision: allow-once | allow-always | deny"],
  ["subagent.start", "id, name, task?, parentId?"],
  ["subagent.update", "id, activity?, tokens?"],
  ["subagent.end", "id, status?, summary?"],
  ["usage", "inputTokens? outputTokens? cacheReadTokens? cacheWriteTokens? costUsd? mode?: add | set"],
  ["limit", "used, max, resetsAt?, label?"],
  ["file.change", "path, additions, deletions, status?, diff?"],
]

export const hookSnippet = `import { useEffect } from "react"
import { useAgentRun } from "@/hooks/use-agent-run"
import { AgentRunCard } from "@/components/agent-run-card"
import { ApprovalPrompt } from "@/components/approval-prompt"
import { ToolTimeline } from "@/components/tool-timeline"
import { SubagentTree } from "@/components/subagent-tree"
import { UsageMeter } from "@/components/usage-meter"
import { DiffSummary } from "@/components/diff-summary"

export function RunView({ runId }: { runId: string }) {
  const run = useAgentRun()
  const { dispatch } = run

  useEffect(() => {
    // Any transport works: SSE, a WebSocket, a fetch stream.
    const source = new EventSource(\`/api/runs/\${runId}/events\`)
    source.onmessage = (e) => dispatch(JSON.parse(e.data))
    return () => source.close()
  }, [runId, dispatch])

  const answer = (id: string, decision: string) =>
    fetch(\`/api/runs/\${runId}/approvals/\${id}\`, { method: "POST", body: decision })

  return (
    <>
      <AgentRunCard {...run.card} onStop={() => fetch(\`/api/runs/\${runId}/stop\`, { method: "POST" })}>
        {run.approval && (
          <ApprovalPrompt
            command={run.approval.command}
            diff={run.approval.diff}
            risk={run.approval.risk}
            reason={run.approval.reason}
            onDecision={(d) => answer(run.approval!.id, d)}
          />
        )}
      </AgentRunCard>
      <ToolTimeline items={run.timeline} />
      <SubagentTree nodes={run.subagents} />
      <UsageMeter {...run.usage} />
      <DiffSummary files={run.files} />
    </>
  )
}`

export const aiSdkSnippet = `"use client"
import { useMemo } from "react"
import { useChat } from "@ai-sdk/react"
import { useAgentRun } from "@/hooks/use-agent-run"
import { createAISDKAdapter } from "@/lib/agent-run-ai-sdk"
import { AgentRunCard } from "@/components/agent-run-card"
import { ToolTimeline } from "@/components/tool-timeline"

export function ChatRun() {
  const { messages, status, stop } = useChat()
  const adapter = useMemo(() => createAISDKAdapter({ model: "claude-opus-5-5" }), [])
  // Tool parts become tool.* events, approval-requested parts become
  // approval.* events, and metadata.usage becomes a usage event.
  const events = useMemo(() => adapter.toEvents(messages, status), [adapter, messages, status])
  const run = useAgentRun({ events })

  return (
    <>
      <AgentRunCard {...run.card} onStop={stop} />
      <ToolTimeline items={run.timeline} />
    </>
  )
}`

export const anthropicSnippet = `import Anthropic from "@anthropic-ai/sdk"
import type { AgentEvent } from "@/hooks/use-agent-run"
import { createAnthropicAdapter } from "@/lib/agent-run-anthropic"

const client = new Anthropic()
// Dollars per million tokens, used for the cost in UsageMeter.
const claude = createAnthropicAdapter({ pricing: { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 } })

export async function runAgent(task: string, dispatch: (e: AgentEvent | AgentEvent[]) => void) {
  dispatch(claude.start({ title: task, model: "claude-opus-5-5" }))
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: task }]

  while (true) {
    const stream = client.messages.stream({ model: "claude-opus-5-5", max_tokens: 64000, tools, messages })
    for await (const event of stream) dispatch(claude.push(event))
    const message = await stream.finalMessage()
    messages.push({ role: "assistant", content: message.content })
    if (message.stop_reason !== "tool_use") break

    const results: Anthropic.ToolResultBlockParam[] = []
    for (const block of message.content) {
      if (block.type !== "tool_use") continue
      const output = await runTool(block.name, block.input)
      dispatch(claude.toolResult(block.id, { output }))
      results.push({ type: "tool_result", tool_use_id: block.id, content: output })
    }
    messages.push({ role: "user", content: results })
  }
  dispatch(claude.end())
}`

export const openaiSnippet = `import OpenAI from "openai"
import type { AgentEvent } from "@/hooks/use-agent-run"
import { createOpenAIAdapter } from "@/lib/agent-run-openai"

const client = new OpenAI()
const adapter = createOpenAIAdapter()

export async function runAgent(task: string, dispatch: (e: AgentEvent | AgentEvent[]) => void) {
  dispatch(adapter.start({ title: task, model: MODEL }))

  // Responses API events and Chat Completions chunks both work.
  const stream = await client.responses.create({ model: MODEL, input: task, tools, stream: true })
  for await (const event of stream) dispatch(adapter.push(event))

  // After you run a function call:
  dispatch(adapter.toolResult(callId, { output }))
  dispatch(adapter.end())
}`
