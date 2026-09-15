import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRimeOmpPetExtension, discoverAlign } from "../extension";
import { catPack } from "../src/pet/assets";
import { renderPetFrame, type PetAlign } from "../src/pet/renderer";
import type { Frame, PetPack } from "../src/pet/types";

type RecordedWidget = { key: string; factory: unknown; options: { placement?: string } | undefined };

type FakeHostOptions = {
  /** Explicit pack paths handed to the factory (disables cwd discovery). */
  packPaths?: string[];
  /** The cwd reported by the fake OMP runtime context. */
  projectCwd?: string;
  defaultPack?: string;
  /** Explicit align handed to the factory (code-level override). */
  align?: PetAlign;
};

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "rime-pet-"));
  tempDirs.push(dir);
  return dir;
}

/**
 * A minimal in-process stand-in for the OMP extension runtime: it records the
 * registrations an extension makes and replays lifecycle events at it.
 */
class FakeHost {
  public readonly handlers = new Map<string, Array<(event: unknown, ctx: unknown) => unknown>>();
  public readonly widgets: RecordedWidget[] = [];
  public readonly timers = new Set<unknown>();
  public readonly warnings: string[] = [];
  private readonly projectCwd: string;

  public constructor(private readonly options: FakeHostOptions = {}) {
    this.projectCwd = options.projectCwd ?? makeTempDir();
  }

  public get api() {
    return {
      logger: {
        warn: (message: string) => {
          this.warnings.push(message);
        },
        error: (message: string) => {
          this.warnings.push(message);
        },
      },
      on: (event: string, handler: (event: unknown) => unknown) => {
        const list = this.handlers.get(event) ?? [];
        list.push(handler);
        this.handlers.set(event, list);
      },
      registerCommand: () => {},
      setTimeout: (callback: () => void) => {
        this.timers.add(callback);
        return callback;
      },
      clearTimer: (timer: unknown) => {
        this.timers.delete(timer);
      },
    };
  }

  public get context() {
    return {
      mode: "tui",
      cwd: this.projectCwd,
      ui: {
        setWidget: (key: string, factory: unknown, options?: { placement?: string }) => {
          this.widgets.push({ key, factory, options });
        },
        notify: () => {},
      },
      setTimeout: (callback: () => void) => {
        this.timers.add(callback);
        return callback;
      },
      clearTimer: (timer: unknown) => {
        this.timers.delete(timer);
      },
    };
  }

  public async load() {
    const factory = createRimeOmpPetExtension({
      ...(this.options.packPaths ? { packPaths: this.options.packPaths } : {}),
      align: this.options.align,
      defaultPack: this.options.defaultPack,
    });
    await factory(this.api as never);
  }

  /** Flush pending macrotask chains so async pack hydration can land. */
  public async settle() {
    for (let round = 0; round < 5; round += 1) {
      const { promise, resolve } = Promise.withResolvers<void>();
      setImmediate(resolve);
      await promise;
    }
  }

  public emit(event: string, payload: Record<string, unknown> = {}) {
    const list = this.handlers.get(event);
    expect(list, `handler for ${event}`).toBeDefined();
    for (const handler of list ?? []) handler({ type: event, ...payload }, this.context);
  }

  public fireTimers() {
    for (const timer of [...this.timers]) (timer as () => void)();
  }

  public async runTimers(rounds: number) {
    for (let index = 0; index < rounds; index += 1) {
      const { promise, resolve } = Promise.withResolvers<void>();
      setImmediate(resolve);
      await promise;
      this.fireTimers();
    }
  }

  public mountedWidget(): { render(width: number): string[] } {
    const entry = this.widgets.at(-1);
    expect(entry, "widget registered").toBeDefined();
    const factory = entry!.factory as (tui: unknown) => { render(width: number): string[] };
    return factory({});
  }
}

function jsonPack(id: string, name: string, actions: PetPack["actions"]): PetPack {
  return { schemaVersion: 1, id, name, width: 14, height: 5, fallbackAction: "idle", actions };
}

