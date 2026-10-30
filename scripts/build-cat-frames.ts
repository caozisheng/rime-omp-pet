#!/usr/bin/env bun
/**
 * Generates the sprite-driven cat actions in packs/cat.json.
 *
 * Art is derived from PixelSergey/meow cats/cat133.txt + cats/cat135.txt and
 * dropdevrahul/campy core/pets/cat.ts (both MIT; see licenses/ and
 * provenance.json), normalized onto a fixed 70x5 printable-ASCII stage.
 *
 * Each pose is written once, with all five rows in their true relative
 * columns, and frames move that pose by stamping it at a column offset.
 * Never re-indent individual frame rows by hand: a stray space — or a
 * miscounted `\\` escape — is exactly how the artwork drifted a column to the
 * left of its own spine.
 *
 * Run:
 *   bun scripts/build-cat-frames.ts --write   # merge into packs/cat.json
 *   bun scripts/build-cat-frames.ts           # print the generated actions
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PetPack } from "../src/pet/types";

const W = 70;
const H = 5;

/**
 * Front-facing sitting cat. The spine (crown, face, belly) sits on column 1;
 * the outstretched paws overhang it on column 0 and column 8, and the hind
 * leg plus tail run from column 0 to column 10.
 *
 *   0123456789
 *    /\___/\
 *    ) - - (
 *   =\ -^- /=
 *    /     \
 *   \__ __ __))
 */
const FRONT = [
  " /\\___/\\",
  " ) - - (",
  "=\\ -^- /=",
  " /     \\",
  "\\__ __ __))",
];

/** Side-view walking cat — meow cat133 rows 2-6, walking right (legs A). */
const SIDE_A = [
  "))          |\\_/|",
  "|      `'..' a a(",
  " \\  \\      \\ =_Y/=",
  " > /` --< <<",
  " \\__))   \\_))",
];
/** Same cat, legs B (mid-stride). */
const SIDE_B = [
  "))          |\\_/|",
  "|      `'..' a a(",
  " \\  \\      \\ =_Y/=",
  "  >\\_  /--<",
  "   (_)) \\_))",
];
/** Arched-back cat — meow cat135 rows 2-6, facing right. */
const ARCH = [
  " /\\=/\\-\"\"-.//",
  "= 'Y' =  ,  \\",
  " '-^-'  /(  /",
  "  /;_,) |\\\\ \\",
  " (_/ (_/ (_(_/",
];
/**
 * Same arched cat mid-stride: the front and hind paws reach one column out
 * from the planted pose, so the gap between the paws widens. Alternating this
 * with ARCH while the sprite travels left gives the legs a gait instead of a
 * rigid slide.
 */
const ARCH_STRIDE = [
  " /\\=/\\-\"\"-.//",
  "= 'Y' =  ,  \\",
  " '-^-'  /(  /",
  "  /;_,) |\\\\ \\",
  "(_/  (_/  (_(_/",
];
/** Curled sleeper, head on the right; ears aligned over the 7-wide face. */
const SLEEP_CURL = [
  "     /\\_/\\",
  " __ ( -.- )>",
  "/  \\/   |",
  "\\__/ /\\ \\",
  "   _/  \\_",
];
/** Curled sleeper, head on the left. */
const SLEEP_CURL_B = [
  "  /\\_/\\",
  "<( -.- ) __",
  "   |   \\/  \\",
  "  / /\\ \\__/",
  " _/  \\_",
];

/**
 * Swap the eyes of a front-facing pose. `- -` in row 1 marks the two eye
 * cells; pass two characters (`o o`) or three (`o.o`) to replace them.
 */
const frontEyes = (sprite: readonly string[], eyes: string): string[] => {
  const out = [...sprite];
  const face = out[1];
  const slot = face.indexOf("- -");
  if (slot < 0) throw new Error("front sprite lost its eye slot");
  const fill = eyes.length === 3 ? eyes : `${eyes[0]} ${eyes[1]}`;
  out[1] = face.slice(0, slot) + fill + face.slice(slot + "- -".length);
  return out;
};

