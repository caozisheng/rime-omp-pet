/**
 * One-shot generator for packs/cat.json action frames derived from the
 * PixelSergey/meow cat family (MIT, (c) 2024 Sergey Ichtchenko).
 * Run: bun scripts/build-cat-frames.ts > /tmp/cat-frames.json
 * Verifies invariants inline: 70x5 stage, first frame at column 0, no ANSI.
 */
const W = 70;
const H = 5;

/** Side-view walking cat — meow cat133 rows 2-6, walking right (legs A). */
const SIDE_A = [
  "))          |\\_/|",
  "|      `'..' a a(",
  " \\  \\      \\ =_Y/=",
  " > /` --< <<",
  " \\__))   \\_))",
];
/** Legs variant — think frame 2 (cat133 legs B). */
const SIDE_B = [
  "))          |\\_/|",
  "|      `'..' - -(",
  " \\  \\      \\ =_Y/=",
  "  >\\_  /--<",
  "   (_)) \\_))",
];
/** Front sitting cat — think frames 7-13 body. */
const FRONT = [
  "/\\___/\\",
  ") - - (",
  "=\\ -^- /=",
  "/     \\",
  "\\__ __ __))",
];

const sideEyes = (sprite: string[], l: string, r: string): string[] => {
  const s = [...sprite];
  const row = [...s[1]];
  row[13] = l;
  row[15] = r;
  s[1] = row.join("");
  return s;
};
const frontEyes = (sprite: string[], eyes: string): string[] => {
  // ") - - (": three-char eyes occupy cols 2-4; two-char eyes at cols 2 and 4
  const s = [...sprite];
  const row = [...s[1]];
  if (eyes.length === 3) {
    row[2] = eyes[0];
    row[3] = eyes[1];
    row[4] = eyes[2];
  } else {
    row[2] = eyes[0];
    row[4] = eyes[1];
  }
  s[1] = row.join("");
  return s;
};

interface FrameOut {
  durationMs: number;
  lines: string[];
}

const stage = (
  sprite: string[],
  x: number,
  overlays: Array<[number, number, string]> = [],
  tag = "?",
): string[] => {
  const grid = Array.from({ length: H }, () => " ".repeat(W).split(""));
  const put = (r: number, c: number, str: string): void => {
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (ch === " ") continue;
      const col = c + i;
      if (col >= W) throw new Error(`${tag}: overflow row ${r} col ${col}`);
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

const actions: Record<string, FrameOut[]> = { idle, work, wait, happy, celebrate, panic, compact, interrupted };

// ---- invariants ----
const problems: string[] = [];
for (const [name, frames] of Object.entries(actions)) {
  frames.forEach((f, fi) => {
    if (f.lines.length !== H) problems.push(`${name}[${fi}] height ${f.lines.length}`);
    f.lines.forEach((l, li) => {
      if (l.length !== W) problems.push(`${name}[${fi}] line ${li} width ${l.length}`);
      if (/[^\x20-\x7e]/.test(l)) problems.push(`${name}[${fi}] line ${li} non-ascii`);
    });
  });
  if (leadingCol(frames[0].lines) !== 0) problems.push(`${name} first frame col ${leadingCol(frames[0].lines)}`);
}
const happySpread = Math.max(...happy.map(f => leadingCol(f.lines))) - Math.min(...happy.map(f => leadingCol(f.lines)));
if (happySpread < 45) problems.push(`happy spread ${happySpread} < 45`);
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.error("ALL OK");

console.log(JSON.stringify(actions, null, 2));
