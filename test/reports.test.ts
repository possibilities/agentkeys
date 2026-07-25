import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Binding } from "../src/model.ts";
import { parseSkhd } from "../src/parsers.ts";
import {
  ALL_KEYS,
  detectConflicts,
  filterBindings,
  findAvailable,
  renderAvailable,
  renderBindings,
  renderCheatsheet,
  renderDoctor,
} from "../src/reports.ts";
import { writeFixture } from "./helpers.ts";

function tempRoot(): string {
  return mkdtempSync(join(tmpdir(), "agentkeys-report-"));
}

test("binding records omit optional fields when empty and keep source line shape", () => {
  expect(
    new Binding({ layer: "nvim", key: "x", action: "plain" }).toRecord(),
  ).toEqual({
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
  expect(
    filterBindings(bindings, { layer: "skhd", modifier: "shift+cmd" }),
  ).toHaveLength(1);
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

  expect(
    detectConflicts(bindings).map((conflict) => [conflict.key, conflict.kind]),
  ).toEqual([
    ["alt+x", "conditional shadow"],
    ["cmd+h", "shadow"],
  ]);
  expect(renderDoctor(bindings)).toContain("## Conditional shadows (1)");
  expect(renderCheatsheet(bindings, bindings)).toContain("(shadowed)");
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
  const bindings = [
    ...skhd,
    new Binding({ layer: "nvim", key: "ctrl+l", action: "redraw" }),
  ];

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
  const report = renderDoctor(bindings);
  expect(report).toContain("Terminal only; Browser only");
  expect(report).not.toContain("default");
  expect(report).not.toContain("passthrough");
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
  expect(availableText).toContain(
    "Available slots for cmd+shift+* at nvim layer",
  );
  expect(availableText).toContain("  Letters:  ");
  expect(availableText).toContain("  Digits:   ");
  expect(availableText).toContain("  Punct:    ");
  expect(availableText).toContain("  Special:  ");
});

test("renders json, yaml, table, and empty binding output", () => {
  const bindings = [
    new Binding({ layer: "skhd", key: "cmd+a", action: "act" }),
  ];
  expect(renderBindings(bindings, "json")).toContain('"layer": "skhd"');
  expect(renderBindings(bindings, "yaml")).toContain("layer: skhd");
  expect(renderBindings(bindings, "table")).toBe(
    "LAYER  KEY    ACTION  CONTEXT\n-----  -----  ------  -------\nskhd   cmd+a  act\n",
  );
  expect(renderBindings([], "json")).toBe("[]\n");
  expect(renderBindings([], "yaml")).toBe("[]\n");
  expect(renderBindings([], "table")).toBe("No bindings found.\n");
});
