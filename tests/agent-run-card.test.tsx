import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AgentRunCard, formatElapsed, formatStepDuration, type AgentRunStatus } from "@/registry/agent-ui/components/agent-run-card"

const steps = [
  { id: "1", label: "Read 12 files", kind: "read" as const, durationMs: 1900 },
  { id: "2", label: "Found 4 call sites", kind: "search" as const, durationMs: 1500 },
  { id: "3", label: "Edited src/billing/invoice.ts", kind: "edit" as const, durationMs: 2500 },
]

afterEach(() => vi.useRealTimers())

describe("AgentRunCard", () => {
  it.each<[AgentRunStatus, string]>([
    ["running", "Running"],
    ["paused", "Paused"],
    ["waiting-approval", "Needs approval"],
    ["done", "Done"],
    ["failed", "Failed"],
    ["idle", "Queued"],
  ])("announces the %s state", (status, label) => {
    render(<AgentRunCard status={status} currentStep="Updating 5 test files" />)
    expect(screen.getByRole("status")).toHaveTextContent(`${label}: Updating 5 test files`)
    expect(screen.getByRole("region")).toHaveAttribute("data-status", status)
  })

  it("renders the segmented progress and completed steps with durations", () => {
    render(<AgentRunCard status="running" currentStep="Updating" step={4} totalSteps={6} steps={steps} model="claude-opus-5-5" />)
    const bar = screen.getByRole("progressbar", { name: "Run progress" })
    expect(bar).toHaveAttribute("aria-valuetext", "Step 4 of 6")
    expect(bar).toHaveAttribute("aria-valuenow", "3")
    expect(bar.children).toHaveLength(6)
    const list = screen.getByRole("list", { name: "Completed steps" })
    expect(list).toHaveTextContent("Read 12 files")
    expect(list).toHaveTextContent("1.9s")
    expect(screen.getByText("claude-opus-5-5")).toBeInTheDocument()
  })

  it("folds older steps past maxSteps", () => {
    render(<AgentRunCard status="running" steps={steps} maxSteps={2} />)
    expect(screen.getByText("1 earlier step")).toBeInTheDocument()
    expect(screen.queryByText("Read 12 files")).not.toBeInTheDocument()
  })

  it("ticks the elapsed timer while running and stops when endedAt is set", () => {
    vi.useFakeTimers()
    const start = Date.now()
    const { rerender } = render(<AgentRunCard status="running" startedAt={start - 71_000} />)
    expect(screen.getByText("1m 11s")).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(2000))
    expect(screen.getByText("1m 13s")).toBeInTheDocument()
    rerender(<AgentRunCard status="paused" startedAt={start - 71_000} endedAt={start} />)
    act(() => vi.advanceTimersByTime(5000))
    expect(screen.getByText("1m 11s")).toBeInTheDocument()
  })

  it("calls the control handlers and swaps pause for resume", async () => {
    const onPause = vi.fn()
    const onResume = vi.fn()
    const onStop = vi.fn()
    const onOpen = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(<AgentRunCard status="running" onPause={onPause} onResume={onResume} onStop={onStop} onOpen={onOpen} />)
    await user.click(screen.getByRole("button", { name: /pause/i }))
    await user.click(screen.getByRole("button", { name: /stop/i }))
    await user.click(screen.getByRole("button", { name: /open run/i }))
    expect(onPause).toHaveBeenCalledOnce()
    expect(onStop).toHaveBeenCalledOnce()
    expect(onOpen).toHaveBeenCalledOnce()
    rerender(<AgentRunCard status="paused" onPause={onPause} onResume={onResume} onStop={onStop} />)
    expect(screen.queryByRole("button", { name: /pause/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /resume/i }))
    expect(onResume).toHaveBeenCalledOnce()
  })

  it("hides pause and stop once finished, and shows the error on failure", () => {
    const { rerender } = render(<AgentRunCard status="done" title="Fix rounding" onPause={() => {}} onStop={() => {}} openHref="/runs/1" />)
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: /open run/i })).toHaveAttribute("href", "/runs/1")
    rerender(<AgentRunCard status="failed" error="npm test exited with 1" />)
    expect(screen.getByText("npm test exited with 1")).toBeInTheDocument()
  })

  it("renders children, for an embedded approval", () => {
    render(
      <AgentRunCard status="waiting-approval">
        <p>approve me</p>
      </AgentRunCard>,
    )
    expect(screen.getByText("approve me")).toBeInTheDocument()
  })
})

describe("formatting", () => {
  it("formats elapsed and step durations", () => {
    expect(formatElapsed(9_400)).toBe("9s")
    expect(formatElapsed(72_000)).toBe("1m 12s")
    expect(formatElapsed(3_723_000)).toBe("1h 02m")
    expect(formatStepDuration(420)).toBe("420ms")
    expect(formatStepDuration(1_940)).toBe("1.9s")
  })
})
