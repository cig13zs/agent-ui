// Renders the promo clips in docs/media from the built demo site.
//
//   npm run build && npm run media            # every clip
//   npm run media -- approval-prompt hero      # some clips
//
// Time is virtual: Playwright's fake clock drives the scripted run, and every
// CSS animation is pinned to that clock before each frame is captured, so
// clips come out identical from run to run regardless of machine speed.
// Needs ffmpeg on PATH and a Chromium that matches playwright-core.
import { execFileSync } from "node:child_process"
import { createReadStream, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs"
import { createServer } from "node:http"
import { extname, join } from "node:path"
import { chromium } from "playwright-core"

const root = new URL("..", import.meta.url).pathname
const dist = join(root, "dist")
const out = join(root, "docs/media")
const tmp = join(root, ".media-tmp")
const FPS = 30

/*
 * view: ?record=<view>. speed: script speed. wait: capture starts once this
 * selector exists. seconds: clip length, or until the run ends plus `hold`.
 * gifWidth: GIF output width in px (MP4 keeps the full 2x size).
 */
const clips = [
  { name: "hero", view: "hero", speed: 1.6, hold: 1.5, gifWidth: 960, gifFps: 20 },
  { name: "agent-run-card", view: "agent-run-card", speed: 1.8, hold: 1.5, gifWidth: 520, gifFps: 20 },
  { name: "tool-timeline", view: "tool-timeline", speed: 1.6, hold: 1.5, gifWidth: 600, gifFps: 20 },
  { name: "approval-prompt", view: "approval-prompt", speed: 1, seconds: 8.7, gifWidth: 520, gifFps: 20 },
  { name: "subagent-tree", view: "subagent-tree", speed: 1.5, wait: "[role=treeitem]", seconds: 9, gifWidth: 560, gifFps: 20 },
  { name: "usage-meter", view: "usage-meter", speed: 2, hold: 1.5, gifWidth: 440, gifFps: 20 },
  { name: "diff-summary", view: "diff-summary", speed: 1.5, wait: "[aria-label=Changes] li", seconds: 12, gifWidth: 600, gifFps: 20 },
  { name: "vertical", view: "vertical", speed: 1, hold: 2.5, gifWidth: 0, scale: 2 },
]

const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2" }

function serve() {
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://x")
    let path = url.pathname.replace(/^\/agent-ui\//, "/")
    if (path.endsWith("/")) path += "index.html"
    const file = join(dist, path)
    if (!existsSync(file) || !statSync(file).isFile()) return res.writeHead(404).end()
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" })
    createReadStream(file).pipe(res)
  })
  return new Promise((resolve) => server.listen(0, () => resolve(server)))
}

/** Lets React's MessageChannel scheduler run between fake-clock ticks. */
const flush = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        let n = 0
        const ch = new MessageChannel()
        ch.port1.onmessage = () => (++n < 4 ? ch.port2.postMessage(0) : resolve())
        ch.port2.postMessage(0)
      }),
  )

/** Pins every CSS animation and transition to the fake clock. */
const pin = (page) =>
  page.evaluate(() => {
    const seen = (window.__animStart ??= new WeakMap())
    const now = performance.now()
    for (const a of document.getAnimations()) {
      if (!seen.has(a)) seen.set(a, now)
      a.pause()
      a.currentTime = now - seen.get(a)
    }
  })

async function step(page, ms) {
  await page.clock.runFor(ms)
  await flush(page)
}

