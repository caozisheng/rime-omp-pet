import { describe, expect, test } from "bun:test";
import { PetAnimator, type Scheduler } from "../src/pet/animator";
import { catPack, dogPack } from "../src/pet/assets";
import { renderPetFrame } from "../src/pet/renderer";
import { PetStateResolver } from "../src/pet/state";
import { validatePetPack } from "../src/pet/validate";

describe("bundled pet packs", () => {
  test("use the Campy cat and dog animation vocabulary with attribution", () => {
    expect(catPack.metadata?.license).toBe("MIT");
    expect(catPack.metadata?.source).toContain("dropdevrahul/campy");
    expect(catPack.actions.idle.frames[0]?.lines[0]).toBe("  /\\_____/\\   ");
    expect(dogPack.metadata?.license).toBe("MIT");
    expect(dogPack.metadata?.source).toContain("dropdevrahul/campy");
    expect(dogPack.actions.idle.frames[0]?.lines[0]).toBe(" /\\       /\\    ");
  });

  test("validate every bundled pack", () => {
    expect(validatePetPack(catPack).ok).toBe(true);
    expect(validatePetPack(dogPack).ok).toBe(true);
  });

  test("map every lifecycle and reaction action onto pack animations", () => {
    for (const pack of [catPack, dogPack]) {
      const resolver = new PetStateResolver({ pack });
      for (const state of ["idle", "thinking", "tool-running", "waiting-user", "success", "error", "interrupted", "compacting"] as const) {
        resolver.setLifecycle(state);
        expect(resolver.resolve(0).action, `${pack.id} lifecycle ${state}`).toBe(resolver.resolve(0).action);
        expect(pack.actions[resolver.resolve(0).action], `${pack.id} lifecycle ${state}`).toBeDefined();
      }
      for (const event of ["tool-start", "file-read", "file-edited", "command-running", "test-passed", "test-failed", "subagent-completed", "context-compacted", "turn-succeeded", "turn-failed", "interrupted"] as const) {
        resolver.emit(event, 0);
        expect(pack.actions[resolver.resolve(0).action], `${pack.id} reaction ${event}`).toBeDefined();
      }
    }
  });
});

describe("state resolution", () => {
  test("expires reactions and returns to the current lifecycle", () => {
    const resolver = new PetStateResolver({ pack: catPack });
    resolver.setLifecycle("thinking");
    resolver.emit("test-failed", 1000);

    expect(resolver.resolve(1001).action).toBe("panic");
    expect(resolver.resolve(4000).action).toBe("think");
  });

  test("selects the newest reaction when priorities tie", () => {
    const resolver = new PetStateResolver({ pack: catPack });
    resolver.emit("file-read", 1000, { ttlMs: 5000, action: "work", priority: 10 });
    resolver.emit("file-edited", 1001, { ttlMs: 5000, action: "happy", priority: 10 });

    expect(resolver.resolve(1002).action).toBe("happy");
  });

  test("keeps a higher-priority reaction over a newer lower-priority one", () => {
    const resolver = new PetStateResolver({ pack: catPack });
    resolver.emit("test-failed", 1000);
    resolver.emit("file-edited", 2000);

    expect(resolver.resolve(2001).action).toBe("panic");
  });

  test("falls back to idle when a requested action is missing from the pack", () => {
    const barePack = validatePetPack({
      schemaVersion: 1,
      id: "bare",
      name: "Bare",
      width: 14,
      height: 5,
      fallbackAction: "idle",
      actions: { idle: { loop: true, frames: [{ lines: ["              ", "     /\\_/\\     ", "    (^.^)      ", "     > ^ <      ", "              "] }] } },
    });
    expect(barePack.ok).toBe(true);
    if (!barePack.ok) return;
    const resolver = new PetStateResolver({ pack: barePack.pack });
    resolver.emit("test-failed", 0);
    expect(resolver.resolve(1).action).toBe("idle");
  });
});

describe("animation", () => {
  test("starts at frame zero and completes non-looping actions", () => {
    const callbacks: string[] = [];
    const scheduled: Array<() => void> = [];
    const scheduler: Scheduler = {
      setTimeout(callback) {
        scheduled.push(callback);
        return callback;
      },
      clearTimeout() {},
    };
    const animator = new PetAnimator({
      pack: catPack,
      scheduler,
      onFrame: (_frame, action, index) => callbacks.push(`${action}:${index}`),
      onComplete: action => callbacks.push(`complete:${action}`),
    });

    animator.setAction("wake");
    expect(callbacks).toEqual(["wake:0"]);
    scheduled.shift()?.();
    expect(callbacks).toContain("wake:1");
    scheduled.shift()?.();
    expect(callbacks).toContain("wake:2");
    scheduled.shift()?.();
    expect(callbacks.at(-1)).toBe("complete:wake");
  });

  test("cancels the pending timer when the action changes mid-play", () => {
    const cleared: unknown[] = [];
    const scheduled: Array<() => void> = [];
    const scheduler: Scheduler = {
      setTimeout(callback) {
        scheduled.push(callback);
        return callback;
      },
      clearTimeout(handle) {
        cleared.push(handle);
      },
    };
    const animator = new PetAnimator({
      pack: catPack,
      scheduler,
      onFrame: () => {},
      onComplete: () => {},
    });

    animator.setAction("wake");
    animator.setAction("idle");
    expect(cleared).toHaveLength(1);
    expect(scheduled).toHaveLength(2);
    animator.dispose();
  });
});

describe("renderer", () => {
  test("right-aligns a frame and hides it when the terminal is too narrow", () => {
    const frame = catPack.actions.idle.frames[0];
    expect(frame).toBeDefined();
    const rendered = renderPetFrame(frame, 20);
    expect(rendered).toHaveLength(5);
    expect(rendered[0]).toStartWith(" ".repeat(6));
    expect(renderPetFrame(frame, 13)).toEqual([]);
  });

  test("emits no terminal control sequences", () => {
    const ansiPattern = /\u001b\[[0-9;]*[A-Za-z]/;
    for (const pack of [catPack, dogPack]) {
      for (const animation of Object.values(pack.actions)) {
        for (const frame of animation.frames) {
          for (const line of frame.lines) {
            expect(line.match(ansiPattern), `${pack.id} frame line`).toBeNull();
          }
        }
      }
    }
  });
});
