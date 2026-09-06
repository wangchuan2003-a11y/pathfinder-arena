import "./style.css";
import {
  COLS,
  ROWS,
  createBoard,
  solve,
  encodeBoard,
  decodeBoard,
  type Board,
  type SearchResult,
} from "./engine";
type Algorithm = "astar" | "dijkstra";
type Tool = "wall" | "erase" | "start" | "end";
type MapPreset = "maze" | "scatter" | "empty";
const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const algorithms: Algorithm[] = ["astar", "dijkstra"];
let board = decodeBoard(location.hash) ?? createBoard("maze", 42);
let preset: MapPreset = "maze",
  tool: Tool = "wall",
  running = false,
  frame = 0,
  maximum = 0;
let results: Record<Algorithm, SearchResult> | null = null;
let lastPaint: Record<Algorithm, number> = { astar: 0, dijkstra: 0 };
let history: { board: Board; preset: MapPreset }[] = [];
const cells: Record<Algorithm, HTMLButtonElement[]> = {
  astar: [],
  dijkstra: [],
};
let wallSet = new Set(board.walls),
  dragging = false,
  strokeChanged = false;
const clone = (b: Board): Board => ({ ...b, walls: [...b.walls] });
function report(text: string) {
  $("result").textContent = text;
}
function updateSeed() {
  $<HTMLInputElement>("seed").value = String(board.seed);
}
function syncTabs() {
  document
    .querySelectorAll<HTMLButtonElement>("[data-map]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.map === preset)),
    );
}
function baseClass(index: number) {
  return (
    "cell" +
    (wallSet.has(index) ? " wall" : "") +
    (board.start === index ? " start" : "") +
    (board.end === index ? " end" : "")
  );
}
function label(index: number) {
  return `第 ${Math.floor(index / COLS) + 1} 行，第 ${(index % COLS) + 1} 列，${index === board.start ? "起点" : index === board.end ? "终点" : wallSet.has(index) ? "墙" : "空地"}`;
}
function paintBase() {
  wallSet = new Set(board.walls);
  for (const a of algorithms)
    for (let i = 0; i < COLS * ROWS; i++) {
      const c = cells[a][i];
      c.className = baseClass(i);
      c.textContent = i === board.start ? "S" : i === board.end ? "G" : "";
      c.setAttribute("aria-label", label(i));
    }
  lastPaint = { astar: 0, dijkstra: 0 };
}
function controls() {
  const finished = results && frame >= maximum;
  $("run").innerHTML = running
    ? "暂停 <span>Ⅱ</span>"
    : finished
      ? "再跑一次 <span>↻</span>"
      : frame > 0
        ? "继续对决 <span>▶</span>"
        : "开始对决 <span>▶</span>";
  const timeline = $<HTMLInputElement>("timeline");
  timeline.disabled = !results;
  timeline.max = String(Math.max(1, maximum));
  timeline.value = String(frame);
  $("timeline-value").textContent = `${frame} / ${maximum}`;
  $<HTMLButtonElement>("undo").disabled = history.length === 0;
}
function clearSearch() {
  running = false;
  results = null;
  frame = 0;
  maximum = 0;
  paintBase();
  for (const a of algorithms) {
    $(a + "-visited").textContent = "0";
    $(a + "-cost").textContent = "—";
    $(a + "-state").textContent = "等待出发";
  }
  controls();
}
function prepare() {
  if (!results) {
    results = {
      astar: solve(board, "astar"),
      dijkstra: solve(board, "dijkstra"),
    };
    maximum = Math.max(
      results.astar.visited.length,
      results.dijkstra.visited.length,
    );
    controls();
  }
}
function finishedMessage() {
  if (!results) return;
  if (results.astar.cost === null) {
    report("此路不通。两种算法都没有找到路径，试着擦掉几格墙。");
    return;
  }
  const a = results.astar.visited.length,
    d = results.dijkstra.visited.length,
    diff = d - a;
  const comparison =
    diff > 0
      ? `A* 少探索了 ${diff} 个节点。`
      : diff < 0
        ? `本图 Dijkstra 少探索了 ${-diff} 个节点。`
        : "两者探索的节点数相同。";
  report(
    `对决完成：最短距离均为 ${results.astar.cost} 步。${comparison}这是展开节点数对比，不是实际运行时间。`,
  );
}
function paintProgress(rebuild = false) {
  if (!results) return;
  if (rebuild) paintBase();
  for (const a of algorithms) {
    const r = results[a],
      upto = Math.min(frame, r.visited.length);
    for (let j = lastPaint[a]; j < upto; j++)
      cells[a][r.visited[j]].classList.add("visited");
    lastPaint[a] = upto;
    const done = frame >= r.visited.length;
    if (done) for (const i of r.path) cells[a][i].classList.add("path");
    $(a + "-visited").textContent = String(upto);
    $(a + "-cost").textContent = done && r.cost !== null ? String(r.cost) : "—";
    $(a + "-state").textContent = done
      ? r.cost === null
        ? "无可达路径"
        : "已到达"
      : frame
        ? "正在探索"
        : "等待出发";
  }
  controls();
  if (frame >= maximum) finishedMessage();
}
function remember() {
  history.push({ board: clone(board), preset });
  if (history.length > 40) history.shift();
}
function updateCell(index: number) {
  if (index < 0 || index >= COLS * ROWS) return false;
  const oldWall = wallSet.has(index);
  if (tool === "wall") {
    if (index === board.start || index === board.end || oldWall) return false;
    wallSet.add(index);
  } else if (tool === "erase") {
    if (!oldWall) return false;
    wallSet.delete(index);
  } else if (tool === "start") {
    if (index === board.start) return false;
    board.start = index;
    wallSet.delete(index);
  } else {
    if (index === board.end) return false;
    board.end = index;
    wallSet.delete(index);
  }
  board.walls = Array.from(wallSet).sort((a, b) => a - b);
  return true;
}
function editSingle(index: number) {
  const before = clone(board);
  if (updateCell(index)) {
    history.push({ board: before, preset });
    if (history.length > 40) history.shift();
    clearSearch();
    report("地图已更新。两种算法会从相同地图重新出发。");
  }
}
function endStroke() {
  if (!dragging) return;
  dragging = false;
  if (!strokeChanged) history.pop();
  report(
    strokeChanged
      ? "地图已更新。两种算法会从相同地图重新出发。"
      : "回放已重置，地图未改变。",
  );
  controls();
}
for (const algorithm of algorithms) {
  const grid = $(algorithm + "-grid");
  for (let row = 0; row < ROWS; row++) {
    const rowElement = document.createElement("div");
    rowElement.className = "grid-row";
    rowElement.setAttribute("role", "row");
    for (let col = 0; col < COLS; col++) {
      const index = row * COLS + col,
        c = document.createElement("button");
      c.className = "cell";
      c.type = "button";
      c.dataset.index = String(index);
      c.setAttribute("role", "gridcell");
      c.tabIndex = index === board.start ? 0 : -1;
      rowElement.append(c);
      cells[algorithm].push(c);
    }
    grid.append(rowElement);
  }
  grid.addEventListener("pointerdown", (e) => {
    const event = e as PointerEvent;
    if (event.button !== 0) return;
    const target = (event.target as Element).closest<HTMLButtonElement>(
      ".cell",
    );
    if (!target) return;
    event.preventDefault();
    dragging = true;
    strokeChanged = false;
    remember();
    clearSearch();
    if (updateCell(Number(target.dataset.index))) {
      strokeChanged = true;
      paintBase();
    }
    grid.setPointerCapture(event.pointerId);
  });
  grid.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const event = e as PointerEvent;
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLButtonElement>(".cell");
    if (!target || !grid.contains(target)) return;
    if (updateCell(Number(target.dataset.index))) {
      strokeChanged = true;
      paintBase();
    }
  });
  grid.addEventListener("pointerup", endStroke);
  grid.addEventListener("pointercancel", endStroke);
  grid.addEventListener("lostpointercapture", endStroke);
  grid.addEventListener("keydown", (e) => {
    const event = e as KeyboardEvent,
      target = (event.target as Element).closest<HTMLButtonElement>(".cell");
    if (!target) return;
    const index = Number(target.dataset.index);
    let next = index;
    switch (event.key) {
      case "ArrowLeft":
        next = Math.max(Math.floor(index / COLS) * COLS, index - 1);
        break;
      case "ArrowRight":
        next = Math.min(Math.floor(index / COLS) * COLS + COLS - 1, index + 1);
        break;
      case "ArrowUp":
        next = Math.max(0, index - COLS);
        break;
      case "ArrowDown":
        next = Math.min(COLS * ROWS - 1, index + COLS);
        break;
      case " ":
      case "Enter":
        event.preventDefault();
        editSingle(index);
        return;
      default:
        return;
    }
    event.preventDefault();
    target.tabIndex = -1;
    cells[algorithm][next].tabIndex = 0;
    cells[algorithm][next].focus();
  });
}
window.addEventListener("pointerup", endStroke);
document.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach(
  (b) =>
    (b.onclick = () => {
      tool = b.dataset.tool as Tool;
      document
        .querySelectorAll<HTMLButtonElement>("[data-tool]")
        .forEach((t) => t.setAttribute("aria-pressed", String(t === b)));
    }),
);
function generate(next: MapPreset, seed: number) {
  remember();
  preset = next;
  board = createBoard(next, seed);
  updateSeed();
  syncTabs();
  clearSearch();
  report("地图已准备好。点击开始对决，观察两种策略。");
}
document
  .querySelectorAll<HTMLButtonElement>("[data-map]")
  .forEach(
    (b) => (b.onclick = () => generate(b.dataset.map as MapPreset, board.seed)),
  );
