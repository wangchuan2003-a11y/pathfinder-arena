import { test as base, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const algorithms = ["astar", "dijkstra"] as const;

// Capture failures throughout every scenario, including navigation and sharing.
const test = base.extend<{ browserDiagnostics: void }>({
  browserDiagnostics: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      await use();
      expect(
        errors,
        "The page should not emit JavaScript or console errors",
      ).toEqual([]);
    },
    { auto: true },
  ],
});

async function snapshot(page: Page, algorithm: (typeof algorithms)[number]) {
  const grid = page.locator(`#${algorithm}-grid`);
  return {
    walls: await grid
      .locator(".wall")
      .evaluateAll((cells) =>
        cells.map((cell) => Number((cell as HTMLElement).dataset.index)),
      ),
    terrain: await grid.locator(".sand, .water").evaluateAll((cells) =>
      cells.map((cell) => ({
        cell: Number((cell as HTMLElement).dataset.index),
        cost: cell.classList.contains("sand") ? 5 : 9,
      })),
    ),
    start: await grid.locator(".start").getAttribute("data-index"),
    end: await grid.locator(".end").getAttribute("data-index"),
    seed: await page.locator("#seed").inputValue(),
  };
}

async function enableDrawing(page: Page) {
  const editMode = page.locator("#edit-mode");
  if ((await editMode.getAttribute("aria-pressed")) === "false") {
    await editMode.click();
  }
  await expect(editMode).toHaveAttribute("aria-pressed", "true");
}

test.afterEach(async ({ page }) => {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(
    overflow,
    "The page should fit the configured desktop or mobile viewport",
  ).toBeLessThanOrEqual(1);
});

test("single-step, pause, reset, finish, and rewind preserve honest statistics", async ({
  page,
}) => {
  await page.goto("/");
  await enableDrawing(page);
  await page.locator('[data-map="empty"]').click();
  const run = page.locator("#run");
  const timeline = page.locator("#timeline");

  await expect(timeline).toBeDisabled();
  await page.locator("#step").click();
  for (const algorithm of algorithms) {
    await expect(page.locator(`#${algorithm}-visited`)).toHaveText("1");
    await expect(page.locator(`#${algorithm}-grid .visited`)).toHaveCount(1);
    await expect(page.locator(`#${algorithm}-cost`)).toHaveText("—");
  }

  await page.locator("#speed").selectOption("20");
  await run.click();
  await expect(run).toContainText("暂停");
  await expect
    .poll(async () =>
      Number(await page.locator("#dijkstra-visited").textContent()),
    )
    .toBeGreaterThan(1);
  await run.click();
  await expect(run).toContainText("继续对决");
  const pausedAt = await timeline.inputValue();
  // A short deliberate wait verifies pause across several animation frames.
  await page.waitForTimeout(150);
  await expect(timeline).toHaveValue(pausedAt);

  await page.locator("#reset").click();
  await expect(timeline).toBeDisabled();
  await expect(page.locator("#timeline-value")).toHaveText("0 / 0");
  for (const algorithm of algorithms) {
    await expect(page.locator(`#${algorithm}-visited`)).toHaveText("0");
    await expect(page.locator(`#${algorithm}-cost`)).toHaveText("—");
    await expect(
      page.locator(`#${algorithm}-grid .visited, #${algorithm}-grid .path`),
    ).toHaveCount(0);
    await expect(page.locator(`#${algorithm}-grid .wall`)).toHaveCount(0);
  }

  await page.locator("#speed").selectOption({ label: "6×" });
  await run.click();
  await expect(page.locator("#dijkstra-state")).toHaveText("已到达", {
    timeout: 10_000,
  });
  await expect(run).toContainText("再跑一次");
  // (1, 1) to (33, 21): 32 horizontal + 20 vertical moves.
  for (const algorithm of algorithms) {
    await expect(page.locator(`#${algorithm}-cost`)).toHaveText("52");
    await expect(page.locator(`#${algorithm}-length`)).toHaveText("52");
    await expect(page.locator(`#${algorithm}-grid .path`)).toHaveCount(53);
  }
  await expect(page.locator("#astar-visited")).toHaveText("53");
  await expect(page.locator("#dijkstra-visited")).toHaveText("801");
  await expect(page.locator("#result")).toContainText("最优总代价均为 52");

  // Native range keyboard input exercises the real input handler on both devices.
  await timeline.press("Home");
  await expect(page.locator("#timeline-value")).toHaveText("0 / 801");
  for (const algorithm of algorithms) {
    await expect(page.locator(`#${algorithm}-visited`)).toHaveText("0");
    await expect(page.locator(`#${algorithm}-cost`)).toHaveText("—");
    await expect(
      page.locator(`#${algorithm}-grid .visited, #${algorithm}-grid .path`),
    ).toHaveCount(0);
  }
  await timeline.press("ArrowRight");
  for (const algorithm of algorithms) {
    await expect(page.locator(`#${algorithm}-visited`)).toHaveText("1");
    await expect(page.locator(`#${algorithm}-grid .visited`)).toHaveCount(1);
  }
  await timeline.press("End");
  await expect(page.locator("#timeline-value")).toHaveText("801 / 801");
  for (const algorithm of algorithms) {
    await expect(page.locator(`#${algorithm}-cost`)).toHaveText("52");
    await expect(page.locator(`#${algorithm}-grid .path`)).toHaveCount(53);
  }
  await expect(page.locator("#result")).toContainText("对决完成");
  await page.locator('#astar-grid [data-index="37"]').click();
  await expect(page.locator("#result")).not.toContainText("对决完成");
  await expect(timeline).toBeDisabled();
  for (const algorithm of algorithms) {
    await expect(page.locator(`#${algorithm}-visited`)).toHaveText("0");
    await expect(page.locator(`#${algorithm}-cost`)).toHaveText("—");
    await expect(
      page.locator(`#${algorithm}-grid [data-index="37"]`),
    ).toHaveClass(/\bwall\b/);
  }
});

