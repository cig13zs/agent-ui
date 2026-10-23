import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { SubagentTree, type Subagent } from "@/registry/agent-ui/components/subagent-tree"

const nodes: Subagent[] = [
  { id: "a", name: "explorer", status: "done", summary: "3 paths", toolCount: 9, durationMs: 14_000 },
  {
    id: "b",
    name: "test-writer",
    status: "running",
    activity: "Editing invoice.test.ts",
    children: [
      { id: "b1", name: "fixture-builder", status: "done" },
      { id: "b2", name: "snapshot-check", status: "failed", summary: "locked" },
    ],
  },
  { id: "c", name: "reviewer", status: "queued", task: "Review" },
]

describe("SubagentTree", () => {
  it("renders an ARIA tree with levels and a status summary", () => {
    render(<SubagentTree nodes={nodes} />)
    expect(screen.getByRole("tree", { name: "Subagents" })).toBeInTheDocument()
    const items = screen.getAllByRole("treeitem")
    expect(items).toHaveLength(5)
    expect(items[1]).toHaveAttribute("aria-level", "1")
    expect(items[1]).toHaveAttribute("aria-expanded", "true")
    expect(items[2]).toHaveAttribute("aria-level", "2")
    expect(items[1]).toHaveAccessibleName("test-writer, running, Editing invoice.test.ts")
    expect(screen.getByText("5 subagents")).toBeInTheDocument()
    expect(screen.getByText("2 done")).toBeInTheDocument()
    expect(screen.getByText("1 failed")).toBeInTheDocument()
    expect(screen.getByText("9 tools")).toBeInTheDocument()
  })

  it("supports arrow-key navigation and folding", async () => {
    const user = userEvent.setup()
    render(<SubagentTree nodes={nodes} />)
    const items = screen.getAllByRole("treeitem")
    expect(items[0]).toHaveAttribute("tabindex", "0")
    expect(items[1]).toHaveAttribute("tabindex", "-1")
    items[0].focus()
    await user.keyboard("{ArrowDown}")
    expect(items[1]).toHaveFocus()
    await user.keyboard("{ArrowRight}")
    expect(screen.getByRole("treeitem", { name: /fixture-builder/ })).toHaveFocus()
    await user.keyboard("{ArrowLeft}")
    expect(items[1]).toHaveFocus()
    await user.keyboard("{ArrowLeft}")
    expect(items[1]).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByRole("treeitem", { name: /fixture-builder/ })).not.toBeInTheDocument()
    await user.keyboard("{End}")
    expect(screen.getByRole("treeitem", { name: /reviewer/ })).toHaveFocus()
    await user.keyboard("{Home}")
    expect(items[0]).toHaveFocus()
  })

  it("toggles with Enter and starts collapsed when asked", async () => {
    const user = userEvent.setup()
    render(<SubagentTree nodes={nodes} defaultCollapsed={["b"]} showSummary={false} />)
    expect(screen.queryByText(/subagents$/)).not.toBeInTheDocument()
    const parent = screen.getByRole("treeitem", { name: /test-writer/ })
    expect(parent).toHaveAttribute("aria-expanded", "false")
    parent.focus()
    await user.keyboard("{Enter}")
    expect(parent).toHaveAttribute("aria-expanded", "true")
  })
})
