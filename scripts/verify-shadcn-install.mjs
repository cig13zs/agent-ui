// End-to-end install check. Creates a fresh Vite + React + Tailwind v4 app,
// serves public/r from a local static server, runs `shadcn add` for every
// item, then typechecks and builds the app.
//
//   node scripts/verify-shadcn-install.mjs [workdir]
//
// SHADCN_COLORS_DIR=<dir> serves <dir>/r/colors/*.json locally and points the
// CLI's REGISTRY_URL at it, for machines that cannot reach ui.shadcn.com.
import { execFileSync, spawn } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"

const root = new URL("..", import.meta.url).pathname
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
const dir = process.argv[2] ?? mkdtempSync(join(tmpdir(), "agent-ui-install-"))
const colorsDir = process.env.SHADCN_COLORS_DIR
const PROD = "https://cig13zs.github.io/agent-ui/"

const v = (name) => (pkg.devDependencies[name] ?? pkg.dependencies[name]).replace(/^[\^~]/, "")
const write = (path, content) => {
  mkdirSync(join(dir, path, ".."), { recursive: true })
  writeFileSync(join(dir, path), content)
}
const run = (cmd, args, env = {}) => {
  console.log(`$ ${cmd} ${args.join(" ")}`)
  execFileSync(cmd, args, { cwd: dir, stdio: "inherit", env: { ...process.env, ...env } })
}

// The registry server runs in this process, so commands that fetch from it must not block the event loop.
const runAsync = (cmd, args, env = {}) =>
  new Promise((resolve, reject) => {
    console.log(`$ ${cmd} ${args.join(" ")}`)
    const child = spawn(cmd, args, { cwd: dir, stdio: "inherit", env: { ...process.env, ...env } })
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`))))
    child.on("error", reject)
  })

console.log(`fresh app in ${dir}`)
write(
  "package.json",
  JSON.stringify(
    {
      name: "fresh-app",
      private: true,
      type: "module",
      dependencies: { react: v("react"), "react-dom": v("react-dom") },
      devDependencies: {
        "@tailwindcss/vite": v("@tailwindcss/vite"),
        "@types/react": v("@types/react"),
        "@types/react-dom": v("@types/react-dom"),
        "@vitejs/plugin-react": v("@vitejs/plugin-react"),
        tailwindcss: v("tailwindcss"),
        typescript: v("typescript"),
        vite: v("vite"),
      },
    },
    null,
    2,
  ),
)
write(
  "tsconfig.json",
  JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        lib: ["ES2023", "DOM", "DOM.Iterable"],
        module: "ESNext",
        moduleResolution: "bundler",
        jsx: "react-jsx",
        strict: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
        verbatimModuleSyntax: true,
        skipLibCheck: true,
        noEmit: true,
        types: ["vite/client"],
        paths: { "@/*": ["./src/*"] },
      },
      include: ["src"],
    },
    null,
    2,
  ),
)
write(
  "vite.config.ts",
  `import { fileURLToPath } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
})
`,
)
write("index.html", `<!doctype html><html class="dark"><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>`)
write(
  "src/main.tsx",
  `import "./index.css"
import { createRoot } from "react-dom/client"
import { App } from "./App"
createRoot(document.getElementById("root")!).render(<App />)
`,
)
write("src/App.tsx", `export function App() { return null }\n`)
// What \`shadcn init\` writes for a Tailwind v4 project with the neutral base color, trimmed to the tokens agent-ui reads.
write(
  "src/index.css",
  `@import "tailwindcss";

@custom-variant dark (&:is(.dark *));

:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --border: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);
  --primary: oklch(0.922 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --border: oklch(1 0 0 / 10%);
  --ring: oklch(0.556 0 0);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-border: var(--border);
  --color-ring: var(--ring);
}
`,
)
write(
  "components.json",
  JSON.stringify(
    {
      $schema: "https://ui.shadcn.com/schema.json",
      style: "new-york",
      rsc: false,
      tsx: true,
      tailwind: { config: "", css: "src/index.css", baseColor: "neutral", cssVariables: true, prefix: "" },
      aliases: { components: "@/components", utils: "@/lib/utils", ui: "@/components/ui", lib: "@/lib", hooks: "@/hooks" },
      iconLibrary: "lucide",
    },
    null,
    2,
  ),
)

run("npm", ["install", "--no-audit", "--no-fund", "--silent"])

const server = createServer((req, res) => {
  const url = new URL(req.url, "http://localhost")
  const send = (file, rewrite) => {
    try {
      let body = readFileSync(file, "utf8")
      if (rewrite) body = body.replaceAll(PROD, `http://localhost:${port}/agent-ui/`)
      res.writeHead(200, { "content-type": "application/json" }).end(body)
    } catch {
      res.writeHead(404).end()
    }
  }
  if (url.pathname.startsWith("/agent-ui/r/")) send(join(root, "public", url.pathname.slice("/agent-ui/".length)), true)
  else if (colorsDir && url.pathname.startsWith("/r/colors/")) send(join(colorsDir, url.pathname))
  else res.writeHead(404).end()
})
await new Promise((r) => server.listen(0, r))
const port = server.address().port

