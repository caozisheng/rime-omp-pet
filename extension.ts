import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { Component } from "@oh-my-pi/pi-tui";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { PetAnimator, type Scheduler } from "./src/pet/animator";
import { catPack, dogPack } from "./src/pet/assets";
import { renderPetFrame, renderStaticFallback } from "./src/pet/renderer";
import { PetStateResolver } from "./src/pet/state";
import type { ActionResolution, Frame, LifecycleState, PetPack, ReactionEvent } from "./src/pet/types";
import { validatePetPack } from "./src/pet/validate";

const WIDGET_KEY = "rime-omp-pet";
const DEFAULT_PACKS = [catPack, dogPack] as const;
type Timer = unknown;

type RuntimeContext = {
  mode: "tui" | "rpc" | "json" | "print";
  cwd?: string;
  ui: {
    setWidget(key: string, content: unknown, options?: { placement?: "aboveEditor" | "belowEditor" }): void;
    notify?(message: string, level?: "info" | "warning" | "error"): void;
  };
  setTimeout(callback: (...args: unknown[]) => void, ms?: number): Timer;
  clearTimer(timer: Timer): void;
};

type TuiLike = { requestRender?(): void };

class PetWidget implements Component {
  private frame: Frame;
  private disposed = false;

  public constructor(private readonly tui: TuiLike, frame: Frame) {
    this.frame = frame;
  }

  public setFrame(frame: Frame): void {
    if (this.disposed) return;
    this.frame = frame;
    this.tui.requestRender?.();
  }

  public render(width: number): string[] {
    return this.disposed ? [] : renderPetFrame(this.frame, width);
  }

  public invalidate(): void {
    this.tui.requestRender?.();
  }

  public dispose(): void {
    this.disposed = true;
  }
}

export interface RimeOmpPetOptions {
  /** Additional in-process PetPack values, usually imported from a trusted script. */
  readonly packs?: readonly unknown[];
  /** JSON or trusted TypeScript/JavaScript pack files or directories. */
  readonly packPaths?: readonly string[];
  readonly defaultPack?: string;
}

