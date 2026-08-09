import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { AgentkeysError } from "./errors.ts";
import { Binding } from "./model.ts";
import {
  buildKey,
  normalizeGhosttyKey,
  normalizeKarabinerKey,
  normalizeKarabinerMods,
  normalizeNvimKey,
  normalizeSkhdKey,
  normalizeSkhdMods,
  normalizeTmuxKey,
} from "./normalize.ts";

function readExistingText(path: string): string | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AgentkeysError(`Cannot read ${path}: ${message}`, "unreadable_config");
  }
}

export interface LogicalLine {
  lineNumber: number;
  text: string;
}

// skhd and tmux both continue a directive onto the next line with a trailing
// backslash, and both report the fault at the line the directive opened on.
function logicalLines(text: string): LogicalLine[] {
  const lines = text.split(/\r?\n/);
  const joined: LogicalLine[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    let line = lines[index] ?? "";
    const lineNumber = index + 1;
    while (line.trimEnd().endsWith("\\") && index + 1 < lines.length) {
      line = `${line.trimEnd().slice(0, -1)} ${(lines[index + 1] ?? "").trim()}`;
      index += 1;
    }
    joined.push({ lineNumber, text: line });
  }
  return joined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function objectValue(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function bundleIdsToLabel(bundleIds: readonly string[]): string {
  const names: string[] = [];
  for (const bundleId of bundleIds) {
    const clean = bundleId.replace(/^\^/, "").replace(/\$$/, "").replaceAll("\\.", ".");
    const parts = clean.split(".");
    const name = parts[parts.length - 1] ?? clean;
    if (!names.includes(name)) names.push(name);
  }
  return `${names.join(", ")} only`;
}

function describeKarabinerTo(toList: unknown): string {
  const items = Array.isArray(toList) ? toList : [];
  if (items.length === 0) return "no action";
  const first = objectValue(items[0]);
  const shellCommand = first.shell_command;
  if (typeof shellCommand === "string") {
    if (shellCommand.includes("yabai")) {
      const match = shellCommand.match(/--(\w+)\s+(\S+)$/);
      if (match) return `yabai ${match[1]} ${match[2]}`;
    }
    return shellCommand.slice(0, 60);
  }
  const keyCode = first.key_code;
  if (typeof keyCode === "string") {
    const mods = stringArray(first.modifiers);
    if (mods.length > 0) return `remap to ${mods.join("+")}+${keyCode}`;
    return `remap to ${keyCode}`;
  }
  return JSON.stringify(first).slice(0, 60);
}

function isModifierOnlyKarabinerKey(keyCode: string): boolean {
  if (!(keyCode.startsWith("left_") || keyCode.startsWith("right_"))) {
    return false;
  }
  const suffix = keyCode.split("_", 2)[1];
  return ["command", "option", "control", "shift"].includes(suffix ?? "");
}

export function parseKarabiner(path: string): Binding[] {
  const text = readExistingText(path);
  if (text === undefined) return [];

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AgentkeysError(`Malformed Karabiner JSON at ${path}: ${message}`, "malformed_config");
  }

  const profiles = Array.isArray(objectValue(data).profiles)
    ? (objectValue(data).profiles as unknown[])
    : [];
  const firstProfile = objectValue(profiles[0]);
  const complex = objectValue(firstProfile.complex_modifications);
  const rules = Array.isArray(complex.rules) ? complex.rules : [];
  const bindings: Binding[] = [];

  for (const rawRule of rules) {
    const rule = objectValue(rawRule);
    const description = typeof rule.description === "string" ? rule.description : "";
    const manipulators = Array.isArray(rule.manipulators) ? rule.manipulators : [];
    for (const rawManipulator of manipulators) {
      const manipulator = objectValue(rawManipulator);
      const from = objectValue(manipulator.from);
      const keyCode = typeof from.key_code === "string" ? from.key_code : "";
      if (keyCode === "" || isModifierOnlyKarabinerKey(keyCode)) continue;

      const modifiers = objectValue(from.modifiers);
      const mandatory = normalizeKarabinerMods(stringArray(modifiers.mandatory));
      const optional = stringArray(modifiers.optional);
      const key = buildKey(mandatory, normalizeKarabinerKey(keyCode));
      const contextParts: string[] = [];
      const conditions = Array.isArray(manipulator.conditions) ? manipulator.conditions : [];
      for (const rawCondition of conditions) {
        const condition = objectValue(rawCondition);
        if (condition.type === "frontmost_application_if") {
          const bundleIds = stringArray(condition.bundle_identifiers);
          if (bundleIds.length > 0) contextParts.push(bundleIdsToLabel(bundleIds));
        } else if (condition.type === "device_if") {
          const identifiers = Array.isArray(condition.identifiers) ? condition.identifiers : [];
          for (const rawIdentifier of identifiers) {
            const identifier = objectValue(rawIdentifier);
            if (identifier.is_built_in_keyboard === true) {
              contextParts.push("built-in kbd");
            }
          }
        }
      }
      if (optional.length > 0 && !(optional.length === 1 && optional[0] === "any")) {
        contextParts.push(`${normalizeKarabinerMods(optional).join("+")} passthrough`);
      }

      let action = describeKarabinerTo(manipulator.to);
      if (description !== "" && !action.startsWith(description.slice(0, 20))) {
        action = `${description}: ${action}`;
      }
      bindings.push(
        new Binding({
          layer: "karabiner",
          key,
          action,
          context: contextParts.join("; "),
          sourceFile: path,
        }),
      );
    }
  }

  return bindings;
}

const SKHD_SIMPLE = /^([\w\s+]+?)\s*-\s*(\S+)\s*:\s*(.+)$/;
const SKHD_BLOCK_START = /^([\w\s+]+?)\s*-\s*(\S+)\s*\[$/;
// skhd binds an unmodified key by naming it alone — how a config catches the
// function keys a Karabiner rule synthesizes, or a raw `0x5A` keycode.
const SKHD_BARE = /^(\S+)\s*:\s*(.+)$/;
const SKHD_BLOCK_BARE = /^(\S+)\s*\[$/;
const SKHD_BLOCK_APP = /^\s*"([^"]+)"\s*:\s*(.+)$/;
const SKHD_BLOCK_DEFAULT = /^\s*\*\s*~\s*$/;

export function parseSkhd(path: string): Binding[] {
  const text = readExistingText(path);
  if (text === undefined) return [];
  const joined = logicalLines(text);

  const bindings: Binding[] = [];
  let index = 0;
  while (index < joined.length) {
    const { lineNumber, text: line } = joined[index] ?? {
      lineNumber: 0,
      text: "",
    };
    const stripped = line.trim();
    if (stripped === "" || stripped.startsWith("#")) {
      index += 1;
      continue;
    }

    const blockMatch = stripped.match(SKHD_BLOCK_START);
    const bareBlockMatch = blockMatch ? null : stripped.match(SKHD_BLOCK_BARE);
    if (blockMatch || bareBlockMatch) {
      const normalized = blockMatch
        ? buildKey(normalizeSkhdMods(blockMatch[1] ?? ""), normalizeSkhdKey(blockMatch[2] ?? ""))
        : buildKey([], normalizeSkhdKey(bareBlockMatch?.[1] ?? ""));
      index += 1;
      let closed = false;
      while (index < joined.length) {
        const blockLine = joined[index];
        if (!blockLine) break;
        const blockStripped = blockLine.text.trim();
        if (blockStripped === "]") {
          closed = true;
          index += 1;
          break;
        }
        const appMatch = blockLine.text.match(SKHD_BLOCK_APP);
        if (appMatch) {
          bindings.push(
            new Binding({
              layer: "skhd",
              key: normalized,
              action: (appMatch[2] ?? "").trim(),
              context: `${appMatch[1]} only`,
              sourceFile: path,
              sourceLine: blockLine.lineNumber,
            }),
          );
        } else if (SKHD_BLOCK_DEFAULT.test(blockLine.text)) {
          bindings.push(
            new Binding({
              layer: "skhd",
              key: normalized,
              action: "passthrough",
              context: "default",
              passthrough: true,
              sourceFile: path,
              sourceLine: blockLine.lineNumber,
            }),
          );
        } else if (blockStripped !== "" && !blockStripped.startsWith("#")) {
          throw new AgentkeysError(
            `Malformed skhd block at ${path}:${blockLine.lineNumber}`,
            "malformed_config",
          );
        }
        index += 1;
      }
      if (!closed)
        throw new AgentkeysError(
          `Unclosed skhd block at ${path}:${lineNumber}`,
          "malformed_config",
        );
      continue;
    }

    const simpleMatch = stripped.match(SKHD_SIMPLE);
    const bareMatch = simpleMatch ? null : stripped.match(SKHD_BARE);
    if (simpleMatch || bareMatch) {
      bindings.push(
        new Binding({
          layer: "skhd",
          key: simpleMatch
            ? buildKey(
                normalizeSkhdMods(simpleMatch[1] ?? ""),
                normalizeSkhdKey(simpleMatch[2] ?? ""),
              )
            : buildKey([], normalizeSkhdKey(bareMatch?.[1] ?? "")),
          action: ((simpleMatch ? simpleMatch[3] : bareMatch?.[2]) ?? "").trim(),
          sourceFile: path,
          sourceLine: lineNumber,
        }),
      );
    } else if (stripped.includes(":") || stripped.includes("-")) {
      throw new AgentkeysError(
        `Malformed skhd binding at ${path}:${lineNumber}`,
        "malformed_config",
      );
    }
    index += 1;
  }

  return bindings;
}

const NVIM_KEYMAP =
  /vim\.keymap\.set\(\s*(?:(["'])([^"']+)\1|\{([^}]*)\})\s*,\s*(["'])([^"']+)\4\s*,\s*([\s\S]*?)\)\s*,?\s*$/;
const DESC = /desc\s*=\s*["']([^"']+)["']/;
const COPILOT_KEYMAP = /(\w+)\s*=\s*["'](<[^"']+>)["']/;

function parenDelta(line: string): number {
  let delta = 0;
  let quote: string | undefined;
  let escaped = false;
  for (const char of line) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (quote !== undefined) {
      if (char === quote) quote = undefined;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
    } else if (char === "(") {
      delta += 1;
    } else if (char === ")") {
      delta -= 1;
    }
  }
  return delta;
}

function keymapStatements(lines: readonly string[]): Array<{ lineNumber: number; text: string }> {
  const statements: Array<{ lineNumber: number; text: string }> = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.trimStart().startsWith("--") || !line.includes("vim.keymap.set(")) {
      continue;
    }
    let statement = line.trim();
    const lineNumber = index + 1;
    let balance = parenDelta(line);
    while (balance > 0 && index + 1 < lines.length) {
      index += 1;
      const next = lines[index] ?? "";
      statement = `${statement}\n${next.trim()}`;
      balance += parenDelta(next);
    }
    statements.push({ lineNumber, text: statement });
  }
  return statements;
}

function parseModes(modeTable: string): string {
  const matches = [...modeTable.matchAll(/["']([^"']+)["']/g)].map((match) => match[1]);
  return matches.filter((mode): mode is string => mode !== undefined).join(",");
}

function extractDesc(opts: string): string {
  return opts.match(DESC)?.[1] ?? "";
}

function cleanRhs(rhs: string): string {
  const action =
    rhs
      .trim()
      .replace(/,$/, "")
      .split(/,\s*\{/)[0]
      ?.trim()
      .replace(/^['"]+|['"]+$/g, "") ?? "";
  return action.length > 60 ? action.slice(0, 60) : action;
}

export function parseNvim(paths: readonly string[]): Binding[] {
  const bindings: Binding[] = [];
  for (const path of paths) {
    const text = readExistingText(path);
    if (text === undefined) continue;
    const lines = text.split(/\r?\n/);

    for (const statement of keymapStatements(lines)) {
      const match = statement.text.match(NVIM_KEYMAP);
      if (!match) {
        throw new AgentkeysError(
          `Malformed Neovim keymap at ${path}:${statement.lineNumber}`,
          "malformed_config",
        );
      }
      const mode = match[2] ?? (match[3] ? parseModes(match[3]) : "n");
      const lhs = match[5] ?? "";
      const rest = match[6] ?? "";
      bindings.push(
        new Binding({
          layer: "nvim",
          key: normalizeNvimKey(lhs),
          action: extractDesc(rest) || cleanRhs(rest),
          mode,
          sourceFile: path,
          sourceLine: statement.lineNumber,
        }),
      );
    }

    if (basename(path).toLowerCase().includes("copilot")) {
      let inKeymap = false;
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index] ?? "";
        if (line.includes("keymap") && line.includes("{")) {
          inKeymap = true;
          continue;
        }
        if (!inKeymap) continue;
        if (line.includes("}") && !line.includes("=")) {
          inKeymap = false;
          continue;
        }
        const match = line.match(COPILOT_KEYMAP);
        if (match) {
          bindings.push(
            new Binding({
              layer: "nvim",
              key: normalizeNvimKey(match[2] ?? ""),
              action: `copilot ${match[1]}`,
              mode: "i",
              context: "copilot suggestion",
              sourceFile: path,
              sourceLine: index + 1,
            }),
          );
        }
      }
    }
  }
  return bindings;
}

// tmux quotes a key whose literal form would otherwise split a word — `M-'\'`,
// `'"'` — so words are split on unquoted whitespace and the quotes discarded.
function tmuxWords(line: string): string[] {
  const words: string[] = [];
  let current = "";
  let quote: string | undefined;
  let started = false;
  for (const char of line) {
    if (quote !== undefined) {
      if (char === quote) quote = undefined;
      else current += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      started = true;
      continue;
    }
    if (char === " " || char === "\t") {
      if (started) {
        words.push(current);
        current = "";
        started = false;
      }
      continue;
    }
    current += char;
    started = true;
  }
  if (started) words.push(current);
  return words;
}

interface TmuxFlags {
  index: number;
  table: string;
}

function parseTmuxFlags(words: readonly string[], root: string): TmuxFlags {
  let index = 1;
  let table = root;
  while (index < words.length) {
    const word = words[index] ?? "";
    if (!word.startsWith("-") || word === "-") break;
    if (word === "-T") {
      table = words[index + 1] ?? "";
      index += 2;
      continue;
    }
    // -N takes a note argument; every other flag we care about is a bare
    // switch, possibly bundled as `-nr`.
    if (word === "-N") {
      index += 2;
      continue;
    }
    if (/^-[a-z]+$/.test(word) && word.includes("n")) table = "root";
    index += 1;
  }
  return { index, table };
}

function tmuxAction(words: readonly string[]): string {
  const action = words.join(" ").trim();
  return action.length > 60 ? action.slice(0, 60) : action;
}

interface TmuxEntry {
  table: string;
  key: string;
  binding: Binding;
}

export function parseTmux(paths: readonly string[]): Binding[] {
  let entries: TmuxEntry[] = [];

  for (const path of paths) {
    const text = readExistingText(path);
    if (text === undefined) continue;

    for (const { lineNumber, text: line } of logicalLines(text)) {
      const stripped = line.trim();
      if (stripped === "" || stripped.startsWith("#")) continue;
      const words = tmuxWords(stripped);
      const command = words[0] ?? "";

      // The prefix is a real global binding: tmux swallows it before any
      // program in the pane sees it, and no other layer reports it.
      if (
        command === "set" ||
        command === "set-option" ||
        command === "setw" ||
        command === "set-window-option"
      ) {
        const at = words.findIndex((word) => word === "prefix" || word === "prefix2");
        const key = at === -1 ? undefined : normalizeTmuxKey(words[at + 1] ?? "");
        if (key !== undefined && key !== "none") {
          entries.push({
            table: "root",
            key,
            binding: new Binding({
              layer: "tmux",
              key,
              action: `tmux ${words[at]} key`,
              sourceFile: path,
              sourceLine: lineNumber,
            }),
          });
        }
        continue;
      }

      if (command === "unbind" || command === "unbind-key") {
        const { index, table } = parseTmuxFlags(words, "prefix");
        const key = normalizeTmuxKey(words[index] ?? "");
        if (key === undefined) continue;
        entries = entries.filter((entry) => !(entry.table === table && entry.key === key));
        continue;
      }

      if (command !== "bind" && command !== "bind-key") continue;

      const { index, table } = parseTmuxFlags(words, "prefix");
      const rawKey = words[index];
      if (rawKey === undefined) {
        throw new AgentkeysError(
          `Malformed tmux binding at ${path}:${lineNumber}`,
          "malformed_config",
        );
      }
      const key = normalizeTmuxKey(rawKey);
      if (key === undefined) continue;

      // Only the root table competes with other layers. A prefix binding is
      // reachable solely after the prefix key, and every other table is a mode
      // that has to be entered first.
      const scoped = table !== "root";
      entries.push({
        table,
        key,
        binding: new Binding({
          layer: "tmux",
          key: table === "prefix" ? `prefix+${key}` : key,
          action: tmuxAction(words.slice(index + 1)),
          mode: table === "root" || table === "prefix" ? "" : table,
          scoped,
          sourceFile: path,
          sourceLine: lineNumber,
        }),
      });
    }
  }

  return entries.map((entry) => entry.binding);
}

const GHOSTTY_KEYBIND = /^\s*keybind\s*=\s*(.+?)\s*$/;

// Ghostty writes `trigger=action`, and a trigger may itself end in `=` — the
// separator is the first `=` that is not part of the chord.
function splitGhosttyKeybind(value: string): [string, string] | undefined {
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== "=") continue;
    if (value[index - 1] === "+") continue;
    return [value.slice(0, index), value.slice(index + 1)];
  }
  return undefined;
}

export function parseGhostty(text: string, source: string): Binding[] {
  let bindings: Binding[] = [];
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const match = (lines[index] ?? "").match(GHOSTTY_KEYBIND);
    if (!match) continue;
    const split = splitGhosttyKeybind(match[1] ?? "");
    if (!split) continue;
    const [trigger, action] = split;
    const key = normalizeGhosttyKey(trigger);
    if (key === undefined) continue;

    if (action === "unbind") {
      bindings = bindings.filter((binding) => binding.key !== key);
      continue;
    }

    bindings.push(
      new Binding({
        layer: "ghostty",
        key,
        action,
        // `text:` and `esc:` write to the pane instead of consuming the key,
        // so what tmux and Neovim receive is unchanged.
        passthrough: action.startsWith("text:") || action.startsWith("esc:"),
        // A chord sequence is Ghostty's own prefix table.
        scoped: key.includes(">"),
        sourceFile: source,
        sourceLine: index + 1,
      }),
    );
  }

  return bindings;
}