/**
 * Swap the eyes of a side-view pose. `a a` in row 1 marks the two eye cells;
 * pass two characters (`- -`, `@ @`, `O O`).
 */
const sideEyes = (sprite: readonly string[], l: string, r: string): string[] => {
  const out = [...sprite];
  const face = out[1];
  const slot = face.indexOf("a a");
  if (slot < 0) throw new Error("side sprite lost its eye slot");
  out[1] = face.slice(0, slot) + `${l} ${r}` + face.slice(slot + "a a".length);
  return out;
};

/** Swap the eyes of the arched pose. `'Y'` in row 1 marks the eye cell. */
const archEyes = (sprite: readonly string[], eyes: string): string[] => {
  const out = [...sprite];
  const face = out[1];
  const slot = face.indexOf("'Y'");
  if (slot < 0) throw new Error("arch sprite lost its eye slot");
  out[1] = face.slice(0, slot) + eyes + face.slice(slot + "'Y'".length);
  return out;
};

interface FrameOut {
  durationMs: number;
  lines: string[];
}

interface ActionOut {
  loop: boolean;
  frames: FrameOut[];
}

/**
 * Stamp `sprite` at column `x` onto a blank 70x5 stage, then paint any
 * overlays. Every row of the sprite keeps its own relative indentation; only
 * the whole sprite moves, so a pose can never shear between rows.
 */
const stage = (
  sprite: readonly string[],
  x: number,
  overlays: ReadonlyArray<readonly [number, number, string]> = [],
  tag = "?",
): string[] => {
  const grid = Array.from({ length: H }, () => " ".repeat(W).split(""));
  const put = (r: number, c: number, str: string): void => {
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (ch === " ") continue;
      const col = c + i;
      if (col < 0 || col >= W) throw new Error(`${tag}: overflow row ${r} col ${col}`);
      grid[r][col] = ch;
    }
  };
  sprite.forEach((row, r) => put(r, x, row));
  overlays.forEach(([r, c, str]) => put(r, c, str));
  return grid.map(g => g.join(""));
};

const leadingCol = (lines: readonly string[]): number =>
  Math.min(...lines.filter(l => l.trim().length > 0).map(l => l.length - l.trimStart().length));

// ---------- idle: front cat breathing + blink, parked at left ----------
const idle: FrameOut[] = [
  { durationMs: 900, lines: stage(frontEyes(FRONT, "- -"), 0, [], "idle") },
  { durationMs: 700, lines: stage(frontEyes(FRONT, "_ _"), 0, [], "idle") },
];

// ---------- think: walk right, stop and ponder, arch back, settle ----------
const think: FrameOut[] = [];
{
  const walkX = [0, 10, 22, 34, 46];
  walkX.forEach((x, i) => {
    const sprite = i % 2 === 0 ? SIDE_A : SIDE_B;
    think.push({ durationMs: 500, lines: stage(sprite, x, [], `think-walk${i}`) });
  });

  // Pondering: eyes cycle through confusion until one insight frame ("!").
  const pondering: Array<[string, string?]> = [
    ["o.o"],
    ["- -"],
    ["o O", "?"],
    ["O o", "??"],
    ["- -", "??"],
    ["O O", "?"],
    ["O.O", "!"],
    ["^.^"],
    ["<.<"],
  ];
  const frontX = 56;
  pondering.forEach(([eyes, mark], i) => {
    const overlays: Array<[number, number, string]> = mark ? [[0, frontX + 10, mark]] : [];
    think.push({
      durationMs: i >= 2 && i <= 4 ? 650 : 500,
      lines: stage(frontEyes(FRONT, eyes), frontX, overlays, `think-front${i}`),
    });
  });

  // Arch the back and pace back to the left edge, alternating the stance so
  // the paws open and close instead of sliding rigidly.
  const archX = [46, 34, 22, 10, 0];
  archX.forEach((x, i) => {
    const stance = i % 2 === 0 ? ARCH : ARCH_STRIDE;
    const sprite = archEyes(stance, i % 2 === 0 ? "'Y'" : "'-'");
    think.push({ durationMs: 500, lines: stage(sprite, x, [], `think-arch${i}`) });
  });

  think.push({ durationMs: 500, lines: stage(frontEyes(FRONT, "^.^"), 0, [], "think-settle") });
}