test("pointer and keyboard edits synchronize both grids and can be undone", async ({
  page,
}) => {
  await page.goto("/");
  await enableDrawing(page);
  const maze = await snapshot(page, "astar");
  await page.locator('[data-map="empty"]').click();
  await page.locator("#undo").click();
  await expect(page.locator('[data-map="maze"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator('[data-map="empty"]')).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await page.locator("#regenerate").click();
  for (const algorithm of algorithms)
    expect(await snapshot(page, algorithm)).toEqual(maze);
  await page.locator('[data-map="empty"]').click();
  const index = 37;
  const cell = (algorithm: (typeof algorithms)[number]) =>
    page.locator(`#${algorithm}-grid [data-index="${index}"]`);

  await cell("astar").click();
  for (const algorithm of algorithms) {
    await expect(cell(algorithm)).toHaveClass(/\bwall\b/);
    await expect(cell(algorithm)).toHaveAttribute(
      "aria-label",
      "第 2 行，第 3 列，墙，不可通行",
    );
  }
  await page.locator("#undo").click();
  for (const algorithm of algorithms)
    await expect(cell(algorithm)).not.toHaveClass(/\bwall\b/);

  const start = page.locator('#dijkstra-grid [data-index="36"]');
  await start.focus();
  await start.press("ArrowRight");
  await expect(cell("dijkstra")).toBeFocused();
  await cell("dijkstra").press("Space");
  for (const algorithm of algorithms)
    await expect(cell(algorithm)).toHaveClass(/\bwall\b/);

  await page.locator('[data-tool="erase"]').click();
  await cell("dijkstra").click();
  for (const algorithm of algorithms)
    await expect(cell(algorithm)).not.toHaveClass(/\bwall\b/);
  await page.locator("#undo").click();
  for (const algorithm of algorithms)
    await expect(cell(algorithm)).toHaveClass(/\bwall\b/);
  expect(await snapshot(page, "astar")).toEqual(
    await snapshot(page, "dijkstra"),
  );

  const keyboardCell = page.locator('#astar-grid [data-index="38"]');
  await keyboardCell.focus();
  await keyboardCell.press("5");
  await expect(page.locator('[data-tool="sand"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await keyboardCell.press("Space");
  for (const algorithm of algorithms) {
    await expect(
      page.locator(`#${algorithm}-grid [data-index="38"]`),
    ).toHaveClass(/\bsand\b/);
  }
  await keyboardCell.press("n");
  for (const algorithm of algorithms) {
    await expect(page.locator(`#${algorithm}-visited`)).toHaveText("1");
    await expect(page.locator(`#${algorithm}-g`)).toHaveText("0");
    await expect(page.locator(`#${algorithm}-f`)).toHaveText(
      algorithm === "astar" ? "52" : "0",
    );
  }
  await keyboardCell.press("p");
  await expect(page.locator("#run")).toContainText("暂停");
  await keyboardCell.press("p");
  await expect(page.locator("#run")).toContainText("继续对决");
  await expect(keyboardCell).toBeFocused();
  await page.locator("#reset").click();
  await expect(page.locator("#timeline")).toBeDisabled();
});

test("moving endpoints onto a wall clears it and coincident endpoints cost zero", async ({
  page,
}) => {
  await page.goto("/");
  await enableDrawing(page);
  await page.locator('[data-map="empty"]').click();
  const destination = (algorithm: (typeof algorithms)[number]) =>
    page.locator(`#${algorithm}-grid [data-index="72"]`);

  await destination("astar").click();
  await expect(destination("astar")).toHaveClass(/\bwall\b/);
  await page.locator('[data-tool="start"]').click();
  await destination("astar").click();
  await page.locator('[data-tool="end"]').click();
  await destination("dijkstra").click();
  for (const algorithm of algorithms) {
    await expect(destination(algorithm)).toHaveClass(/\bstart\b/);
    await expect(destination(algorithm)).toHaveClass(/\bend\b/);
    await expect(destination(algorithm)).not.toHaveClass(/\bwall\b/);
    await expect(page.locator(`#${algorithm}-grid .start`)).toHaveCount(1);
    await expect(page.locator(`#${algorithm}-grid .end`)).toHaveCount(1);
  }
  await page.locator("#step").click();
  for (const algorithm of algorithms) {
    await expect(page.locator(`#${algorithm}-cost`)).toHaveText("0");
    await expect(page.locator(`#${algorithm}-length`)).toHaveText("0");
    await expect(page.locator(`#${algorithm}-visited`)).toHaveText("1");
    await expect(page.locator(`#${algorithm}-state`)).toHaveText("已到达");
    await expect(page.locator(`#${algorithm}-grid .path`)).toHaveCount(1);
  }
});

test("seed regeneration is deterministic and a shared URL restores custom edits", async ({
  page,
}) => {
  await page.goto("/");
  await enableDrawing(page);
  await page.locator('[data-map="scatter"]').click();
  await page.locator("#seed").fill("2026");
  await page.locator("#regenerate").click();
  const seeded = await snapshot(page, "astar");
  expect(seeded.walls.length).toBeGreaterThan(0);

  await page.locator("#seed").fill("2027");
  await page.locator("#seed").press("Enter");
  expect((await snapshot(page, "astar")).walls).not.toEqual(seeded.walls);
  await page.locator("#seed").fill("2026");
  await page.locator("#regenerate").click();
  expect(await snapshot(page, "astar")).toEqual(seeded);

  await page
    .locator("#astar-grid .cell:not(.wall):not(.start):not(.end)")
    .first()
    .click();
  await page.locator('[data-tool="start"]').click();
  await page.locator('#astar-grid [data-index="73"]').click();
  await page.locator('[data-tool="end"]').click();
  await page.locator('#dijkstra-grid [data-index="74"]').click();
  const edited = await snapshot(page, "astar");
  expect(edited.start).toBe("73");
  expect(edited.end).toBe("74");
  expect(edited.walls).not.toEqual(seeded.walls);

  await page.locator("#share").click();
  await expect(page).toHaveURL(/#v1\./);
  const sharedURL = page.url();
  // Navigate away first so restoration must work on a fresh document.
  await page.goto("about:blank");
  await page.goto(sharedURL);
  for (const algorithm of algorithms)
    expect(await snapshot(page, algorithm)).toEqual(edited);
  await expect(page.locator("#timeline")).toBeDisabled();
  await expect(page.locator("#astar-visited")).toHaveText("0");
});

test("invalid shared hashes fall back safely and later invalid hashes preserve edits", async ({
  page,
}) => {
  await page.goto("/");
  const defaultBoard = await snapshot(page, "astar");
  await page.goto("about:blank");
  await page.goto("/#v1.invalid");
  await expect(page.locator("#result")).toHaveText(
    "分享链接无效，已载入默认迷宫。",
  );
  await enableDrawing(page);
  for (const algorithm of algorithms)
    expect(await snapshot(page, algorithm)).toEqual(defaultBoard);

  await page.locator('[data-map="empty"]').click();
  await page.locator('#astar-grid [data-index="37"]').click();
  const edited = await snapshot(page, "astar");
  // A same-document hash navigation exercises the hashchange recovery branch.
  await page.goto("/#v1.still-invalid");
  await expect(page.locator("#result")).toHaveText(
    "分享链接无效，保留当前地图。",
  );
  for (const algorithm of algorithms)
    expect(await snapshot(page, algorithm)).toEqual(edited);
  await page.locator("#step").click();
  for (const algorithm of algorithms)
    await expect(page.locator(`#${algorithm}-visited`)).toHaveText("1");
});

test("the water detour minimizes cost and exposes each algorithm's decision", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('[data-scenario="detour"]').click();
  await expect(page.locator("#result")).toContainText("水域每格代价 9");
  await page.locator("#step").click();
  for (const algorithm of algorithms) {
    await expect(page.locator(`#${algorithm}-g`)).toHaveText("0");
    await expect(page.locator(`#${algorithm}-h`)).toHaveText(
      algorithm === "astar" ? "28" : "0",
    );
    await expect(page.locator(`#${algorithm}-f`)).toHaveText(
      algorithm === "astar" ? "28" : "0",
    );
    await expect(page.locator(`#${algorithm}-frontier`)).toHaveText("4");
    await expect(page.locator(`#${algorithm}-grid .frontier`)).toHaveCount(4);
    await expect(page.locator(`#${algorithm}-grid .current`)).toHaveCount(1);
    await expect(page.locator(`#${algorithm}-current`)).toContainText(
      "第 12 行，第 4 列",
    );
  }

  await page.locator("#timeline").press("End");
  // The straight 28-step route costs 148 (15 water cells). Going four rows
  // around the water rectangle takes 36 ordinary steps and costs only 36.
  for (const algorithm of algorithms) {
    await expect(page.locator(`#${algorithm}-cost`)).toHaveText("36");
    await expect(page.locator(`#${algorithm}-length`)).toHaveText("36");
    await expect(page.locator(`#${algorithm}-grid .path`)).toHaveCount(37);
    await expect(page.locator(`#${algorithm}-grid .path.water`)).toHaveCount(0);
    await expect(page.locator(`#${algorithm}-g`)).toHaveText("36");
    await expect(page.locator(`#${algorithm}-h`)).toHaveText("0");
    await expect(page.locator(`#${algorithm}-f`)).toHaveText("36");
  }
  await expect(page.locator("#result")).toContainText("最优总代价均为 36");
  await page.locator("#timeline").press("Home");
  for (const algorithm of algorithms) {
    for (const field of ["g", "h", "f", "frontier", "cost", "length"]) {
      await expect(page.locator(`#${algorithm}-${field}`)).toHaveText("—");
    }
    await expect(
      page.locator(`#${algorithm}-grid .frontier, #${algorithm}-grid .current`),
    ).toHaveCount(0);
  }
});

test("browse mode prevents painting while precise controls support undo and redo", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");
  const editMode = page.locator("#edit-mode");
  await expect(editMode).toHaveAttribute(
    "aria-pressed",
    isMobile ? "false" : "true",
  );
  if (!isMobile) await editMode.click();
  await page.locator('[data-map="empty"]').click();
  const empty = await snapshot(page, "astar");
  await page.locator('#astar-grid [data-index="37"]').click();
  for (const algorithm of algorithms)
    expect(await snapshot(page, algorithm)).toEqual(empty);

  await page.locator(".precise-editor summary").click();
  await page.locator("#astar-grid .start").focus();
  for (const [direction, index] of [
    ["right", 37],
    ["down", 72],
    ["left", 71],
    ["up", 36],
  ] as const) {
    await page.locator(`[data-move="${direction}"]`).click();
    for (const algorithm of algorithms) {
      await expect(
        page.locator(`#${algorithm}-grid .selected`),
      ).toHaveAttribute("data-index", String(index));
    }
  }
  await page.locator('[data-move="right"]').click();
  await expect(page.locator("#selection")).toContainText("第 2 行，第 3 列");
  await page.locator('[data-tool="water"]').click();
  await page.locator("#apply-selected").click();
  for (const algorithm of algorithms) {
    await expect(
      page.locator(`#${algorithm}-grid [data-index="37"]`),
    ).toHaveClass(/\bwater\b/);
  }
  await expect(page.locator('[data-map][aria-pressed="true"]')).toHaveCount(0);
  await expect(page.locator("#regenerate")).toBeDisabled();
  await expect(page.locator("#edit-mode")).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  await page.locator("#undo").click();
  await expect(page.locator('[data-map="empty"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#regenerate")).toBeEnabled();
  for (const algorithm of algorithms)
    expect(await snapshot(page, algorithm)).toEqual(empty);
  await expect(page.locator("#redo")).toBeEnabled();
  await page.locator("#redo").click();
  await expect(page.locator("#redo")).toBeDisabled();
  await expect(page.locator("#regenerate")).toBeDisabled();
  for (const algorithm of algorithms) {
    await expect(
      page.locator(`#${algorithm}-grid [data-index="37"]`),
    ).toHaveClass(/\bwater\b/);
  }
});

test("a weighted draft survives reload and a v2 share overrides a different local draft", async ({
  page,
}) => {
  await page.goto("/");
  await enableDrawing(page);
  await page.locator('[data-map="empty"]').click();
  for (const [tool, index] of [
    ["sand", 37],
    ["water", 38],
    ["wall", 39],
    ["start", 71],
    ["end", 73],
  ] as const) {
    await page.locator(`[data-tool="${tool}"]`).click();
    await page.locator(`#astar-grid [data-index="${index}"]`).click();
  }
  const edited = await snapshot(page, "astar");
  expect(edited.terrain).toEqual([
    { cell: 37, cost: 5 },
    { cell: 38, cost: 9 },
  ]);
  await expect(page.locator("#save-state")).toContainText(
    "草稿已保存在此浏览器",
  );

  await page.reload();
  await expect(page.locator("#result")).toContainText(
    "已恢复此浏览器上次的地图草稿",
  );
  await expect(page.locator("#regenerate")).toBeDisabled();
  await expect(page.locator("#timeline")).toBeDisabled();
  for (const algorithm of algorithms)
    expect(await snapshot(page, algorithm)).toEqual(edited);
  await page.locator("#share").click();
  await expect(page).toHaveURL(/#v2\./);
  const sharedURL = page.url();

  await page.locator('[data-map="maze"]').click();
  expect(await snapshot(page, "astar")).not.toEqual(edited);
  await page.goto("about:blank");
  await page.goto(sharedURL);
  await expect(page.locator("#result")).toContainText("分享地图已载入");
  for (const algorithm of algorithms)
    expect(await snapshot(page, algorithm)).toEqual(edited);
});

test("JSON import and export preserve a map, invalid files preserve edits, and PNG is usable", async ({
  page,
}) => {
  await page.goto("/");
  const payload = {
    version: 1,
    cols: 35,
    rows: 23,
    board: {
      walls: [40, 75],
      start: 36,
      end: 768,
      seed: 2026,
      terrain: [
        { cell: 37, cost: 5 },
        { cell: 38, cost: 9 },
      ],
    },
  };
  const chooseFile = page.waitForEvent("filechooser");
  await page.locator("#import-json").click();
  await (
    await chooseFile
  ).setFiles({
    name: "weighted-map.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(payload)),
  });
  await expect(page.locator("#result")).toContainText("地图已导入");
  const expected = {
    ...payload.board,
    start: "36",
    end: "768",
    seed: "2026",
  };
  for (const algorithm of algorithms)
    expect(await snapshot(page, algorithm)).toEqual(expected);
  await expect(page.locator("#regenerate")).toBeDisabled();

  const jsonDownload = page.waitForEvent("download");
  await page.locator("#export-json").click();
  const json = await jsonDownload;
  expect(json.suggestedFilename()).toBe("pathfinder-2026.json");
  expect(await json.failure()).toBeNull();
  const jsonPath = await json.path();
  expect(jsonPath).not.toBeNull();
  expect(JSON.parse(await readFile(jsonPath!, "utf8"))).toEqual(payload);

  await page.locator("#map-file").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":99}'),
  });
  await expect(page.locator("#result")).toContainText("地图文件格式无效");
  for (const algorithm of algorithms)
    expect(await snapshot(page, algorithm)).toEqual(expected);
  await page.locator("#map-file").setInputFiles({
    name: "oversized.json",
    mimeType: "application/json",
    buffer: Buffer.alloc(50_001, " "),
  });
  await expect(page.locator("#result")).toContainText("地图文件过大");
  for (const algorithm of algorithms)
    expect(await snapshot(page, algorithm)).toEqual(expected);

  await page.locator("#step").click();
  await page.locator("#timeline").press("End");
  const pngDownload = page.waitForEvent("download");
  await page.locator("#export-image").click();
  const png = await pngDownload;
  expect(png.suggestedFilename()).toBe("pathfinder-2026.png");
  expect(await png.failure()).toBeNull();
  const pngPath = await png.path();
  expect(pngPath).not.toBeNull();
  const image = await readFile(pngPath!);
  expect(image.subarray(0, 8)).toEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  expect(image.readUInt32BE(16)).toBe(1500);
  expect(image.readUInt32BE(20)).toBe(750);
  await expect(page.locator("#result")).toContainText("已导出为 PNG");
});

test("ordinary anchors preserve feedback and zoom scrolls inside the map", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('[data-map="empty"]').click();
  const before = await snapshot(page, "astar");
  const feedback = await page.locator("#result").textContent();
  await page.locator('a[href="#arena"]').click();
  await expect(page).toHaveURL(/#arena$/);
  await expect(page.locator("#result")).toHaveText(feedback!);
  // The navigation link is hidden on mobile; a same-document URL navigation
  // still checks the shared hash handler for this ordinary page anchor.
  await page.goto("/#how");
  await expect(page).toHaveURL(/#how$/);
  await expect(page.locator("#result")).toHaveText(feedback!);

  await page.locator("#zoom").selectOption("3");
  const viewport = page.locator(".board-wrap").first();
  await expect
    .poll(() =>
      viewport.evaluate((element) => element.scrollWidth > element.clientWidth),
    )
    .toBe(true);
  await page.locator('#astar-grid [data-index="34"]').scrollIntoViewIfNeeded();
  await expect
    .poll(() => viewport.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
  for (const algorithm of algorithms)
    expect(await snapshot(page, algorithm)).toEqual(before);
  await page.locator("#zoom").selectOption("1");
  await expect
    .poll(() =>
      viewport.evaluate((element) => element.scrollWidth - element.clientWidth),
    )
    .toBeLessThanOrEqual(2);
});

test("undo and play shortcuts commit an active pointer stroke exactly once", async ({
  page,
}) => {
  await page.goto("/");
  await enableDrawing(page);
  await page.locator('[data-map="empty"]').click();
  const empty = await snapshot(page, "astar");

  const beginStroke = async (index: number) => {
    const cell = page.locator(`#astar-grid [data-index="${index}"]`);
    await cell.scrollIntoViewIfNeeded();
    const box = await cell.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await expect(cell).toHaveClass(/\bwall\b/);
  };

  await beginStroke(37);
  await page.keyboard.press("Control+z");
  await page.mouse.up();
  await expect(page.locator("#result")).toContainText("已撤销");
  for (const algorithm of algorithms)
    expect(await snapshot(page, algorithm)).toEqual(empty);
  await expect(page.locator("#redo")).toBeEnabled();
  await page.locator("#redo").click();
  for (const algorithm of algorithms) {
    await expect(
      page.locator(`#${algorithm}-grid [data-index="37"]`),
    ).toHaveClass(/\bwall\b/);
  }
  await page.locator("#undo").click();

  await beginStroke(38);
  await page.keyboard.press("p");
  await page.mouse.up();
  await expect(page.locator("#run")).toContainText("暂停");
  await expect
    .poll(async () =>
      Number(await page.locator("#dijkstra-visited").textContent()),
    )
    .toBeGreaterThan(0);
  await page.locator("#run").click();
  await page.locator("#undo").click();
  for (const algorithm of algorithms)
    expect(await snapshot(page, algorithm)).toEqual(empty);
  await expect(page.locator("#timeline")).toBeDisabled();
  await expect(page.locator("#redo")).toBeEnabled();
});

test("late file reads cannot overwrite newer edits or a more recent import", async ({
  page,
}) => {
  // Delay only the browser File API. DOM events release individual reads;
  // the test neither accesses application state nor depends on timer races.
  await page.addInitScript(() => {
    const originalText = File.prototype.text;
    File.prototype.text = async function () {
      const text = await originalText.call(this);
      if (this.name.startsWith("slow-")) {
        await new Promise<void>((resolve) => {
          document.addEventListener(
            `release-import:${this.name}`,
            () => resolve(),
            { once: true },
          );
          document.documentElement.setAttribute(
            "data-waiting-import",
            this.name,
          );
        });
        document.documentElement.setAttribute(
          "data-completed-import",
          this.name,
        );
      }
      return text;
    };
  });
  await page.goto("/");
  await page.locator('[data-map="empty"]').click();
  const importFile = (name: string, seed: number, wall: number) =>
    page.locator("#map-file").setInputFiles({
      name,
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          version: 1,
          cols: 35,
          rows: 23,
          board: { walls: [wall], start: 36, end: 768, seed },
        }),
      ),
    });
  const releaseFile = async (name: string) => {
    await page.evaluate((filename) => {
      document.dispatchEvent(new Event(`release-import:${filename}`));
    }, name);
    await expect(page.locator("html")).toHaveAttribute(
      "data-completed-import",
      name,
    );
  };

  await importFile("slow-before-edit.json", 11, 80);
  await expect(page.locator("html")).toHaveAttribute(
    "data-waiting-import",
    "slow-before-edit.json",
  );
  await page.locator('#astar-grid [data-index="37"]').press("Space");
  const edited = await snapshot(page, "astar");
  expect(edited.walls).toEqual([37]);
  await releaseFile("slow-before-edit.json");
  await expect(page.locator("#result")).toContainText(
    "读取期间地图已改变，已取消此次导入",
  );
  for (const algorithm of algorithms)
    expect(await snapshot(page, algorithm)).toEqual(edited);

  await importFile("slow-superseded.json", 22, 81);
  await expect(page.locator("html")).toHaveAttribute(
    "data-waiting-import",
    "slow-superseded.json",
  );
  await importFile("latest.json", 33, 82);
  await expect(page.locator("#result")).toContainText("地图已导入");
  const latest = await snapshot(page, "astar");
  expect(latest.walls).toEqual([82]);
  expect(latest.seed).toBe("33");
  await releaseFile("slow-superseded.json");
  await expect(page.locator("#result")).toContainText("地图已导入");
  for (const algorithm of algorithms)
    expect(await snapshot(page, algorithm)).toEqual(latest);
});

test("switching languages preserves edited cells and the current replay", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('[data-map="empty"]').click();
  await page.locator('[data-tool="water"]').click();
  const cell = page.locator('#astar-grid [data-index="37"]');
  await cell.press("Space");
  const originalCell = await cell.elementHandle();
  const board = await snapshot(page, "astar");
  await page.locator("#step").click();
  await page.locator("#step").click();
  const replay = await page.locator("#timeline").inputValue();
  const statistics = () =>
    page.locator(".decision-panel dd, .player-stats strong").allTextContents();
  const before = await statistics();

  for (const locale of ["en", "zh-CN"]) {
    await page.locator("#locale").selectOption(locale);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page).toHaveTitle(
      locale === "en"
        ? "Pathfinder Arena · Search laboratory"
        : "Pathfinder Arena · 寻路竞技场",
    );
    await expect(page.locator("#timeline")).toHaveValue(replay);
    expect(await statistics()).toEqual(before);
    for (const algorithm of algorithms)
      expect(await snapshot(page, algorithm)).toEqual(board);
    expect(await originalCell!.evaluate((element) => element.isConnected)).toBe(
      true,
    );
  }
  await expect(cell).toHaveAttribute(
    "aria-label",
    "第 2 行，第 3 列，水域，进入代价 9",
  );
  await page.locator("#step").click();
  for (const algorithm of algorithms)
    await expect(page.locator(`#${algorithm}-visited`)).toHaveText("3");
});

test("English covers visible copy, accessible labels, and new status messages", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#locale").selectOption("en");
  await expect(page.locator("h1")).toContainText("One map.");
  await expect(page.locator("#step")).toHaveText("Step");
  await expect(page.locator("#reset")).toHaveText("Reset replay");
  await expect(page.locator("#astar-grid")).toHaveAttribute(
    "aria-label",
    "A* map, editable",
  );
  for (const selector of [
    ".how details summary",
    ".precise-editor summary",
    ".draft-manager summary",
  ]) {
    await page.locator(selector).click();
  }
  const expectEnglish = async () => {
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const untranslated: string[] = [];
            const chinese = /\p{Script=Han}/u;
            const walker = document.createTreeWalker(
              document.body,
              NodeFilter.SHOW_TEXT,
            );
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
              const parent = node.parentElement;
              if (!parent || parent.closest("#locale, script, style")) continue;
              if (!chinese.test(node.textContent ?? "")) continue;
              const range = document.createRange();
              range.selectNodeContents(node);
              if (range.getClientRects().length)
                untranslated.push(node.textContent!.trim());
            }
            for (const element of Array.from(
              document.querySelectorAll(
                "[aria-label], [title], [placeholder], [alt]",
              ),
            )) {
              if (element.closest("#locale")) continue;
              for (const attribute of [
                "aria-label",
                "title",
                "placeholder",
                "alt",
              ]) {
                const value = element.getAttribute(attribute);
                if (value && chinese.test(value))
                  untranslated.push(`${attribute}: ${value}`);
              }
            }
            return untranslated.slice(0, 20);
          }),
        {
          message:
            "English UI must not retain Chinese outside the language menu",
        },
      )
      .toEqual([]);
  };
  await expectEnglish();
  await page.locator('[data-scenario="detour"]').click();
  await page.locator("#step").click();
  await expect(page.locator("#result")).toContainText("Expansion 1.");
  await expectEnglish();
  await page.locator("#timeline").press("End");
  await expect(page.locator("#result")).toContainText(
    "Finished: both minimum costs are 36.",
  );
  await expectEnglish();
  await page.locator("#map-file").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from("{}"),
  });
  await expect(page.locator("#result")).toContainText("Invalid map file.");
  await expectEnglish();
});

