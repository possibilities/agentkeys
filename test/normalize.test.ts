import { expect, test } from "bun:test";
import {
  buildKey,
  normalizeKarabinerKey,
  normalizeKarabinerMods,
  normalizeModifierCombo,
  normalizeNvimKey,
  normalizeSkhdMods,
} from "../src/normalize.ts";

test("canonical modifier order and aliases", () => {
  expect(normalizeModifierCombo("shift+cmd")).toBe("cmd+shift");
  expect(normalizeModifierCombo("option + control + cmd")).toBe("ctrl+alt+cmd");
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