// ---------- sleeping: curled cat rocking across the stage ----------
const sleeping: FrameOut[] = [];
{
  const sleepX = [0, 16, 33, 51, 51, 33, 16, 0];
  sleepX.forEach((x, i) => {
    const sprite = i < 4 ? SLEEP_CURL : SLEEP_CURL_B;
    sleeping.push({ durationMs: 1050, lines: stage(sprite, x, [], `sleeping${i}`) });
  });
}

// ---------- work: front cat at a terminal desk — fixed composition with ----------
// ---------- scrolling code, paw taps, and eye cycles (no stage travel) ----------
const work: FrameOut[] = [];
{
  // terminal occupies the right side; the cat sits at the left facing it
  const DESK = [
    "          +--------------+",
    "          | > _          |",
    "          |              |",
    "     _____|              |",
    "    '----'\\--------------+",
  ];
  const CODE_LINES = ["~~~ ~= ~ ~~~", "=~ ~~ = ~~~=", "~~ = ~~ = ~=", "=~= ~= ~ =~~"];
  const code = (variant: number): string[] => {
    const d = DESK.map(r => [...r]);
    const src = CODE_LINES[variant % CODE_LINES.length];
    for (let i = 0; i < src.length && i < 12; i++) d[2][12 + i] = src[i];
    return d.map(r => r.join(""));
  };
  const eyes: Array<[string, string]> = [
    ["o", "o"],
    ["O", "O"],
  ];
  const paw = (variant: number): Array<[number, number, string]> => {
    if (variant % 4 === 3) return [[0, 22, "*"]];
    return [[3, 17 + (variant % 2), variant % 2 === 0 ? "\\" : "/"]];
  };
  for (let i = 0; i < 8; i++) {
    const [l, r] = eyes[i % 2];
    const cat = frontEyes(FRONT, `${l}.${r}`);
    const overlays: Array<[number, number, string]> = [
      ...code(i).map((row, ri) => [ri, 10, row] as [number, number, string]),
      ...paw(i),
    ];
    work.push({ durationMs: 170, lines: stage(cat, 0, overlays, `work${i}`) });
  }
}

// ---------- wait: front cat, patient blink + tail flick ----------
const wait: FrameOut[] = [
  { durationMs: 700, lines: stage(frontEyes(FRONT, "- -"), 0, [[2, 11, "~"]], "wait") },
  { durationMs: 300, lines: stage(frontEyes(FRONT, ">.<"), 0, [[2, 11, "~~"]], "wait") },
];

// ---------- happy: full-stage bounce run ----------
const happy: FrameOut[] = [];
{
  const go = [frontEyes(FRONT, "^.^"), frontEyes(FRONT, "^o^")];
  let hx = 0;
  for (let i = 0; i < 4; i++) {
    happy.push({ durationMs: 220, lines: stage(go[i % 2], hx, [], `happy${i}`) });
    hx += 15;
  }
  hx -= 15;
  for (let i = 0; i < 4; i++) {
    happy.push({ durationMs: 220, lines: stage(go[i % 2], hx, [], `happy-b${i}`) });
    hx -= 15;
  }
}

// ---------- celebrate: perk-up + sparkle trail across the stage ----------
const celebrate: FrameOut[] = [];
{
  const sprites = [frontEyes(FRONT, "^.^"), frontEyes(FRONT, "^o^")];
  const offsets = [0, 16, 32, 48, 48, 32, 16, 0];
  offsets.forEach((x, i) => {
    const sparkle = i % 2 === 0 ? "*" : "+";
    celebrate.push({ durationMs: 130, lines: stage(sprites[i % 2], x, [[0, Math.min(x + 9, 68), sparkle]], `cel${i}`) });
  });
}

