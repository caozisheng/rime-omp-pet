import type { Animation, Frame, PetPack } from "./types";

/**
 * Sprite data derived from dropdevrahul/campy at commit
 * 814566b7df24512c64884550bd22589d5fedd2d4.
 *
 * Campy is MIT licensed. The license text is kept in licenses/CAMPY-MIT.txt.
 * Its Unicode glyphs and layered eight-row frames are normalized here to the
 * extension's five-row printable-ASCII canvas; the animation vocabulary and
 * recognizable source sprites are retained.
 */
const CAT_WIDTH = 14;
const DOG_WIDTH = 16;
const HEIGHT = 5;

function makeFrame(width: number, lines: readonly string[], durationMs = 800): Frame {
  const normalized = Array.from(
    { length: HEIGHT },
    (_, index) => (lines[index] ?? "").slice(0, width).padEnd(width, " "),
  );
  return { lines: normalized, durationMs };
}

function catFrame(lines: readonly string[], durationMs = 800): Frame {
  return makeFrame(CAT_WIDTH, lines, durationMs);
}

function dogFrame(lines: readonly string[], durationMs = 800): Frame {
  return makeFrame(DOG_WIDTH, lines, durationMs);
}

function animation(frames: readonly Frame[], loop = true): Animation {
  return { loop, frames };
}

/** A static frame used when a user pack cannot be loaded or rendered safely. */
export const builtinFallbackCatFrame: Frame = catFrame([
  "  /\\_____/\\  ",
  " /  o   o  \\ ",
  "(  == ^ ==  )",
  " \\  '-'  /  ",
  " (__)  (__) ",
], 900);

/** Uppercase alias for callers that prefer constants for immutable built-ins. */
export const BUILTIN_FALLBACK_CAT_FRAME = builtinFallbackCatFrame;

// Campy's cat vocabulary, normalized from eight rows to the five-row widget.
const catIdle = [
  catFrame([
    "  /\\_____/\\  ",
    " /  o   o  \\ ",
    "(  == ^ ==  )",
    " \\  '-'  /  ",
    " (__)  (__) ",
  ], 900),
  catFrame([
    "  /\\_____/\\  ",
    " /  -   -  \\ ",
    "(  == ^ ==  )",
    " \\  '-'  /  ",
    " (__)  (__) ",
  ], 700),
];

const catHappy = [
  catFrame([
    "  /\\_____/\\  ",
    " /  ^   ^  \\ ",
    "(  == w ==  )",
    " \\  '-'  /  ",
    " (__)  (__) ",
  ], 1_500),
  catFrame([
    "  /\\_____/\\  ",
    " /  ^   ^  \\ ",
    "(  == w ==  )",
    " \\  '-'  /  ",
    "  |  *  |   ",
  ], 800),
];

const catSleeping = [
  catFrame([
    "  /\\_____/\\  ",
    " /  -   -  \\ ",
    "(  == z z  )",
    " \\  '-'  /  ",
    " (__)  (__) ",
  ], 2_000),
  catFrame([
    "  /\\_____/\\  ",
    " /  -   -  \\ ",
    "(  == Z z  )",
    " \\  '-'  /  ",
    " (__)  (__) ",
  ], 1_200),
];

const catEating = [
  catFrame([
    "  /\\_____/\\  ",
    " /  o   o  \\ ",
    "(  == w ==  )",
    " \\  nom /  ",
    " (__)  (__) ",
  ], 400),
  catFrame([
    "  /\\_____/\\  ",
    " /  ^   ^  \\ ",
    "(  == w ==  )",
    " \\  nom /  ",
    " (__)  (__) ",
  ], 300),
];

const catPlaying = [
  catFrame([
    "    /\\_____/\\ ",
    "   /  ^   ^  \\ ",
    " ( == w ==  ) ",
    "  \\  '-'  /  ",
    "  (__)  (__) ",
  ], 500),
  catFrame([
    "  /\\_____/\\  ",
    " /  ^   ^  \\ ",
    "(  == w ==  )",
    " \\  '-'  /  ",
    " (__)  (__) ",
  ], 500),
];

const catExcited = [
  catFrame([
    "  /\\_____/\\  ",
    " /  ^   ^  \\ ",
    "(  == w ==  )",
    " \\  '-'  /  ",
    "  |  *  |   ",
  ], 300),
  catFrame([
    "  /\\_____/\\  ",
    " /  ^   ^  \\ ",
    "(  == w==  ) ",
    " \\  '-'  /  ",
    " (__)  (__) ",
  ], 300),
];

