import "./style.css";
import {
  COLS,
  ROWS,
  createBoard,
  solve,
  encodeBoard,
  decodeBoard,
  type Algorithm,
  type Board,
  type SearchResult,
} from "./engine";
import {
  History,
  applyTool,
  saveDraft,
  loadDraft,
  mapToJSON,
  mapFromJSON,
  type Tool,
  type EditorSnapshot,
} from "./editor";
import { createScenario, scenarioText, type Scenario } from "./scenarios";
const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const algorithms: Algorithm[] = ["astar", "dijkstra"];
const tools: Tool[] = ["wall", "erase", "start", "end", "sand", "water"];
const namedAnchor = () =>
  ["", "#arena", "#how", "#playback"].includes(location.hash);
let storage: Storage | undefined;
try {
  storage = window.localStorage;
} catch {
  /* Private browsing may disable storage. */
}
const shared = decodeBoard(location.hash);
const draft = namedAnchor() && storage ? loadDraft(storage) : null;
const initial: EditorSnapshot = shared
  ? { board: shared, preset: "custom" }
  : (draft ?? { board: createBoard("maze", 42), preset: "maze" });
const history = new History(initial);
let board = initial.board,
  preset = initial.preset,
  tool: Tool = "wall";
let running = false,
  frame = 0,
  maximum = 0,
  budget = 0;
let results: Record<Algorithm, SearchResult> | null = null;
let lastPaint: Record<Algorithm, number> = { astar: 0, dijkstra: 0 };
let currentNode: Record<Algorithm, number | null> = {
  astar: null,
  dijkstra: null,
};
const cells: Record<Algorithm, HTMLButtonElement[]> = {
  astar: [],
  dijkstra: [],
};
let wallSet = new Set(board.walls),
  terrain = new Map(board.terrain?.map((t) => [t.cell, t.cost]));
let dragging = false,
  strokeChanged = false;
let editMode = !matchMedia("(pointer: coarse)").matches;
let selected = board.start,
  selectedAlgorithm: Algorithm = "astar";