/** Build the OMP extension factory. */
export function createRimeOmpPetExtension(options: RimeOmpPetOptions = {}) {
  return async (pi: ExtensionAPI): Promise<void> => {
    const log = pi.logger;
    const initialPackId = options.defaultPack ?? "cat";
    // Explicit paths are resolved once, up front. Default-path discovery is
    // deferred to session_start so project packs resolve against the session
    // cwd instead of the process launch cwd.
    let packs: Map<string, PetPack> | undefined;
    if (options.packPaths !== undefined) {
      packs = await discoverPacks(options.packPaths, options.packs, log);
    }
    let runtime: PetRuntime | undefined;
    let discoveredCwd: string | undefined;

    const ensureRuntime = (ctx: RuntimeContext): PetRuntime | undefined => {
      if (ctx.mode !== "tui") return undefined;
      if (runtime !== undefined) return runtime;
      const resolved = packs ?? loadPacks([...DEFAULT_PACKS, ...(options.packs ?? [])], log);
      runtime = new PetRuntime(ctx, resolved, initialPackId);
      runtime.mount();
      return runtime;
    };

    pi.on("session_start", async (_event, ctx) => {
      const rctx = ctx as unknown as RuntimeContext;
      if (options.packPaths !== undefined) {
        ensureRuntime(rctx);
        return;
      }
      const cwd = rctx.cwd ?? process.cwd();
      if (packs === undefined || cwd !== discoveredCwd) {
        packs = await discoverPacks(defaultPackPaths(cwd), options.packs, log);
        discoveredCwd = cwd;
        runtime?.updatePacks(packs);
      }
      ensureRuntime(rctx);
    });
    pi.on("before_agent_start", (_event, ctx) => {
      ensureRuntime(ctx as unknown as RuntimeContext)?.setLifecycle("thinking");
    });
    pi.on("agent_start", (_event, ctx) => {
      ensureRuntime(ctx as unknown as RuntimeContext)?.setLifecycle("thinking");
    });
    pi.on("turn_start", (_event, ctx) => {
      ensureRuntime(ctx as unknown as RuntimeContext)?.setLifecycle("thinking");
    });
    pi.on("tool_approval_requested", (_event, ctx) => {
      ensureRuntime(ctx as unknown as RuntimeContext)?.setLifecycle("waiting-user");
    });
    pi.on("tool_approval_resolved", (event, ctx) => {
      const pet = ensureRuntime(ctx as unknown as RuntimeContext);
      if (pet === undefined) return;
      // A denied approval never starts a tool; the loop receives the denial
      // as a tool result and continues generating, so the pet keeps thinking.
      pet.setLifecycle(event.approved ? "tool-running" : "thinking");
    });
    pi.on("tool_execution_start", (event, ctx) => {
      const pet = ensureRuntime(ctx as unknown as RuntimeContext);
      if (pet === undefined) return;
      pet.setLifecycle("tool-running");
      pet.react(toolStartReaction(event.toolName));
    });
    pi.on("tool_execution_end", (event, ctx) => {
      const pet = ensureRuntime(ctx as unknown as RuntimeContext);
      if (pet === undefined) return;
      pet.setLifecycle(event.isError ? "error" : "thinking");
      pet.react(toolEndReaction(event.toolName, event.isError));
    });
    pi.on("session.compacting", (_event, ctx) => ensureRuntime(ctx as unknown as RuntimeContext)?.setLifecycle("compacting"));
    pi.on("auto_compaction_start", (_event, ctx) => ensureRuntime(ctx as unknown as RuntimeContext)?.setLifecycle("compacting"));
    pi.on("auto_compaction_end", (_event, ctx) => {
      const pet = ensureRuntime(ctx as unknown as RuntimeContext);
      if (pet === undefined) return;
      pet.react("context-compacted");
      pet.setLifecycle("thinking");
    });
    pi.on("session_compact", (_event, ctx) => {
      const pet = ensureRuntime(ctx as unknown as RuntimeContext);
      if (pet === undefined) return;
      pet.react("context-compacted");
      pet.setLifecycle("thinking");
    });
    // turn_end fires between assistant turns inside a loop; the loop may still
    // continue with tools, so settle signals come from agent_end/session_stop.
    pi.on("agent_end", (event, ctx) => {
      const pet = ensureRuntime(ctx as unknown as RuntimeContext);
      if (pet === undefined) return;
      if (event.willContinue) {
        pet.setLifecycle("thinking");
        return;
      }
      pet.setLifecycle("idle");
      pet.react("turn-succeeded");
    });
    pi.on("auto_retry_start", (_event, ctx) => {
      const pet = ensureRuntime(ctx as unknown as RuntimeContext);
      if (pet === undefined) return;
      pet.setLifecycle("error");
      pet.react("turn-failed");
    });
    // session_stop: a main-agent turn settled normally (not an interruption).
    pi.on("session_stop", (_event, ctx) => {
      ensureRuntime(ctx as unknown as RuntimeContext)?.setLifecycle("idle");
    });
    pi.on("session_shutdown", () => {
      runtime?.dispose();
      runtime = undefined;
    });

    pi.registerCommand("pet", {
      description: "Control the Rime OMP ASCII pet",
      handler: async (args, commandContext) => {
        const ctx = commandContext as unknown as RuntimeContext;
        const pet = ensureRuntime(ctx);
        if (pet === undefined) return;
        const [command] = args.trim().split(/\s+/, 1);
        if (command === "off") {
          pet.setVisible(false);
          return;
        }
        if (command === "on" || command === "") {
          pet.setVisible(true);
          return;
        }
        if (command === "status") {
          ctx.ui.notify?.(pet.status(), "info");
          return;
        }
        if (pet.hasPack(command)) {
          pet.selectPack(command);
          return;
        }
        ctx.ui.notify?.("Usage: /pet on|off|status|<pack-id>", "warning");
      },
    });
  };
}

export default createRimeOmpPetExtension();

class PetRuntime {
  private pack: PetPack;
  private resolver: PetStateResolver;
  private animator: PetAnimator;
  private widget: PetWidget | undefined;
  private expiryTimer: Timer | undefined;
  private visible = true;
  private lifecycle: LifecycleState = "idle";
  /** Identifies the resolution already applied to the animator. */
  private appliedKey: string | undefined;

