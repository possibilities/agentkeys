import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  collectAll,
  parseKarabiner,
  parseNvim,
  parseSkhd,
} from "../src/parsers.ts";
import { writeFixture } from "./helpers.ts";

function tempRoot(): string {
  return mkdtempSync(join(tmpdir(), "agentkeys-parser-"));
}

test("Karabiner parser handles conditions, actions, optional modifiers, and skips modifier-only remaps", () => {
  const root = tempRoot();
  const path = writeFixture(
    root,
    "karabiner.json",
    JSON.stringify({
      profiles: [
        {
          complex_modifications: {
            rules: [
              {
                description: "Window focus",
                manipulators: [
                  {
                    from: {
                      key_code: "h",
                      modifiers: {
                        mandatory: ["left_command", "shift"],
                        optional: ["left_option"],
                      },
                    },
                    conditions: [
                      {
                        type: "frontmost_application_if",
                        bundle_identifiers: [
                          "^com.google.Chrome$",
                          "^com.google.Chrome$",
                        ],
                      },
                      {
                        type: "device_if",
                        identifiers: [{ is_built_in_keyboard: true }],
                      },
                    ],
                    to: [{ shell_command: "yabai -m window --focus west" }],
                  },
                  {
                    from: { key_code: "left_command" },
                    to: [{ key_code: "left_option" }],
                  },
                ],
              },
            ],
          },
        },
      ],
    }),
  );

  const bindings = parseKarabiner(path);
  expect(bindings).toHaveLength(1);
  expect(bindings[0]?.toRecord()).toEqual({
    layer: "karabiner",
    key: "cmd+shift+h",
    action: "Window focus: yabai focus west",
    context: "Chrome only; built-in kbd; alt passthrough",
    source: path,
  });
});

test("Karabiner malformed JSON fails clearly", () => {
  const path = writeFixture(tempRoot(), "bad.json", "{");
  expect(() => parseKarabiner(path)).toThrow("Malformed Karabiner JSON");
});

test("skhd parser handles continuation lines and app-conditional blocks", () => {
  const path = writeFixture(
    tempRoot(),
    "skhdrc",
    [
      "# comment",
      "cmd + shift - h : yabai -m window --focus west",
      "alt - x : echo first \\",
      "  && echo second",
      "ctrl - l [",
      '  "Terminal" : echo term',
      "  * ~",
      "]",
    ].join("\n"),
  );

  expect(parseSkhd(path).map((binding) => binding.toRecord())).toEqual([
    {
      layer: "skhd",
      key: "cmd+shift+h",
      action: "yabai -m window --focus west",
      source: `${path}:2`,
    },
    {
      layer: "skhd",
      key: "alt+x",
      action: "echo first  && echo second",
      source: `${path}:3`,
    },
    {
      layer: "skhd",
      key: "ctrl+l",
      action: "echo term",
      context: "Terminal only",
      source: `${path}:6`,
    },
    {
      layer: "skhd",
      key: "ctrl+l",
      action: "passthrough",
      context: "default",
      source: `${path}:7`,
    },
  ]);
});

test("skhd parser reports malformed blocks and config-shaped lines", () => {
  const blockPath = writeFixture(tempRoot(), "skhdrc", "cmd - x [\n  nope\n");
  expect(() => parseSkhd(blockPath)).toThrow("Malformed skhd block");

  const linePath = writeFixture(
    tempRoot(),
    "skhdrc",
    "cmd + x : missing dash\n",
  );
  expect(() => parseSkhd(linePath)).toThrow(
    `Malformed skhd binding at ${linePath}:1`,
  );
});

test("Neovim parser handles direct keymaps, mode tables, multiline calls, and Copilot tables", () => {
  const root = tempRoot();
  const init = writeFixture(
    root,
    "init.lua",
    [
      "vim.keymap.set('n', '<Leader>f', ':Files<CR>', { desc = 'Find files' })",
      "vim.keymap.set('v', '<Leader>y', '\"+y')",
      "vim.keymap.set({'n', 'v'}, '<C-j>', function()",
      "  return true",
      'end, { desc = "Jump" })',
    ].join("\n"),
  );
  const plugin = writeFixture(
    root,
    "copilot.lua",
    [
      "return {",
      "  keymap = {",
      "    accept = '<C-l>',",
      "    next = '<M-]>',",
      "  },",
      "}",
    ].join("\n"),
  );

  expect(
    parseNvim([init, plugin]).map((binding) => binding.toRecord()),
  ).toEqual([
    {
      layer: "nvim",
      key: "space+f",
      action: "Find files",
      mode: "n",
      source: `${init}:1`,
    },
    {
      layer: "nvim",
      key: "space+y",
      action: "+y",
      mode: "v",
      source: `${init}:2`,
    },
    {
      layer: "nvim",
      key: "ctrl+j",
      action: "Jump",
      mode: "n,v",
      source: `${init}:3`,
    },
    {
      layer: "nvim",
      key: "ctrl+l",
      action: "copilot accept",
      mode: "i",
      context: "copilot suggestion",
      source: `${plugin}:3`,
    },
    {
      layer: "nvim",
      key: "alt+]",
      action: "copilot next",
      mode: "i",
      context: "copilot suggestion",
      source: `${plugin}:4`,
    },
  ]);
});

test("Neovim parser reports collected keymap candidates that cannot be parsed", () => {
  const path = writeFixture(
    tempRoot(),
    "init.lua",
    "local x = 1\nvim.keymap.set('n', dynamic_lhs, ':Nope<CR>')\nlocal y = 2\n",
  );
  expect(() => parseNvim([path])).toThrow(
    `Malformed Neovim keymap at ${path}:2`,
  );
});

test("collectAll accepts injected paths and treats missing files as empty", () => {
  const root = tempRoot();
  const skhd = writeFixture(root, "skhdrc", "cmd - a : echo a\n");
  const bindings = collectAll({
    karabiner: join(root, "missing.json"),
    skhd,
    nvimInit: join(root, "missing.lua"),
    nvimPlugins: join(root, "missing-plugins"),
  });
  expect(bindings.map((binding) => binding.key)).toEqual(["cmd+a"]);
});
