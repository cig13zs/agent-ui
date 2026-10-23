import * as React from "react"
import { ArrowDown, Moon, Sun } from "lucide-react"
import { CodeBlock, CopyButton, InstallCommand } from "./code"
import { Gallery, Tabs } from "./gallery"
import { RunConsole } from "./run-console"
import { aiSdkSnippet, anthropicSnippet, eventRows, hookSnippet, openaiSnippet } from "./snippets"

const REPO = "https://github.com/cig13zs/agent-ui"
const KOFI = "https://ko-fi.com/jju1s"

function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={className} fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}

function Logo() {
  return (
    <a href="#top" className="inline-flex items-center gap-2 rounded-md font-mono text-sm font-medium tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span aria-hidden className="relative flex size-5 items-center justify-center rounded-[5px] bg-foreground">
        <span className="size-1.5 rounded-full bg-brand" />
      </span>
      agent-ui
    </a>
  )
}

function useTheme() {
  const [dark, setDark] = React.useState(() => document.documentElement.classList.contains("dark"))
  React.useEffect(() => {
    document.documentElement.classList.toggle("dark", dark)
    try {
      localStorage.setItem("agent-ui-theme", dark ? "dark" : "light")
    } catch {
      /* storage can be blocked; the toggle still works for this visit */
    }
  }, [dark])
  return [dark, setDark] as const
}

const navLink =
  "rounded-md px-2 py-1 text-[13px] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"

function Nav({ dark, setDark }: { dark: boolean; setDark: (d: boolean) => void }) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <nav aria-label="Main" className="mx-auto flex h-14 max-w-6xl items-center gap-1 px-4 sm:px-6">
        <Logo />
        <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
          <a href="#components" className={`${navLink} hidden sm:inline`}>
            Components
          </a>
          <a href="#events" className={`${navLink} hidden sm:inline`}>
            Events
          </a>
          <a href="#adapters" className={`${navLink} hidden sm:inline`}>
            Adapters
          </a>
          <a href={REPO} className={`${navLink} inline-flex items-center gap-1.5`}>
            <GitHubMark className="size-4" />
            <span className="hidden md:inline">GitHub</span>
          </a>
          <button
            type="button"
            onClick={() => setDark(!dark)}
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {dark ? <Sun aria-hidden className="size-4" /> : <Moon aria-hidden className="size-4" />}
          </button>
        </div>
      </nav>
    </header>
  )
}

function Hero() {
  return (
    <section id="top" className="mx-auto max-w-6xl px-4 pt-14 pb-10 sm:px-6 sm:pt-20">
      <div className="grid gap-10 lg:grid-cols-12 lg:items-end">
        <div className="min-w-0 lg:col-span-7">
          <p className="font-mono text-xs text-muted-foreground">React · Tailwind v4 · shadcn registry · MIT</p>
          <h1 className="mt-4 text-[2.6rem] leading-[1.02] font-semibold tracking-[-0.035em] text-balance sm:text-6xl">
            Show the run,
            <br />
            not just the chat.
          </h1>
          <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-muted-foreground text-pretty">
            Six components for the part of an agent app people sit and watch: the current step, the tool calls, the approvals, the
            subagents, the bill and the diff. Copy them into your project with the shadcn CLI and own the code.
          </p>
        </div>
        <div className="flex min-w-0 flex-col gap-3 lg:col-span-5">
          <InstallCommand name="agent-ui" />
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="#components"
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground outline-none transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Browse components <ArrowDown aria-hidden className="size-3.5" />
            </a>
            <a
              href={REPO}
              className="inline-flex h-9 items-center gap-2 rounded-lg border px-4 text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            >
              <GitHubMark className="size-4" /> Source
            </a>
          </div>
          <p className="text-xs text-muted-foreground">Needs react and lucide-react. Nothing else at runtime.</p>
        </div>
      </div>
    </section>
  )
}

