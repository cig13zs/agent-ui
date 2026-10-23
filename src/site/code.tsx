import * as React from "react"
import { Check, Copy } from "lucide-react"

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ")
}

const KEYWORDS = new Set(
  "import export from const let var function return if else for while switch case default break continue new type interface extends as async await of in typeof keyof true false null undefined void".split(
    " ",
  ),
)

type Token = { text: string; cls?: string }

const TOKEN = new RegExp(
  [
    String.raw`(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*)`, // 1 comment
    String.raw`("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|\`(?:[^\`\\]|\\.)*\`)`, // 2 string
    String.raw`(<\/?[A-Za-z][\w.]*)`, // 3 jsx tag
    String.raw`\b(\d[\d_.]*)\b`, // 4 number
    String.raw`\b([A-Za-z_$][\w$]*)\b`, // 5 word
  ].join("|"),
  "g",
)

export function tokenize(code: string, lang: "tsx" | "json" | "bash"): Token[] {
  const out: Token[] = []
  let last = 0
  for (const m of code.matchAll(TOKEN)) {
    const i = m.index ?? 0
    if (i > last) out.push({ text: code.slice(last, i) })
    const [text, comment, str, tag, num, word] = m
    if (comment !== undefined) {
      if (lang === "json" || (lang === "tsx" && comment.startsWith("#"))) out.push({ text: comment })
      else out.push({ text, cls: "text-muted-foreground/70 italic" })
    } else if (str !== undefined) {
      const isKey = lang === "json" && /^\s*:/.test(code.slice(i + text.length))
      out.push({ text, cls: isKey ? "text-sky-700 dark:text-sky-300" : "text-emerald-700 dark:text-emerald-300" })
    } else if (tag !== undefined) out.push({ text, cls: lang === "tsx" ? "text-sky-700 dark:text-sky-300" : undefined })
    else if (num !== undefined) out.push({ text, cls: "text-amber-700 dark:text-amber-300" })
    else if (word !== undefined) {
      if (lang === "bash" && (word === "npx" || word === "npm" || word === "pnpm")) out.push({ text, cls: "text-sky-700 dark:text-sky-300" })
      else if (lang === "tsx" && KEYWORDS.has(word)) out.push({ text, cls: "text-rose-700 dark:text-rose-300" })
      else if (lang === "tsx" && /^[A-Z]/.test(word)) out.push({ text, cls: "text-amber-700 dark:text-amber-200" })
      else out.push({ text })
    } else out.push({ text })
    last = i + text.length
  }
  if (last < code.length) out.push({ text: code.slice(last) })
  return out
}

export function CopyButton({ value, label = "Copy", className }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = React.useState(false)
  React.useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(id)
  }, [copied])
  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : label}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(
          () => setCopied(true),
          () => {},
        )
      }}
      className={cx(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {copied ? <Check aria-hidden className="size-3.5 text-emerald-500" /> : <Copy aria-hidden className="size-3.5" />}
      <span aria-live="polite" className="sr-only">
        {copied ? "Copied" : ""}
      </span>
    </button>
  )
}

export function CodeBlock({
  code,
  lang = "tsx",
  title,
  className,
  maxHeight = "28rem",
}: {
  code: string
  lang?: "tsx" | "json" | "bash"
  title?: string
  className?: string
  maxHeight?: string
}) {
  const tokens = React.useMemo(() => tokenize(code, lang), [code, lang])
  return (
    <div className={cx("relative overflow-hidden rounded-xl border bg-card", className)}>
      {title && (
        <div className="flex h-10 items-center justify-between border-b px-4">
          <span className="font-mono text-xs text-muted-foreground">{title}</span>
          <CopyButton value={code} label={`Copy ${title}`} />
        </div>
      )}
      {!title && <CopyButton value={code} className="absolute top-2 right-2 bg-card" />}
      <pre
        tabIndex={0}
        style={{ maxHeight }}
        className="overflow-auto p-4 font-mono text-[12.5px] leading-[1.7] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <code>
          {tokens.map((t, i) =>
            t.cls ? (
              <span key={i} className={t.cls}>
                {t.text}
              </span>
            ) : (
              <React.Fragment key={i}>{t.text}</React.Fragment>
            ),
          )}
        </code>
      </pre>
    </div>
  )
}

export function InstallCommand({ name, className }: { name: string; className?: string }) {
  const cmd = `npx shadcn@latest add https://cig13zs.github.io/agent-ui/r/${name}.json`
  return (
    <div className={cx("flex h-10 min-w-0 items-center gap-2 rounded-lg border bg-card pr-1.5 pl-3.5", className)}>
      <span aria-hidden className="font-mono text-xs text-muted-foreground select-none">
        $
      </span>
      <code className="min-w-0 flex-1 overflow-x-auto font-mono text-[12.5px] whitespace-nowrap [scrollbar-width:none]">
        <span className="text-sky-700 dark:text-sky-300">npx</span> shadcn@latest add{" "}
        <span className="text-muted-foreground">https://cig13zs.github.io/agent-ui/r/</span>
        <span className="text-foreground">{name}</span>
        <span className="text-muted-foreground">.json</span>
      </code>
      <CopyButton value={cmd} label="Copy install command" />
    </div>
  )
}
