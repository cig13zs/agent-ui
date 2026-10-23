import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { ApprovalPrompt } from "@/registry/agent-ui/components/approval-prompt"

describe("ApprovalPrompt", () => {
  it("shows the command, risk and reason", () => {
    render(<ApprovalPrompt command="rm -rf dist" cwd="~/app" risk="medium" reason="Clears stale output" />)
    const dialog = screen.getByRole("alertdialog", { name: "Agent wants to run a command" })
    expect(dialog).toHaveAttribute("data-risk", "medium")
    expect(dialog).toHaveTextContent("rm -rf dist")
    expect(dialog).toHaveTextContent("~/app")
    expect(screen.getByText("Medium risk")).toBeInTheDocument()
    expect(screen.getByText("Clears stale output")).toBeInTheDocument()
  })

  it("calls onDecision from each button", async () => {
    const onDecision = vi.fn()
    const user = userEvent.setup()
    render(<ApprovalPrompt command="npm test" risk="low" onDecision={onDecision} />)
    await user.click(screen.getByRole("button", { name: /allow once/i }))
    await user.click(screen.getByRole("button", { name: /always allow/i }))
    await user.click(screen.getByRole("button", { name: /deny/i }))
    expect(onDecision.mock.calls.map((c) => c[0])).toEqual(["allow-once", "allow-always", "deny"])
  })

  it("does not offer always-allow for high risk unless asked", () => {
    const { rerender } = render(<ApprovalPrompt command="rm -rf /" risk="high" />)
    expect(screen.queryByRole("button", { name: /always allow/i })).not.toBeInTheDocument()
    rerender(<ApprovalPrompt command="rm -rf /" risk="high" allowAlways />)
    expect(screen.getByRole("button", { name: /always allow/i })).toBeInTheDocument()
  })

  it("answers Y, A, N and Escape while focus is inside", async () => {
    const onDecision = vi.fn()
    const user = userEvent.setup()
    render(<ApprovalPrompt command="npm test" risk="low" onDecision={onDecision} />)
    screen.getByRole("button", { name: /allow once/i }).focus()
    await user.keyboard("y")
    await user.keyboard("a")
    await user.keyboard("n")
    await user.keyboard("{Escape}")
    expect(onDecision.mock.calls.map((c) => c[0])).toEqual(["allow-once", "allow-always", "deny", "deny"])
  })

  it("ignores shortcuts when disabled", async () => {
    const onDecision = vi.fn()
    const user = userEvent.setup()
    render(<ApprovalPrompt command="x" shortcuts={false} onDecision={onDecision} />)
    screen.getByRole("button", { name: /deny/i }).focus()
    await user.keyboard("y")
    expect(onDecision).not.toHaveBeenCalled()
  })

  it("focuses Deny on mount for high risk when autoFocus is set", () => {
    render(<ApprovalPrompt command="rm -rf dist" risk="high" autoFocus />)
    expect(screen.getByRole("button", { name: /deny/i })).toHaveFocus()
  })

  it("renders a diff preview for edits", () => {
    render(<ApprovalPrompt path="src/a.ts" diff={"@@ -1 +1 @@\n-old\n+new\n"} />)
    expect(screen.getByRole("alertdialog", { name: "Agent wants to edit a file" })).toBeInTheDocument()
    expect(screen.getByText("+new")).toHaveClass("bg-emerald-500/10")
    expect(screen.getByText("-old")).toHaveClass("bg-red-500/10")
  })

  it("collapses to a resolved line once decided", () => {
    render(<ApprovalPrompt command="rm -rf dist" decision="deny" />)
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    expect(screen.getByText("Denied")).toBeInTheDocument()
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })
})
