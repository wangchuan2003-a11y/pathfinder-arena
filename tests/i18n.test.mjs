import test from "node:test";
import assert from "node:assert/strict";
import {
  messages,
  localeFrom,
  translate,
  translateText,
} from "../.test-build/i18n.js";

const variables = (text) =>
  [...text.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g)]
    .map((match) => match[1])
    .sort();

test("Chinese and English dictionaries have identical keys and template variables", () => {
  const keys = Object.keys(messages["zh-CN"]).sort();
  assert.deepEqual(keys, Object.keys(messages.en).sort());
  for (const key of keys) {
    assert.ok(messages["zh-CN"][key].trim(), `Empty Chinese value: ${key}`);
    assert.ok(messages.en[key].trim(), `Empty English value: ${key}`);
    assert.deepEqual(
      variables(messages["zh-CN"][key]),
      variables(messages.en[key]),
      key,
    );
    if (key !== "中文")
      assert.doesNotMatch(messages.en[key], /\p{Script=Han}/u, key);
  }
});

test("localeFrom accepts English locale variants and defaults other input to Chinese", () => {
  for (const value of ["en", "en-US", "en-GB", "EN", " EN-au "])
    assert.equal(localeFrom(value), "en");
  for (const value of [
    undefined,
    null,
    0,
    {},
    [],
    "",
    "zh-CN",
    "fr",
    "english",
    "en_US",
  ])
    assert.equal(localeFrom(value), "zh-CN");
});

test("translate uses complete keys and preserves unknown keys", () => {
  assert.equal(translate("en", "总代价"), "Total cost");
  assert.equal(translate("zh-CN", "总代价"), "总代价");
  assert.equal(translate("en", "missing.key"), "missing.key");
  assert.equal(
    translate("en", "missing {value}", { value: 0 }),
    "missing {value}",
  );
  assert.equal(translate("en", "toString"), "toString");
});

test("interpolation preserves zero, missing parameters, and literal replacement text", () => {
  const key = "第 {row} 行，第 {col} 列";
  assert.equal(translate("en", key, { row: 0, col: 2 }), "Row 0, column 2");
  assert.equal(translate("en", key, { row: 0 }), "Row 0, column {col}");
  assert.equal(
    translate("en", key, { row: "$&", col: "<b>2</b>" }),
    "Row $&, column <b>2</b>",
  );
  assert.equal(
    translate("en", key, Object.create({ row: 2 })),
    "Row {row}, column {col}",
  );
});

test("translateText translates static strings and preserves Chinese locale source text", () => {
  assert.equal(translateText("en", "等待出发"), "Ready");
  assert.equal(translateText("zh-CN", "第 0 行，第 2 列"), "第 0 行，第 2 列");
});

test("translateText handles zero-valued templates and current-node coordinates", () => {
  assert.equal(translateText("en", "进入代价 0"), "Entry cost 0");
  assert.equal(translateText("en", "第 1 行，第 2 列"), "Row 1, column 2");
  assert.equal(
    translateText("en", "当前展开：第 1 行，第 2 列"),
    "Current: row 1, column 2",
  );
});

test("translateText translates one nested level of cell labels", () => {
  assert.equal(
    translateText("en", "第 1 行，第 2 列，沙地，进入代价 5"),
    "Row 1, column 2, Sand, Entry cost 5",
  );
  assert.equal(
    translateText("en", "第 3 行，第 4 列，墙，不可通行"),
    "Row 3, column 4, Wall, Blocked",
  );
});

test("translateText translates a whole completion report including its comparison", () => {
  assert.equal(
    translateText(
      "en",
      "对决完成：最优总代价均为 0。A* 0 步，Dijkstra 0 步。两者探索的节点数相同。展开节点数不代表实际运行时间。",
    ),
    "Finished: both minimum costs are 0. A*: 0 steps; Dijkstra: 0 steps. Both algorithms expanded the same number of nodes. Expanded nodes do not measure running time.",
  );
  assert.equal(
    translateText(
      "en",
      "对决完成：最优总代价均为 10。A* 6 步，Dijkstra 10 步。A* 少探索了 3 个节点。展开节点数不代表实际运行时间。",
    ),
    "Finished: both minimum costs are 10. A*: 6 steps; Dijkstra: 10 steps. A* expanded 3 fewer nodes. Expanded nodes do not measure running time.",
  );
});

test("template literals are regex-escaped and matching never replaces a substring", () => {
  assert.equal(
    translateText("en", "A* 少探索了 2 个节点。"),
    "A* expanded 2 fewer nodes.",
  );
  for (const source of [
    "AAAA 少探索了 2 个节点。",
    "提示：进入代价 5",
    "开始对决 now",
    "第 1 行，第 2 列\n",
    "This text is unknown.",
    "<b>开始对决</b>",
  ])
    assert.equal(translateText("en", source), source);
});

test("nested parameter translation stops after one level", () => {
  assert.equal(
    translateText("en", "第 1 行，第 2 列，沙地，进入代价 起点"),
    "Row 1, column 2, Sand, Entry cost 起点",
  );
});

test("step announcements keep all zero values and translate nested coordinates", () => {
  assert.equal(
    translateText(
      "en",
      "第 0 次展开。A* 当前格 第 1 行，第 2 列，g 0，h 0，f 0；Dijkstra 当前格 第 3 行，第 4 列，g 0，h 0，f 0。",
    ),
    "Expansion 0. A* cell Row 1, column 2: g 0, h 0, f 0; Dijkstra cell Row 3, column 4: g 0, h 0, f 0.",
  );
});
