export type Locale = "zh-CN" | "en";

// Chinese source text is the stable key. Keep markup and browser state outside
// this module; callers translate text nodes and attributes independently.
const english: Record<string, string> = {
  "Pathfinder Arena · 寻路竞技场": "Pathfinder Arena · A* and Dijkstra",
  "画一张迷宫，让 A* 与 Dijkstra 同场寻路。实时对比搜索策略、逐步回放、分享你创造的地图。":
    "Draw a maze for A* and Dijkstra. Compare search strategies, replay each step, and share your maps.",
  如何运作: "How it works",
  "同一张地图。": "One map.",
  "两种寻路直觉。": "Two search strategies.",
  "一边朝着目标前进，一边探索所有可能。":
    "One follows the goal. One expands by cost.",
  "画下障碍，看算法如何做出选择。":
    "Draw obstacles and watch the algorithms choose.",
  进入竞技场: "Enter the arena",
  寻路竞技场: "Pathfinding arena",
  从一个问题开始: "Start with a question",
  代价更低的绕路: "The cheaper detour",
  直觉被墙挡住: "When a wall blocks the way",
  真的无路可走: "When no path exists",
  地图预设: "Map presets",
  迷宫: "Maze",
  散落障碍: "Scattered walls",
  空白画布: "Empty grid",
  SEED: "SEED",
  种子: "Seed",
  用当前种子重新生成地图: "Rebuild the map with the current seed",
  重建: "Rebuild",
  "随机一张 ↗": "Random map ↗",
  绘图工具: "Map tools",
  画墙: "Wall",
  擦除: "Erase",
  起点: "Start",
  终点: "Goal",
  起点和终点: "Start and goal",
  墙: "Wall",
  沙地: "Sand",
  水域: "Water",
  普通地面: "Normal ground",
  不可通行: "Blocked",
  "沙地 ×5": "Sand ×5",
  "水域 ×9": "Water ×9",
  撤销: "Undo",
  重做: "Redo",
  自定义地图: "Custom map",
  可复现预设: "Seeded preset",
  绘图已开启: "Drawing on",
  浏览模式: "Browse mode",
  地图缩放: "Map zoom",
  适应屏幕: "Fit to screen",
  全屏: "Fullscreen",
  "可逐格点击或拖动绘制；关闭绘图后可滑动地图。":
    "Click cells or drag to draw. Turn drawing off to pan the map.",
  "可滑动浏览；开启绘图后点按格子，或使用下方方向按钮。":
    "Swipe to browse. Turn drawing on to edit cells, or use the arrow buttons below.",
  目标导向: "Goal-directed",
  逐层探索: "Cost-ordered",
  等待出发: "Ready",
  正在探索: "Searching",
  已到达: "Goal reached",
  无可达路径: "No path",
  "A 星地图，可编辑": "A* map, editable",
  "Dijkstra 地图，可编辑": "Dijkstra map, editable",
  已探索: "Expanded",
  个节点: "nodes",
  总代价: "Total cost",
  单位: "units",
  路径步数: "Path steps",
  步: "steps",
  "点击单步，观察每个决定": "Step through each decision",
  已知起点到当前格的累计代价: "Known cost from the start to the current cell",
  "g · 已走代价": "g · Cost so far",
  "A* 为曼哈顿距离；Dijkstra 不使用启发项":
    "A*: Manhattan distance. Dijkstra: no heuristic.",
  "h · 预估剩余": "h · Estimate to goal",
  "优先级 f = g + h": "Priority: f = g + h",
  "f · 优先级": "f · Priority",
  待探索格: "Frontier cells",
  待探索: "Frontier",
  当前节点: "Current node",
  最终路径: "Final path",
  "四向移动 · 普通格 1 / 沙地 5 / 水域 9":
    "Four-way movement · Normal 1 / Sand 5 / Water 9",
  "精确点选：方向按钮 + 应用工具": "Precise editing: arrows + apply tool",
  选中上方一格: "Select the cell above",
  选中左方一格: "Select the cell to the left",
  选中下方一格: "Select the cell below",
  选中右方一格: "Select the cell to the right",
  应用当前工具: "Apply current tool",
  开始对决: "Run comparison",
  暂停: "Pause",
  再跑一次: "Run again",
  继续对决: "Resume",
  单步: "Step",
  重置回放: "Reset replay",
  速度: "Speed",
  "分享地图 ↗": "Share map ↗",
  回放进度: "Replay progress",
  "准备好了吗？先直接开始，再试着改变地图。":
    "Ready? Run the comparison, then try changing the map.",
  快捷回放: "Quick playback",
  "完整控件 ↑": "All controls ↑",
  地图文件: "Map files",
  草稿仅保存在此浏览器: "Drafts stay in this browser",
  草稿已保存在此浏览器: "Draft saved in this browser",
  "草稿无法保存，可导出地图备份":
    "Draft could not be saved. Export the map as a backup.",
  "导出地图 JSON": "Export map JSON",
  导入地图: "Import map",
  保存对照图片: "Save comparison image",
  "聪明的捷径，": "A smarter shortcut,",
  "有条件。": "with conditions.",
  "这不是跑分。你看到的是算法展开节点的顺序。":
    "This is not a speed benchmark. You are watching the order in which nodes are expanded.",
  "A* 的方向感": "How A* finds its direction",
  "A* 加入到终点的曼哈顿距离估计，优先搜索看起来更有希望的路线。障碍物可能让直觉失效，需要绕路。":
    "A* adds a Manhattan-distance estimate to the goal, prioritizing promising routes. Walls can block that direction and require a detour.",
  "最低代价，不一定最少步数": "Lowest cost can mean more steps",
  "在这里的四向地图上，两种算法都能找到最低总代价的路线。进入普通格消耗 1、沙地 5、水域 9；起点代价从 0 开始。路线和步数可能不同；A* 也不保证在每张地图上都探索更少。":
    "On this four-way grid, both algorithms find a route with the lowest total cost. Entering normal ground costs 1, sand 5, and water 9; the start has cost 0. Routes and step counts may differ. A* does not always expand fewer nodes.",
  键盘操作与实验边界: "Keyboard controls and limitations",
  "P 播放/暂停，N 单步，1–6 切换工具，Ctrl/⌘ Z 撤销、Shift Z 重做。Tab 进入地图，方向键移动焦点，空格或 Enter 应用当前工具。起点与终点不能放在墙上；点击墙会先为端点清空该格。分享链接保存墙、地形、端点和种子，不保存播放位置。地图完全在浏览器本地计算。实际运行速度取决于设备，播放速度仅用于观看。":
    "P plays or pauses; N advances one step; 1–6 select tools; Ctrl/⌘ Z undoes and Ctrl/⌘ Shift Z redoes. Tab into a map, move with arrow keys, and press Space or Enter to apply the tool. Placing an endpoint on a wall clears that wall. Shared links save walls, terrain, endpoints, and the seed, but not the replay position. Maps are computed locally in your browser. Actual running time depends on your device; playback speed only controls the animation.",
  "开源，从这里开始 ↗": "Explore the source ↗",
  "水域每格代价 9。预测一下：更少步数和更低总代价，会选同一条路吗？":
    "Water costs 9 per cell. Predict: will the fewest steps and the lowest cost follow the same route?",
  "终点看起来很近，中间却有长墙。观察 A* 如何修正方向。":
    "The goal looks close, but a long wall blocks the way. Watch how A* changes direction.",
  "一整面墙切断了两边。观察两个算法如何确认不存在路径。":
    "A wall separates the two sides. Watch both algorithms confirm that no path exists.",
  "此路不通。两种算法都没有找到路径，试着擦掉几格墙。":
    "No path found by either algorithm. Try erasing a few wall cells.",
  "两者探索的节点数相同。":
    "Both algorithms expanded the same number of nodes.",
  "已暂停。可单步推进或拖动回放进度。":
    "Paused. Advance one step or move the replay slider.",
  "同速回放：两侧每次各展开一个节点。边框表示待探索，白色标记表示当前节点。":
    "Both sides replay one expansion at a time. Borders mark the frontier; the white outline marks the current node.",
  "地图已更新，旧搜索结果已清除。":
    "Map updated. Previous search results cleared.",
  "地图已更新。两种算法会从相同地图重新出发。":
    "Map updated. Both algorithms will restart on the same map.",
  "回放已重置，地图未改变。": "Replay reset. The map is unchanged.",
  "地图已准备好。点击开始对决，观察两种策略。":
    "Map ready. Run the comparison to watch both strategies.",
  "已撤销上一次地图编辑。": "Last map edit undone.",
  "已重做地图编辑。": "Map edit redone.",
  "回放已重置，地图保持不变。": "Replay reset. The map is unchanged.",
  "地图链接已复制，包含地形代价、墙、起终点和种子。":
    "Map link copied, including terrain costs, walls, endpoints, and the seed.",
  "地图已保存到地址栏。请复制浏览器地址来分享。":
    "The map is in the address bar. Copy the browser address to share it.",
  "地图 JSON 已导出，可随时导入恢复。":
    "Map JSON exported. Import it later to restore the map.",
  "地图文件过大，限制为 50 KB。当前地图未改变。":
    "The map file exceeds the 50 KB limit. The current map is unchanged.",
  "读取期间地图已改变，已取消此次导入。请重新选择文件。":
    "The map changed while the file was being read. Import cancelled; select the file again.",
  "地图文件格式无效。请导入本工具导出的 JSON。":
    "Invalid map file. Import JSON exported by this tool.",
  "地图已导入，可继续编辑或开始对决。":
    "Map imported. Continue editing or run the comparison.",
  "读取文件失败，当前地图未改变。":
    "The file could not be read. The current map is unchanged.",
  "此浏览器无法导出图片。": "This browser cannot export images.",
  "当前双板结果已导出为 PNG。":
    "The current comparison has been exported as PNG.",
  "图片导出失败，请重试。": "Image export failed. Please try again.",
  "此浏览器不支持全屏，可以使用地图放大。":
    "Fullscreen is not supported in this browser. Use map zoom instead.",
  "已载入分享地图。": "Shared map loaded.",
  "分享链接无效，保留当前地图。":
    "Invalid share link. The current map is unchanged.",
  "已载入分享地图，包含保存的地形与起终点。":
    "Shared map loaded, including its terrain and endpoints.",
  "已恢复此浏览器上次的地图草稿。":
    "The last map draft in this browser has been restored.",
  "分享链接无效，已载入默认迷宫。":
    "Invalid share link. The default maze has been loaded.",

  // Dynamic text mirrors the original punctuation and spaces in main.ts.
  "第 {row} 行，第 {col} 列": "Row {row}, column {col}",
  "第 {row} 行，第 {col} 列，{terrain}，{access}":
    "Row {row}, column {col}, {terrain}, {access}",
  "进入代价 {cost}": "Entry cost {cost}",
  "当前展开：第 {row} 行，第 {col} 列": "Current: row {row}, column {col}",
  "A* 少探索了 {count} 个节点。": "A* expanded {count} fewer nodes.",
  "本图 Dijkstra 少探索了 {count} 个节点。":
    "Dijkstra expanded {count} fewer nodes on this map.",
  "对决完成：最优总代价均为 {cost}。A* {astarSteps} 步，Dijkstra {dijkstraSteps} 步。{comparison}展开节点数不代表实际运行时间。":
    "Finished: both minimum costs are {cost}. A*: {astarSteps} steps; Dijkstra: {dijkstraSteps} steps. {comparison} Expanded nodes do not measure running time.",
  "第 {frame} 次展开。比较当前节点的 g、h、f 与待探索数量。":
    "Expansion {frame}. Compare the current node's g, h, f, and frontier size.",
  "正在查看第 {frame} 次展开。点击继续对决可接着播放。":
    "Viewing expansion {frame}. Resume the comparison to continue.",

  // Language-selector labels; selection and persistence belong to the caller.
  语言: "Language",
  草稿管理: "Draft management",
  恢复已有草稿: "Restore saved draft",
  清除已保存草稿: "Clear saved draft",
  "当前地图会保留，清除的草稿不会继续自动保存，直到你再次编辑地图。":
    "The current map stays open. Autosave stays off after clearing the draft until you edit the map again.",
  "已清除本机草稿，当前地图仍可导出。":
    "Local draft cleared. You can still export the current map.",
  "未找到可恢复的草稿。": "No saved draft was found.",
  "已恢复本机保存的地图。": "The locally saved map has been restored.",
  本机草稿已清除: "Local draft cleared",
  "无法清除草稿，浏览器可能禁用了存储。":
    "Could not clear the draft. Browser storage may be disabled.",
  "分享地图已载入；编辑将更新本机草稿。":
    "Shared map loaded. Editing it will update the local draft.",
  "第 {frame} 次展开。A* 当前格 {astarCell}，g {astarG}，h {astarH}，f {astarF}；Dijkstra 当前格 {dijkstraCell}，g {dijkstraG}，h {dijkstraH}，f {dijkstraF}。":
    "Expansion {frame}. A* cell {astarCell}: g {astarG}, h {astarH}, f {astarF}; Dijkstra cell {dijkstraCell}: g {dijkstraG}, h {dijkstraH}, f {dijkstraF}.",
  "仍可恢复进入此页面前的草稿。":
    "You can still restore the draft saved before opening this page.",
  "地图已恢复，当前草稿未被覆盖。":
    "Map restored. The current saved draft was not overwritten.",
  界面语言: "Interface language",
  中文: "中文",
  简体中文: "Simplified Chinese",
  English: "English",
};

