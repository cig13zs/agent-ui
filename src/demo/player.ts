import * as React from "react"
import type { AgentEvent, ApprovalDecision } from "@/registry/agent-ui/hooks/use-agent-run"
import { buildScript, type Beat } from "./script"

export interface PlayerOptions {
  dispatch: (event: AgentEvent) => void
  /** Answer approvals with "allow-once" after this many ms. null waits for a click. */
  autoApproveMs?: number | null
  loop?: boolean
  loopDelayMs?: number
  speed?: number
  onChange?: () => void
}

export type PlayerState = "idle" | "playing" | "paused" | "waiting" | "finished" | "stopped"

/** Plays the scripted run into a dispatch function on real (or faked) timers. */
export class ScriptPlayer {
  state: PlayerState = "idle"
  private beats: Beat[] = []
  private index = 0
  private timer: ReturnType<typeof setTimeout> | undefined
  private autoTimer: ReturnType<typeof setTimeout> | undefined
  private dueAt = 0
  private remaining = 0
  private decisions = new Map<string, ApprovalDecision>()
  private gate: string | undefined
  private opts: PlayerOptions

  constructor(opts: PlayerOptions) {
    this.opts = opts
  }

  private set(state: PlayerState) {
    this.state = state
    this.opts.onChange?.()
  }

  private clear() {
    clearTimeout(this.timer)
    clearTimeout(this.autoTimer)
    this.timer = undefined
    this.autoTimer = undefined
  }

  start() {
    this.clear()
    this.beats = buildScript(Date.now())
    this.index = 0
    this.decisions.clear()
    this.gate = undefined
    this.set("playing")
    this.schedule(0)
  }

  private schedule(wait: number) {
    const ms = wait / (this.opts.speed ?? 1)
    this.dueAt = Date.now() + ms
    this.timer = setTimeout(() => this.step(), ms)
  }

  private step() {
    while (this.index < this.beats.length) {
      const beat = this.beats[this.index]
      this.index++
      if ("event" in beat) this.opts.dispatch(beat.event)
      else if ("gate" in beat) {
        if (!this.decisions.has(beat.gate)) {
          this.gate = beat.gate
          this.set("waiting")
          const ms = this.opts.autoApproveMs
          if (ms != null) this.autoTimer = setTimeout(() => this.decide(beat.gate, "allow-once"), ms)
          return
        }
      } else if ("ifDenied" in beat) {
        if (this.decisions.get(beat.ifDenied) === "deny") {
          const target = this.beats.findIndex((b) => "label" in b && b.label === beat.goto)
          if (target !== -1) this.index = target
        }
      }
      const next = this.beats[this.index]
      if (next && next.wait > 0) {
        this.schedule(next.wait)
        return
      }
    }
    this.set("finished")
    if (this.opts.loop) this.timer = setTimeout(() => this.start(), this.opts.loopDelayMs ?? 4000)
  }

  decide(id: string, decision: ApprovalDecision) {
    if (this.decisions.has(id)) return
    this.decisions.set(id, decision)
    this.opts.dispatch({ type: "approval.resolve", id, decision })
    if (decision === "deny") {
      this.opts.dispatch({ type: "tool.start", id: `${id}-denied`, kind: "run", title: "Run", target: "rm -rf dist && npm run build" })
      this.opts.dispatch({ type: "tool.end", id: `${id}-denied`, status: "error", error: "Denied. Running the tests against the old build." })
    }
    if (this.gate === id && this.state === "waiting") {
      clearTimeout(this.autoTimer)
      this.gate = undefined
      this.set("playing")
      this.schedule(this.beats[this.index]?.wait ?? 0)
    }
  }

  pause() {
    if (this.state !== "playing" && this.state !== "waiting") return
    this.remaining = Math.max(0, this.dueAt - Date.now())
    const wasWaiting = this.state === "waiting"
    this.clear()
    this.opts.dispatch({ type: "run.pause" })
    this.set("paused")
    this.resumeTo = wasWaiting ? "waiting" : "playing"
  }

  private resumeTo: "playing" | "waiting" = "playing"

  resume() {
    if (this.state !== "paused") return
    this.opts.dispatch({ type: "run.resume" })
    if (this.resumeTo === "waiting") {
      this.set("waiting")
      const ms = this.opts.autoApproveMs
      if (ms != null && this.gate) {
        const gate = this.gate
        this.autoTimer = setTimeout(() => this.decide(gate, "allow-once"), ms)
      }
      return
    }
    this.set("playing")
    this.dueAt = Date.now() + this.remaining
    this.timer = setTimeout(() => this.step(), this.remaining)
  }

  stop() {
    if (this.state === "finished" || this.state === "stopped" || this.state === "idle") return
    this.clear()
    this.opts.dispatch({ type: "run.end", status: "failed", error: "Stopped by you. Changes so far are kept in the working tree." })
    this.set("stopped")
  }

  dispose() {
    this.clear()
  }
}

export function useScriptPlayer(dispatch: (event: AgentEvent) => void, options: Omit<PlayerOptions, "dispatch" | "onChange"> = {}) {
  const [, force] = React.useReducer((n: number) => n + 1, 0)
  const [player] = React.useState(() => new ScriptPlayer({ ...options, dispatch, onChange: force }))
  React.useEffect(() => {
    player.start()
    return () => player.dispose()
  }, [player])
  return player
}