const catWake = [
  catFrame([
    "  /\\_____/\\  ",
    " /  -   -  \\ ",
    "(  == .-. == )",
    " \\  '-'  /  ",
    "             ",
  ], 500),
  catFrame([
    "  /\\_____/\\  ",
    " /  o   o  \\ ",
    "(  == ^ ==  )",
    " \\  '-'  /  ",
    " (__)  (__) ",
  ], 500),
  catFrame([
    "  /\\_____/\\  ",
    " /  ^   ^  \\ ",
    "(  == w ==  )",
    " \\  '-'  /  ",
    " (__)  (__) ",
  ], 500),
];

const catSad = [
  catFrame([
    "  /\\_____/\\  ",
    " /  -   -  \\ ",
    "(  == T T  )",
    " \\  '-'  /  ",
    " (__)  (__) ",
  ], 900),
  catFrame([
    "  /\\_____/\\  ",
    " /  -   -  \\ ",
    "(  == T T  )",
    " \\  '-'  /  ",
    "   ;_;      ",
  ], 700),
];


// Dedicated frames for lifecycle actions that previously reused other sets.
// Each keeps the campy cat pose but adds a state-specific cue, so thinking,
// running a tool, and waiting for the user read as distinct states.
const catThink = [
  catFrame([
    "  /\\_____/\\  ",
    " /  o   o  \\ ",
    "(  == ? ==  )",
    " \\  '-'  /  ",
    " (__)  (__) ",
  ], 1_400),
  catFrame([
    "  /\\_____/\\  ",
    " /  -   -  \\ ",
    "(  == ?? == )",
    " \\  '-'  /  ",
    " (__)  (__) ",
  ], 700),
  catFrame([
    "  /\\_____/\\  ",
    " /  o   o  \\ ",
    "(  == ? ==  )",
    " \\  '-'  /  ",
    " (__)  (__) ",
  ], 700),
  catFrame([
    "  /\\_____/\\  ",
    " /  -   -  \\ ",
    "(   == ...   )",
    " \\  '?'  /  ",
    " (__)  (__) ",
  ], 900),
];

const catWork = [
  catFrame([
    "  /\\_____/\\  ",
    " /  o   o  \\ ",
    "(  == > ==  )",
    " \\  '-'  /  ",
    " (__)  (__) ",
  ], 450),
  catFrame([
    "  /\\_____/\\  ",
    " /  -   -  \\ ",
    "(  == >> == )",
    " \\  '-'  /  ",
    " (__)  (__) ",
  ], 450),
  catFrame([
    "  /\\_____/\\  ",
    " /  -   -  \\ ",
    "(  == ooo  )",
    " \\  '-'  /  ",
    " (__)  (__) ",
  ], 900),
  catFrame([
    "  /\\_____/\\  ",
    " /  o   o  \\ ",
    "(  == ...  )",
    " \\  '-'  /  ",
    " (__)  (__) ",
  ], 900),
];
const catWait = [
  catFrame([
    "  /\\_____/\\  ",
    " /  o   o  \\ ",
    "(  == ...  )",
    " \\  '-'  /  ",
    " (__)  (__) ",
  ], 1_600),
  catFrame([
    "  /\\_____/\\  ",
    " /  -   -  \\ ",
    "(  == ooo  )",
    " \\  '-'  /  ",
    " (__)  (__) ",
  ], 900),
  catFrame([
    "  /\\_____/\\  ",
    " /  -   -  \\ ",
    "(  == zzz  )",
    " \\  '-'  /  ",
    " (__)  (__) ",
  ], 900),
  catFrame([
    "  /\\_____/\\  ",
    " /  o   o  \\ ",
    "(  == ...  )",
    " \\  '-'  /  ",
    " (__)  (__) ",
  ], 900),
];
const catCelebrate = [
  catFrame([
    "  /\\_____/\\  ",
    " /  ^   ^  \\ ",
    "(  == \\_/ == )",
    " \\  \\_/  /  ",
    " (__)  (__) ",
  ], 500),
  catFrame([
    "  /\\_____/\\  ",
    " /  ^   ^  \\ ",
    "(  == \\_/ == )",
    " \\  '-'  /  ",
    " (__)  (__) ",
  ], 500),
];
const catPanic = [
  catFrame([
    "  /\\_____/\\  ",
    " /  @   @  \\ ",
    "(  == ! ==  )",
    " \\  '\\'  /  ",
    " (__)  (__) ",
  ], 350),
  catFrame([
    "  /\\_____/\\  ",
    " /  @   @  \\ ",
    "(  == !! == )",
    " \\  '-'  /  ",
    " \\_)  (_/ ",
  ], 350),
];
const catCompact = [
  catFrame([
    "  /\\_____/\\  ",
    " /  x   x  \\ ",
    "(  == ~ ==  )",
    " \\  '-'  /  ",
    " (__)  (__) ",
  ], 800),
  catFrame([
    "  /\\_____/\\  ",
    " /  <   <  \\ ",
    "(  == << == )",
    " \\  '-'  /  ",
    " (__)  (__) ",
  ], 800),
];
const catInterrupted = [
  catFrame([
    "  /\\_____/\\  ",
    " /  >   <  \\ ",
    "(  == # ==  )",
    " \\  '-'  /  ",
    " (__)  (__) ",
    ], 1_200),
];
const catAliases = {
  wake: catWake,
  think: catThink,
  work: catWork,
  wait: catWait,
  celebrate: catCelebrate,
  panic: catPanic,
  compact: catCompact,
  interrupted: catInterrupted,
  sleep: catSleeping,
} as const;

