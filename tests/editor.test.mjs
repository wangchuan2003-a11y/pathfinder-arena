import test from "node:test";
import assert from "node:assert/strict";
import { COLS, ROWS, createBoard, encodeBoard } from "../.test-build/engine.js";
import {
  applyTool,
  History,
  saveDraft,
  loadDraft,
  mapToJSON,
  mapFromJSON,
} from "../.test-build/editor.js";

const empty = () => createBoard("empty", 42);
const state = (board = empty(), preset = "empty") => ({ board, preset });
const sameBoard = (actual, expected) =>
  assert.equal(encodeBoard(actual), encodeBoard(expected));

function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function memoryStorage(initial = null) {
  let value = initial;
  const reads = [];
  const writes = [];
  return {
    reads,
    writes,
    getItem(key) {
      reads.push(key);
      return value;
    },
    setItem(key, next) {
      writes.push([key, next]);
      value = next;
    },
  };
}

test("wall and erase tools preserve endpoints and replace terrain without mutation", () => {
  const board = freeze({
    ...empty(),
    walls: [40],
    terrain: [
      { cell: 41, cost: 5 },
      { cell: 42, cost: 9 },
    ],
  });
  assert.equal(applyTool(board, board.start, "wall"), board);
  assert.equal(applyTool(board, board.end, "wall"), board);
  assert.equal(applyTool(board, 40, "wall"), board);
  const wall = applyTool(board, 41, "wall");
  assert.deepEqual(wall.walls, [40, 41]);
  assert.deepEqual(wall.terrain, [{ cell: 42, cost: 9 }]);
  assert.deepEqual(board.walls, [40]);
  assert.equal(board.terrain.length, 2);
  const erasedWall = applyTool(wall, 41, "erase");
  assert.deepEqual(erasedWall.walls, [40]);
  const erasedTerrain = applyTool(erasedWall, 42, "erase");
  assert.deepEqual(erasedTerrain.terrain, []);
  assert.equal(applyTool(erasedTerrain, 42, "erase"), erasedTerrain);
});

test("sand and water clear walls, replace costs, and allow weighted endpoints", () => {
  const board = freeze({ ...empty(), walls: [40] });
  const sand = applyTool(board, 40, "sand");
  assert.deepEqual(sand.walls, []);
  assert.deepEqual(sand.terrain, [{ cell: 40, cost: 5 }]);
  assert.equal(applyTool(sand, 40, "sand"), sand);
  const water = applyTool(sand, 40, "water");
  assert.deepEqual(water.terrain, [{ cell: 40, cost: 9 }]);
  assert.equal(applyTool(water, 40, "water"), water);
  const weightedStart = applyTool(water, board.start, "water");
  const weightedEnd = applyTool(weightedStart, board.end, "sand");
  assert.equal(weightedEnd.start, board.start);
  assert.equal(weightedEnd.end, board.end);
  assert.deepEqual(weightedEnd.terrain, [
    { cell: board.start, cost: 9 },
    { cell: 40, cost: 9 },
    { cell: board.end, cost: 5 },
  ]);
  assert.doesNotThrow(() => encodeBoard(weightedEnd));
  assert.deepEqual(board.walls, [40]);
});

test("moving endpoints clears walls, retains terrain, and allows overlap", () => {
  const board = freeze({
    ...empty(),
    walls: [40],
    terrain: [{ cell: 41, cost: 9 }],
  });
  assert.equal(applyTool(board, board.start, "start"), board);
  assert.equal(applyTool(board, board.end, "end"), board);
  const start = applyTool(board, 40, "start");
  assert.equal(start.start, 40);
  assert.deepEqual(start.walls, []);
  const end = applyTool(start, 41, "end");
  const coincident = applyTool(end, 41, "start");
  assert.equal(coincident.start, 41);
  assert.equal(coincident.end, 41);
  assert.deepEqual(coincident.terrain, [{ cell: 41, cost: 9 }]);
  assert.doesNotThrow(() => encodeBoard(coincident));
  const movedEnd = applyTool(board, 40, "end");
  assert.equal(movedEnd.end, 40);
  assert.deepEqual(movedEnd.walls, []);
});

test("invalid cell positions and empty erases are identity-preserving no-ops", () => {
  const board = freeze(empty());
  for (const tool of ["wall", "erase", "start", "end", "sand", "water"]) {
    for (const index of [-1, COLS * ROWS, 0.5, NaN, Infinity]) {
      assert.equal(applyTool(board, index, tool), board);
    }
  }
  assert.equal(applyTool(board, 40, "erase"), board);
});

