import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { DiffSummary, parseUnifiedDiff, type FileChange } from "@/registry/agent-ui/components/diff-summary"

const diff = `--- a/src/a.ts
+++ b/src/a.ts
@@ -10,3 +10,3 @@ fn
 keep
-old line
+new line
 tail
`

const files: FileChange[] = [
  { path: "src/billing/a.ts", additions: 1, deletions: 1, diff },
  { path: "src/new.ts", additions: 10, deletions: 0, status: "added" },
  { path: "old.ts", additions: 0, deletions: 31, status: "deleted" },
]

describe("DiffSummary", () => {
  it("totals the changes and labels each file", () => {
    render(<DiffSummary files={files} />)
    const section = screen.getByRole("region", { name: "Changes" })
    expect(section).toHaveTextContent("3 files")
    expect(section).toHaveTextContent("+11")
    expect(section).toHaveTextContent("−32")
    expect(screen.getByText("Added")).toHaveClass("sr-only")
    expect(screen.getByText("Deleted")).toHaveClass("sr-only")
    expect(screen.getByText("a.ts")).toBeInTheDocument()
    expect(screen.getByText("src/billing/")).toBeInTheDocument()
  })

  it("only rows with a diff expand, and expanding shows numbered lines", async () => {
    const user = userEvent.setup()
    render(<DiffSummary files={files} />)
    const buttons = screen.getAllByRole("button")
    expect(buttons).toHaveLength(1)
    expect(buttons[0]).toHaveAttribute("aria-expanded", "false")
    await user.click(buttons[0])
    expect(buttons[0]).toHaveAttribute("aria-expanded", "true")
    const region = screen.getByRole("region", { name: "Diff" })
    expect(region).toHaveTextContent("new line")
    expect(region).toHaveTextContent("@@ -10,3 +10,3 @@ fn")
  })

  it("respects defaultExpanded", () => {
    render(<DiffSummary files={files} defaultExpanded={["src/billing/a.ts"]} />)
    expect(screen.getByRole("region", { name: "Diff" })).toBeInTheDocument()
  })
})

describe("parseUnifiedDiff", () => {
  it("numbers old and new lines from the hunk header", () => {
    const lines = parseUnifiedDiff(diff)
    expect(lines.map((l) => [l.kind, l.oldNo, l.newNo])).toEqual([
      ["hunk", undefined, undefined],
      ["ctx", 10, 10],
      ["del", 11, undefined],
      ["add", undefined, 11],
      ["ctx", 12, 12],
    ])
  })
})