describe("rime-omp-pet extension", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  test("mounts an aboveEditor widget and renders the default cat idle frame", async () => {
    const host = new FakeHost();
    await host.load();
    host.emit("session_start");
    await host.settle();

    const widget = host.mountedWidget();
    const rendered = widget.render(40);
    expect(rendered).toHaveLength(5);
    expect(rendered[0].endsWith("  /\\_____/\\   ")).toBe(true);
    expect(host.widgets.at(-1)?.options?.placement).toBe("aboveEditor");
  });

  test("follows the tool lifecycle through widget frames", async () => {
    const host = new FakeHost();
    await host.load();
    host.emit("session_start");
    await host.settle();

    const widget = host.mountedWidget();
    host.emit("turn_start");
    host.emit("tool_execution_start", { toolCallId: "1", toolName: "read" });
    let rendered = widget.render(40);
    expect(rendered[1].trim()).not.toBe("");

    host.emit("tool_execution_end", { toolCallId: "1", toolName: "bash", isError: true });
    rendered = widget.render(40);
    expect(rendered).toHaveLength(5);
  });

  test("a denied approval keeps the pet thinking instead of tool-running", async () => {
    const host = new FakeHost();
    await host.load();
    host.emit("session_start");
    await host.settle();

    const widget = host.mountedWidget();
    host.emit("tool_approval_requested");
    host.emit("tool_approval_resolved", { toolCallId: "1", toolName: "bash", approved: false });

    const expected = renderPetFrame(catPack.actions.think.frames[0], 40);
    expect(widget.render(40)).toEqual(expected);
  });

  test("an approved approval moves the pet into tool-running", async () => {
    const host = new FakeHost();
    await host.load();
    host.emit("session_start");
    await host.settle();

    const widget = host.mountedWidget();
    host.emit("tool_approval_resolved", { toolCallId: "1", toolName: "bash", approved: true });

    const expected = renderPetFrame(catPack.actions.work.frames[0], 40);
    expect(widget.render(40)).toEqual(expected);
  });

  test("settles back to lifecycle after a non-loop reaction animation completes", async () => {
    const dir = makeTempDir();
    const pack = jsonPack("calico", "Calico", {
      idle: {
        loop: true,
        frames: [
          {
            lines: ["              ", "  (idle)      ", "  cat         ", "              ", "              "],
            durationMs: 900,
          },
        ],
      },
      happy: {
        loop: false,
        frames: [
          {
            lines: ["              ", "  (happy!)    ", "  cat         ", "              ", "              "],
            durationMs: 50,
          },
        ],
      },
    });
    writeFileSync(join(dir, "calico.json"), JSON.stringify(pack));

    const host = new FakeHost({ packPaths: [dir], defaultPack: "calico" });
    await host.load();
    host.emit("session_start");
    await host.settle();

    const widget = host.mountedWidget();
    expect(widget.render(40)[1].endsWith("(idle)      ")).toBe(true);

    host.emit("agent_end", {});
    expect(widget.render(40)[1].endsWith("(happy!)    ")).toBe(true);

    // Completing the non-loop happy animation must consume the reaction and
    // return to the lifecycle action instead of restarting happy until TTL.
    await host.runTimers(1);
    expect(widget.render(40)[1].endsWith("(idle)      ")).toBe(true);
    await host.runTimers(4);
    expect(widget.render(40)[1].endsWith("(idle)      ")).toBe(true);
  });

  test("celebrates success then settles back to lifecycle idle", async () => {
    const host = new FakeHost();
    await host.load();
    host.emit("session_start");
    await host.settle();

    const widget = host.mountedWidget();
    host.emit("agent_end", {});
    let rendered = widget.render(40);
    expect(rendered).toHaveLength(5);

    await host.runTimers(20);
    rendered = widget.render(40);
    expect(rendered).toHaveLength(5);
    expect(rendered[0].endsWith("  /\\_____/\\   ")).toBe(true);
  });

  test("disposes the widget on session_shutdown without leaking timers", async () => {
    const host = new FakeHost();
    await host.load();
    host.emit("session_start");
    await host.settle();
    host.emit("session_shutdown");
    expect(host.timers.size).toBe(0);
    expect(host.widgets.at(-1)?.key).toBe("rime-omp-pet");
  });

  test("loads a user JSON pack from explicit paths and selects it as the default pet", async () => {
    const dir = makeTempDir();
    const pack = jsonPack("fox", "Test Fox", {
      idle: {
        loop: true,
        frames: [
          {
            lines: ["              ", "    /\\_/\\     ", "    (o.o)     ", "    > ^ <     ", "              "],
            durationMs: 900,
          },
        ],
      },
    });
    writeFileSync(join(dir, "fox.json"), JSON.stringify(pack));

    const host = new FakeHost({ packPaths: [dir], defaultPack: "fox" });
    await host.load();
    host.emit("session_start");
    await host.settle();

    const widget = host.mountedWidget();
    const rendered = widget.render(40);
    expect(rendered[2].endsWith("    (o.o)     ")).toBe(true);
  });

  test("discovers project packs from the session cwd, not the process cwd", async () => {
    const dir = makeTempDir();
    const packDir = join(dir, ".omp", "pets");
    mkdirSync(packDir, { recursive: true });
    const pack = jsonPack("marten", "Marten", {
      idle: {
        loop: true,
        frames: [
          {
            lines: ["              ", "   <({o o})   ", "    marten    ", "              ", "              "],
            durationMs: 900,
          },
        ],
      },
    });
    writeFileSync(join(packDir, "marten.json"), JSON.stringify(pack));

    // No explicit packPaths: discovery must derive from ctx.cwd at mount.
    const host = new FakeHost({ projectCwd: dir, defaultPack: "marten" });
    await host.load();
    host.emit("session_start");
    await host.settle();

    const widget = host.mountedWidget();
    const rendered = widget.render(40);
    expect(rendered[2].endsWith("    marten    ")).toBe(true);
  });

  test("disables malformed JSON packs with a warning instead of failing", async () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, "broken.json"), "{ not json");

    const host = new FakeHost({ packPaths: [dir] });
    await host.load();
    host.emit("session_start");
    await host.settle();

    expect(host.warnings.length).toBeGreaterThan(0);
    const widget = host.mountedWidget();
    const frame: Frame = { lines: widget.render(40) };
    expect(frame.lines).toHaveLength(5);
  });

  test("applies align from project pet.json over the user default", async () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, ".omp"), { recursive: true });
    writeFileSync(join(dir, ".omp", "pet.json"), JSON.stringify({ align: "left" }));

    const host = new FakeHost({ projectCwd: dir });
    await host.load();
    host.emit("session_start");
    await host.settle();

    const widget = host.mountedWidget();
    const rendered = widget.render(40);
    expect(rendered[0]).toBe(catPack.actions.idle.frames[0].lines[0]);
  });

  test("discoverAlign prefers the project file over the user file", () => {
    const user = makeTempDir();
    const project = makeTempDir();
    const warnings: string[] = [];
    const log = { warn: (message: string) => warnings.push(message) };
    writeFileSync(join(user, "user.json"), JSON.stringify({ align: "left" }));
    writeFileSync(join(project, "project.json"), JSON.stringify({ align: "right" }));

    // Paths are ordered highest precedence first.
    expect(discoverAlign([join(project, "project.json"), join(user, "user.json")], undefined, log)).toBe("right");
    expect(discoverAlign([join(user, "user.json")], undefined, log)).toBe("left");
    expect(discoverAlign([join(user, "user.json")], "right", log)).toBe("right");
    expect(warnings).toHaveLength(0);
  });

  test("code-level align overrides config files", async () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, ".omp"), { recursive: true });
    writeFileSync(join(dir, ".omp", "pet.json"), JSON.stringify({ align: "left" }));

    const host = new FakeHost({ projectCwd: dir, align: "right" });
    await host.load();
    host.emit("session_start");
    await host.settle();

    const widget = host.mountedWidget();
    const rendered = widget.render(40);
    expect(rendered[0].length).toBe(40);
  });
});
