import { expect, test } from "bun:test";
import {
  buildKey,
  normalizeBaseKey,
  normalizeGhosttyKey,
  normalizeKarabinerKey,
  normalizeKarabinerMods,
  normalizeModifierCombo,
  normalizeNvimKey,
  normalizeSkhdKey,
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
  expect(normalizeKarabinerMods(["left_command", "right_option"])).toEqual(["cmd", "alt"]);
  expect(normalizeKarabinerKey("return_or_enter")).toBe("return");
  expect(normalizeSkhdMods("control + option + shift")).toEqual(["ctrl", "alt", "shift"]);
});

// One physical punctuation key, five spellings: the symbol is canonical, so a
// key spelled by name in one layer collides with the same key spelled as a
// symbol in another instead of silently passing as two different keys.
test("folds every layer's punctuation spelling to the symbol", () => {
  expect(normalizeKarabinerKey("comma")).toBe(",");
  expect(normalizeKarabinerKey("period")).toBe(".");
  expect(normalizeKarabinerKey("hyphen")).toBe("-");
  expect(normalizeKarabinerKey("equal_sign")).toBe("=");
  expect(normalizeKarabinerKey("open_bracket")).toBe("[");
  expect(normalizeKarabinerKey("close_bracket")).toBe("]");
  expect(normalizeKarabinerKey("semicolon")).toBe(";");
  expect(normalizeKarabinerKey("quote")).toBe("'");
  expect(normalizeKarabinerKey("slash")).toBe("/");
  expect(normalizeKarabinerKey("backslash")).toBe("\\");
  expect(normalizeKarabinerKey("grave_accent_and_tilde")).toBe("`");
  expect(normalizeSkhdKey("0x2B")).toBe(",");
  expect(normalizeSkhdKey("0x21")).toBe("[");
  expect(normalizeSkhdKey("0x32")).toBe("`");
  expect(normalizeSkhdKey("x")).toBe("x");
  expect(normalizeNvimKey("<M-Bar>")).toBe("alt+|");
  expect(normalizeNvimKey("<M-Bslash>")).toBe("alt+\\");
  expect(normalizeNvimKey("<lt>")).toBe("<");
  expect(normalizeNvimKey("<M-[>")).toBe("alt+[");
  expect(normalizeGhosttyKey("super+comma")).toBe("cmd+,");
  expect(normalizeGhosttyKey("super+left_bracket")).toBe("cmd+[");
  expect(normalizeBaseKey("comma")).toBe(",");
  expect(normalizeBaseKey(",")).toBe(",");
  expect(normalizeBaseKey("F5")).toBe("f5");
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