function SectionHeading({ id, kicker, title, children }: { id: string; kicker: string; title: string; children?: React.ReactNode }) {
  return (
    <div id={id} className="scroll-mt-20">
      <p className="font-mono text-xs text-muted-foreground">{kicker}</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">{title}</h2>
      {children && <div className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">{children}</div>}
    </div>
  )
}

function Events() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <SectionHeading id="events" kicker="useAgentRun" title="One event stream drives all six.">
        <p>
          Push small JSON events into <code className="font-mono text-foreground">useAgentRun</code> and spread what comes out onto the
          components. The reducer is a pure function, so the same events can be stored, replayed or reduced on a server.
        </p>
      </SectionHeading>
      <div className="mt-10 grid gap-6 lg:grid-cols-12">
        <div className="min-w-0 overflow-hidden rounded-xl border lg:col-span-6">
          <table className="w-full text-left text-[13px]">
            <caption className="sr-only">Event types</caption>
            <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  type
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  fields
                </th>
              </tr>
            </thead>
            <tbody>
              {eventRows.map(([type, fields]) => (
                <tr key={type} className="border-b last:border-0">
                  <td className="px-4 py-2 align-top font-mono text-xs whitespace-nowrap text-foreground">{type}</td>
                  <td className="px-4 py-2 align-top font-mono text-xs text-muted-foreground">{fields}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
            Every event takes an optional <code className="font-mono">at</code> (epoch ms). Missing times are stamped on arrival.
          </p>
        </div>
        <CodeBlock code={hookSnippet} title="run-view.tsx" className="min-w-0 lg:col-span-6" maxHeight="40rem" />
      </div>
    </section>
  )
}

function Adapters() {
  const [tab, setTab] = React.useState(0)
  const snippets = [
    { label: "Vercel AI SDK", file: "chat-run.tsx", code: aiSdkSnippet, item: "agent-run-ai-sdk" },
    { label: "Claude stream", file: "claude-run.ts", code: anthropicSnippet, item: "agent-run-anthropic" },
    { label: "OpenAI stream", file: "openai-run.ts", code: openaiSnippet, item: "agent-run-openai" },
  ]
  const s = snippets[tab]
  return (
    <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
      <SectionHeading id="adapters" kicker="Adapters" title="Already streaming tool calls? Translate them.">
        <p>
          Three small files that turn what your model client already gives you into agent-ui events. They use structural types, so none
          of them import an SDK.
        </p>
      </SectionHeading>
      <div className="mt-8 flex flex-col gap-3">
        <Tabs label="Adapter" items={snippets.map((x) => x.label)} value={tab} onChange={setTab} />
        <InstallCommand name={s.item} />
        <CodeBlock code={s.code} title={s.file} maxHeight="34rem" />
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 sm:flex-row sm:items-center sm:px-6">
        <div className="max-w-md">
          <Logo />
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Free and MIT licensed, with no paid tier. If it saved you an afternoon, a coffee keeps it maintained.
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Made by{" "}
            <a href="https://github.com/cig13zs" className="underline underline-offset-4 hover:text-foreground">
              jju1s
            </a>
            . Icons by{" "}
            <a href="https://lucide.dev" className="underline underline-offset-4 hover:text-foreground">
              Lucide
            </a>
            . Install flow by{" "}
            <a href="https://ui.shadcn.com" className="underline underline-offset-4 hover:text-foreground">
              shadcn/ui
            </a>
            .
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:ml-auto sm:items-end">
          <a
            href={KOFI}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#FF5E5B] px-4 text-sm font-semibold text-white outline-none transition-[filter] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <svg viewBox="0 0 24 24" aria-hidden className="size-4" fill="currentColor">
              <path d="M23.881 8.948c-.773-4.085-4.859-4.593-4.859-4.593H.723c-.604 0-.679.798-.679.798s-.082 7.324-.022 11.822c.164 2.424 2.586 2.672 2.586 2.672s8.267-.023 11.966-.049c2.438-.426 2.683-2.566 2.658-3.734 4.352.24 7.422-2.831 6.649-6.916zm-11.062 3.511c-1.246 1.453-4.011 3.976-4.011 3.976s-.121.119-.31.023c-.076-.057-.108-.09-.108-.09-.443-.441-3.368-3.049-4.034-3.954-.709-.965-1.041-2.7-.091-3.71.951-1.01 3.005-1.086 4.363.407 0 0 1.565-1.782 3.468-.963 1.904.82 1.832 3.011.723 4.311zm6.173.478c-.928.116-1.682.028-1.682.028V7.284h1.77s1.971.551 1.971 2.638c0 1.913-.985 2.667-2.059 3.015z" />
            </svg>
            Support on Ko-fi
          </a>
          <span className="font-mono text-xs text-muted-foreground">ko-fi.com/jju1s</span>
        </div>
      </div>
    </footer>
  )
}

export function Landing() {
  const [dark, setDark] = useTheme()
  return (
    <>
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-card px-3 py-2 text-sm focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>
      <Nav dark={dark} setDark={setDark} />
      <main id="main">
        <Hero />
        <div className="mx-auto max-w-6xl px-2 sm:px-6">
          <RunConsole />
        </div>
        <section className="mx-auto max-w-6xl px-4 pt-24 sm:px-6">
          <SectionHeading id="components" kicker="Components" title="Six pieces, each one file.">
            <p>
              Each component is a single <code className="font-mono text-foreground">.tsx</code> file styled with shadcn theme tokens, so
              it picks up your colors, radius and dark mode. Every state is keyboard reachable, and motion stops when the OS asks for
              reduced motion.
            </p>
          </SectionHeading>
          <div className="mt-6 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>Everything at once:</span>
            <code className="rounded border bg-card px-2 py-1 font-mono">npx shadcn@latest add https://cig13zs.github.io/agent-ui/r/agent-ui.json</code>
            <CopyButton value="npx shadcn@latest add https://cig13zs.github.io/agent-ui/r/agent-ui.json" label="Copy install-all command" />
          </div>
          <div className="mt-10">
            <Gallery dark={dark} />
          </div>
        </section>
        <Events />
        <Adapters />
      </main>
      <Footer />
    </>
  )
}