  public constructor(
    private readonly ctx: RuntimeContext,
    private packs: Map<string, PetPack>,
    initialPackId: string,
  ) {
    this.pack = packs.get(initialPackId) ?? packs.values().next().value ?? catPack;
    this.resolver = new PetStateResolver({ pack: this.pack });
    this.animator = this.createAnimator();
  }

  public mount(): void {
    this.widget?.dispose?.();
    this.widget = undefined;
    this.ctx.ui.setWidget(
      WIDGET_KEY,
      (tui: TuiLike) => {
        this.widget = new PetWidget(tui, this.animator.getFrame() ?? fallbackFrame());
        return this.widget;
      },
      { placement: "aboveEditor" },
    );
    this.sync();
  }

  public setLifecycle(state: LifecycleState): void {
    this.lifecycle = state;
    this.resolver.setLifecycle(state);
    this.sync();
  }

  public react(event: ReactionEvent): void {
    this.resolver.emit(event, Date.now());
    this.sync();
  }

  public setVisible(visible: boolean): void {
    if (this.visible === visible) return;
    this.visible = visible;
    if (!visible) {
      this.clearExpiryTimer();
      this.animator.dispose();
      this.ctx.ui.setWidget(WIDGET_KEY, undefined);
      return;
    }
    this.animator = this.createAnimator();
    this.mount();
  }

  public hasPack(id: string): boolean {
    return this.packs.has(id);
  }

  public selectPack(id: string): void {
    const next = this.packs.get(id);
    if (next === undefined || next.id === this.pack.id) return;
    this.animator.dispose();
    this.pack = next;
    this.resolver = new PetStateResolver({ pack: this.pack, initialLifecycle: this.lifecycle });
    this.animator = this.createAnimator();
    if (this.visible) this.mount();
  }

  public updatePacks(next: Map<string, PetPack>): void {
    this.packs = next;
    if (next.has(this.pack.id)) return;
    const fallback = next.values().next().value;
    if (fallback !== undefined && fallback.id !== this.pack.id) {
      this.selectPack(fallback.id);
    }
  }

  public status(): string {
    return `pet=${this.pack.id} lifecycle=${this.lifecycle} action=${this.animator.getAction() ?? "none"}`;
  }

  public dispose(): void {
    this.clearExpiryTimer();
    this.animator.dispose();
    this.widget?.dispose?.();
    this.ctx.ui.setWidget(WIDGET_KEY, undefined);
    this.widget = undefined;
  }

  private createAnimator(): PetAnimator {
    this.appliedKey = undefined;
    const scheduler: Scheduler = {
      setTimeout: (callback, delayMs) => this.ctx.setTimeout(callback, delayMs),
      clearTimeout: timer => this.ctx.clearTimer(timer),
    };
    return new PetAnimator({
      pack: this.pack,
      scheduler,
      onFrame: frame => this.widget?.setFrame(frame),
      onComplete: () => this.onAnimationComplete(),
    });
  }

  /**
   * A finished non-loop reaction is consumed so resolution falls through to
   * the lifecycle action (or the next reaction) instead of replaying it until
   * its TTL expires. A finished non-loop lifecycle action holds its final
   * frame; sync() will not re-apply the same lifecycle key, and a later
   * reaction with a new sequence replays normally.
   */
  private onAnimationComplete(): void {
    const resolution = this.resolver.resolve(Date.now());
    if (resolution.source === "reaction" && resolution.reaction !== undefined) {
      this.resolver.dismiss(resolution.reaction.sequence);
      this.appliedKey = undefined;
      this.sync();
    }
  }

  private sync(): void {
    if (!this.visible) return;
    const resolution = this.resolver.resolve(Date.now());
    const key = resolutionKey(resolution, this.lifecycle);
    if (key !== this.appliedKey) {
      this.appliedKey = key;
      this.animator.setAction(resolution.action);
    }
    this.scheduleExpiry();
  }

  private scheduleExpiry(): void {
    this.clearExpiryTimer();
    const nextExpiry = this.resolver.nextExpiryAt(Date.now());
    if (nextExpiry === undefined) return;
    const delay = Math.max(0, nextExpiry - Date.now());
    this.expiryTimer = this.ctx.setTimeout(() => {
      this.expiryTimer = undefined;
      this.sync();
    }, delay);
  }