function readSeed() {
  const value = Number($<HTMLInputElement>("seed").value);
  return Number.isFinite(value)
    ? Math.max(0, Math.min(4294967295, Math.floor(value)))
    : 42;
}
$("regenerate").onclick = () => generate(preset, readSeed());
$("shuffle").onclick = () =>
  generate(preset, crypto.getRandomValues(new Uint32Array(1))[0]);
$("seed").addEventListener("keydown", (e) => {
  if ((e as KeyboardEvent).key === "Enter") generate(preset, readSeed());
});
$("undo").onclick = () => {
  const previous = history.pop();
  if (previous) {
    board = previous.board;
    preset = previous.preset;
    syncTabs();
    updateSeed();
    clearSearch();
    report("已撤销上一次地图编辑。");
  }
};
$("run").onclick = () => {
  if (running) {
    running = false;
    controls();
    return;
  }
  if (results && frame >= maximum) {
    frame = 0;
    paintBase();
  }
  prepare();
  running = true;
  report("同速回放中：每次推进，两侧各展开一个节点。");
  controls();
};
$("step").onclick = () => {
  running = false;
  prepare();
  frame = Math.min(maximum, frame + 1);
  paintProgress();
};
$("reset").onclick = () => {
  clearSearch();
  report("回放已重置，地图保持不变。");
};
$("timeline").addEventListener("input", () => {
  running = false;
  frame = Number($<HTMLInputElement>("timeline").value);
  paintProgress(true);
  if (frame < maximum)
    report(`正在查看第 ${frame} 次展开。点击继续对决可接着播放。`);
});
$("share").onclick = async () => {
  const url = new URL(location.href);
  url.hash = encodeBoard(board).replace(/^#/, "");
  window.history.replaceState(null, "", url);
  try {
    await navigator.clipboard.writeText(url.href);
    report("地图链接已复制。别人打开后会得到相同的墙、起点和终点。");
  } catch {
    report("地图已保存到地址栏。请复制浏览器地址来分享。");
  }
};
window.addEventListener("hashchange", () => {
  const parsed = decodeBoard(location.hash);
  if (parsed) {
    remember();
    board = parsed;
    updateSeed();
    clearSearch();
    report("已载入分享地图。");
  } else if (location.hash && !["#how", "#arena"].includes(location.hash))
    report("分享链接无效，保留当前地图。");
});
let last = performance.now(),
  budget = 0;
function tick(now: number) {
  const elapsed = Math.min(now - last, 100);
  last = now;
  if (running && !document.hidden) {
    budget += (elapsed / 1000) * Number($<HTMLSelectElement>("speed").value);
    const steps = Math.floor(budget);
    if (steps) {
      budget -= steps;
      frame = Math.min(maximum, frame + steps);
      if (frame >= maximum) running = false;
      paintProgress();
    }
  } else budget = 0;
  requestAnimationFrame(tick);
}
updateSeed();
paintBase();
controls();
if (
  location.hash &&
  !["#how", "#arena"].includes(location.hash) &&
  !decodeBoard(location.hash)
)
  report("分享链接无效，已载入默认迷宫。");
requestAnimationFrame(tick);