let failed = false
try {
  const items = readdirSync(join(root, "public/r"))
    .filter((f) => f !== "registry.json")
    .map((f) => `http://localhost:${port}/agent-ui/r/${f}`)
  const env = colorsDir ? { REGISTRY_URL: `http://localhost:${port}/r` } : {}
  const shadcn = join(root, "node_modules/.bin/shadcn")
  await runAsync(shadcn, ["add", ...items, "--yes", "--overwrite"], env)

  const expected = [
    "src/components/agent-run-card.tsx",
    "src/components/tool-timeline.tsx",
    "src/components/approval-prompt.tsx",
    "src/components/subagent-tree.tsx",
    "src/components/usage-meter.tsx",
    "src/components/diff-summary.tsx",
    "src/hooks/use-agent-run.ts",
    "src/lib/agent-run-ai-sdk.ts",
    "src/lib/agent-run-anthropic.ts",
    "src/lib/agent-run-openai.ts",
  ]
  for (const f of expected) if (!existsSync(join(dir, f))) throw new Error(`shadcn add did not write ${f}`)
  const adapter = readFileSync(join(dir, "src/lib/agent-run-anthropic.ts"), "utf8")
  if (!adapter.includes(`from "@/hooks/use-agent-run"`)) throw new Error("adapter import was not rewritten to the hooks alias")

  write(
    "src/App.tsx",
    `import { AgentRunCard } from "@/components/agent-run-card"
import { ApprovalPrompt } from "@/components/approval-prompt"
import { DiffSummary } from "@/components/diff-summary"
import { SubagentTree } from "@/components/subagent-tree"
import { ToolTimeline } from "@/components/tool-timeline"
import { UsageMeter } from "@/components/usage-meter"
import { useAgentRun } from "@/hooks/use-agent-run"
import { createAISDKAdapter } from "@/lib/agent-run-ai-sdk"
import { createAnthropicAdapter } from "@/lib/agent-run-anthropic"
import { createOpenAIAdapter } from "@/lib/agent-run-openai"

export const adapters = [createAISDKAdapter(), createAnthropicAdapter(), createOpenAIAdapter()]

export function App() {
  const run = useAgentRun()
  return (
    <div className="flex flex-col gap-4 p-8">
      <AgentRunCard {...run.card} onStop={() => run.dispatch({ type: "run.end", status: "failed" })}>
        {run.approval && <ApprovalPrompt command={run.approval.command} risk={run.approval.risk} />}
      </AgentRunCard>
      <ToolTimeline items={run.timeline} />
      <SubagentTree nodes={run.subagents} />
      <UsageMeter {...run.usage} variant="compact" />
      <DiffSummary files={run.files} />
    </div>
  )
}
`,
  )
  run("npx", ["tsc", "-p", "."])
  run("npx", ["vite", "build", "--logLevel", "warn"])
  const css = readdirSync(join(dir, "dist/assets")).filter((f) => f.endsWith(".css"))
  const built = css.map((f) => readFileSync(join(dir, "dist/assets", f), "utf8")).join("\n")
  for (const k of ["agent-ui-in", "agent-ui-shimmer", "agent-ui-fill", "agent-ui-indeterminate"]) {
    if (!built.includes(`@keyframes ${k}`)) throw new Error(`keyframes ${k} missing from the built CSS`)
  }
  console.log(`\ninstall ok: ${items.length} items added, typechecked and built in ${dir}`)
} catch (err) {
  failed = true
  console.error(`\ninstall check failed: ${err.message}`)
} finally {
  server.close()
}
process.exit(failed ? 1 : 0)