async function record(browser, base, clip) {
  const scale = clip.scale ?? 2
  const context = await browser.newContext({
    viewport: clip.view === "vertical" ? { width: 540, height: 960 } : { width: 1280, height: 1000 },
    deviceScaleFactor: scale,
    colorScheme: "dark",
    reducedMotion: "no-preference",
  })
  const page = await context.newPage()
  page.on("pageerror", (e) => console.error(`  page error: ${e.message}`))
  const t0 = new Date("2026-10-20T09:00:00Z").getTime()
  await page.clock.install({ time: t0 })
  // Without a pause the fake clock also follows wall time, and slow screenshots would speed the clip up.
  await page.clock.pauseAt(t0 + 1000)
  await page.goto(`${base}?record=${clip.view}&speed=${clip.speed}`)
  // waitForSelector polls on requestAnimationFrame, which the paused clock holds, so poll by
  // hand. React's Suspense reveal also waits on a timer, hence the clock steps.
  for (let i = 0; i < 200 && !(await page.$("#stage")); i++) await step(page, 20)
  await page.evaluate(() => document.fonts.ready)
  await flush(page)

  if (clip.wait) {
    for (let i = 0; i < 1200 && !(await page.$(clip.wait)); i++) await step(page, 50)
  }

  const dir = join(tmp, clip.name)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const box = await page.evaluate(() => {
    const r = document.getElementById("stage").getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  })
  const frameMs = 1000 / FPS
  const maxFrames = clip.seconds ? Math.round(clip.seconds * FPS) : 90 * FPS
  let holdLeft = clip.hold ? Math.round(clip.hold * FPS) : Infinity
  let frames = 0
  for (; frames < maxFrames; frames++) {
    await pin(page)
    await page.screenshot({ path: join(dir, `${String(frames).padStart(5, "0")}.png`), clip: box, animations: "allow", caret: "initial" })
    await step(page, frameMs)
    if (!clip.seconds) {
      const ended = await page.$('[data-run="done"], [data-run="failed"], section[data-status="done"], section[data-status="failed"]')
      if (ended && --holdLeft <= 0) break
    }
  }
  await context.close()
  return { dir, frames }
}

function encode(clip, dir) {
  mkdirSync(out, { recursive: true })
  const input = ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", join(dir, "%05d.png")]
  const even = "scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=lanczos"
  const mp4 = join(out, `${clip.name}.mp4`)
  if (clip.view === "vertical") {
    // 1080x1920 for Shorts / Reels.
    execFileSync("ffmpeg", [...input, "-vf", "scale=1080:1920:flags=lanczos,format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-movflags", "+faststart", "-r", String(FPS), mp4])
  } else {
    execFileSync("ffmpeg", [...input, "-vf", `${even},format=yuv420p`, "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-movflags", "+faststart", mp4])
  }
  const made = [mp4]
  if (clip.gifWidth) {
    const gif = join(out, `${clip.name}.gif`)
    const fps = clip.gifFps ?? 20
    execFileSync("ffmpeg", [
      ...input,
      "-filter_complex",
      `fps=${fps},scale=${clip.gifWidth * 2}:-1:flags=lanczos,scale=${clip.gifWidth}:-1:flags=area,split[a][b];[a]palettegen=max_colors=192:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
      "-loop",
      "0",
      gif,
    ])
    made.push(gif)
  }
  return made
}

const only = process.argv.slice(2)
if (!existsSync(join(dist, "index.html"))) {
  console.error("dist/ is missing: run npm run build first")
  process.exit(1)
}
const server = await serve()
const base = `http://localhost:${server.address().port}/agent-ui/`
const browser = await chromium.launch()
try {
  for (const clip of clips.filter((c) => !only.length || only.includes(c.name))) {
    const started = Date.now()
    const { dir, frames } = await record(browser, base, clip)
    const files = encode(clip, dir)
    const sizes = files.map((f) => `${f.replace(root, "")} ${(statSync(f).size / 1024 / 1024).toFixed(2)} MB`)
    console.log(`${clip.name}: ${frames} frames (${(frames / FPS).toFixed(1)}s) in ${((Date.now() - started) / 1000).toFixed(0)}s -> ${sizes.join(", ")}`)
    rmSync(dir, { recursive: true, force: true })
  }
} finally {
  await browser.close()
  server.close()
  if (existsSync(tmp) && readdirSync(tmp).length === 0) rmSync(tmp, { recursive: true })
}