function report(message: string) {
  $("result").textContent = message;
}
function persist() {
  const ok = storage ? saveDraft(storage, { board, preset }) : false;
  $("save-state").textContent = ok
    ? "草稿已保存在此浏览器"
    : "草稿无法保存，可导出地图备份";
}
function syncMap() {
  wallSet = new Set(board.walls);
  terrain = new Map(board.terrain?.map((t) => [t.cell, t.cost]));
  $<HTMLInputElement>("seed").value = String(board.seed);
  document
    .querySelectorAll<HTMLButtonElement>("[data-map]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.map === preset)),
    );
  $("map-state").textContent =
    preset === "custom" ? "自定义地图" : "可复现预设";
  $<HTMLButtonElement>("regenerate").disabled = preset === "custom";
}
function label(index: number) {
  const location = `第 ${Math.floor(index / COLS) + 1} 行，第 ${(index % COLS) + 1} 列`;
  const endpoint =
    index === board.start && index === board.end
      ? "起点和终点"
      : index === board.start
        ? "起点"
        : index === board.end
          ? "终点"
          : "";
  return `${location}，${endpoint || (wallSet.has(index) ? "墙" : terrain.get(index) === 5 ? "沙地" : terrain.get(index) === 9 ? "水域" : "普通地面")}，${wallSet.has(index) ? "不可通行" : `进入代价 ${terrain.get(index) ?? 1}`}`;
}
function baseClass(index: number) {
  return (
    "cell" +
    (wallSet.has(index) ? " wall" : "") +
    (terrain.get(index) === 5 ? " sand" : "") +
    (terrain.get(index) === 9 ? " water" : "") +
    (board.start === index ? " start" : "") +
    (board.end === index ? " end" : "")
  );
}
function paintBase() {
  syncMap();
  for (const a of algorithms)
    for (let i = 0; i < COLS * ROWS; i++) {
      const c = cells[a][i];
      c.className = baseClass(i);
      c.textContent =
        i === board.start && i === board.end
          ? "◎"
          : i === board.start
            ? "S"
            : i === board.end
              ? "G"
              : terrain.has(i)
                ? String(terrain.get(i))
                : "";
      c.setAttribute("aria-label", label(i));
    }
  lastPaint = { astar: 0, dijkstra: 0 };
  currentNode = { astar: null, dijkstra: null };
  updateSelection(false);
}
function updateSelection(focus: boolean) {
  $("selection").textContent = label(selected);
  for (const a of algorithms) {
    for (const cell of cells[a]) cell.tabIndex = -1;
    cells[a][selected].tabIndex = 0;
  }
  if (focus) {
    cells[selectedAlgorithm][selected].focus();
    cells[selectedAlgorithm][selected].scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  }
}
function controls() {
  const finished = !!results && frame >= maximum;
  $("run").innerHTML = running
    ? "暂停 <span>Ⅱ</span>"
    : finished
      ? "再跑一次 <span>↻</span>"
      : frame
        ? "继续对决 <span>▶</span>"
        : "开始对决 <span>▶</span>";
  $("quick-run").textContent = running
    ? "暂停"
    : finished
      ? "再跑一次"
      : frame
        ? "继续对决"
        : "开始对决";
  const timeline = $<HTMLInputElement>("timeline");
  timeline.disabled = !results;
  timeline.max = String(Math.max(1, maximum));
  timeline.value = String(frame);
  $("timeline-value").textContent = `${frame} / ${maximum}`;
  $<HTMLButtonElement>("undo").disabled = !history.canUndo;
  $<HTMLButtonElement>("redo").disabled = !history.canRedo;
}
function clearSearch() {
  running = false;
  results = null;
  frame = 0;
  maximum = 0;
  budget = 0;
  paintBase();
  for (const a of algorithms) {
    $(a + "-visited").textContent = "0";
    $(a + "-cost").textContent = "—";
    $(a + "-length").textContent = "—";
    $(a + "-state").textContent = "等待出发";
    for (const key of ["g", "h", "f", "frontier"])
      $(a + "-" + key).textContent = "—";
    $(a + "-current").textContent = "点击单步，观察每个决定";
  }
  controls();
}
function adopt(snapshot: EditorSnapshot, message: string, commit = true) {
  endStroke();
  if (commit) history.commit(snapshot);
  board = snapshot.board;
  preset = snapshot.preset;
  selected = Math.min(COLS * ROWS - 1, selected);
  clearSearch();
  persist();
  report(message);
}
function prepare() {
  if (results) return;
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
function finishedMessage() {
  if (!results) return;
  const a = results.astar,
    d = results.dijkstra;
  if (a.cost === null) {
    report("此路不通。两种算法都没有找到路径，试着擦掉几格墙。");
    return;
  }
  const diff = d.visited.length - a.visited.length;
  const comparison =
    diff > 0
      ? `A* 少探索了 ${diff} 个节点。`
      : diff < 0
        ? `本图 Dijkstra 少探索了 ${-diff} 个节点。`
        : "两者探索的节点数相同。";
  report(
    `对决完成：最优总代价均为 ${a.cost}。A* ${a.path.length - 1} 步，Dijkstra ${d.path.length - 1} 步。${comparison}展开节点数不代表实际运行时间。`,
  );
}
function paintProgress(rebuild = false) {
  if (!results) return;
  if (rebuild) paintBase();
  for (const a of algorithms) {
    const r = results[a],
      upto = Math.min(frame, r.visited.length);
    for (let j = lastPaint[a]; j < upto; j++) {
      for (const cell of r.steps[j].opened)
        cells[a][cell].classList.add("frontier");
      const c = cells[a][r.visited[j]];
      c.classList.remove("frontier");
      c.classList.add("visited");
    }
    lastPaint[a] = upto;
    const previous = currentNode[a];
    if (previous !== null) cells[a][previous].classList.remove("current");
    const current = upto ? r.steps[upto - 1] : undefined;
    currentNode[a] = current?.cell ?? null;
    if (current) {
      cells[a][current.cell].classList.add("current");
      for (const key of ["g", "h", "f", "frontier"] as const)
        $(a + "-" + key).textContent = String(current[key]);
      $(a + "-current").textContent =
        `当前展开：第 ${Math.floor(current.cell / COLS) + 1} 行，第 ${(current.cell % COLS) + 1} 列`;
    } else {
      for (const key of ["g", "h", "f", "frontier"])
        $(a + "-" + key).textContent = "—";
      $(a + "-current").textContent = "点击单步，观察每个决定";
    }
    const done = frame >= r.visited.length;
    if (done) for (const i of r.path) cells[a][i].classList.add("path");
    $(a + "-visited").textContent = String(upto);
    $(a + "-cost").textContent = done && r.cost !== null ? String(r.cost) : "—";
    $(a + "-length").textContent =
      done && r.cost !== null ? String(r.path.length - 1) : "—";
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
function toggleRun() {
  endStroke();
  if (running) {
    running = false;
    controls();
    report("已暂停。可单步推进或拖动回放进度。");
    return;
  }
  if (results && frame >= maximum) {
    frame = 0;
    paintBase();
  }
  prepare();
  budget = 0;
  running = true;
  report(
    "同速回放：两侧每次各展开一个节点。边框表示待探索，白色标记表示当前节点。",
  );
  controls();
}
function step() {
  endStroke();
  running = false;
  prepare();
  frame = Math.min(maximum, frame + 1);
  paintProgress();
  if (frame < maximum)
    report(`第 ${frame} 次展开。比较当前节点的 g、h、f 与待探索数量。`);
}
function selectTool(next: Tool) {
  tool = next;
  document
    .querySelectorAll<HTMLButtonElement>("[data-tool]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.tool === tool)),
    );
}
function editSingle(index: number) {
  const next = applyTool(board, index, tool);
  selected = index;
  if (next !== board)
    adopt({ board: next, preset: "custom" }, "地图已更新，旧搜索结果已清除。");
  else updateSelection(false);
}
function endStroke() {
  if (!dragging) return;
  dragging = false;
  if (strokeChanged) {
    preset = "custom";
    history.commit({ board, preset });
    persist();
    report("地图已更新。两种算法会从相同地图重新出发。");
  } else report("回放已重置，地图未改变。");
  syncMap();
  controls();
}
function setEditMode(value: boolean) {
  editMode = value;
  $("edit-mode").setAttribute("aria-pressed", String(editMode));
  $("edit-mode").textContent = editMode ? "绘图已开启" : "浏览模式";
  $("arena").classList.toggle("editing", editMode);
  $("gesture-hint").textContent = editMode
    ? "可逐格点击或拖动绘制；关闭绘图后可滑动地图。"
    : "可滑动浏览；开启绘图后点按格子，或使用下方方向按钮。";
}
for (const a of algorithms) {
  const grid = $(a + "-grid");
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
      c.tabIndex = -1;
      rowElement.append(c);
      cells[a].push(c);
    }
    grid.append(rowElement);
  }
  grid.addEventListener("pointerdown", (e) => {
    const event = e as PointerEvent;
    if (event.button !== 0 || !editMode) return;
    const target = (event.target as Element).closest<HTMLButtonElement>(
      ".cell",
    );
    if (!target) return;
    event.preventDefault();
    endStroke();
    selected = Number(target.dataset.index);
    selectedAlgorithm = a;
    dragging = true;
    strokeChanged = false;
    clearSearch();
    const next = applyTool(board, selected, tool);
    if (next !== board) {
      board = next;
      strokeChanged = true;
      paintBase();
    }
    grid.setPointerCapture(event.pointerId);
  });
  grid.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const event = e as PointerEvent,
      target = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLButtonElement>(".cell");
    if (!target || !grid.contains(target)) return;
    selected = Number(target.dataset.index);
    const next = applyTool(board, selected, tool);
    if (next !== board) {
      board = next;
      strokeChanged = true;
      paintBase();
    }
  });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
    grid.addEventListener(event, endStroke);
  grid.addEventListener("focusin", (e) => {
    const target = (e.target as Element).closest<HTMLButtonElement>(".cell");
    if (target) {
      selected = Number(target.dataset.index);
      selectedAlgorithm = a;
      $("selection").textContent = label(selected);
    }
  });
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
        next = index >= COLS ? index - COLS : index;
        break;
      case "ArrowDown":
        next = index < (ROWS - 1) * COLS ? index + COLS : index;
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
    selected = next;
    selectedAlgorithm = a;
    updateSelection(true);
  });
}
window.addEventListener("pointerup", endStroke);
window.addEventListener("blur", endStroke);
document
  .querySelectorAll<HTMLButtonElement>("[data-tool]")
  .forEach((b) => (b.onclick = () => selectTool(b.dataset.tool as Tool)));