test("history undoes and redoes terrain and preset changes", () => {
  const initial = state();
  const history = new History(initial);
  const wall = state(applyTool(initial.board, 40, "wall"), "custom");
  const sand = state(applyTool(wall.board, 40, "sand"), "custom");
  assert.equal(history.canUndo, false);
  assert.equal(history.canRedo, false);
  history.commit(wall);
  history.commit(sand);
  assert.deepEqual(history.undo(), wall);
  assert.equal(history.canRedo, true);
  assert.deepEqual(history.undo(), initial);
  assert.equal(history.canUndo, false);
  assert.deepEqual(history.undo(), initial);
  assert.deepEqual(history.redo(), wall);
  assert.deepEqual(history.redo(), sand);
  assert.deepEqual(history.redo(), sand);
  assert.equal(history.canRedo, false);
});

test("history owns deep copies of inputs and every returned snapshot", () => {
  const initial = state({ ...empty(), terrain: [{ cell: 40, cost: 5 }] });
  const history = new History(initial);
  initial.board.terrain[0].cost = 9;
  initial.board.walls.push(41);
  initial.preset = "maze";
  assert.deepEqual(history.current.board.terrain, [{ cell: 40, cost: 5 }]);
  assert.deepEqual(history.current.board.walls, []);
  assert.equal(history.current.preset, "empty");

  const current = history.current;
  current.board.terrain[0].cost = 9;
  current.board.walls.push(41);
  const next = state(applyTool(history.current.board, 42, "water"), "custom");
  const expectedNext = structuredClone(next);
  const committed = history.commit(next);
  next.board.terrain[0].cost = 9;
  next.board.walls.push(41);
  committed.board.terrain[0].cost = 9;
  committed.board.walls.push(43);
  assert.deepEqual(history.current, expectedNext);

  const undone = history.undo();
  undone.board.terrain[0].cost = 9;
  undone.board.walls.push(44);
  const redone = history.redo();
  redone.board.terrain[0].cost = 9;
  redone.board.walls.push(45);
  assert.deepEqual(history.current, expectedNext);
  assert.deepEqual(history.undo().board.terrain, [{ cell: 40, cost: 5 }]);
  assert.deepEqual(history.current.board.walls, []);
});

test("equivalent commits retain redo, while a new edit discards only the redo branch", () => {
  const initial = state({ ...empty(), walls: [40, 41] });
  const history = new History(initial);
  const future = state(applyTool(initial.board, 42, "water"), "custom");
  history.commit(future);
  history.undo();
  history.commit(state({ ...empty(), walls: [41, 40] }));
  assert.equal(history.canUndo, false);
  assert.equal(history.canRedo, true);
  assert.deepEqual(history.redo(), future);
  history.undo();
  const branch = state(applyTool(initial.board, 43, "sand"), "custom");
  history.commit(branch);
  assert.equal(history.canRedo, false);
  assert.deepEqual(history.redo(), branch);
  sameBoard(history.undo().board, initial.board);
});

test("a preset-only change is undoable and history retains at most 50 snapshots", () => {
  const history = new History(state());
  history.commit(state(empty(), "custom"));
  assert.equal(history.canUndo, true);
  assert.equal(history.undo().preset, "empty");
  assert.equal(history.redo().preset, "custom");

  const bounded = new History(state({ ...empty(), seed: 0 }));
  for (let seed = 1; seed <= 70; seed++)
    bounded.commit(state({ ...empty(), seed }));
  let undos = 0;
  while (bounded.canUndo) {
    bounded.undo();
    undos++;
  }
  assert.equal(undos, 49);
  assert.equal(bounded.current.board.seed, 21);
  assert.equal(bounded.undo().board.seed, 21);
  let redos = 0;
  while (bounded.canRedo) {
    bounded.redo();
    redos++;
  }
  assert.equal(redos, 49);
  assert.equal(bounded.current.board.seed, 70);
});

test("drafts round-trip weighted custom maps and use only their dedicated storage key", () => {
  const snapshot = state(
    applyTool(applyTool(empty(), 40, "sand"), 41, "water"),
    "custom",
  );
  const storage = memoryStorage();
  assert.equal(saveDraft(storage, snapshot), true);
  const loaded = loadDraft(storage);
  sameBoard(loaded.board, snapshot.board);
  assert.equal(loaded.preset, "custom");
  assert.deepEqual(storage.reads, ["pathfinder-arena:draft"]);
  assert.deepEqual(
    storage.writes.map(([key]) => key),
    ["pathfinder-arena:draft"],
  );
  loaded.board.terrain[0].cost = 9;
  sameBoard(loadDraft(storage).board, snapshot.board);
});