test("preferences survive reload and clearing a draft leaves the map and settings alone", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('[data-map="empty"]').click();
  await page.locator('#astar-grid [data-index="37"]').press("Space");
  const edited = await snapshot(page, "astar");
  await page.locator("#locale").selectOption("en");
  await page.locator("#zoom").selectOption("1.5");
  await page.locator("#speed").selectOption("100");
  await page.reload();
  for (const [id, value] of [
    ["locale", "en"],
    ["zoom", "1.5"],
    ["speed", "100"],
  ]) {
    await expect(page.locator(`#${id}`)).toHaveValue(value);
  }
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  for (const algorithm of algorithms)
    expect(await snapshot(page, algorithm)).toEqual(edited);
  await page.locator(".draft-manager summary").click();
  await page.locator("#clear-draft").click();
  await expect(page.locator("#result")).toContainText("Local draft cleared.");
  await expect(page.locator("#restore-draft")).toBeDisabled();
  for (const algorithm of algorithms)
    expect(await snapshot(page, algorithm)).toEqual(edited);
  const readDraft = () =>
    page.evaluate(() => localStorage.getItem("pathfinder-arena:draft"));
  expect(await readDraft()).toBeNull();

  await page.locator("#run").click();
  await expect(page.locator("#run")).toContainText("Pause");
  await page.locator("#run").click();
  await page.locator("#reset").click();
  await page.locator("#locale").selectOption("zh-CN");
  await page.locator("#locale").selectOption("en");
  expect(await readDraft()).toBeNull();
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("pathfinder-arena:preferences")!),
    ),
  ).toEqual({ version: 1, locale: "en", zoom: 1.5, speed: 100 });

  await page.reload();
  expect((await snapshot(page, "astar")).walls.length).toBeGreaterThan(0);
  await expect(page.locator("#locale")).toHaveValue("en");
  await expect(page.locator("#zoom")).toHaveValue("1.5");
  await expect(page.locator("#speed")).toHaveValue("100");
  expect(await readDraft()).toBeNull();
  await page.locator('[data-tool="sand"]').click();
  await page.locator('#astar-grid [data-index="38"]').press("Space");
  await expect(page.locator("#save-state")).toContainText(
    "Draft saved in this browser",
  );
  expect(await readDraft()).not.toBeNull();
});

