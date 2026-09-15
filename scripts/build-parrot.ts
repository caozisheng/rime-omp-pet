#!/usr/bin/env bun
/**
 * Generates packs/parrot.json — the config-file-driven showcase pack.
 *
 * Artwork is original for rime-omp-pet (an homage to parrot.live's constant
 * motion, not a copy of its GPL frames). Sprites are defined once below and
 * composed with whole-canvas transforms (translate, mirror) so every action
 * can move across the full 24-column envelope.
 *
 * Run: bun scripts/build-parrot.ts [--preview]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Frame, PetPack } from "../src/pet/types";

const WIDTH = 24;
const HEIGHT = 5;

interface SpriteFrame {
  lines: string[];
  durationMs: number;
}

interface SpriteAnimation {
  loop: boolean;
  frames: SpriteFrame[];
}

interface Canvas {
  rows: string[][];
}

/** Glyph swaps applied when a sprite is mirrored horizontally. */
const FLIP: Record<string, string> = {
  "/": "\\",
  "\\": "/",
  "<": ">",
  ">": "<",
  "(": ")",
  ")": "(",
  "[": "]",
  "]": "[",
  "{": "}",
  "}": "{",
};

/** Mirrors a sprite horizontally, swapping directional glyphs. */
function mirror(sprite: readonly string[]): string[] {
  const width = Math.max(...sprite.map((row) => row.length));
  return sprite.map((row) =>
    [...row.padEnd(width)]
      .reverse()
      .map((ch) => FLIP[ch] ?? ch)
      .join("")
      .trimEnd(),
  );
}

function frame(canvas: Canvas, durationMs: number): SpriteFrame {
  return { lines: canvas.rows.map((row) => row.join("")), durationMs };
}

// ---------------------------------------------------------------------------
// Original parrot poses. The bird faces left (beak "<"), tail to the right.
// ---------------------------------------------------------------------------

/** Alert stance: head, open eye, body, tail fin, feet. */
const STAND = [
  "   .---.",
  "  / o   \\",
  " <   \\    \\___",
  "  \\   \\__/    \\",
  "   '-''-'   '-'",
];

/** Same stance with the eye closed. */
const BLINK = [
  "   .---.",
  "  / -   \\",
  " <   \\    \\___",
  "  \\   \\__/    \\",
  "   '-''-'   '-'",
];

/** Head tilted back, beak up — thinking. */
const LEAN_BACK = [
  "    .---.",
  "   / o  /",
  "  <  \\ /   \\___",
  "   \\  X      \\",
  "    '-'-''  '-'",
];

/** Beak driven down onto a keyboard — working. */
const PECK = [
  "   .---.",
  "  / o   \\",
  "  <<<  \\__/    \\",
  "   '-''-'/[_]'-'",
];

/** Airborne: STAND lifted one row with the feet row dropped for hop frames. */
const STAND_AIR: readonly string[] = ["", ...STAND.slice(0, 4)];

/** Head low, tail drooping — sad. */
const DROOP = [
  "   .---.",
  "  / -   \\",
  " <   \\    \\",
  "  \\   \\__  \\",
  "   '-''-' \\_\\",
];

/** Wings thrown out — celebrating. */
const SPREAD = [
  " \\   .---.   /",
  "  \\ / o   \\ /",
  " --<   \\   >--",
  "  / \\   \\_/ \\",
  " /  '-''-'  '-'",
];

/** Feathers everywhere — panic. */
const RUFFLED = [
  "  ,---.",
  " ; O ;   \\___",
  " <  \\  \\_/  \\",
  "  \\  \\__/  ,'",
  "   '-;-'  ;'",
];

/** Curled into a ball — sleeping or waking. */
const CURL = [
  "   ,--.",
  "  / -  \\",
  " (  \\   \\",
  "  \\_/\\__\\",
];

/** Half-risen — wake midpoint. */
const CROUCH = [
  "   .---.",
  "  / -   \\",
  " (   \\  \\___",
  "  \\  \\_/_/",
  "   '-'-'",
];

/** Squashed flat — compaction. */
const SQUASHED = [
  "   .---.",
  " < o \\ \\____",
  "  \\  \\_/   \\",
  "   '-''-''-'",
];

// Mirrored stances for right-facing travel (beak ">").
const STAND_M = mirror(STAND);
const SPREAD_M = mirror(SPREAD);
const RUFFLED_M = mirror(RUFFLED);

// ---------------------------------------------------------------------------
// Canvas helpers. Sprites are stamped at a column offset onto a blank canvas;
// stamping clips anything past the right edge so offsets stay safe.
// ---------------------------------------------------------------------------

function blank(): Canvas {
  return { rows: Array.from({ length: HEIGHT }, () => Array.from({ length: WIDTH }, () => " ")) };
}

function stamp(target: Canvas, sprite: readonly string[], x: number): Canvas {
  for (let r = 0; r < HEIGHT; r++) {
    const row = sprite[r] ?? "";
    for (let c = 0; c < WIDTH; c++) {
      const sc = c - x;
      target.rows[r][c] = sc >= 0 && sc < row.length ? row[sc] : " ";
    }
  }
  return target;
}