// ---------- panic: side-view cat dashes zig-zag with alarm marks ----------
const panic: FrameOut[] = [];
{
  const dash = (sprite: string[], x: number, tag: string): FrameOut => {
    const lines = stage(sprite, x, [], tag);
    const grid = lines.map(l => [...l]);
    const markCol = Math.min(x + 20, 67);
    grid[0][markCol] = "!";
    grid[2][Math.min(markCol + 2, 69)] = "?";
    return { durationMs: 130, lines: grid.map(g => g.join("")) };
  };
  const shockedA = sideEyes(SIDE_A, "@", "@");
  const shockedB = sideEyes(SIDE_B, "O", "O");
  const px = [0, 16, 32, 48, 32, 16];
  for (let i = 0; i < px.length; i++) {
    panic.push(dash(i % 2 === 0 ? shockedA : shockedB, px[i], `panic${i}`));
  }
}

// ---------- compact: cat settles into a box, eyes flicker ----------
const compact: FrameOut[] = [];
{
  const BOX_A = [
    "+-----------+",
    "|  /\\_/\\    |",
    "| ( -.- ) ..|",
    "| /(   )\\  <|",
    "+----VV-----+",
  ];
  const BOX_B = [
    "+-----------+",
    "|  /\\_/\\    |",
    "| ( ._. ) ..|",
    "| /(   )\\  <|",
    "+----VV-----+",
  ];
  compact.push({ durationMs: 350, lines: stage(BOX_A, 0, [], "compact") });
  compact.push({ durationMs: 350, lines: stage(BOX_B, 0, [], "compact") });
  compact.push({ durationMs: 350, lines: stage(BOX_A, 0, [], "compact") });
}

// ---------- interrupted: front cat startled, pages drop beside it ----------
const interrupted: FrameOut[] = [];
{
  const base = frontEyes(FRONT, ">.<");
  const drop = (row: number, mark: string): FrameOut => {
    const lines = stage(base, 0, [], "int");
    const grid = lines.map(l => [...l]);
    if (row >= 0 && row < H - 1) grid[row][14] = mark;
    return { durationMs: 200, lines: grid.map(g => g.join("")) };
  };
  interrupted.push(drop(0, "v"), drop(1, "v"), drop(2, "v"), drop(3, "?"));
}

const actions: Record<string, ActionOut> = {
  idle: { loop: true, frames: idle },
  think: { loop: true, frames: think },
  sleeping: { loop: true, frames: sleeping },
  work: { loop: true, frames: work },
  wait: { loop: true, frames: wait },
  happy: { loop: true, frames: happy },
  celebrate: { loop: true, frames: celebrate },
  panic: { loop: true, frames: panic },
  compact: { loop: true, frames: compact },
  interrupted: { loop: true, frames: interrupted },
};

// ---- invariants ----
const problems: string[] = [];
for (const [name, action] of Object.entries(actions)) {
  action.frames.forEach((f, fi) => {
    if (f.lines.length !== H) problems.push(`${name}[${fi}] height ${f.lines.length}`);
    f.lines.forEach((l, li) => {
      if (l.length !== W) problems.push(`${name}[${fi}] line ${li} width ${l.length}`);
      if (/[^\x20-\x7e]/.test(l)) problems.push(`${name}[${fi}] line ${li} non-ascii`);
    });
  });
  if (leadingCol(action.frames[0].lines) !== 0) problems.push(`${name} first frame col ${leadingCol(action.frames[0].lines)}`);
}
const happySpread = Math.max(...happy.map(f => leadingCol(f.lines))) - Math.min(...happy.map(f => leadingCol(f.lines)));
if (happySpread < 45) problems.push(`happy spread ${happySpread} < 45`);
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.error("ALL OK");

if (process.argv.includes("--write")) {
  const packPath = join(dirname(fileURLToPath(import.meta.url)), "..", "packs", "cat.json");
  const pack = JSON.parse(readFileSync(packPath, "utf8")) as PetPack;
  const next: PetPack = { ...pack, actions: { ...pack.actions, ...actions } };
  writeFileSync(packPath, JSON.stringify(next, null, 2) + "\n");
  console.log(`wrote ${packPath}: ${Object.keys(actions).length} generated, ${Object.keys(next.actions).length} total actions`);
} else {
  console.log(JSON.stringify(actions, null, 2));
}
