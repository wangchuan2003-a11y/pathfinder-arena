import { COLS, ROWS, createBoard, type Board } from "./engine";
export type Scenario = "detour" | "barrier" | "unreachable";
export function createScenario(scenario: Scenario): Board {
  const board = createBoard("empty", 42);
  board.start = 11 * COLS + 3;
  board.end = 11 * COLS + 31;
  if (scenario === "detour") {
    board.terrain = [];
    for (let row = 8; row <= 14; row++)
      for (let col = 10; col <= 24; col++)
        board.terrain.push({ cell: row * COLS + col, cost: 9 });
  } else if (scenario === "barrier") {
    board.start = 4 * COLS + 5;
    board.end = 4 * COLS + 29;
    for (let row = 0; row < ROWS - 3; row++) board.walls.push(row * COLS + 17);
  } else {
    for (let row = 0; row < ROWS; row++) board.walls.push(row * COLS + 17);
  }
  return board;
}
export const scenarioText: Record<Scenario, string> = {
  detour: "水域每格代价 9。预测一下：更少步数和更低总代价，会选同一条路吗？",
  barrier: "终点看起来很近，中间却有长墙。观察 A* 如何修正方向。",
  unreachable: "一整面墙切断了两边。观察两个算法如何确认不存在路径。",
};