export const messages: Record<Locale, Record<string, string>> = {
  "zh-CN": Object.fromEntries(Object.keys(english).map((key) => [key, key])),
  en: english,
};

export function localeFrom(value: unknown): Locale {
  if (typeof value !== "string") return "zh-CN";
  const normalized = value.trim().toLowerCase();
  return normalized === "en" || normalized.startsWith("en-") ? "en" : "zh-CN";
}

export function translate(
  locale: Locale,
  key: string,
  params: Record<string, string | number> = {},
): string {
  const dictionary = messages[locale];
  if (!Object.hasOwn(dictionary, key)) return key;
  const message = dictionary[key];
  return message.replace(
    /\{([a-zA-Z][a-zA-Z0-9_]*)\}/g,
    (token, name: string) =>
      Object.hasOwn(params, name) ? String(params[name]) : token,
  );
}

type CompiledTemplate = {
  key: string;
  names: string[];
  pattern: RegExp;
  literalLength: number;
};

let templateCache: CompiledTemplate[] | undefined;

function templates(): CompiledTemplate[] {
  if (templateCache) return templateCache;
  const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  templateCache = [];
  for (const key of Object.keys(messages["zh-CN"])) {
    const names: string[] = [];
    let cursor = 0;
    let pattern = "^";
    let literalLength = 0;
    for (const match of key.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g)) {
      const literal = key.slice(cursor, match.index);
      pattern += escaped(literal) + "([\\s\\S]*?)";
      literalLength += literal.length;
      names.push(match[1]);
      cursor = match.index + match[0].length;
    }
    if (!names.length) continue;
    const suffix = key.slice(cursor);
    templateCache.push({
      key,
      names,
      // A negative character lookahead anchors the true end, including newlines.
      pattern: new RegExp(pattern + escaped(suffix) + "(?![\\s\\S])"),
      literalLength: literalLength + suffix.length,
    });
  }
  templateCache.sort((a, b) => b.literalLength - a.literalLength);
  return templateCache;
}

function translateWhole(
  locale: Locale,
  source: string,
  translateParams: boolean,
): string {
  if (Object.hasOwn(messages[locale], source)) return messages[locale][source];
  for (const template of templates()) {
    const match = template.pattern.exec(source);
    if (!match) continue;
    const params = Object.fromEntries(
      template.names.map((name, index) => {
        const value = match[index + 1];
        return [
          name,
          translateParams ? translateWhole(locale, value, false) : value,
        ];
      }),
    );
    return translate(locale, template.key, params);
  }
  return source;
}

/** Translate one complete source string, with at most one level of nested text. */
export function translateText(locale: Locale, source: string): string {
  return locale === "zh-CN" ? source : translateWhole(locale, source, true);
}
