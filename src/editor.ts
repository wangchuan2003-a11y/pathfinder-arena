import { COLS, ROWS, encodeBoard, decodeBoard, type Board } from "./engine.js";

export type Tool = "wall" | "erase" | "start" | "end" | "sand" | "water";
export type MapPreset = "maze" | "scatter" | "empty" | "custom";
export type EditorSnapshot = { board: Board; preset: MapPreset };
export type DraftStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

const DRAFT_KEY = "pathfinder-arena:draft";
const MAX_JSON_LENGTH = 50_000;
const HISTORY_LIMIT = 50;

function isPreset(value: unknown): value is MapPreset {
  return ["maze", "scatter", "empty", "custom"].includes(value as string);
}

function cloneBoard(board: Board): Board {
  const copy: Board = {
    walls: [...board.walls],
    start: board.start,
    end: board.end,
    seed: board.seed,
  };
  if (board.terrain)
    copy.terrain = board.terrain.map((entry) => ({ ...entry }));
  return copy;
}

function cloneSnapshot(snapshot: EditorSnapshot): EditorSnapshot {
  return { board: cloneBoard(snapshot.board), preset: snapshot.preset };
}

/** Apply one cell edit without mutating the board; no-ops preserve identity. */
export function applyTool(board: Board, index: number, tool: Tool): Board {
  if (!Number.isInteger(index) || index < 0 || index >= COLS * ROWS)
    return board;
  const walls = new Set(board.walls);
  const terrain = new Map(
    (board.terrain ?? []).map(({ cell, cost }) => [cell, cost]),
  );
  let { start, end } = board;

  switch (tool) {
    case "wall":
      if (index === start || index === end || walls.has(index)) return board;
      walls.add(index);
      terrain.delete(index);
      break;
    case "erase":
      if (!walls.has(index) && !terrain.has(index)) return board;
      walls.delete(index);
      terrain.delete(index);
      break;
    case "sand":
    case "water": {
      const cost = tool === "sand" ? 5 : 9;
      if (!walls.has(index) && terrain.get(index) === cost) return board;
      walls.delete(index);
      terrain.set(index, cost);
      break;
    }
    case "start":
      if (index === start) return board;
      start = index;
      walls.delete(index);
      break;
    case "end":
      if (index === end) return board;
      end = index;
      walls.delete(index);
      break;
    default:
      return board;
  }

  const edited: Board = {
    walls: [...walls].sort((a, b) => a - b),
    start,
    end,
    seed: board.seed,
  };
  if (terrain.size > 0 || board.terrain) {
    edited.terrain = [...terrain]
      .sort(([a], [b]) => a - b)
      .map(([cell, cost]) => ({ cell, cost }));
  }
  return edited;
}

type HistoryEntry = { snapshot: EditorSnapshot; encoded: string };

function historyEntry(snapshot: EditorSnapshot): HistoryEntry {
  if (!isPreset(snapshot.preset)) throw new TypeError("Invalid map preset.");
  return {
    encoded: encodeBoard(snapshot.board),
    snapshot: cloneSnapshot(snapshot),
  };
}

/** Retains at most 50 snapshots, including the current snapshot. */
export class History {
  private entries: HistoryEntry[];
  private cursor = 0;

  constructor(initial: EditorSnapshot) {
    this.entries = [historyEntry(initial)];
  }

  get current(): EditorSnapshot {
    return cloneSnapshot(this.entries[this.cursor].snapshot);
  }

  get canUndo(): boolean {
    return this.cursor > 0;
  }

  get canRedo(): boolean {
    return this.cursor < this.entries.length - 1;
  }

  commit(next: EditorSnapshot): EditorSnapshot {
    const entry = historyEntry(next);
    const current = this.entries[this.cursor];
    if (
      entry.encoded === current.encoded &&
      entry.snapshot.preset === current.snapshot.preset
    ) {
      return this.current;
    }
    this.entries = this.entries.slice(0, this.cursor + 1);
    this.entries.push(entry);
    if (this.entries.length > HISTORY_LIMIT) this.entries.shift();
    this.cursor = this.entries.length - 1;
    return this.current;
  }

  undo(): EditorSnapshot {
    if (this.canUndo) this.cursor--;
    return this.current;
  }

  redo(): EditorSnapshot {
    if (this.canRedo) this.cursor++;
    return this.current;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

/** A failed save leaves the existing draft untouched when storage rejects it. */
export function saveDraft(
  storage: DraftStorage,
  snapshot: EditorSnapshot,
): boolean {
  try {
    if (!isPreset(snapshot.preset)) return false;
    const value = JSON.stringify({
      version: 1,
      board: encodeBoard(snapshot.board),
      preset: snapshot.preset,
    });
    storage.setItem(DRAFT_KEY, value);
    return true;
  } catch {
    return false;
  }
}

export function loadDraft(storage: DraftStorage): EditorSnapshot | null {
  try {
    const text = storage.getItem(DRAFT_KEY);
    if (typeof text !== "string" || text.length > MAX_JSON_LENGTH) return null;
    const value: unknown = JSON.parse(text);
    if (
      !isRecord(value) ||
      !hasOnlyKeys(value, ["version", "board", "preset"]) ||
      value.version !== 1 ||
      typeof value.board !== "string" ||
      !isPreset(value.preset)
    ) {
      return null;
    }
    const board = decodeBoard(value.board);
    return board ? { board, preset: value.preset } : null;
  } catch {
    return null;
  }
}

/** Export readable board data with explicit schema and grid dimensions. */
export function mapToJSON(board: Board): string {
  const validated = decodeBoard(encodeBoard(board));
  if (!validated) throw new TypeError("Invalid board.");
  return JSON.stringify(
    { version: 1, cols: COLS, rows: ROWS, board: validated },
    null,
    2,
  );
}

export function mapFromJSON(text: string): Board | null {
  if (typeof text !== "string" || text.length > MAX_JSON_LENGTH) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (
      !isRecord(value) ||
      !hasOnlyKeys(value, ["version", "cols", "rows", "board"]) ||
      value.version !== 1 ||
      value.cols !== COLS ||
      value.rows !== ROWS ||
      !isRecord(value.board) ||
      !hasOnlyKeys(value.board, ["walls", "start", "end", "seed", "terrain"])
    ) {
      return null;
    }
    return decodeBoard(encodeBoard(value.board as Board));
  } catch {
    return null;
  }
}
