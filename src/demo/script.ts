import type { AgentEvent } from "@/registry/agent-ui/hooks/use-agent-run"

/** One beat of the scripted run: wait `wait` ms, then dispatch. */
export type Beat =
  | { wait: number; event: AgentEvent }
  /** Holds the script until the approval is answered. */
  | { wait: number; gate: string }
  /** Jumps to the label when the gate was denied. */
  | { wait: number; ifDenied: string; goto: string }
  | { wait: number; label: string }

const invoiceDiff = `@@ -38,12 +38,14 @@ export function invoiceTotal(lines: Line[], opts: TotalOpts) {
   const subtotal = lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0)
-  const tax = subtotal * opts.taxRate
-  return Number((subtotal + tax).toFixed(2))
+  const tax = roundHalfUp(subtotal * opts.taxRate, 2)
+  return roundHalfUp(subtotal + tax, 2)
 }

@@ -84,7 +86,7 @@ export function creditNoteTotal(note: CreditNote) {
-  return -Number(Math.abs(note.amount).toFixed(2))
+  return note.amount === 0 ? 0 : -roundHalfUp(Math.abs(note.amount), 2)
 }
`

const roundDiff = `@@ -0,0 +1,12 @@
+/**
+ * Rounds half away from zero at the given precision. toFixed rounds
+ * 1.005 down to 1.00 because 1.005 is stored as 1.00499999...
+ */
+export function roundHalfUp(value: number, digits: number) {
+  const factor = 10 ** digits
+  const shifted = Math.abs(value) * factor
+  const rounded = Math.round(Number(shifted.toPrecision(15)))
+  return (Math.sign(value) * rounded) / factor
+}
`

const testDiff = `@@ -12,6 +12,18 @@ describe("invoiceTotal", () => {
   it("adds tax", () => {
     expect(invoiceTotal([line(10, 1)], { taxRate: 0.2 })).toBe(12)
   })
+
+  it("rounds half-cents up", () => {
+    expect(invoiceTotal([line(1.005, 1)], { taxRate: 0 })).toBe(1.01)
+  })
+
+  it("rounds tax before adding it", () => {
+    expect(invoiceTotal([line(19.99, 3)], { taxRate: 0.0825 })).toBe(64.92)
+  })
 })
`

const reportDiff = `@@ -129,5 +129,5 @@ export function revenueByMonth(invoices: Invoice[]) {
   for (const inv of invoices) {
-    bucket[month(inv)] += Number(inv.total.toFixed(2))
+    bucket[month(inv)] += inv.total
   }
`

const testRunFail = [
  " RUN  v3.2.4 /repo",
  "",
  " ✓ tests/billing/round.test.ts (6 tests) 4ms",
  " ✓ tests/billing/invoice.test.ts (14 tests) 9ms",
  " ❯ tests/billing/credit-note.test.ts (9 tests | 1 failed) 7ms",
  "   × keeps zero credit notes at 0",
  "     → expected -0 to be 0 // Object.is equality",
  "",
  " Test Files  1 failed | 2 passed (3)",
  "      Tests  1 failed | 28 passed (29)",
].join("\n")

const testRunPass = [
  " RUN  v3.2.4 /repo",
  "",
  " ✓ tests/billing/round.test.ts (6 tests) 4ms",
  " ✓ tests/billing/invoice.test.ts (16 tests) 9ms",
  " ✓ tests/billing/credit-note.test.ts (9 tests) 6ms",
  " ✓ tests/reports/revenue.test.ts (17 tests) 21ms",
  "",
  " Test Files  4 passed (4)",
  "      Tests  48 passed (48)",
].join("\n")

const HOUR = 3_600_000

