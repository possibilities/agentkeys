import { afterAll, expect, test } from "bun:test";
import { Binding } from "../src/model.ts";
import { parseSkhd } from "../src/parsers.ts";
import {
  ALL_KEYS,
  detectConflicts,
  explainKey,
  filterBindings,
  findAvailable,
  renderAvailable,
  renderBindings,
  renderCheatsheet,
  renderDoctor,
  renderExplain,
} from "../src/reports.ts";
import { makeTempDir, removeTempDirs, writeFixture } from "./helpers.ts";

afterAll(removeTempDirs);

function tempRoot(): string {
  return makeTempDir("agentkeys-report-");
}

test("binding records omit optional fields when empty and keep source line shape", () => {
  expect(new Binding({ layer: "nvim", key: "x", action: "plain" }).toRecord()).toEqual({
    layer: "nvim",
    key: "x",
    action: "plain",
  });
  expect(
    new Binding({
      layer: "nvim",
      key: "space+x",
      action: "act",
      mode: "n",
      context: "ctx",
      sourceFile: "init.lua",
      sourceLine: 7,
    }).toRecord(),
  ).toEqual({
    layer: "nvim",
    key: "space+x",
    action: "act",
    mode: "n",
    context: "ctx",
    source: "init.lua:7",
  });
});

test("filters by layer and canonical modifier combo", () => {
  const bindings = [
    new Binding({ layer: "skhd", key: "cmd+shift+h", action: "one" }),
    new Binding({ layer: "nvim", key: "shift+h", action: "two" }),
  ];
  expect(filterBindings(bindings, { layer: "skhd", modifier: "shift+cmd" })).toHaveLength(1);
  expect(filterBindings(bindings, { modifier: "shift" })).toHaveLength(2);
});

test("conflicts honor priority, conditional shadows, and layer-scoped exclusion", () => {
  const bindings = [
    new Binding({ layer: "karabiner", key: "cmd+h", action: "higher" }),
    new Binding({ layer: "skhd", key: "cmd+h", action: "lower" }),
    new Binding({
      layer: "skhd",
      key: "alt+x",
      action: "app",
      context: "Terminal only",
    }),
    new Binding({ layer: "nvim", key: "alt+x", action: "edit" }),
    new Binding({ layer: "karabiner", key: "space+k", action: "space" }),
    new Binding({ layer: "nvim", key: "space+k", action: "leader" }),
  ];

  expect(detectConflicts(bindings).map((conflict) => [conflict.key, conflict.kind])).toEqual([
    ["alt+x", "conditional shadow"],
    ["cmd+h", "shadow"],
  ]);
  expect(renderDoctor(bindings, [])).toContain("## Conditional shadows (1)");
  expect(renderCheatsheet(bindings, bindings)).toContain("(shadowed)");
});

// Sibling layers tmux and herdr share no hosting path: only the selected
// multiplexer receives the keystroke, so identical keys are never a Shadow.
test("interception follows hosting paths, so siblings never conflict", () => {
  const siblings = [
    new Binding({ layer: "tmux", key: "ctrl+b", action: "prefix" }),
    new Binding({ layer: "herdr", key: "ctrl+b", action: "prefix" }),
  ];
  expect(detectConflicts(siblings)).toEqual([]);

  // The same keys against a hosted layer are still real shadows.
  const hosted = [...siblings, new Binding({ layer: "nvim", key: "ctrl+b", action: "page back" })];
  const conflicts = detectConflicts(hosted).map((conflict) => [
    conflict.key,
    conflict.higherLayer,
    conflict.lowerLayer,
  ]);
  expect(conflicts).toEqual([
    ["ctrl+b", "tmux", "nvim"],
    ["ctrl+b", "herdr", "nvim"],
  ]);

  // Both siblings win outright in their own worlds; neither is shadowed.
  const explanation = explainKey(siblings, "ctrl+b");
  expect(explanation.owners.map((owner) => [owner.layer, owner.verdict])).toEqual([
    ["tmux", "wins"],
    ["herdr", "wins"],
  ]);
  expect(explanation.verdict).toBe("taken by tmux, herdr");

  // A sibling's binding never blocks a slot in the other multiplexer.
  const tmuxOnly = [new Binding({ layer: "tmux", key: "ctrl+b", action: "prefix" })];
  expect(findAvailable(tmuxOnly, "ctrl", "herdr").available).toContain("b");
  expect(findAvailable(tmuxOnly, "ctrl", "nvim").available).not.toContain("b");
});

