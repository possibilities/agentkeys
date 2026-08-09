import { expect, test } from "bun:test";
import {
  buildKey,
  normalizeGhosttyKey,
  normalizeKarabinerKey,
  normalizeKarabinerMods,
  normalizeModifierCombo,
  normalizeNvimKey,
  normalizeSkhdMods,
  normalizeTmuxKey,
} from "../src/normalize.ts";

test("canonical modifier order and aliases", () => {
  expect(normalizeModifierCombo("shift+cmd")).toBe("cmd+shift");
  expect(normalizeModifierCombo("option + control + cmd")).toBe("ctrl+alt+cmd");
  expect(normalizeModifierCombo("super+opt")).toBe("alt+cmd");
  expect(normalizeModifierCombo("")).toBe("");
  expect(buildKey(["shift", "cmd", "cmd"], "H")).toBe("cmd+shift+h");
});

test("normalizes source-specific key names", () => {
  expect(normalizeKarabinerMods(["left_command", "right_option"])).toEqual([
    "cmd",
    "alt",
  ]);
  expect(normalizeKarabinerKey("return_or_enter")).toBe("return");
  expect(normalizeSkhdMods("control + option + shift")).toEqual([
    "ctrl",
    "alt",
    "shift",
  ]);
});

test("normalizes tmux key notation and skips pointer input", () => {
  expect(normalizeTmuxKey("C-Space")).toBe("ctrl+space");
  expect(normalizeTmuxKey("M-S-H")).toBe("alt+shift+h");
  expect(normalizeTmuxKey("M-H")).toBe("alt+shift+h");
  expect(normalizeTmuxKey("^A")).toBe("ctrl+a");
  expect(normalizeTmuxKey("PPage")).toBe("pageup");
  expect(normalizeTmuxKey("'\\'")).toBe("\\");
  expect(normalizeTmuxKey("MouseDown1StatusLeft")).toBeUndefined();
  expect(normalizeTmuxKey("WheelUpPane")).toBeUndefined();
});

test("normalizes Ghostty triggers, prefixes, and chord sequences", () => {
  expect(normalizeGhosttyKey("super+shift+,")).toBe("cmd+shift+,");
  expect(normalizeGhosttyKey("super+=")).toBe("cmd+=");
  expect(normalizeGhosttyKey("super++")).toBe("cmd+=");
  expect(normalizeGhosttyKey("alt+arrow_left")).toBe("alt+left");
  expect(normalizeGhosttyKey("performable:ctrl+shift+c")).toBe("ctrl+shift+c");
  expect(normalizeGhosttyKey("ctrl+a>n")).toBe("ctrl+a>n");
});

test("normalizes Neovim key notation", () => {
  expect(normalizeNvimKey("<Leader>f")).toBe("space+f");
  expect(normalizeNvimKey("<Leader>G")).toBe("space+shift+g");
  expect(normalizeNvimKey("<Leader>gg")).toBe("space+gg");
  expect(normalizeNvimKey("<leader>")).toBe("space");
  expect(normalizeNvimKey("<C-S-Tab>")).toBe("ctrl+shift+tab");
  expect(normalizeNvimKey("<M-w>")).toBe("alt+w");
  expect(normalizeNvimKey("Q")).toBe("shift+q");
  expect(normalizeNvimKey("x")).toBe("x");
});
