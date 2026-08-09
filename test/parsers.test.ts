import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  collectAll,
  defaultPaths,
  parseGhostty,
  parseHerdr,
  parseKarabiner,
  parseNvim,
  parseOrca,
  parseSkhd,
  parseTmux,
  tmuxFiles,
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
                        bundle_identifiers: ["^com.google.Chrome$", "^com.google.Chrome$"],
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
      passthrough: true,
      source: `${path}:7`,
    },
  ]);
});

test("skhd parser binds keys named without a modifier", () => {
  const path = writeFixture(
    tempRoot(),
    "skhdrc",
    ["f13 : yabai -m space --focus 1", "0x5A : yabai -m space --focus 8"].join("\n"),
  );
  expect(parseSkhd(path).map((binding) => binding.key)).toEqual(["f13", "0x5a"]);
});

test("skhd parser reports malformed blocks and config-shaped lines", () => {
  const blockPath = writeFixture(tempRoot(), "skhdrc", "cmd - x [\n  nope\n");
  expect(() => parseSkhd(blockPath)).toThrow("Malformed skhd block");

  const linePath = writeFixture(tempRoot(), "skhdrc", "cmd + x : missing dash\n");
  expect(() => parseSkhd(linePath)).toThrow(`Malformed skhd binding at ${linePath}:1`);
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
    ["return {", "  keymap = {", "    accept = '<C-l>',", "    next = '<M-]>',", "  },", "}"].join(
      "\n",
    ),
  );

  expect(parseNvim([init, plugin]).map((binding) => binding.toRecord())).toEqual([
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
  expect(() => parseNvim([path])).toThrow(`Malformed Neovim keymap at ${path}:2`);
});

test("tmux parser separates root, prefix, and mode tables and follows unbind", () => {
  const root = tempRoot();
  const conf = writeFixture(
    root,
    "tmux.conf",
    [
      "# comment",
      "set -g mouse on",
      "unbind C-b",
      "set -g prefix C-Space",
      "bind C-Space send-prefix",
      "bind -n M-h select-pane -LZ",
      "bind -n M-S-H resize-pane -L 5",
      "bind -r Left select-pane -LZ",
      "bind -T copy-mode-vi v send-keys -X begin-selection",
      "bind -n M-'\\' split-window -h",
      "bind -n MouseDown1StatusLeft choose-session",
      "unbind %",
      "bind | split-window -h",
      "unbind -n M-h",
    ].join("\n"),
  );

  expect(
    parseTmux([conf]).map((binding) => [binding.key, binding.mode, binding.isLayerScoped]),
  ).toEqual([
    ["ctrl+space", "", false],
    ["prefix+ctrl+space", "", true],
    ["alt+shift+h", "", false],
    ["prefix+left", "", true],
    ["v", "copy-mode-vi", true],
    ["alt+\\", "", false],
    ["prefix+|", "", true],
  ]);
});

test("tmux file discovery follows literal source-file and conf.d fragments", () => {
  const root = tempRoot();
  writeFixture(root, "tmux/tmux.conf", "source-file ../extra.conf\n");
  writeFixture(root, "extra.conf", "bind -n M-a display 'a'\n");
  writeFixture(root, "tmux/conf.d/10-nav.conf", "bind -n M-b display 'b'\n");
  writeFixture(root, "tmux/conf.d/notes.txt", "bind -n M-c display 'c'\n");

  const paths = {
    ...defaultPaths(root),
    tmuxConf: join(root, "tmux", "tmux.conf"),
    tmuxConfD: join(root, "tmux", "conf.d"),
  };
  expect(parseTmux(tmuxFiles(paths)).map((binding) => binding.key)).toEqual(["alt+a", "alt+b"]);
});

test("Ghostty parser reads triggers, passthrough actions, and unbind", () => {
  const bindings = parseGhostty(
    [
      "font-size = 20",
      "keybind = super+shift+,=reload_config",
      "keybind = super+==increase_font_size:1",
      "keybind = performable:ctrl+shift+c=copy_to_clipboard",
      "keybind = shift+enter=text:\\x1b[13;2u",
      "keybind = alt+arrow_left=esc:b",
      "keybind = ctrl+a>n=new_window",
      "keybind = super+q=unbind",
      "keybind = super+q=quit",
    ].join("\n"),
    "config",
  );

  expect(
    bindings.map((binding) => [binding.key, binding.passthrough, binding.isLayerScoped]),
  ).toEqual([
    ["cmd+shift+,", false, false],
    ["cmd+=", false, false],
    ["ctrl+shift+c", false, false],
    ["shift+return", true, false],
    ["alt+left", true, false],
    ["ctrl+a>n", false, true],
    ["cmd+q", false, false],
  ]);
});

test("Orca parser emits vendored darwin defaults with scope classification", () => {
  const root = tempRoot();
  const bindings = parseOrca(join(root, "missing-keybindings.json"));

  const byAction = new Map(bindings.map((binding) => [binding.action, binding]));
  // Mod folds to cmd on darwin; global/tabs/terminal scopes compete.
  expect(byAction.get("tab.newTerminal")?.key).toBe("cmd+t");
  expect(byAction.get("tab.newTerminal")?.isLayerScoped).toBe(false);
  expect(byAction.get("tab.nextAllTypes")?.key).toBe("cmd+shift+]");
  expect(byAction.get("terminal.splitRight")?.key).toBe("cmd+d");
  // Editor/browser scopes never fire while a terminal pane has focus.
  expect(byAction.get("editor.save")?.key).toBe("cmd+s");
  expect(byAction.get("editor.save")?.isLayerScoped).toBe(true);
  expect(byAction.get("editor.save")?.mode).toBe("editor");
  expect(byAction.get("browser.reload")?.isLayerScoped).toBe(true);
  // A digit-range representative claims the whole 1-9 row.
  const workspaceDigits = bindings.filter((b) => b.action === "workspace.selectByIndex");
  expect(workspaceDigits.map((b) => b.key)).toEqual(
    Array.from({ length: 9 }, (_, i) => `cmd+${i + 1}`),
  );
  expect(bindings.every((binding) => binding.sourceFile.includes("vendored"))).toBe(true);
});

test("Orca parser overlays keybindings.json: rebind, unbind, mask, unknown ids", () => {
  const root = tempRoot();
  const path = writeFixture(
    root,
    "keybindings.json",
    JSON.stringify({
      version: 1,
      keybindings: {
        "tab.newTerminal": "Mod+Shift+K",
        "voice.dictation": null,
        "plugin:acme.tools/run": ["Mod+Alt+G"],
      },
      platforms: {
        darwin: { "tab.newTerminal": ["Mod+Alt+K"] },
        linux: { "tab.newTerminal": "Ctrl+Alt+Z" },
      },
    }),
  );
  const bindings = parseOrca(path);

  // The darwin section masks the common one, mirroring Orca's own merge.
  const newTerminal = bindings.filter((binding) => binding.action === "tab.newTerminal");
  expect(newTerminal.map((binding) => binding.key)).toEqual(["alt+cmd+k"]);
  expect(newTerminal[0]?.sourceFile).toBe(path);
  // null unbinds the action and its vendored default with it.
  expect(bindings.some((binding) => binding.action === "voice.dictation")).toBe(false);
  // An id the vendored registry does not know competes rather than hides.
  const plugin = bindings.find((binding) => binding.action === "plugin:acme.tools/run");
  expect(plugin?.key).toBe("alt+cmd+g");
  expect(plugin?.isLayerScoped).toBe(false);

  const malformed = writeFixture(root, "broken.json", "{ not json");
  expect(() => parseOrca(malformed)).toThrow("Malformed Orca keybindings JSON");
});

test("herdr parser emits vendored defaults: prefix, prefix-mode keys, ranges, modes", () => {
  const root = tempRoot();
  const bindings = parseHerdr(join(root, "missing-config.toml"));

  const byAction = new Map(bindings.map((binding) => [binding.action, binding]));
  // The prefix is a real global binding, exactly like tmux's.
  expect(byAction.get("herdr prefix key")?.key).toBe("ctrl+b");
  expect(byAction.get("herdr prefix key")?.isLayerScoped).toBe(false);
  // prefix+ bindings keep the scope marker the model already understands.
  expect(byAction.get("new_tab")?.key).toBe("prefix+c");
  expect(byAction.get("new_tab")?.isLayerScoped).toBe(true);
  expect(byAction.get("split_horizontal")?.key).toBe("prefix+-");
  expect(byAction.get("copy_mode")?.key).toBe("prefix+[");
  // Mode-scoped keys are unreachable outside their herdr mode.
  expect(byAction.get("navigate_pane_left")?.key).toBe("h");
  expect(byAction.get("navigate_pane_left")?.mode).toBe("navigate");
  expect(byAction.get("navigate_pane_left")?.isLayerScoped).toBe(true);
  expect(byAction.get("remote_image_paste")?.context).toBe("remote client only");
  // 1..9 ranges expand to nine bindings.
  const switchTab = bindings.filter((binding) => binding.action === "switch_tab");
  expect(switchTab.map((binding) => binding.key)).toEqual(
    Array.from({ length: 9 }, (_, i) => `prefix+${i + 1}`),
  );
});

test("herdr parser overlays config.toml: prefix, direct chords, unbinds, commands, indexed", () => {
  const root = tempRoot();
  const path = writeFixture(
    root,
    "config.toml",
    [
      "[keys]",
      'prefix = "f12"',
      'next_tab = ["prefix+n", "ctrl+alt+]"]',
      'zoom = ""',
      'previous_workspace = "prefix+shift+l"',
      "",
      "[keys.indexed]",
      'tabs = "alt"',
      "",
      "[[keys.command]]",
      'key = "ctrl+alt+g"',
      'command = "lazygit"',
      'description = "open lazygit"',
    ].join("\n"),
  );
  const bindings = parseHerdr(path);

  const byKey = new Map(bindings.map((binding) => [binding.key, binding]));
  expect(byKey.get("f12")?.action).toBe("herdr prefix key");
  expect(bindings.some((binding) => binding.key === "ctrl+b")).toBe(false);
  // A direct chord competes cross-layer; its prefix-mode twin stays scoped.
  const nextTab = bindings.filter((binding) => binding.action === "next_tab");
  expect(nextTab.map((binding) => [binding.key, binding.isLayerScoped])).toEqual([
    ["prefix+n", true],
    ["ctrl+alt+]", false],
  ]);
  // An empty string unbinds the vendored default.
  expect(bindings.some((binding) => binding.action === "zoom")).toBe(false);
  // Unset-by-default actions bind when the user sets them.
  expect(bindings.some((binding) => binding.key === "prefix+shift+l")).toBe(true);
  // [keys.indexed] combos claim the whole direct 1-9 row.
  const indexed = bindings.filter((binding) => binding.action === "indexed tabs 1-9");
  expect(indexed.map((binding) => binding.key)).toEqual(
    Array.from({ length: 9 }, (_, i) => `alt+${i + 1}`),
  );
  expect(indexed[0]?.isLayerScoped).toBe(false);
  expect(byKey.get("ctrl+alt+g")?.action).toBe("open lazygit");

  const malformed = writeFixture(root, "broken.toml", "[keys\nprefix=");
  expect(() => parseHerdr(malformed)).toThrow("Malformed herdr TOML");
});

test("collectAll accepts injected paths, reports sources, and treats missing files as empty", () => {
  const root = tempRoot();
  const skhd = writeFixture(root, "skhdrc", "cmd - a : echo a\n");
  const inventory = collectAll({
    ...defaultPaths(root),
    karabiner: join(root, "missing.json"),
    skhd,
    ghosttyBin: "",
    ghosttyConfig: join(root, "missing-ghostty"),
    orcaBin: "",
    orcaKeybindings: join(root, "missing-orca.json"),
    herdrBin: "",
    herdrConfig: join(root, "missing-herdr.toml"),
    tmuxConf: join(root, "missing.conf"),
    tmuxConfD: join(root, "missing-conf.d"),
    nvimInit: join(root, "missing.lua"),
    nvimPlugins: join(root, "missing-plugins"),
  });

  expect(inventory.bindings.map((binding) => binding.key)).toEqual(["cmd+a"]);
  expect(inventory.sources.map((source) => [source.layer, source.found])).toEqual([
    ["karabiner", false],
    ["skhd", true],
    ["ghostty", false],
    ["orca", false],
    ["tmux", false],
    ["herdr", false],
    ["nvim", false],
  ]);
  expect(inventory.sources.find((source) => source.layer === "orca")?.source).toContain(
    "not installed",
  );
});