test("a shared map can recover the draft that existed before this page opened", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('[data-map="empty"]').click();
  await page.locator('[data-tool="water"]').click();
  await page.locator('#astar-grid [data-index="38"]').press("Space");
  const shared = await snapshot(page, "astar");
  await page.locator("#share").click();
  await expect(page).toHaveURL(/#v2\./);
  const sharedURL = page.url();

  await page.locator('[data-map="empty"]').click();
  await page.locator('[data-tool="wall"]').click();
  await page.locator('#astar-grid [data-index="37"]').press("Space");
  const earlierDraft = await snapshot(page, "astar");
  await page.goto("about:blank");
  await page.goto(sharedURL);
  for (const algorithm of algorithms)
    expect(await snapshot(page, algorithm)).toEqual(shared);
  await page.locator(".draft-manager summary").click();
  await expect(page.locator("#restore-draft")).toBeEnabled();

  await page.locator('#astar-grid [data-index="40"]').press("Space");
  expect((await snapshot(page, "astar")).walls).toEqual([40]);
  await expect(page.locator("#save-state")).toContainText(
    "草稿已保存在此浏览器",
  );
  await page.locator("#restore-draft").click();
  for (const algorithm of algorithms)
    expect(await snapshot(page, algorithm)).toEqual(earlierDraft);
  await expect(page.locator("#restore-draft")).toBeDisabled();
  await expect(page.locator("#result")).toContainText("已恢复");
});

