export const COLS = 35;
export const ROWS = 23;

const CELL_COUNT = COLS * ROWS;
const WALL_BYTES = Math.ceil(CELL_COUNT / 8);
const WALL_TEXT_LENGTH = Math.ceil((WALL_BYTES * 8) / 6);
const DEFAULT_START = COLS + 1;
const DEFAULT_END = (ROWS - 2) * COLS + COLS - 2;

export type Algorithm = "astar" | "dijkstra";
export type TerrainCell = { cell: number; cost: 5 | 9 };

/** Walls and terrain are unique, disjoint cells; seed is an unsigned uint32. */
export type Board = {
  walls: number[];
  /** Cost of entering each marked cell; every other open cell costs 1. */
  terrain?: TerrainCell[];
  start: number;
  end: number;
  seed: number;
};

export type SearchStep = {
  cell: number;
  g: number;
  h: number;
  f: number;
  /** Unique open cells after this expansion, excluding stale heap entries. */
  frontier: number;
  /** Cells discovered for the first time during this expansion. */
  opened: number[];
};

export type SearchResult = {
  /** Unique cells removed from the frontier, including the goal if reached. */
  visited: number[];
  /** The route includes both endpoints; an unreachable route is empty. */
  path: number[];
  /** Total movement cost; the starting cell itself contributes no cost. */
  cost: number | null;
  /** One snapshot per actual expansion, in the same order as visited. */
  steps: SearchStep[];
};

type FrontierEntry = {
  cell: number;
  distance: number;
  priority: number;
  heuristic: number;
  order: number;
};

function precedes(a: FrontierEntry, b: FrontierEntry): boolean {
  return (
    a.priority < b.priority ||
    (a.priority === b.priority &&
      (a.heuristic < b.heuristic ||
        (a.heuristic === b.heuristic && a.order < b.order)))
  );
}

/** A binary min-heap: insertion and removal are O(log frontier size). */
class MinHeap {
  private entries: FrontierEntry[] = [];

  push(entry: FrontierEntry): void {
    let position = this.entries.length;
    this.entries.push(entry);
    while (position > 0) {
      const parent = Math.floor((position - 1) / 2);
      if (!precedes(entry, this.entries[parent])) break;
      this.entries[position] = this.entries[parent];
      position = parent;
    }
    this.entries[position] = entry;
  }

  pop(): FrontierEntry | undefined {
    const first = this.entries[0];
    const last = this.entries.pop();
    if (!last || this.entries.length === 0) return first;

    let position = 0;
    while (position * 2 + 1 < this.entries.length) {
      let child = position * 2 + 1;
      const right = child + 1;
      if (
        right < this.entries.length &&
        precedes(this.entries[right], this.entries[child])
      ) {
        child = right;
      }
      if (!precedes(this.entries[child], last)) break;
      this.entries[position] = this.entries[child];
      position = child;
    }
    this.entries[position] = last;
    return first;
  }
}

function isCell(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < CELL_COUNT;
}

function isSeed(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
}

function boardMasks(board: Board): { walls: Uint8Array; costs: Uint8Array } {
  if (
    !board ||
    !Array.isArray(board.walls) ||
    board.walls.length > CELL_COUNT ||
    !isCell(board.start) ||
    !isCell(board.end) ||
    !isSeed(board.seed)
  ) {
    throw new TypeError("Invalid board or seed.");
  }

  const walls = new Uint8Array(CELL_COUNT);
  for (const wall of board.walls) {
    if (!isCell(wall) || walls[wall]) {
      throw new TypeError("Walls must be unique, in-range cell indices.");
    }
    walls[wall] = 1;
  }
  if (walls[board.start] || walls[board.end]) {
    throw new TypeError("Start and end must be open cells.");
  }
  const costs = new Uint8Array(CELL_COUNT).fill(1);
  if (board.terrain !== undefined) {
    if (!Array.isArray(board.terrain) || board.terrain.length > CELL_COUNT) {
      throw new TypeError("Terrain must be an array of unique weighted cells.");
    }
    for (const terrain of board.terrain) {
      if (
        !terrain ||
        !isCell(terrain.cell) ||
        (terrain.cost !== 5 && terrain.cost !== 9) ||
        walls[terrain.cell] ||
        costs[terrain.cell] !== 1
      ) {
        throw new TypeError(
          "Terrain must be unique open cells with cost 5 or 9.",
        );
      }
      costs[terrain.cell] = terrain.cost;
    }
  }
  return { walls, costs };
}

/** A fixed neighbor order makes repeated runs and equal-priority ties stable. */
function neighbors(cell: number): number[] {
  const x = cell % COLS;
  const y = Math.floor(cell / COLS);
  const adjacent: number[] = [];
  if (x + 1 < COLS) adjacent.push(cell + 1);
  if (y + 1 < ROWS) adjacent.push(cell + COLS);
  if (x > 0) adjacent.push(cell - 1);
  if (y > 0) adjacent.push(cell - COLS);
  return adjacent;
}

