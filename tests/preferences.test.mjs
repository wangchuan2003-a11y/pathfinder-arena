import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  savePreferences,
} from "../.test-build/preferences.js";

const defaults = { locale: "zh-CN", zoom: 1, speed: 40 };

function storageWith(initial = null) {
  let stored = initial;
  const reads = [];
  const writes = [];
  return {
    reads,
    writes,
    getItem(key) {
      reads.push(key);
      return stored;
    },
    setItem(key, value) {
      writes.push([key, value]);
      stored = value;
    },
  };
}

test("all supported preferences survive save/load using only the preferences key", () => {
  for (const locale of ["zh-CN", "en"]) {
    for (const zoom of [1, 1.5, 2, 3]) {
      for (const speed of [20, 40, 100, 240]) {
        const storage = storageWith();
        const preferences = Object.freeze({ locale, zoom, speed });
        assert.equal(savePreferences(storage, preferences), true);
        assert.deepEqual(loadPreferences(storage), preferences);
        assert.deepEqual(storage.reads, ["pathfinder-arena:preferences"]);
        assert.deepEqual(storage.writes, [
          [
            "pathfinder-arena:preferences",
            JSON.stringify({ version: 1, ...preferences }),
          ],
        ]);
      }
    }
  }
});

test("invalid fields fall back independently without coercion or loss of valid fields", () => {
  const cases = [
    [
      { locale: "fr", zoom: 2, speed: 100 },
      { locale: "zh-CN", zoom: 2, speed: 100 },
    ],
    [
      { locale: "en", zoom: 0, speed: 240 },
      { locale: "en", zoom: 1, speed: 240 },
    ],
    [
      { locale: "en", zoom: 1.5, speed: null },
      { locale: "en", zoom: 1.5, speed: 40 },
    ],
    [
      { locale: "en", zoom: "3", speed: "20" },
      { locale: "en", zoom: 1, speed: 40 },
    ],
    [{ locale: 0, zoom: null, speed: 0 }, defaults],
    [{ locale: null, zoom: [], speed: {} }, defaults],
    [
      { zoom: 3, speed: 20 },
      { locale: "zh-CN", zoom: 3, speed: 20 },
    ],
    [
      { locale: "en", unknown: "ignored" },
      { locale: "en", zoom: 1, speed: 40 },
    ],
  ];
  for (const [fields, expected] of cases) {
    const storage = storageWith(JSON.stringify({ version: 1, ...fields }));
    assert.deepEqual(loadPreferences(storage), expected);
    assert.deepEqual(
      storage.writes,
      [],
      "loading never repairs storage implicitly",
    );
  }
});

test("missing, malformed, primitive, array, and unsupported-version values use defaults", () => {
  const invalid = [
    null,
    0,
    {},
    "",
    "{",
    "null",
    "0",
    "false",
    '"en"',
    "[]",
    '[{"version":1,"locale":"en"}]',
    JSON.stringify({ locale: "en", zoom: 3, speed: 240 }),
    ...[0, 2, "1", null].map((version) =>
      JSON.stringify({ version, locale: "en", zoom: 3, speed: 240 }),
    ),
  ];
  for (const value of invalid) {
    const storage = storageWith(value);
    assert.deepEqual(loadPreferences(storage), defaults);
    assert.deepEqual(storage.reads, ["pathfinder-arena:preferences"]);
    assert.deepEqual(storage.writes, []);
  }
});

test("preferences reject oversized payloads while accepting the 2048-character boundary", () => {
  const preferences = { locale: "en", zoom: 3, speed: 240 };
  const json = JSON.stringify({ version: 1, ...preferences });
  const boundary = json.padEnd(2048, " ");
  assert.deepEqual(loadPreferences(storageWith(boundary)), preferences);
  assert.deepEqual(loadPreferences(storageWith(`${boundary} `)), defaults);
});

test("loaded settings cannot mutate shared defaults or future reads", () => {
  const storage = storageWith();
  const first = loadPreferences(storage);
  first.locale = "en";
  first.zoom = 3;
  assert.deepEqual(loadPreferences(storage), defaults);
  assert.deepEqual(DEFAULT_PREFERENCES, defaults);
  assert.notEqual(loadPreferences(storage), DEFAULT_PREFERENCES);
});

test("storage denial and quota failure are recoverable without touching other keys", () => {
  const calls = [];
  const denied = {
    getItem(key) {
      calls.push(["get", key]);
      throw new Error("SecurityError: denied");
    },
    setItem(key) {
      calls.push(["set", key]);
      throw new Error("QuotaExceededError");
    },
  };
  assert.deepEqual(loadPreferences(denied), defaults);
  assert.equal(savePreferences(denied, defaults), false);
  assert.deepEqual(calls, [
    ["get", "pathfinder-arena:preferences"],
    ["set", "pathfinder-arena:preferences"],
  ]);
});

test("saving canonicalizes runtime-invalid fields and does not modify the caller", () => {
  const input = Object.freeze({
    locale: "unknown",
    zoom: 3,
    speed: 0,
    extra: true,
  });
  const storage = storageWith();
  assert.equal(savePreferences(storage, input), true);
  assert.deepEqual(loadPreferences(storage), {
    locale: "zh-CN",
    zoom: 3,
    speed: 40,
  });
  assert.equal(input.locale, "unknown");
  assert.equal(input.speed, 0);
  assert.deepEqual(Object.keys(JSON.parse(storage.writes[0][1])), [
    "version",
    "locale",
    "zoom",
    "speed",
  ]);
});
