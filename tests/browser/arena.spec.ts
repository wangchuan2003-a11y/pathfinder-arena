import { test as base, expect, type Page } from "@playwright/test";

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
    start: await grid.locator(".start").getAttribute("data-index"),
    end: await grid.locator(".end").getAttribute("data-index"),
    seed: await page.locator("#seed").inputValue(),
  };
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
    await expect(page.locator(`#${algorithm}-grid .path`)).toHaveCount(53);
  }
  await expect(page.locator("#astar-visited")).toHaveText("53");
  await expect(page.locator("#dijkstra-visited")).toHaveText("801");
  await expect(page.locator("#result")).toContainText("最短距离均为 52 步");

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
      "第 2 行，第 3 列，墙",
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
});

test("moving endpoints onto a wall clears it and coincident endpoints cost zero", async ({
  page,
}) => {
  await page.goto("/");
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
    await expect(page.locator(`#${algorithm}-visited`)).toHaveText("1");
    await expect(page.locator(`#${algorithm}-state`)).toHaveText("已到达");
    await expect(page.locator(`#${algorithm}-grid .path`)).toHaveCount(1);
  }
});

test("seed regeneration is deterministic and a shared URL restores custom edits", async ({
  page,
}) => {
  await page.goto("/");
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