export interface ConfigPaths {
  karabiner: string;
  skhd: string;
  ghosttyConfig: string;
  ghosttyBin: string;
  tmuxConf: string;
  tmuxConfD: string;
  nvimInit: string;
  nvimPlugins: string;
}

const GHOSTTY_APP_BIN = "/Applications/Ghostty.app/Contents/MacOS/ghostty";

function resolveGhosttyBin(): string {
  const override = process.env.AGENTKEYS_GHOSTTY_BIN;
  // An explicit empty value disables the probe, leaving the config file as the
  // only source — what a hermetic test wants.
  if (override !== undefined) return override;
  return Bun.which("ghostty") ?? (existsSync(GHOSTTY_APP_BIN) ? GHOSTTY_APP_BIN : "");
}

// Every layer is read from the location its own tool documents, so agentkeys
// works against a plain machine and against a dotfiles checkout stowed into
// place — they are the same paths.
export function defaultPaths(home = process.env.HOME ?? ""): ConfigPaths {
  const config = join(home, ".config");
  const env = process.env;
  return {
    karabiner: env.AGENTKEYS_KARABINER_CONFIG ?? join(config, "karabiner", "karabiner.json"),
    skhd: env.AGENTKEYS_SKHD_CONFIG ?? join(config, "skhd", "skhdrc"),
    ghosttyConfig: env.AGENTKEYS_GHOSTTY_CONFIG ?? join(config, "ghostty", "config"),
    ghosttyBin: resolveGhosttyBin(),
    tmuxConf: env.AGENTKEYS_TMUX_CONFIG ?? join(config, "tmux", "tmux.conf"),
    tmuxConfD: join(
      dirname(env.AGENTKEYS_TMUX_CONFIG ?? join(config, "tmux", "tmux.conf")),
      "conf.d",
    ),
    nvimInit: env.AGENTKEYS_NVIM_CONFIG ?? join(config, "nvim", "init.lua"),
    nvimPlugins: join(
      dirname(env.AGENTKEYS_NVIM_CONFIG ?? join(config, "nvim", "init.lua")),
      "lua",
      "plugins",
    ),
  };
}