export const catPack: PetPack = {
  schemaVersion: 1,
  id: "cat",
  name: "Campy ASCII Cat",
  width: CAT_WIDTH,
  height: HEIGHT,
  fallbackAction: "idle",
  actions: {
    idle: animation(catIdle),
    happy: animation(catHappy),
    sleeping: animation(catSleeping),
    eating: animation(catEating),
    playing: animation(catPlaying),
    excited: animation(catExcited),
    sad: animation(catSad),
    ...Object.fromEntries(
      Object.entries(catAliases).map(([action, frames]) => [action, animation(frames, action !== "wake")]),
    ),
  },
  metadata: {
    author: "OpenCode Pets Contributors",
    license: "MIT",
    source:
      "Derived from https://github.com/dropdevrahul/campy/blob/814566b7df24512c64884550bd22589d5fedd2d4/core/pets/cat.ts; Unicode glyphs replaced with ASCII and frames normalized to 14x5",
    originalImplementation: false,
  },
};

// Campy's dog vocabulary, normalized to a single five-row layer per frame.
const dogIdle = [
  dogFrame([
    " /\\       /\\ ",
    "(  o-|-o  )  ",
    " \\  ---  /   ",
    "  | --- |    ",
    " /  ___  \\   ",
  ], 4_000),
  dogFrame([
    " /\\       /\\ ",
    "(  --|-|--)  ",
    " \\  ---  /   ",
    "  | --- |    ",
    " /  ___  \\   ",
  ], 130),
];

const dogHappy = [
  dogFrame([
    " /\\       /\\ ",
    "(  ^-|-^  )  ",
    " \\  w    /   ",
    "  | --- |    ",
    " /  ___  \\   ",
  ], 1_800),
  dogFrame([
    " /\\       /\\ ",
    "(  ^-|-^  )  ",
    " \\  w    /   ",
    "  | --- |    ",
    " /  *  ~  \\ ",
  ], 600),
];

const dogSleeping = [
  dogFrame([
    " /\\       /\\ ",
    "(  --|-|--)  ",
    " \\  ___  /   ",
    "  | --- |    ",
    "    z z      ",
  ], 2_500),
  dogFrame([
    " /\\       /\\ ",
    "(  --|-|--)  ",
    " \\  ___  /   ",
    "  | --- |    ",
    "   Z   z     ",
  ], 1_200),
];

const dogEating = [
  dogFrame([
    " /\\       /\\ ",
    "(  o-|-o  )  ",
    " \\  w    /   ",
    "  |-nom- |   ",
    " /  ___  \\   ",
  ], 400),
  dogFrame([
    " /\\       /\\ ",
    "(  ^-|-^  )  ",
    " \\  w    /   ",
    "  |-nom- |   ",
    " /  ___  \\   ",
  ], 350),
];

const dogPlaying = [
  dogFrame([
    " /\\       /\\ ",
    "(  >-|->  )  ",
    " \\  w    /   ",
    " ~| --- |~   ",
    " /  ___  \\   ",
  ], 450),
  dogFrame([
    " /\\       /\\ ",
    "(  <-|-<  )  ",
    " \\  w    /   ",
    " ~| --- |~   ",
    " /  ___  \\   ",
  ], 450),
];

const dogExcited = [
  dogFrame([
    "*/\\       /\\*",
    "(  *-|-*  )  ",
    " \\  !!   /   ",
    "  | --- |    ",
    " /  *  ~  \\ ",
  ], 280),
  dogFrame([
    " /\\       /\\ ",
    "(  ^-|-^  )  ",
    " \\  w    /   ",
    "  | --- |    ",
    " /  *  ~  \\ ",
  ], 280),
];

