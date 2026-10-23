import { act, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { formatCost, formatCountdown, formatTokens, UsageMeter } from "@/registry/agent-ui/components/usage-meter"

afterEach(() => vi.useRealTimers())

const usage = { inputTokens: 42_300, outputTokens: 12_290, cacheReadTokens: 373_000, cacheWriteTokens: 24_800, costUsd: 0.61 }

describe("UsageMeter", () => {
  it("expanded: shows cost, breakdown, cache share and the limit meter", () => {
    render(<UsageMeter {...usage} limit={{ used: 66, max: 100, label: "5-hour limit" }} />)
    expect(screen.getByRole("region", { name: "Usage" })).toBeInTheDocument()
    expect(screen.getByLabelText("Cost $0.61")).toBeInTheDocument()
    expect(screen.getByText("452k")).toBeInTheDocument()
    expect(screen.getByText("85%")).toBeInTheDocument()
    expect(screen.getByText("373k")).toBeInTheDocument()
    const meter = screen.getByRole("meter", { name: "5-hour limit" })
    expect(meter).toHaveAttribute("aria-valuenow", "66")
  })

  it("compact: one line with percent, tokens and cost", () => {
    render(<UsageMeter variant="compact" {...usage} limit={{ used: 93, max: 100 }} />)
    const group = screen.getByRole("group", { name: "Usage" })
    expect(group).toHaveTextContent("93%")
    expect(group).toHaveTextContent("452k tok")
    expect(group).toHaveTextContent("$0.61")
    expect(screen.getByText("93%")).toHaveClass("text-red-600")
  })

  it("counts down to the reset", () => {
    vi.useFakeTimers()
    render(<UsageMeter variant="compact" {...usage} limit={{ used: 10, max: 100, resetsAt: Date.now() + 65_000 }} />)
    expect(screen.getByText("1m 05s")).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(10_000))
    expect(screen.getByText("55s")).toBeInTheDocument()
  })

  it("omits the limit section without a limit", () => {
    render(<UsageMeter inputTokens={10} outputTokens={5} />)
    expect(screen.queryByRole("meter")).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^Cost/)).not.toBeInTheDocument()
  })
})

describe("formatters", () => {
  it("formats tokens, cost and countdowns", () => {
    expect(formatTokens(950)).toBe("950")
    expect(formatTokens(1_250)).toBe("1.3k")
    expect(formatTokens(42_300)).toBe("42k")
    expect(formatTokens(1_240_000)).toBe("1.24M")
    expect(formatCost(0.004)).toBe("<$0.01")
    expect(formatCost(3.4)).toBe("$3.40")
    expect(formatCountdown(2 * 3_600_000 + 14 * 60_000)).toBe("2h 14m")
  })
})