test("precise selection stays marked after edits and step announcements describe both decisions", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('[data-map="empty"]').click();
  await page.locator(".precise-editor summary").click();
  await page.locator('[data-move="right"]').click();
  await page.locator('[data-tool="sand"]').click();
  await page.locator("#apply-selected").click();
  const expectSelection = async () => {
    for (const algorithm of algorithms) {
      const selected = page.locator(`#${algorithm}-grid .selected`);
      await expect(selected).toHaveCount(1);
      await expect(selected).toHaveAttribute("data-index", "37");
      await expect(selected).toHaveClass(/\bsand\b/);
    }
  };
  await expectSelection();
  const result = page.locator("#result");
  await expect(result).toHaveAttribute("role", "status");
  await expect(result).toHaveAttribute("aria-live", "polite");
  await page.locator("#step").click();
  await expect(result).toHaveText(
    "第 1 次展开。A* 当前格 37，g 0，h 52，f 52；Dijkstra 当前格 37，g 0，h 0，f 0。",
  );
  await expectSelection();
  await page.locator("#timeline").press("Home");
  await expectSelection();
  await page.locator("#locale").selectOption("en");
  await page.locator("#step").click();
  await expect(result).toHaveText(
    "Expansion 1. A* cell 37: g 0, h 52, f 52; Dijkstra cell 37: g 0, h 0, f 0.",
  );
  await expectSelection();
  await expect(page.locator('#astar-grid [data-index="37"]')).toHaveAttribute(
    "aria-label",
    "Row 2, column 3, Sand, Entry cost 5",
  );
});
