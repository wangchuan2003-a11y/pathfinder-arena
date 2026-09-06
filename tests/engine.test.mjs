import test from "node:test";
import assert from "node:assert/strict";
import {
  COLS,
  ROWS,
  createBoard,
  solve,
  encodeBoard,
  decodeBoard,
} from "../.test-build/engine.js";

const CELL_COUNT = COLS * ROWS;
const algorithms = ["astar", "dijkstra"];

// An independent FIFO BFS is the oracle for this unweighted graph. It does
// not reuse the engine's neighbor function, priority queue, or heuristic.
function bfsCost(board) {
  const walls = new Set(board.walls);
  const distances = new Map([[board.start, 0]]);
  const queue = [board.start];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const cell = queue[cursor];
    if (cell === board.end) return distances.get(cell);
    const x = cell % COLS;
    const y = Math.floor(cell / COLS);
    for (const [dx, dy] of [
      [0, -1],
      [-1, 0],
      [0, 1],
      [1, 0],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const next = ny * COLS + nx;
      if (walls.has(next) || distances.has(next)) continue;
      distances.set(next, distances.get(cell) + 1);
      queue.push(next);
    }
  }
  return null;
}

function checkResult(board, result, expectedCost) {
  const walls = new Set(board.walls);
  assert.equal(result.cost, expectedCost);
  assert.equal(new Set(result.visited).size, result.visited.length);
  assert.equal(result.visited[0], board.start);
  for (const cell of result.visited) {
    assert.ok(Number.isInteger(cell) && cell >= 0 && cell < CELL_COUNT);
    assert.ok(!walls.has(cell));
  }
  if (expectedCost === null) {
    assert.deepEqual(result.path, []);
    assert.ok(!result.visited.includes(board.end));
    return;
  }
  assert.equal(result.path.length, expectedCost + 1);
  assert.equal(result.path[0], board.start);
  assert.equal(result.path.at(-1), board.end);
  assert.equal(result.visited.at(-1), board.end);
  for (let i = 0; i < result.path.length; i++) {
    const cell = result.path[i];
    assert.ok(!walls.has(cell));
    assert.ok(result.visited.includes(cell));
    if (i === 0) continue;
    const previous = result.path[i - 1];
    const step =
      Math.abs((cell % COLS) - (previous % COLS)) +
      Math.abs(Math.floor(cell / COLS) - Math.floor(previous / COLS));
    assert.equal(step, 1, "every path edge is one orthogonal move");
  }
}

for (const preset of ["maze", "scatter", "empty"]) {
  test(`${preset}: both algorithms match BFS across 32 seeds`, () => {
    for (let seed = 0; seed < 32; seed++) {
      const board = createBoard(preset, seed);
      const expectedCost = bfsCost(board);
      assert.notEqual(
        expectedCost,
        null,
        `${preset} seed ${seed} is reachable`,
      );
      for (const algorithm of algorithms) {
        checkResult(board, solve(board, algorithm), expectedCost);
      }
    }
  });
}

test("both algorithms match BFS on arbitrary endpoints and walls", () => {
  let state = 0x9e3779b9;
  const random = () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  for (let example = 0; example < 80; example++) {
    const start = Math.floor(random() * CELL_COUNT);
    const end = Math.floor(random() * CELL_COUNT);
    const density = example % 2 === 0 ? 0.23 : 0.48;
    const walls = [];
    for (let cell = 0; cell < CELL_COUNT; cell++) {
      if (cell !== start && cell !== end && random() < density)
        walls.push(cell);
    }
    const board = { walls, start, end, seed: example };
    const expectedCost = bfsCost(board);
    for (const algorithm of algorithms)
      checkResult(board, solve(board, algorithm), expectedCost);
  }
});

test("a solid barrier reports an unreachable goal and explores only reachable cells", () => {
  const board = createBoard("empty", 1);
  board.walls = Array.from({ length: COLS }, (_, x) => 11 * COLS + x);
  for (const algorithm of algorithms) {
    const result = solve(board, algorithm);
    checkResult(board, result, null);
    assert.equal(result.visited.length, 11 * COLS);
    assert.ok(result.visited.every((cell) => cell < 11 * COLS));
  }
});

test("an isolated start does not wrap around row boundaries", () => {
  const board = { walls: [1, COLS], start: 0, end: COLS - 1, seed: 3 };
  for (const algorithm of algorithms) {
    assert.deepEqual(solve(board, algorithm), {
      visited: [0],
      path: [],
      cost: null,
    });
  }
});

test("identical endpoints produce a zero-cost path and survive sharing", () => {
  const board = createBoard("maze", 10);
  board.end = board.start;
  for (const algorithm of algorithms) {
    assert.deepEqual(solve(board, algorithm), {
      visited: [board.start],
      path: [board.start],
      cost: 0,
    });
  }
  assert.deepEqual(decodeBoard(encodeBoard(board)), board);
});

test("seeded maps and tie-breaking are reproducible and input is immutable", () => {
  for (const preset of ["maze", "scatter", "empty"]) {
    const board = createBoard(preset, 0xffffffff);
    assert.deepEqual(board, createBoard(preset, 0xffffffff));
    const before = structuredClone(board);
    Object.freeze(board.walls);
    Object.freeze(board);
    for (const algorithm of algorithms) {
      assert.deepEqual(solve(board, algorithm), solve(board, algorithm));
    }
    assert.deepEqual(decodeBoard(encodeBoard(board)), before);
    assert.deepEqual(board, before);
  }
  for (const preset of ["maze", "scatter"]) {
    assert.notDeepEqual(
      createBoard(preset, 42).walls,
      createBoard(preset, 43).walls,
    );
  }
});