  private clearExpiryTimer(): void {
    if (this.expiryTimer === undefined) return;
    this.ctx.clearTimer(this.expiryTimer);
    this.expiryTimer = undefined;
  }
}

function resolutionKey(resolution: ActionResolution, lifecycle: LifecycleState): string {
  if (resolution.source === "reaction" && resolution.reaction !== undefined) {
    return `reaction:${resolution.reaction.sequence}`;
  }
  return `lifecycle:${lifecycle}:${resolution.action}`;
}

async function discoverPacks(
  paths: readonly string[],
  extra: readonly unknown[] | undefined,
  log: { warn(message: string, context?: Record<string, unknown>): void; error(message: string, context?: Record<string, unknown>): void },
): Promise<Map<string, PetPack>> {
  try {
    const external = await loadExternalPacks(paths, log);
    return loadPacks([...DEFAULT_PACKS, ...external, ...(extra ?? [])], log);
  } catch (error) {
    // Discovery must never reject extension registration; fall back to
    // built-in packs so event handlers and /pet still work.
    log.error("rime-omp-pet: pack discovery failed; using built-in packs", { error: String(error) });
    return loadPacks([...DEFAULT_PACKS, ...(extra ?? [])], log);
  }
}

function loadPacks(
  values: readonly unknown[],
  log: { warn(message: string, context?: Record<string, unknown>): void },
): Map<string, PetPack> {
  const result = new Map<string, PetPack>();
  for (const value of values) {
    const checked = validatePetPack(value);
    if (checked.ok) {
      result.set(checked.pack.id, checked.pack);
      continue;
    }
    const id = packIdOf(value);
    log.warn("rime-omp-pet: disabling invalid pack", { id, error: checked.error.message });
  }
  if (result.size === 0) result.set(catPack.id, catPack);
  return result;
}

function packIdOf(value: unknown): string {
  if (value !== null && typeof value === "object" && "id" in value && typeof value.id === "string") {
    return value.id;
  }
  return "unknown";
}

function defaultPackPaths(projectCwd: string): string[] {
  return [join(homedir(), ".omp", "agent", "pets"), join(projectCwd, ".omp", "pets")];
}

async function loadExternalPacks(
  paths: readonly string[],
  log: { warn(message: string, context?: Record<string, unknown>): void },
): Promise<unknown[]> {
  const values: unknown[] = [];
  for (const input of paths) {
    const files = listPackFiles(input);
    for (const file of files) {
      try {
        if (extname(file).toLowerCase() === ".json") {
          values.push(JSON.parse(readFileSync(file, "utf8")));
          continue;
        }
        const module = await import(`${pathToFileURL(file).href}?rime_omp_pet=${statSync(file).mtimeMs}`);
        const exported = module.default ?? module.pack ?? module.packs;
        if (Array.isArray(exported)) values.push(...exported);
        else if (exported !== undefined) values.push(exported);
      } catch (error) {
        // A malformed or untrusted user pack is disabled, never fatal to OMP.
        log.warn("rime-omp-pet: skipping unreadable pack", { file, error: String(error) });
      }
    }
  }
  return values;
}

function listPackFiles(input: string): string[] {
  try {
    if (!existsSync(input)) return [];
    const candidates = statSync(input).isDirectory()
      ? readdirSync(input).sort().map(name => join(input, name))
      : [input];
    return candidates;
  } catch {
    return [];
  }
}

function fallbackFrame(): Frame {
  return { lines: renderStaticFallback(14).map(line => line.slice(-14)) };
}

function toolStartReaction(toolName: string): ReactionEvent {
  const normalized = toolName.toLowerCase();
  if (normalized.includes("read") || normalized.includes("grep") || normalized.includes("search")) return "file-read";
  return normalized.includes("bash") || normalized.includes("command") ? "command-running" : "tool-start";
}

function toolEndReaction(toolName: string, isError: boolean): ReactionEvent {
  if (isError) return normalizedTest(toolName) ? "test-failed" : "turn-failed";
  if (normalizedTest(toolName)) return "test-passed";
  return normalizedWrite(toolName) ? "file-edited" : "tool-start";
}

function normalizedTest(toolName: string): boolean {
  return /test|check|lint|typecheck/i.test(toolName);
}

function normalizedWrite(toolName: string): boolean {
  return /write|edit|patch|apply/i.test(toolName);
}