test("doctor aggregates contextual higher-layer records and ignores passthrough", () => {
  const skhd = parseSkhd(
    writeFixture(
      tempRoot(),
      "skhdrc",
      [
        "ctrl - l [",
        '  "Terminal" : open terminal',
        '  "Browser" : open browser',
        "  * ~",
        "]",
      ].join("\n"),
    ),
  );
  const bindings = [...skhd, new Binding({ layer: "nvim", key: "ctrl+l", action: "redraw" })];

  expect(detectConflicts(bindings)).toEqual([
    {
      key: "ctrl+l",
      kind: "conditional shadow",
      higherLayer: "skhd",
      lowerLayer: "nvim",
      higherAction: "open terminal; open browser",
      lowerAction: "redraw",
      higherContexts: ["Terminal only", "Browser only"],
    },
  ]);
  const report = renderDoctor(bindings, [
    { layer: "skhd", source: "skhdrc", found: true, bindings: skhd.length },
    { layer: "tmux", source: "tmux.conf", found: false, bindings: 0 },
  ]);
  expect(report).toContain("Terminal only; Browser only");
  expect(report).not.toContain("passthrough");
  expect(report).toContain("| tmux | tmux.conf (not found) | — |");
});

test("doctor reports its sources even when nothing conflicts", () => {
  const report = renderDoctor(
    [new Binding({ layer: "skhd", key: "cmd+a", action: "act" })],
    [{ layer: "skhd", source: "skhdrc", found: true, bindings: 1 }],
  );
  expect(report).toContain("## Sources");
  expect(report).toContain("| skhd | skhdrc | 1 |");
  expect(report).toContain("No cross-layer conflicts detected.");
});

test("explain ranks every layer on a key and names well-known owners", () => {
  const bindings = [
    new Binding({ layer: "skhd", key: "ctrl+l", action: "focus address bar" }),
    new Binding({ layer: "tmux", key: "ctrl+l", action: "clear" }),
    new Binding({
      layer: "nvim",
      key: "ctrl+l",
      action: "copilot accept",
      mode: "i",
    }),
  ];

  const explanation = explainKey(bindings, "control + L");
  expect(explanation.key).toBe("ctrl+l");
  expect(explanation.owners.map((owner) => [owner.layer, owner.verdict])).toEqual([
    ["skhd", "wins"],
    ["tmux", "shadowed"],
    ["nvim", "shadowed"],
  ]);
  expect(explanation.verdict).toBe("taken by skhd");
  expect(explanation.reserved[0]?.owner).toBe("shell (readline)");
  expect(renderExplain(explanation)).toContain("Verdict: taken by skhd.");

  const free = explainKey(bindings, "alt+g");
  expect(free.verdict).toBe("free");
  expect(renderExplain(free)).toContain("No binding in any layer.");

  const reservedOnly = explainKey(bindings, "cmd+shift+4");
  expect(reservedOnly.verdict).toBe("free in your config, but macOS uses it");
});

test("availability uses the 69-key universe and priority blocking semantics", () => {
  expect(ALL_KEYS).toHaveLength(69);
  const bindings = [
    new Binding({ layer: "karabiner", key: "cmd+shift+a", action: "top" }),
    new Binding({ layer: "nvim", key: "cmd+shift+b", action: "bottom" }),
  ];
  const skhd = findAvailable(bindings, "shift+cmd", "skhd");
  expect(skhd.modifier).toBe("cmd+shift");
  expect(skhd.available).not.toContain("a");
  expect(skhd.available).toContain("b");

  const nvim = findAvailable(bindings, "cmd+shift", "nvim");
  expect(nvim.available).not.toContain("a");
  expect(nvim.available).not.toContain("b");
  const availableText = renderAvailable(nvim);
  expect(availableText).toContain("Available slots for cmd+shift+* at nvim layer");
  expect(availableText).toContain("  Letters:  ");
  expect(availableText).toContain("  Digits:   ");
  expect(availableText).toContain("  Punct:    ");
  expect(availableText).toContain("  Special:  ");
});

test("availability names free slots that well-known software already uses", () => {
  const result = findAvailable([], "cmd+shift", "skhd");
  expect(result.reserved.map((reservation) => reservation.key)).toEqual([
    "cmd+shift+n",
    "cmd+shift+t",
    "cmd+shift+z",
    "cmd+shift+3",
    "cmd+shift+4",
    "cmd+shift+5",
    "cmd+shift+/",
    "cmd+shift+tab",
  ]);
  const text = renderAvailable(result);
  expect(text).toContain("Free here, but well known elsewhere:");
  expect(text).toContain("macOS: Screenshot a selection");
});

test("renders json, yaml, table, and empty binding output", () => {
  const bindings = [new Binding({ layer: "skhd", key: "cmd+a", action: "act" })];
  const enveloped = JSON.parse(renderBindings(bindings, "json"));
  expect(enveloped).toMatchObject({
    schema_version: 1,
    ok: true,
    error: null,
    data: [{ layer: "skhd", key: "cmd+a", action: "act" }],
  });
  expect(renderBindings(bindings, "yaml")).toContain("layer: skhd");
  expect(renderBindings(bindings, "table")).toBe(
    "LAYER  KEY    ACTION  CONTEXT\n-----  -----  ------  -------\nskhd   cmd+a  act\n",
  );
  expect(JSON.parse(renderBindings([], "json")).data).toEqual([]);
  expect(renderBindings([], "yaml")).toBe("schema_version: 1\nok: true\nerror: null\ndata: []\n");
  expect(renderBindings([], "table")).toBe("No bindings found.\n");
});