test("A* expands fewer cells on an open board and the demonstration mazes", () => {
  for (const preset of ["maze", "empty"]) {
    for (const seed of [0, 1, 7, 42, 2026, 0xffffffff]) {
      const board = createBoard(preset, seed);
      const astar = solve(board, "astar");
      const dijkstra = solve(board, "dijkstra");
      assert.equal(astar.cost, dijkstra.cost);
      assert.ok(
        astar.visited.length < dijkstra.visited.length,
        `${preset} seed ${seed}`,
      );
    }
  }
});

test("every odd maze room is connected and random shortcuts create cycles", () => {
  const board = createBoard("maze", 123);
  const walls = new Set(board.walls);
  const openCells = CELL_COUNT - walls.size;
  // A perfect DFS maze has R rooms and R-1 corridors; 18 extra corridors add loops.
  const rooms = ((COLS - 1) / 2) * ((ROWS - 1) / 2);
  assert.equal(openCells, rooms * 2 - 1 + 18);
  for (let y = 1; y < ROWS - 1; y += 2) {
    for (let x = 1; x < COLS - 1; x += 2) {
      assert.notEqual(bfsCost({ ...board, end: y * COLS + x }), null);
    }
  }
  for (let x = 0; x < COLS; x++) {
    assert.ok(walls.has(x));
    assert.ok(walls.has((ROWS - 1) * COLS + x));
  }
});

test("compact sharing round-trips maps, edits, endpoint moves and extreme seeds", () => {
  for (const preset of ["maze", "scatter", "empty"]) {
    for (const seed of [0, 42, 0xffffffff]) {
      const board = createBoard(preset, seed);
      const hash = encodeBoard(board);
      assert.ok(hash.length <= 160);
      assert.match(hash, /^#[A-Za-z0-9_.-]+$/);
      assert.deepEqual(decodeBoard(hash), board);
      assert.deepEqual(decodeBoard(hash.slice(1)), board);
    }
  }
  const board = {
    walls: [CELL_COUNT - 1, 17, 40, 0],
    start: 2,
    end: 800,
    seed: 123,
  };
  const decoded = decodeBoard(encodeBoard(board));
  assert.deepEqual(decoded, { ...board, walls: [0, 17, 40, CELL_COUNT - 1] });
  assert.deepEqual(board.walls, [CELL_COUNT - 1, 17, 40, 0]);
});

test("sharing rejects malformed, oversized, noncanonical and invalid board data", () => {
  const valid = encodeBoard(createBoard("empty", 1));
  const parts = valid.split(".");
  const replace = (part, value) =>
    parts.map((text, i) => (i === part ? value : text)).join(".");
  const unusedBits = Buffer.alloc(Math.ceil(CELL_COUNT / 8));
  unusedBits[unusedBits.length - 1] = 0x20;
  const invalid = [
    "",
    "#",
    "#v2." + valid.slice(4),
    valid + ".",
    valid + "\n",
    " " + valid,
    "https://example.com/" + valid,
    null,
    undefined,
    {},
    42,
    "#".repeat(10000),
    replace(1, "-1"),
    replace(1, CELL_COUNT.toString(36)),
    replace(2, "zz"),
    replace(3, "1z141z4"),
    replace(3, "01"),
    replace(1, "01"),
    replace(3, "1.5"),
    replace(4, parts[4].slice(1)),
    replace(4, parts[4] + "A"),
    replace(4, "=".repeat(135)),
    // Nonzero unused final bits and a noncanonical base64 trailing pad bit.
    replace(4, unusedBits.toString("base64url")),
    replace(4, "A".repeat(134) + "B"),
  ];
  for (const value of invalid)
    assert.equal(decodeBoard(value), null, String(value).slice(0, 100));

  const endpointOnWall = encodeBoard({
    walls: [1],
    start: 0,
    end: 2,
    seed: 1,
  }).split(".");
  endpointOnWall[1] = "1";
  assert.equal(decodeBoard(endpointOnWall.join(".")), null);
});

test("invalid direct API inputs are rejected instead of silently corrupting results", () => {
  const valid = createBoard("empty", 1);
  const invalid = [
    { ...valid, start: -1 },
    { ...valid, end: CELL_COUNT },
    { ...valid, seed: -1 },
    { ...valid, seed: NaN },
    { ...valid, walls: [1, 1] },
    { ...valid, walls: [CELL_COUNT] },
    { ...valid, walls: [1.5] },
    { ...valid, walls: [valid.start] },
    { ...valid, walls: [valid.end] },
  ];
  for (const board of invalid) {
    assert.throws(() => encodeBoard(board), TypeError);
    for (const algorithm of algorithms)
      assert.throws(() => solve(board, algorithm), TypeError);
  }
  for (const seed of [-1, 0x100000000, 1.5, NaN, Infinity]) {
    assert.throws(() => createBoard("maze", seed), TypeError);
  }
  assert.throws(() => createBoard("unknown", 1), TypeError);
  assert.throws(() => solve(valid, "unknown"), TypeError);
});
