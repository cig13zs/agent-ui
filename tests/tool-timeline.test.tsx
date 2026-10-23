import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ToolTimeline, type ToolCall } from "@/registry/agent-ui/components/tool-timeline"

afterEach(() => vi.useRealTimers())

const items: ToolCall[] = [
  { id: "1", kind: "read", title: "Read", target: "src/a.ts", status: "done", durationMs: 420, output: "142 lines" },
  { id: "2", kind: "search", title: "Search", target: "toFixed", status: "done", durationMs: 1500 },
  { id: "3", kind: "run", title: "Run", target: "npm test", status: "error", durationMs: 2000, error: "1 failed", output: "× zero" },
]

describe("ToolTimeline", () => {
  it("lists every call with its target and duration", () => {
    render(<ToolTimeline items={items} />)
    const list = screen.getByRole("list", { name: "Tool calls" })
    const rows = within(list).getAllByRole("listitem")
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent("Read:Readsrc/a.ts")
    expect(rows[0]).toHaveTextContent("420ms")
    expect(rows[1]).toHaveTextContent("1.5s")
  })

  it("expands a row with output on click and keyboard", async () => {
    const user = userEvent.setup()
    render(<ToolTimeline items={items} />)
    const toggle = screen.getAllByRole("button")[0]
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByText("142 lines")).not.toBeVisible()
    await user.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText("142 lines")).toBeVisible()
    toggle.focus()
    await user.keyboard("{Enter}")
    expect(toggle).toHaveAttribute("aria-expanded", "false")
  })

  it("does not make rows without details interactive", () => {
    render(<ToolTimeline items={[items[1]]} />)
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  it("opens failed calls by default and shows the error", () => {
    render(<ToolTimeline items={items} />)
    const errorToggle = screen.getAllByRole("button")[1]
    expect(errorToggle).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText("1 failed")).toBeVisible()
    expect(screen.getByLabelText("Error")).toBeInTheDocument()
  })

  it("can leave failed calls closed", () => {
    render(<ToolTimeline items={items} expandErrors={false} />)
    expect(screen.getAllByRole("button")[1]).toHaveAttribute("aria-expanded", "false")
  })

  it("shows a live duration for a running call", () => {
    vi.useFakeTimers()
    render(<ToolTimeline items={[{ id: "r", kind: "run", title: "Run", status: "running", startedAt: Date.now() - 1000 }]} />)
    expect(screen.getByText("1.0s")).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(500))
    expect(screen.getByText("1.5s")).toBeInTheDocument()
    expect(screen.getByText("Running")).toHaveClass("sr-only")
  })
})