const dogSad = [
  dogFrame([
    " /\\       /\\ ",
    "(  T-|-T  )  ",
    " \\  ___  /   ",
    "  | --- |    ",
    "  ;;  ;;     ",
  ], 3_500),
  dogFrame([
    " /\\       /\\ ",
    "(  T-|-T  )  ",
    " \\  ___  /   ",
    "  | --- |    ",
    " ;;;   ;;;   ",
  ], 1_500),
];
const dogThink = [
  dogFrame([
    " /\\       /\\ ",
    "(  ?-|-?  )  ",
    " \\  ---  /   ",
    "  | --- |    ",
    " /  ___  \\   ",
  ], 1_400),
  dogFrame([
    " /\\       /\\ ",
    "(  6-|-9  )  ",
    " \\  ---  /   ",
    "  | --- |    ",
    " /  ___  \\   ",
  ], 700),
];
const dogWork = [
  dogFrame([
    " /\\       /\\ ",
    "(  >-|->  )  ",
    " \\  w    /   ",
    "  | --- |    ",
    " /  ___  \\   ",
  ], 450),
  dogFrame([
    " /\\       /\\ ",
    "(  =-|-=  )  ",
    " \\  zz   /   ",
    "  | --- |    ",
    " /  ___  \\   ",
  ], 450),
];
const dogWait = [
  dogFrame([
    " /\\       /\\ ",
    "(  o-|-o  )  ",
    " \\  ...  /   ",
    "  | --- |    ",
    " /  ___  \\   ",
  ], 1_600),
  dogFrame([
    " /\\       /\\ ",
    "(  --|-|--)  ",
    " \\  ...  /   ",
    "  | --- |    ",
    " /  ___  \\   ",
  ], 900),
];
const dogCelebrate = [
  dogFrame([
    " /\\       /\\ ",
    "(  ^-|-^  )  ",
    " \\  w    /   ",
    "  | --- |    ",
    " /  \\o/  \\   ",
  ], 500),
  dogFrame([
    " /\\       /\\ ",
    "(  ^-|-^  )  ",
    " \\  w    /   ",
    "  | --- |    ",
    " /  ___  \\   ",
  ], 500),
];
const dogPanic = [
  dogFrame([
    " /\\       /\\ ",
    "(  #-|-#  )  ",
    " \\  !!   /   ",
    "  | --- |    ",
    " /  \\/  \\   ",
  ], 350),
  dogFrame([
    " /\\       /\\ ",
    "(  @-|-@  )  ",
    " \\  !!   /   ",
    "  | --- |    ",
    " \\_ ___ _/   ",
  ], 350),
];
const dogCompact = [
  dogFrame([
    " /\\       /\\ ",
    "(  <-|-<  )  ",
    " \\  <<   /   ",
    "  | --- |    ",
    " /  ___  \\   ",
  ], 800),
  dogFrame([
    " /\\       /\\ ",
    "(  >-|->  )  ",
    " \\  >>   /   ",
    "  | --- |    ",
    " /  ___  \\   ",
  ], 800),
];
const dogInterrupted = [
  dogFrame([
    " /\\       /\\ ",
    "(  X-|-X  )  ",
    " \\  ##   /   ",
    "  | --- |    ",
    " /  ___  \\   ",
  ], 1_200),
];
const dogWake = [
  dogFrame([
    " /\\       /\\ ",
    "(  |-|-|  )  ",
    " \\  ---  /   ",
    "  | --- |    ",
    " /  ___  \\   ",
  ], 900),
  dogFrame([
    " /\\       /\\ ",
    "(  o-|-o  )  ",
    " \\  ---  /   ",
    "  | --- |    ",
    " /  ___  \\   ",
  ], 700),
];
const dogAliases = {
  wake: dogWake,
  think: dogThink,
  work: dogWork,
  wait: dogWait,
  celebrate: dogCelebrate,
  panic: dogPanic,
  compact: dogCompact,
  interrupted: dogInterrupted,
  sleep: dogSleeping,
} as const;

export const dogPack: PetPack = {
  schemaVersion: 1,
  id: "dog",
  name: "Campy ASCII Dog",
  width: DOG_WIDTH,
  height: HEIGHT,
  fallbackAction: "idle",
  actions: {
    idle: animation(dogIdle),
    happy: animation(dogHappy),
    sleeping: animation(dogSleeping),
    eating: animation(dogEating),
    playing: animation(dogPlaying),
    excited: animation(dogExcited),
    sad: animation(dogSad),
    ...Object.fromEntries(
      Object.entries(dogAliases).map(([action, frames]) => [action, animation(frames)]),
    ),
  },
  metadata: {
    author: "OpenCode Pets Contributors",
    license: "MIT",
    source:
      "Derived from https://github.com/dropdevrahul/campy/blob/814566b7df24512c64884550bd22589d5fedd2d4/core/pets/dog.ts; Unicode glyphs replaced with ASCII and layered frames normalized to 16x5",
    originalImplementation: false,
  },
};
