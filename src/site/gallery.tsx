import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { CodeBlock, InstallCommand } from "./code"
import { examples, type Example } from "./examples"

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ")
}

/** Roving-tabindex tab list. */
export function Tabs({
  label,
  items,
  value,
  onChange,
  size = "md",
}: {
  label: string
  items: string[]
  value: number
  onChange: (i: number) => void
  size?: "sm" | "md"
}) {
  const refs = React.useRef<Array<HTMLButtonElement | null>>([])
  const go = (i: number) => {
    const next = (i + items.length) % items.length
    onChange(next)
    refs.current[next]?.focus()
  }
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cx("inline-flex max-w-full flex-wrap gap-1", size === "md" && "rounded-lg bg-muted p-1")}
    >
      {items.map((item, i) => (
        <button
          key={item}
          ref={(el) => {
            refs.current[i] = el
          }}
          role="tab"
          type="button"
          aria-selected={value === i}
          tabIndex={value === i ? 0 : -1}
          onClick={() => onChange(i)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") go(i + 1)
            else if (e.key === "ArrowLeft") go(i - 1)
            else if (e.key === "Home") go(0)
            else if (e.key === "End") go(items.length - 1)
            else return
            e.preventDefault()
          }}
          className={cx(
            "outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
            size === "md"
              ? "h-7 rounded-md px-3 text-[13px] font-medium"
              : "h-7 rounded-full border px-2.5 text-xs",
            size === "md" && (value === i ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"),
            size === "sm" &&
              (value === i ? "border-foreground/30 bg-card text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"),
          )}
        >
          {item}
        </button>
      ))}
    </div>
  )
}

function GalleryItem({ example, dark }: { example: Example; dark: boolean }) {
  const [tab, setTab] = React.useState(0)
  const [variant, setVariant] = React.useState(0)
  const [stageTheme, setStageTheme] = React.useState<"light" | "dark" | null>(null)
  const theme = stageTheme ?? (dark ? "dark" : "light")
  const Variant = example.variants[variant]

  return (
    <article id={example.id} aria-labelledby={`${example.id}-title`} className="grid scroll-mt-20 gap-6 border-t py-14 lg:grid-cols-12 lg:gap-10">
      <div className="min-w-0 lg:col-span-4">
        <h3 id={`${example.id}-title`} className="font-mono text-lg font-medium tracking-tight">
          {example.name}
        </h3>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{example.blurb}</p>
        <InstallCommand name={example.id} className="mt-5" />
      </div>
      <div className="min-w-0 lg:col-span-8">
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Tabs label={`${example.name} view`} items={["Preview", "Usage", "Source"]} value={tab} onChange={setTab} />
          {tab === 0 && example.variants.length > 1 && (
            <Tabs label={`${example.name} state`} items={example.variants.map((v) => v.label)} value={variant} onChange={setVariant} size="sm" />
          )}
          {tab === 0 && (
            <button
              type="button"
              onClick={() => setStageTheme(theme === "dark" ? "light" : "dark")}
              aria-label={`Show preview in ${theme === "dark" ? "light" : "dark"} mode`}
              className="ml-auto inline-flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              {theme === "dark" ? <Sun aria-hidden className="size-3.5" /> : <Moon aria-hidden className="size-3.5" />}
            </button>
          )}
        </div>
        {tab === 0 && (
          <div
            role="tabpanel"
            aria-label={`${example.name} preview: ${Variant.label}`}
            className={cx(theme, "dot-grid flex min-h-[24rem] items-center justify-center rounded-2xl border bg-stage p-4 text-foreground sm:p-8")}
          >
            <React.Fragment key={variant}>{Variant.render()}</React.Fragment>
          </div>
        )}
        {tab === 1 && <CodeBlock code={example.usage} title="usage.tsx" />}
        {tab === 2 && <CodeBlock code={example.source} title={`components/${example.id}.tsx`} maxHeight="36rem" />}
      </div>
    </article>
  )
}

export function Gallery({ dark }: { dark: boolean }) {
  return (
    <div>
      {examples.map((e) => (
        <GalleryItem key={e.id} example={e} dark={dark} />
      ))}
    </div>
  )
}
