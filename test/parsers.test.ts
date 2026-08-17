import { afterAll, expect, test } from "bun:test";
import { chmodSync } from "node:fs";
import { join } from "node:path";
import {
  collectAll,
  defaultPaths,
  parseGhostty,
  parseHerdr,
  parseHerdrDefaultConfig,
  parseKarabiner,
  parseNvim,
  parseSkhd,
  parseTmux,
  tmuxFiles,
} from "../src/parsers.ts";
import { makeTempDir, removeTempDirs, writeFixture } from "./helpers.ts";

afterAll(removeTempDirs);

function tempRoot(): string {
  return makeTempDir("agentkeys-parser-");
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

test("herdr fallback parser emits prefix, prefix-mode keys, ranges, and modes", () => {
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

test("herdr default-config parser reads supported actions and ignores command examples", () => {
  const parsed = parseHerdrDefaultConfig(
    [
      "[keys]",
      '# prefix = "ctrl+b"',
      '# goto = "prefix+g"',
      '# move_tab_next = "" # optional',
      '# navigate_pane_right = "l"',
      '# type = "shell" runs detached in the background.',
      "# [[keys.command]]",
      '# key = "prefix+alt+g"',
      '# command = "lazygit"',
      "[server]",
    ].join("\n"),
    "fixture herdr --default-config",
  );

  expect(parsed.prefix).toBe("ctrl+b");
  expect(parsed.defaults).toEqual([
    { action: "goto", keys: ["prefix+g"] },
    { action: "move_tab_next", keys: [] },
    { action: "navigate_pane_right", keys: ["l"] },
  ]);
  expect([...parsed.supportedActions]).toEqual(["goto", "move_tab_next", "navigate_pane_right"]);
  expect(() => parseHerdrDefaultConfig("[server]\n", "broken dump")).toThrow(
    "[keys] table not found",
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
  // An empty string unbinds the fallback default.
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

test("collectAll prefers live herdr defaults and records user displacement", () => {
  const root = tempRoot();
  const defaults = writeFixture(
    root,
    "herdr-defaults.toml",
    [
      "[keys]",
      '# prefix = "ctrl+b"',
      '# goto = "prefix+g"',
      '# move_tab_next = ""',
      '# focus_pane_right = "prefix+l"',
      "# [[keys.command]]",
    ].join("\n"),
  );
  const bin = writeFixture(
    root,
    "herdr",
    [
      "#!/bin/sh",
      'if [ "$1" = "--default-config" ]; then',
      `  /bin/cat '${defaults}'`,
      'elif [ "$1" = "--version" ]; then',
      '  echo "herdr 9.9.9"',
      "else",
      "  exit 2",
      "fi",
    ].join("\n"),
  );
  chmodSync(bin, 0o755);
  const config = writeFixture(
    root,
    "config.toml",
    [
      "[keys]",
      'move_tab_next = "alt+4"',
      'unsupported_action = "prefix+u"',
      "",
      "[[keys.command]]",
      'key = "prefix+l"',
      'command = "agentsurface launch"',
      'description = "launch an agent"',
    ].join("\n"),
  );
  const inventory = collectAll({
    ...defaultPaths(root),
    ghosttyBin: "",
    herdrBin: bin,
    herdrConfig: config,
  });

  expect(inventory.sources.find((source) => source.layer === "herdr")?.source).toBe(
    `${bin} --default-config (herdr 9.9.9) + ${config}`,
  );
  expect(inventory.bindings.some((binding) => binding.action === "move_tab_next")).toBe(true);
  expect(inventory.bindings.some((binding) => binding.action === "unsupported_action")).toBe(false);
  expect(inventory.bindings.some((binding) => binding.action === "focus_pane_right")).toBe(false);
  expect(inventory.displacements).toEqual([
    {
      layer: "herdr",
      key: "prefix+l",
      action: "focus_pane_right",
      source: `${bin} --default-config (herdr 9.9.9)`,
      displacedBy: {
        action: "launch an agent",
        source: config,
        field: "keys.command[0]",
      },
    },
  ]);
});

test("collectAll labels the vendored herdr fallback when no dump is available", () => {
  const root = tempRoot();
  const config = writeFixture(root, "config.toml", "[keys]\nnext_tab = 'prefix+n'\n");
  const inventory = collectAll({
    ...defaultPaths(root),
    ghosttyBin: "",
    herdrBin: "",
    herdrConfig: config,
  });

  expect(inventory.sources.find((source) => source.layer === "herdr")?.source).toBe(
    `vendored fallback 0.8.0 defaults + ${config}`,
  );
});

test("collectAll degrades the herdr layer when a successful dump is malformed", () => {
  const root = tempRoot();
  const skhd = writeFixture(root, "skhdrc", "cmd - a : echo a\n");
  const bin = writeFixture(
    root,
    "herdr",
    [
      "#!/bin/sh",
      'if [ "$1" = "--default-config" ]; then',
      '  echo "[server]"',
      "else",
      '  echo "herdr 9.9.9"',
      "fi",
    ].join("\n"),
  );
  chmodSync(bin, 0o755);

  const inventory = collectAll({
    ...defaultPaths(root),
    skhd,
    ghosttyBin: "",
    herdrBin: bin,
    herdrConfig: join(root, "missing-herdr.toml"),
  });

  expect(inventory.degraded).toHaveLength(1);
  expect(inventory.degraded[0]?.layer).toBe("herdr");
  expect(inventory.degraded[0]?.code).toBe("malformed_config");
  expect(inventory.degraded[0]?.message).toContain("Malformed herdr default config");
  // The layer is out, but every other layer still answers.
  expect(inventory.bindings.some((binding) => binding.layer === "skhd")).toBe(true);
  expect(inventory.bindings.some((binding) => binding.layer === "herdr")).toBe(false);
  const source = inventory.sources.find((entry) => entry.layer === "herdr");
  expect(source?.found).toBe(false);
  expect(source?.error).toContain("Malformed herdr default config");
});

// The shape that took the whole CLI down: Bun.TOML read a `[[` opening a
// value as an array-of-tables header, and herdr's documented sidebar row
// layout is exactly that.
test("parses a herdr config whose values are arrays of arrays", () => {
  const root = tempRoot();
  const config = writeFixture(
    root,
    "herdr.toml",
    [
      "[keys]",
      'prefix = "ctrl+space"',
      "",
      "[ui.sidebar.agents]",
      'rows = [["state_icon", "agent"]]',
      "",
      "[ui.sidebar.spaces]",
      "rows = [",
      '  ["state_icon"],',
      '  ["space"],',
      "]",
    ].join("\n"),
  );

  const inventory = collectAll({
    ...defaultPaths(root),
    ghosttyBin: "",
    herdrBin: "",
    herdrConfig: config,
  });

  expect(inventory.degraded).toEqual([]);
  expect(
    inventory.bindings.some((binding) => binding.layer === "herdr" && binding.key === "ctrl+space"),
  ).toBe(true);
});

test("a malformed herdr config names file:line and costs only its own layer", () => {
  const root = tempRoot();
  const skhd = writeFixture(root, "skhdrc", "cmd - a : echo a\n");
  const config = writeFixture(root, "herdr.toml", "[keys]\nprefix = \nnext_tab = 1\n");

  const inventory = collectAll({
    ...defaultPaths(root),
    skhd,
    ghosttyBin: "",
    herdrBin: "",
    herdrConfig: config,
  });

  expect(inventory.degraded).toHaveLength(1);
  expect(inventory.degraded[0]?.message).toContain(`${config}:2:`);
  expect(inventory.bindings.some((binding) => binding.layer === "skhd")).toBe(true);
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
    ["tmux", false],
    ["herdr", false],
    ["nvim", false],
  ]);
});