// ---------------------------------------------------------------------------
// Action composition. Large-scale motion = whole-sprite travel across the
// 24-column canvas plus mirroring, not just glyph swaps.
// ---------------------------------------------------------------------------

const actions: Record<string, SpriteAnimation> = {};

function action(name: string, loop: boolean, frames: SpriteFrame[]): void {
  actions[name] = { loop, frames };
}

// idle: breathe and blink in place.
action("idle", true, [
  frame(stamp(blank(), STAND, 5), 900),
  frame(stamp(blank(), BLINK, 5), 130),
  frame(stamp(blank(), STAND, 5), 1400),
]);

// think: rock the head back, settle, repeat.
action("think", true, [
  frame(stamp(blank(), LEAN_BACK, 8), 700),
  frame(stamp(blank(), STAND, 8), 700),
]);

// work: hammer the keyboard, beak strikes alternating with upright posts.
action("work", true, [
  frame(stamp(blank(), STAND, 6), 300),
  frame(stamp(blank(), PECK, 7), 260),
  frame(stamp(blank(), STAND, 6), 300),
  frame(stamp(blank(), PECK, 7), 260),
]);

// wait: pace left and right across the canvas, patience thinning.
action("wait", true, [
  frame(stamp(blank(), STAND, 1), 800),
  frame(stamp(blank(), STAND_M, 8), 800),
]);

// happy: hop in place, blinking between bounces.
action("happy", true, [
  frame(stamp(blank(), STAND_AIR, 6), 260),
  frame(stamp(blank(), STAND, 6), 240),
  frame(stamp(blank(), STAND_AIR, 6), 260),
  frame(stamp(blank(), BLINK, 6), 240),
]);

// sad: droop and sink toward the left edge.
action("sad", true, [
  frame(stamp(blank(), DROOP, 6), 900),
  frame(stamp(blank(), DROOP, 3), 900),
]);

// celebrate: spin (mirror) with wings out, bouncing end to end.
action("celebrate", true, [
  frame(stamp(blank(), SPREAD, 4), 260),
  frame(stamp(blank(), SPREAD_M, 8), 260),
  frame(stamp(blank(), SPREAD, 4), 260),
  frame(stamp(blank(), SPREAD_M, 8), 260),
]);

// panic: ricochet between the canvas edges, feathers flying.
action("panic", true, [
  frame(stamp(blank(), RUFFLED, 0), 220),
  frame(stamp(blank(), RUFFLED_M, 10), 220),
  frame(stamp(blank(), RUFFLED, 0), 220),
  frame(stamp(blank(), RUFFLED_M, 10), 220),
]);

// excited: glide the full width of the canvas and back, beak first.
action("excited", true, [
  frame(stamp(blank(), STAND, 1), 300),
  frame(stamp(blank(), STAND, 8), 300),
  frame(stamp(blank(), STAND_M, 8), 300),
  frame(stamp(blank(), STAND_M, 1), 300),
]);

// compact: squash flat and spring back.
action("compact", true, [
  frame(stamp(blank(), SQUASHED, 6), 500),
  frame(stamp(blank(), STAND, 6), 500),
]);

// interrupted: jolt sideways, feathers popping loose.
action("interrupted", true, [
  frame(stamp(blank(), RUFFLED, 10), 350),
  frame(stamp(blank(), STAND, 8), 750),
]);

// wake: unfold from a curl (non-loop — holds the final stance).
action("wake", false, [
  frame(stamp(blank(), CURL, 6), 500),
  frame(stamp(blank(), CROUCH, 6), 450),
  frame(stamp(blank(), STAND, 6), 500),
]);

// sleep: curled up, drifting gently.
action("sleep", true, [
  frame(stamp(blank(), CURL, 6), 1500),
  frame(stamp(blank(), CURL, 8), 1500),
]);

const pack: PetPack = {
  schemaVersion: 1,
  id: "parrot",
  name: "Parrot (24-col wide)",
  width: WIDTH,
  height: HEIGHT,
  fallbackAction: "idle",
  actions: Object.fromEntries(
    Object.entries(actions).map(([name, { loop, frames }]) => [
      name,
      { loop, frames: frames satisfies Frame[] },
    ]),
  ),
  metadata: {
    author: "rime-omp-pet",
    license: "MIT",
    source:
      "Original artwork for rime-omp-pet; an homage to parrot.live / ascii-live motion style (no GPL frame text reused)",
    originalImplementation: true,
  },
};

const outPath = join(dirname(fileURLToPath(import.meta.url)), "..", "packs", "parrot.json");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(pack, null, 2) + "\n");

if (process.argv.includes("--preview")) {
  for (const [name, { loop, frames }] of Object.entries(actions)) {
    console.log(`\n=== ${name} (loop=${loop}, ${frames.length} frames) ===`);
    const rows: string[] = [];
    for (let r = 0; r < HEIGHT; r++) {
      rows.push(frames.map((f) => f.lines[r]).join(" | "));
    }
    console.log(rows.join("\n"));
  }
} else {
  console.log(`wrote ${outPath}: ${Object.keys(actions).length} actions`);
}