test("storage denial, quota failures, and invalid saves are recoverable", () => {
  const denied = {
    getItem() {
      throw new Error("SecurityError: denied");
    },
    setItem() {
      throw new Error("QuotaExceededError");
    },
  };
  assert.equal(loadDraft(denied), null);
  assert.equal(saveDraft(denied, state()), false);
  const storage = memoryStorage();
  assert.equal(saveDraft(storage, state(empty(), "unknown")), false);
  assert.equal(saveDraft(storage, state({ ...empty(), start: -1 })), false);
  assert.deepEqual(storage.writes, []);
  assert.equal(loadDraft(storage), null);
});

test("malformed and unsupported drafts do not throw or write to storage", () => {
  const valid = { version: 1, board: encodeBoard(empty()), preset: "empty" };
  const invalid = [
    null,
    "",
    "{",
    "null",
    "[]",
    "true",
    " ".repeat(50_001),
    JSON.stringify({ ...valid, version: 2 }),
    JSON.stringify({ ...valid, preset: "unknown" }),
    JSON.stringify({ ...valid, board: "#v2.broken" }),
    JSON.stringify({ ...valid, board: empty() }),
    JSON.stringify({ ...valid, unexpected: true }),
  ];
  for (const value of invalid) {
    const storage = memoryStorage(value);
    assert.equal(loadDraft(storage), null);
    assert.deepEqual(storage.reads, ["pathfinder-arena:draft"]);
    assert.deepEqual(storage.writes, []);
  }
});

test("readable JSON round-trips walls, endpoints, seed, and weighted terrain", () => {
  let board = applyTool(empty(), 40, "wall");
  board = applyTool(board, board.start, "water");
  board = applyTool(board, board.end, "sand");
  const text = mapToJSON(board);
  const json = JSON.parse(text);
  assert.equal(json.version, 1);
  assert.equal(json.cols, COLS);
  assert.equal(json.rows, ROWS);
  assert.deepEqual(json.board.walls, [40]);
  assert.deepEqual(json.board.terrain, board.terrain);
  sameBoard(mapFromJSON(text), board);
  sameBoard(mapFromJSON(mapToJSON(empty())), empty());

  const fullTerrain = {
    ...empty(),
    terrain: Array.from({ length: COLS * ROWS }, (_, cell) => ({
      cell,
      cost: cell % 2 ? 5 : 9,
    })),
  };
  const maximumText = mapToJSON(fullTerrain);
  assert.ok(
    maximumText.length <= 50_000,
    "a valid full-size map fits the import bound",
  );
  sameBoard(mapFromJSON(maximumText), fullTerrain);
});

test("JSON import rejects unsupported schemas, oversized text, and malformed boards", () => {
  const envelope = { version: 1, cols: COLS, rows: ROWS, board: empty() };
  for (const text of ["", "{", "null", "[]", "1", " ".repeat(50_001), null]) {
    assert.equal(mapFromJSON(text), null);
  }
  for (const mutation of [
    { version: 99 },
    { cols: COLS + 1 },
    { rows: ROWS - 1 },
    { board: null },
    { board: [] },
    { extra: true },
  ]) {
    assert.equal(
      mapFromJSON(JSON.stringify({ ...envelope, ...mutation })),
      null,
    );
  }
  for (const mutation of [
    { walls: [40, 40] },
    { walls: [-1] },
    { walls: [COLS * ROWS] },
    { walls: [empty().start] },
    { walls: "40" },
    { seed: -1 },
    { seed: 1.5 },
    { start: "36" },
    { end: COLS * ROWS },
    { terrain: [{ cell: 40, cost: 3 }] },
    { terrain: [{ cell: -1, cost: 5 }] },
    { terrain: [{ cell: COLS * ROWS, cost: 9 }] },
    { terrain: [{ cell: "40", cost: 5 }] },
    {
      terrain: [
        { cell: 40, cost: 5 },
        { cell: 40, cost: 9 },
      ],
    },
    { walls: [40], terrain: [{ cell: 40, cost: 5 }] },
    { terrain: null },
    { terrain: "sand" },
    { terrain: [null] },
    { unexpected: "reject unknown board fields" },
  ]) {
    assert.equal(
      mapFromJSON(
        JSON.stringify({ ...envelope, board: { ...empty(), ...mutation } }),
      ),
      null,
    );
  }
  const malicious = JSON.stringify(envelope).replace(
    '"board":{',
    '"board":{"__proto__":{"polluted":true},',
  );
  assert.equal(mapFromJSON(malicious), null);
  assert.equal(Object.prototype.polluted, undefined);
  assert.throws(() => mapToJSON({ ...empty(), walls: [empty().start] }));
});