function directoryEntries(directory: string, suffix: string, label: string): string[] {
  if (!existsSync(directory)) return [];
  try {
    if (!statSync(directory).isDirectory()) return [];
    return readdirSync(directory)
      .filter((entry) => entry.endsWith(suffix))
      .sort()
      .map((entry) => join(directory, entry));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AgentkeysError(`Cannot inspect ${label}: ${message}`, "unreadable_config");
  }
}

export function nvimFiles(paths: ConfigPaths): string[] {
  return [paths.nvimInit, ...directoryEntries(paths.nvimPlugins, ".lua", paths.nvimPlugins)];
}

const TMUX_SOURCE = /^\s*(?:source-file|source)\s+(?:-\S+\s+)*(\S+)\s*$/;

// tmux.conf usually delegates, so follow the plain `source-file` targets it
// names. Anything computed — a glob, a shell expansion — is left to the
// conf.d convention rather than guessed at.
function tmuxSourced(path: string, seen: Set<string>): string[] {
  const text = readExistingText(path);
  if (text === undefined) return [];
  const files: string[] = [];
  for (const { text: line } of logicalLines(text)) {
    const match = line.match(TMUX_SOURCE);
    const target = match?.[1];
    if (target === undefined) continue;
    if (/[*?$`]/.test(target)) continue;
    const expanded = target.startsWith("~/")
      ? join(process.env.HOME ?? "", target.slice(2))
      : target;
    const absolute = isAbsolute(expanded) ? expanded : resolve(dirname(path), expanded);
    if (seen.has(absolute)) continue;
    seen.add(absolute);
    files.push(absolute, ...tmuxSourced(absolute, seen));
  }
  return files;
}

export function tmuxFiles(paths: ConfigPaths): string[] {
  const seen = new Set([paths.tmuxConf]);
  return [
    paths.tmuxConf,
    ...tmuxSourced(paths.tmuxConf, seen),
    ...directoryEntries(paths.tmuxConfD, ".conf", paths.tmuxConfD).filter(
      (file) => !seen.has(file),
    ),
  ];
}

export interface LayerSource {
  layer: string;
  source: string;
  found: boolean;
  bindings: number;
}

export interface Inventory {
  bindings: Binding[];
  sources: LayerSource[];
}

function fileSourceLabel(files: readonly string[]): string {
  const [first, ...rest] = files;
  if (first === undefined) return "";
  return rest.length === 0 ? first : `${first} (+${rest.length} more)`;
}

function collectGhostty(paths: ConfigPaths): {
  bindings: Binding[];
  source: LayerSource;
} {
  // The config file holds only what the user overrode. The running binary
  // reports that plus every default, which is what actually intercepts keys.
  if (paths.ghosttyBin !== "") {
    const label = `${paths.ghosttyBin} +list-keybinds`;
    const result = Bun.spawnSync([paths.ghosttyBin, "+list-keybinds"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    if (result.success) {
      const bindings = parseGhostty(result.stdout.toString(), label);
      return {
        bindings,
        source: {
          layer: "ghostty",
          source: label,
          found: true,
          bindings: bindings.length,
        },
      };
    }
  }

  const text = readExistingText(paths.ghosttyConfig);
  const bindings = text === undefined ? [] : parseGhostty(text, paths.ghosttyConfig);
  return {
    bindings,
    source: {
      layer: "ghostty",
      source: paths.ghosttyConfig,
      found: text !== undefined,
      bindings: bindings.length,
    },
  };
}

export function collectAll(paths: Partial<ConfigPaths> = {}): Inventory {
  const resolved = { ...defaultPaths(), ...paths };
  const karabiner = parseKarabiner(resolved.karabiner);
  const skhd = parseSkhd(resolved.skhd);
  const ghostty = collectGhostty(resolved);
  const tmux = tmuxFiles(resolved).filter((file) => existsSync(file));
  const tmuxBindings = parseTmux(tmux);
  const nvim = nvimFiles(resolved).filter((file) => existsSync(file));
  const nvimBindings = parseNvim(nvim);

  return {
    bindings: [...karabiner, ...skhd, ...ghostty.bindings, ...tmuxBindings, ...nvimBindings],
    sources: [
      {
        layer: "karabiner",
        source: resolved.karabiner,
        found: existsSync(resolved.karabiner),
        bindings: karabiner.length,
      },
      {
        layer: "skhd",
        source: resolved.skhd,
        found: existsSync(resolved.skhd),
        bindings: skhd.length,
      },
      ghostty.source,
      {
        layer: "tmux",
        source: tmux.length > 0 ? fileSourceLabel(tmux) : resolved.tmuxConf,
        found: tmux.length > 0,
        bindings: tmuxBindings.length,
      },
      {
        layer: "nvim",
        source: nvim.length > 0 ? fileSourceLabel(nvim) : resolved.nvimInit,
        found: nvim.length > 0,
        bindings: nvimBindings.length,
      },
    ],
  };
}