function readSeed() {
  const value = Number($<HTMLInputElement>("seed").value);
  return Number.isFinite(value)
    ? Math.max(0, Math.min(4294967295, Math.floor(value)))
    : 42;
}
function generate(next: "maze" | "scatter" | "empty", seed: number) {
  adopt(
    { board: createBoard(next, seed), preset: next },
    "地图已准备好。点击开始对决，观察两种策略。",
  );
}
document
  .querySelectorAll<HTMLButtonElement>("[data-map]")
  .forEach(
    (b) =>
      (b.onclick = () =>
        generate(b.dataset.map as "maze" | "scatter" | "empty", readSeed())),
  );
$("regenerate").onclick = () => {
  if (preset !== "custom") generate(preset, readSeed());
};
$("shuffle").onclick = () =>
  generate(
    preset === "custom" ? "maze" : preset,
    crypto.getRandomValues(new Uint32Array(1))[0],
  );
$("seed").addEventListener("keydown", (e) => {
  if ((e as KeyboardEvent).key === "Enter" && preset !== "custom")
    generate(preset, readSeed());
});
document.querySelectorAll<HTMLButtonElement>("[data-scenario]").forEach(
  (b) =>
    (b.onclick = () => {
      const scenario = b.dataset.scenario as Scenario;
      adopt(
        { board: createScenario(scenario), preset: "custom" },
        scenarioText[scenario],
      );
    }),
);
function undo() {
  endStroke();
  if (history.canUndo) adopt(history.undo(), "已撤销上一次地图编辑。", false);
}
function redo() {
  endStroke();
  if (history.canRedo) adopt(history.redo(), "已重做地图编辑。", false);
}
$("undo").onclick = undo;
$("redo").onclick = redo;
$("run").onclick = toggleRun;
$("quick-run").onclick = toggleRun;
$("quick-step").onclick = step;
$("step").onclick = step;
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
$("edit-mode").onclick = () => setEditMode(!editMode);
$("zoom").addEventListener("change", () => {
  $("arena").style.setProperty(
    "--grid-scale",
    $<HTMLSelectElement>("zoom").value,
  );
});
document.querySelectorAll<HTMLButtonElement>("[data-move]").forEach(
  (b) =>
    (b.onclick = () => {
      const direction = b.dataset.move;
      const row = Math.floor(selected / COLS),
        col = selected % COLS;
      if (direction === "up" && row > 0) selected -= COLS;
      if (direction === "down" && row < ROWS - 1) selected += COLS;
      if (direction === "left" && col > 0) selected--;
      if (direction === "right" && col < COLS - 1) selected++;
      updateSelection(false);
      document
        .querySelectorAll(".cell.selected")
        .forEach((c) => c.classList.remove("selected"));
      for (const a of algorithms) cells[a][selected].classList.add("selected");
    }),
);
$("apply-selected").onclick = () => editSingle(selected);
$("share").onclick = async () => {
  const url = new URL(location.href);
  url.hash = encodeBoard(board).replace(/^#/, "");
  window.history.replaceState(null, "", url);
  try {
    await navigator.clipboard.writeText(url.href);
    report("地图链接已复制，包含地形代价、墙、起终点和种子。");
  } catch {
    report("地图已保存到地址栏。请复制浏览器地址来分享。");
  }
};
function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("export-json").onclick = () => {
  download(
    new Blob([mapToJSON(board)], { type: "application/json" }),
    `pathfinder-${board.seed}.json`,
  );
  report("地图 JSON 已导出，可随时导入恢复。");
};
$("import-json").onclick = () => {
  $<HTMLInputElement>("map-file").click();
};
let importRequest = 0;
$("map-file").addEventListener("change", async () => {
  endStroke();
  const request = ++importRequest;
  const boardBeforeRead = encodeBoard(board);
  const input = $<HTMLInputElement>("map-file"),
    file = input.files?.[0];
  input.value = "";
  if (!file) return;
  if (file.size > 50000) {
    report("地图文件过大，限制为 50 KB。当前地图未改变。");
    return;
  }
  try {
    const text = await file.text();
    if (request !== importRequest) return;
    if (encodeBoard(board) !== boardBeforeRead) {
      report("读取期间地图已改变，已取消此次导入。请重新选择文件。");
      return;
    }
    const imported = mapFromJSON(text);
    if (!imported) {
      report("地图文件格式无效。请导入本工具导出的 JSON。");
      return;
    }
    adopt(
      { board: imported, preset: "custom" },
      "地图已导入，可继续编辑或开始对决。",
    );
  } catch {
    report("读取文件失败，当前地图未改变。");
  }
});
$("export-image").onclick = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 1500;
  canvas.height = 750;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    report("此浏览器无法导出图片。");
    return;
  }
  ctx.fillStyle = "#101723";
  ctx.fillRect(0, 0, 1500, 750);
  ctx.fillStyle = "#edf2ff";
  ctx.font = "bold 25px sans-serif";
  ctx.fillText("PATHFINDER ARENA", 30, 42);
  ctx.font = "14px sans-serif";
  ctx.fillStyle = "#a3b4cc";
  ctx.fillText(
    `Seed ${board.seed} · Four-way movement · Enter costs 1 / 5 / 9`,
    30,
    70,
  );
  for (const [side, a] of algorithms.entries()) {
    const x0 = 30 + side * 745,
      y0 = 127,
      size = 20;
    ctx.fillStyle = a === "astar" ? "#79a8ff" : "#ffb277";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText(a === "astar" ? "A*" : "Dijkstra", x0, 108);
    const visited = new Set(results?.[a].visited.slice(0, frame)),
      done = !!results && frame >= results[a].visited.length,
      path = new Set(done ? results![a].path : []);
    for (let i = 0; i < COLS * ROWS; i++) {
      ctx.fillStyle = wallSet.has(i)
        ? "#44526a"
        : terrain.get(i) === 5
          ? "#796b36"
          : terrain.get(i) === 9
            ? "#285d71"
            : "#19283e";
      if (visited.has(i)) ctx.fillStyle = a === "astar" ? "#294e83" : "#765039";
      if (path.has(i)) ctx.fillStyle = a === "astar" ? "#93bdff" : "#ffd2ac";
      if (i === board.start) ctx.fillStyle = "#79d4b8";
      if (i === board.end) ctx.fillStyle = "#ffd189";
      ctx.fillRect(
        x0 + (i % COLS) * size,
        y0 + Math.floor(i / COLS) * size,
        size - 1,
        size - 1,
      );
    }
    ctx.fillStyle = "#dce7fb";
    ctx.font = "16px sans-serif";
    const r = results?.[a];
    ctx.fillText(
      `Expanded: ${Math.min(frame, r?.visited.length ?? 0)} · Cost: ${done ? (r?.cost ?? "unreachable") : "pending"} · Steps: ${done && r?.cost !== null ? (r?.path.length ?? 1) - 1 : "pending"}`,
      x0,
      620,
    );
  }
  ctx.fillStyle = "#a3b4cc";
  ctx.font = "14px sans-serif";
  ctx.fillText(
    "Expanded nodes compare search strategies, not wall-clock performance.",
    30,
    674,
  );
  ctx.fillText("wangchuan2003-a11y.github.io/pathfinder-arena", 30, 704);
  canvas.toBlob((blob) => {
    if (blob) {
      download(blob, `pathfinder-${board.seed}.png`);
      report("当前双板结果已导出为 PNG。");
    } else report("图片导出失败，请重试。");
  });
};
$("fullscreen").onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await $("arena").requestFullscreen();
  } catch {
    report("此浏览器不支持全屏，可以使用地图放大。");
  }
};
window.addEventListener("keydown", (event) => {
  const target = event.target as HTMLElement;
  if (target.closest("input,select,textarea,[contenteditable=true]")) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    event.shiftKey ? redo() : undo();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
    event.preventDefault();
    redo();
    return;
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key.toLowerCase() === "p") {
    event.preventDefault();
    toggleRun();
  }
  if (event.key.toLowerCase() === "n") {
    event.preventDefault();
    step();
  }
  if (/^[1-6]$/.test(event.key)) selectTool(tools[Number(event.key) - 1]);
});
window.addEventListener("hashchange", () => {
  const parsed = decodeBoard(location.hash);
  if (parsed) adopt({ board: parsed, preset: "custom" }, "已载入分享地图。");
  else if (!namedAnchor()) report("分享链接无效，保留当前地图。");
});
let last = performance.now();
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
setEditMode(editMode);
clearSearch();
if (shared) report("已载入分享地图，包含保存的地形与起终点。");
else if (draft) report("已恢复此浏览器上次的地图草稿。");
else if (!namedAnchor()) report("分享链接无效，已载入默认迷宫。");
requestAnimationFrame(tick);