export function solve(board: Board, algorithm: Algorithm): SearchResult {
  if (algorithm !== "astar" && algorithm !== "dijkstra") {
    throw new TypeError("Unknown search algorithm.");
  }
  const { walls, costs } = boardMasks(board);
  const distances = new Int32Array(CELL_COUNT).fill(-1);
  const parents = new Int32Array(CELL_COUNT).fill(-1);
  const closed = new Uint8Array(CELL_COUNT);
  const visited: number[] = [];
  const steps: SearchStep[] = [];
  const frontier = new MinHeap();
  const goalX = board.end % COLS;
  const goalY = Math.floor(board.end / COLS);
  let order = 0;
  let openCount = 1;

  // Each four-way move changes Manhattan distance by at most one and costs
  // at least 1. Manhattan therefore remains admissible and consistent with
  // costs 1/5/9 and walls; the first expanded goal has minimum total cost.
  const heuristic = (cell: number): number =>
    algorithm === "dijkstra"
      ? 0
      : Math.abs((cell % COLS) - goalX) +
        Math.abs(Math.floor(cell / COLS) - goalY);

  distances[board.start] = 0;
  const initialHeuristic = heuristic(board.start);
  frontier.push({
    cell: board.start,
    distance: 0,
    priority: initialHeuristic,
    heuristic: initialHeuristic,
    order: order++,
  });

  // Lazy duplicate entries avoid an indexed decrease-key heap. Each edge can
  // add at most one entry: O((V + E) log V) time and O(V + E) memory. Because
  // this grid has at most four neighbors per cell, E = O(V), so memory is O(V).
  for (let entry = frontier.pop(); entry; entry = frontier.pop()) {
    const { cell, distance } = entry;
    if (closed[cell] || distance !== distances[cell]) continue;
    closed[cell] = 1;
    openCount--;
    visited.push(cell);

    const step: SearchStep = {
      cell,
      g: distance,
      h: entry.heuristic,
      f: entry.priority,
      frontier: openCount,
      opened: [],
    };
    steps.push(step);

    if (cell === board.end) {
      const path: number[] = [];
      for (let step = cell; step !== -1; step = parents[step]) path.push(step);
      path.reverse();
      return { visited, path, cost: distance, steps };
    }

    for (const next of neighbors(cell)) {
      if (walls[next] || closed[next]) continue;
      // Pay for the destination terrain only; never charge the start itself.
      const nextDistance = distance + costs[next];
      if (distances[next] !== -1 && nextDistance >= distances[next]) continue;
      if (distances[next] === -1) {
        openCount++;
        step.opened.push(next);
      }
      distances[next] = nextDistance;
      parents[next] = cell;
      const h = heuristic(next);
      frontier.push({
        cell: next,
        distance: nextDistance,
        priority: nextDistance + h,
        heuristic: h,
        order: order++,
      });
    }
    step.frontier = openCount;
  }

  return { visited, path: [], cost: null, steps };
}