/** A run that fixes a rounding bug. About 32 seconds at 1x. */
export function buildScript(startAt: number): Beat[] {
  const tok = (input: number, output: number, cacheRead: number, cacheWrite = 0): AgentEvent => ({
    type: "usage",
    inputTokens: input,
    outputTokens: output,
    cacheReadTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
    costUsd: (input * 4 + output * 20 + cacheRead * 0.2 + cacheWrite * 5) / 1_000_000,
  })

  return [
    {
      wait: 0,
      event: { type: "run.start", runId: "run_8f2c", title: "Fix rounding in invoice totals", model: "claude-opus-5-5", totalSteps: 6 },
    },
    { wait: 0, event: { type: "limit", used: 61, max: 100, label: "5-hour limit", resetsAt: startAt + 2 * HOUR + 14 * 60_000 } },
    { wait: 0, event: tok(18_400, 0, 0, 24_800) },

    // 1. Read
    { wait: 300, event: { type: "step.start", label: "Reading the billing module", kind: "read" } },
    { wait: 150, event: { type: "tool.start", id: "t1", kind: "read", title: "Read", target: "src/billing/invoice.ts" } },
    { wait: 420, event: { type: "tool.end", id: "t1", output: "142 lines" } },
    { wait: 60, event: { type: "tool.start", id: "t2", kind: "read", title: "Read", target: "src/billing/tax.ts" } },
    { wait: 360, event: { type: "tool.end", id: "t2", output: "58 lines" } },
    { wait: 60, event: { type: "tool.start", id: "t3", kind: "read", title: "Read 10 files", target: "src/billing/**" } },
    { wait: 780, event: { type: "tool.end", id: "t3", output: "src/billing/credit-note.ts\nsrc/billing/currency.ts\nsrc/billing/discount.ts\nsrc/billing/line.ts\nsrc/billing/types.ts\n..." } },
    { wait: 120, event: tok(2_100, 640, 41_000) },
    { wait: 120, event: { type: "step.end", summary: "Read 12 files" } },

    // 2. Search, fan out
    { wait: 80, event: { type: "step.start", label: "Finding call sites", kind: "search" } },
    { wait: 100, event: { type: "tool.start", id: "t4", kind: "search", title: "Search", target: "toFixed\\(2\\)" } },
    {
      wait: 700,
      event: {
        type: "tool.end",
        id: "t4",
        output: "src/billing/invoice.ts:40\nsrc/billing/invoice.ts:87\nsrc/billing/credit-note.ts:17\nsrc/reports/revenue.ts:131",
      },
    },
    { wait: 100, event: { type: "tool.start", id: "t5", kind: "task", title: "Delegate", target: "3 subagents" } },
    { wait: 120, event: { type: "subagent.start", id: "s1", name: "explorer", task: "Trace where invoice totals are reported" } },
    { wait: 90, event: { type: "subagent.start", id: "s2", name: "test-writer", task: "Write failing tests for half-cent totals" } },
    { wait: 90, event: { type: "subagent.start", id: "s3", name: "reviewer", task: "Check other currencies for the same bug" } },
    { wait: 200, event: { type: "subagent.update", id: "s1", activity: "Reading src/reports/revenue.ts", tokens: 8_200 } },
    { wait: 120, event: { type: "subagent.update", id: "s2", activity: "Reading tests/billing/invoice.test.ts", tokens: 5_400 } },
    { wait: 120, event: { type: "subagent.start", id: "s4", parentId: "s2", name: "fixture-builder", task: "Generate invoices with .005 amounts" } },
    { wait: 150, event: { type: "subagent.update", id: "s3", activity: "Searching for Intl.NumberFormat", tokens: 3_900 } },
    { wait: 200, event: { type: "subagent.update", id: "s4", activity: "Writing tests/fixtures/half-cents.json", tokens: 2_100 } },
    { wait: 200, event: tok(6_300, 1_900, 58_000) },
    { wait: 120, event: { type: "tool.end", id: "t5", output: "explorer, test-writer and reviewer started" } },
    { wait: 120, event: { type: "step.end", summary: "Found 4 call sites" } },

    // 3. Edit
    { wait: 80, event: { type: "step.start", label: "Editing src/billing/invoice.ts", kind: "edit" } },
    { wait: 120, event: { type: "tool.start", id: "t6", kind: "edit", title: "Create", target: "src/billing/round.ts" } },
    { wait: 300, event: { type: "subagent.update", id: "s1", activity: "Searching for toFixed(", tokens: 11_600 } },
    { wait: 300, event: { type: "file.change", path: "src/billing/round.ts", additions: 10, deletions: 0, status: "added", diff: roundDiff } },
    { wait: 60, event: { type: "tool.end", id: "t6", output: "+10 lines" } },
    { wait: 80, event: { type: "tool.start", id: "t7", kind: "edit", title: "Edit", target: "src/billing/invoice.ts" } },
    { wait: 300, event: { type: "subagent.end", id: "s4", summary: "12 fixtures, 4 hit the bug" } },
    { wait: 360, event: { type: "file.change", path: "src/billing/invoice.ts", additions: 3, deletions: 3, diff: invoiceDiff } },
    { wait: 60, event: { type: "tool.end", id: "t7", output: "+3 −3" } },
    { wait: 150, event: { type: "subagent.end", id: "s1", summary: "3 report paths round the total twice" } },
    { wait: 100, event: tok(4_800, 3_100, 63_000) },
    { wait: 0, event: { type: "limit", used: 63, max: 100, label: "5-hour limit", resetsAt: startAt + 2 * HOUR + 14 * 60_000 } },
    { wait: 150, event: { type: "step.end", summary: "Edited src/billing/invoice.ts" } },

    // 4. Tests, with an approval
    { wait: 80, event: { type: "step.start", label: "Updating 5 test files", kind: "edit" } },
    { wait: 100, event: { type: "tool.start", id: "t8", kind: "edit", title: "Edit", target: "tests/billing/invoice.test.ts" } },
    { wait: 300, event: { type: "subagent.update", id: "s3", activity: "Reading src/billing/currency.ts", tokens: 7_000 } },
    { wait: 300, event: { type: "file.change", path: "tests/billing/invoice.test.ts", additions: 8, deletions: 0, diff: testDiff } },
    { wait: 60, event: { type: "tool.end", id: "t8", output: "+8 lines" } },
    { wait: 100, event: { type: "subagent.end", id: "s2", summary: "5 test files, 9 new cases" } },
    { wait: 100, event: { type: "file.change", path: "tests/billing/credit-note.test.ts", additions: 14, deletions: 2 } },
    { wait: 80, event: { type: "file.change", path: "tests/reports/revenue.test.ts", additions: 21, deletions: 4 } },
    { wait: 80, event: { type: "file.change", path: "tests/fixtures/half-cents.json", additions: 36, deletions: 0, status: "added" } },
    { wait: 200, event: tok(3_600, 2_400, 66_000) },
    {
      wait: 300,
      event: {
        type: "approval.request",
        id: "a1",
        title: "Agent wants to run a command",
        command: "rm -rf dist && npm run build",
        cwd: "~/acme/billing",
        risk: "high",
        reason: "Stale build output in dist/ shadows the new round.ts in the test run.",
      },
    },
    { wait: 0, gate: "a1" },
    { wait: 200, ifDenied: "a1", goto: "skip-clean" },
    { wait: 0, event: { type: "tool.start", id: "t9", kind: "run", title: "Run", target: "rm -rf dist && npm run build" } },
    { wait: 900, event: { type: "tool.end", id: "t9", output: "vite v7.1.4 building for production...\n✓ 214 modules transformed.\ndist/index.js  48.21 kB │ gzip: 14.02 kB\n✓ built in 812ms" } },
    { wait: 0, label: "skip-clean" },
    { wait: 120, event: { type: "step.end", summary: "Updated 5 test files" } },

    // 5. Test run, fails once, then passes
    { wait: 80, event: { type: "step.start", label: "Running the test suite", kind: "run" } },
    { wait: 100, event: { type: "tool.start", id: "t10", kind: "run", title: "Run", target: "npm test -- billing" } },
    { wait: 500, event: { type: "tool.delta", id: "t10", output: testRunFail.split("\n").slice(0, 4).join("\n") + "\n" } },
    { wait: 500, event: { type: "tool.delta", id: "t10", output: testRunFail.split("\n").slice(4).join("\n") } },
    { wait: 120, event: { type: "tool.end", id: "t10", status: "error", error: "1 failed: credit-note keeps zero credit notes at 0" } },
    { wait: 150, event: { type: "subagent.end", id: "s3", status: "done", summary: "EUR and JPY paths are fine" } },
    { wait: 300, event: { type: "tool.start", id: "t11", kind: "edit", title: "Edit", target: "src/billing/invoice.ts" } },
    { wait: 500, event: { type: "tool.end", id: "t11", output: "Return 0 for zero amounts" } },
    { wait: 60, event: { type: "file.change", path: "src/reports/revenue.ts", additions: 1, deletions: 1, diff: reportDiff } },
    { wait: 200, event: tok(5_200, 2_800, 71_000) },
    { wait: 0, event: { type: "limit", used: 66, max: 100, label: "5-hour limit", resetsAt: startAt + 2 * HOUR + 14 * 60_000 } },
    { wait: 100, event: { type: "tool.start", id: "t12", kind: "run", title: "Run", target: "npm test" } },
    { wait: 600, event: { type: "tool.delta", id: "t12", output: testRunPass.split("\n").slice(0, 5).join("\n") + "\n" } },
    { wait: 600, event: { type: "tool.delta", id: "t12", output: testRunPass.split("\n").slice(5).join("\n") } },
    { wait: 100, event: { type: "tool.end", id: "t12", status: "done" } },
    { wait: 120, event: { type: "step.end", summary: "48 tests pass" } },

    // 6. Wrap up
    { wait: 80, event: { type: "step.start", label: "Writing the summary", kind: "other" } },
    { wait: 900, event: tok(1_900, 1_450, 74_000) },
    { wait: 120, event: { type: "step.end", summary: "Wrote the summary" } },
    { wait: 150, event: { type: "run.end", status: "done" } },
  ]
}