/** Mulberry32 keeps map generation independent of Math.random and time. */
function randomSource(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function createBoard(
  preset: "maze" | "scatter" | "empty",
  seed: number,
): Board {
  if (!isSeed(seed))
    throw new TypeError("Seed must be an unsigned 32-bit integer.");
  if (preset !== "maze" && preset !== "scatter" && preset !== "empty") {
    throw new TypeError("Unknown map preset.");
  }
  const random = randomSource(seed);
  const mask = new Uint8Array(CELL_COUNT);

  if (preset === "maze") {
    mask.fill(1);
    mask[DEFAULT_START] = 0;
    const stack = [DEFAULT_START];

    // Iterative randomized DFS creates a spanning tree over odd-coordinate
    // rooms: every room is reachable and the base maze has a unique route.
    while (stack.length > 0) {
      const current = stack[stack.length - 1];
      const x = current % COLS;
      const y = Math.floor(current / COLS);
      const choices: number[] = [];
      if (x + 2 < COLS - 1 && mask[current + 2]) choices.push(current + 2);
      if (y + 2 < ROWS - 1 && mask[current + COLS * 2])
        choices.push(current + COLS * 2);
      if (x - 2 > 0 && mask[current - 2]) choices.push(current - 2);
      if (y - 2 > 0 && mask[current - COLS * 2])
        choices.push(current - COLS * 2);

      if (choices.length === 0) {
        stack.pop();
      } else {
        const next = choices[Math.floor(random() * choices.length)];
        mask[(current + next) / 2] = 0;
        mask[next] = 0;
        stack.push(next);
      }
    }

    // Add seeded shortcuts to the perfect-maze base. Loops provide competing
    // routes, making the algorithms' exploration differences visible.
    const shortcuts: number[] = [];
    for (let y = 1; y < ROWS - 1; y++) {
      for (let x = 1; x < COLS - 1; x++) {
        const cell = y * COLS + x;
        if (
          mask[cell] &&
          ((x % 2 === 0 && y % 2 === 1) || (x % 2 === 1 && y % 2 === 0))
        ) {
          shortcuts.push(cell);
        }
      }
    }
    const shortcutCount = Math.min(18, shortcuts.length);
    for (let i = 0; i < shortcutCount; i++) {
      const picked = i + Math.floor(random() * (shortcuts.length - i));
      [shortcuts[i], shortcuts[picked]] = [shortcuts[picked], shortcuts[i]];
      mask[shortcuts[i]] = 0;
    }
  } else if (preset === "scatter") {
    for (let cell = 0; cell < CELL_COUNT; cell++) {
      mask[cell] = random() < 0.28 ? 1 : 0;
    }
    // Carve a seeded monotone route so every generated scatter map is solvable.
    let current = DEFAULT_START;
    mask[current] = 0;
    while (current !== DEFAULT_END) {
      const canRight = current % COLS < COLS - 2;
      const canDown = Math.floor(current / COLS) < ROWS - 2;
      current += canRight && (!canDown || random() < 0.5) ? 1 : COLS;
      mask[current] = 0;
    }
  }

  const walls: number[] = [];
  for (let cell = 0; cell < CELL_COUNT; cell++)
    if (mask[cell]) walls.push(cell);
  return { walls, start: DEFAULT_START, end: DEFAULT_END, seed };
}

/** Fixed-size bitset: 805 cells become 135 URL-safe characters. */
function encodeMask(mask: Uint8Array): string {
  const bytes = new Uint8Array(WALL_BYTES);
  for (let cell = 0; cell < CELL_COUNT; cell++) {
    if (mask[cell]) bytes[cell >> 3] |= 1 << (cell & 7);
  }
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Unweighted boards keep their original v1 hashes, including empty terrain. */
export function encodeBoard(board: Board): string {
  const { walls, costs } = boardMasks(board);
  const weighted = Boolean(board.terrain?.length);
  const header = `#${weighted ? "v2" : "v1"}.${board.start.toString(36)}.${board.end.toString(36)}.${board.seed.toString(36)}`;
  const payloads = [encodeMask(walls)];
  if (weighted) {
    // Separate fixed-size cost-5 and cost-9 sets make overlap detectable and
    // bound even a completely painted map to 425 URL-safe characters.
    payloads.push(
      encodeMask(costs.map((cost) => (cost === 5 ? 1 : 0))),
      encodeMask(costs.map((cost) => (cost === 9 ? 1 : 0))),
    );
  }
  return `${header}.${payloads.join(".")}`;
}

/** Accept only canonical v1/v2 board hashes; malformed links never throw. */
export function decodeBoard(hash: string): Board | null {
  if (typeof hash !== "string" || hash.length > 425) return null;
  const text = hash.startsWith("#") ? hash.slice(1) : hash;
  const [version, startText, endText, seedText, ...payloads] = text.split(".");
  if (
    (version !== "v1" && version !== "v2") ||
    payloads.length !== (version === "v1" ? 1 : 3) ||
    !/^[0-9a-z]{1,2}$/.test(startText) ||
    !/^[0-9a-z]{1,2}$/.test(endText) ||
    !/^[0-9a-z]{1,7}$/.test(seedText) ||
    payloads.some(
      (payload) =>
        payload.length !== WALL_TEXT_LENGTH ||
        !/^[A-Za-z0-9_-]+$/.test(payload),
    )
  )
    return null;
  const start = Number.parseInt(startText, 36);
  const end = Number.parseInt(endText, 36);
  const seed = Number.parseInt(seedText, 36);
  if (!isCell(start) || !isCell(end) || !isSeed(seed)) return null;

  try {
    const binaries = payloads.map((payload) =>
      atob(payload.replace(/-/g, "+").replace(/_/g, "/") + "="),
    );
    if (binaries.some((binary) => binary.length !== WALL_BYTES)) return null;
    const walls: number[] = [];
    const terrain: TerrainCell[] = [];
    for (let cell = 0; cell < CELL_COUNT; cell++) {
      const occupied = binaries.map((binary) =>
        Boolean(binary.charCodeAt(cell >> 3) & (1 << (cell & 7))),
      );
      if (occupied.filter(Boolean).length > 1) return null;
      if (occupied[0]) walls.push(cell);
      if (occupied[1]) terrain.push({ cell, cost: 5 });
      if (occupied[2]) terrain.push({ cell, cost: 9 });
    }
    const board: Board = { walls, start, end, seed };
    if (version === "v2") board.terrain = terrain;
    // Round-tripping rejects leading zeroes, nonzero unused bits, alternative
    // base64 encodings, and endpoints on walls through the shared validator.
    return encodeBoard(board).slice(1) === text ? board : null;
  } catch {
    return null;
  }
}
