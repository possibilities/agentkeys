import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
// Not Bun.TOML: it tokenizes a `[[` that opens a *value* as an
// array-of-tables header, so `rows = [["state_icon", "agent"]]` — herdr's
// documented sidebar row layout — fails to parse. smol-toml is TOML 1.0
// complete.
import { parse as parseToml, TomlError } from "smol-toml";
import { AgentkeysError } from "./errors.ts";
import { Binding, type Displacement, type Layer } from "./model.ts";
import {
  buildKey,
  normalizeGhosttyKey,
  normalizeHerdrKey,
  normalizeKarabinerKey,
  normalizeKarabinerMods,
  normalizeNvimKey,
  normalizeSkhdKey,
  normalizeSkhdMods,
  normalizeTmuxKey,
} from "./normalize.ts";
import {
  HERDR_ACTION_CONTEXTS,
  HERDR_ACTION_MODES,
  HERDR_DEFAULT_PREFIX,
  HERDR_DEFAULTS,
  HERDR_VERSION,
  type HerdrDefault,
} from "./vendored.ts";

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

// A parse failure names file:line the way every other loud parser here does.
// smol-toml's own message trails a multi-line source excerpt, which would
// wreck the one-line-per-layer shape a degraded report is rendered in.
function tomlFailure(error: unknown, path: string): string {
  const summary = (error instanceof Error ? error.message : String(error)).split("\n")[0] ?? "";
  return error instanceof TomlError
    ? `${path}:${error.line}:${error.column}: ${summary}`
    : `${path}: ${summary}`;
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

// string[] to rebind, null to unbind, undefined when the field is absent.
function herdrValue(value: unknown): string[] | null | undefined {
  if (typeof value === "string") return value.trim() === "" ? null : [value];
  if (Array.isArray(value)) {
    const entries = value.filter(
      (item): item is string => typeof item === "string" && item.trim() !== "",
    );
    return entries.length > 0 ? entries : null;
  }
  return undefined;
}

// "prefix+1..9" is herdr's spelling for nine bindings.
function expandHerdrRange(label: string): string[] {
  const match = label.match(/^(.*?)(\d)\.\.(\d)$/);
  if (!match) return [label];
  const from = Number(match[2]);
  const to = Number(match[3]);
  if (from > to) return [label];
  return Array.from({ length: to - from + 1 }, (_, index) => `${match[1]}${from + index}`);
}

interface HerdrDefaultsConfig {
  prefix: string;
  defaults: HerdrDefault[];
  supportedActions?: ReadonlySet<string>;
}

export interface HerdrDefaultConfig extends HerdrDefaultsConfig {
  supportedActions: ReadonlySet<string>;
}

// --default-config is a human-readable template: the table header is live TOML
// while its values are commented assignments. Only the direct [keys] fields
// describe built-in actions; the later command and indexed tables are examples.
export function parseHerdrDefaultConfig(text: string, source: string): HerdrDefaultConfig {
  const assignments = ["[keys]"];
  let inKeys = false;
  let sawKeys = false;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "[keys]") {
      inKeys = true;
      sawKeys = true;
      continue;
    }
    if (!inKeys) continue;
    if (/^(?:#\s*)?\[\[?/.test(trimmed)) break;
    const assignment = line.match(/^\s*#\s*([a-z][a-z0-9_]*)\s*=\s*(.+)$/i);
    // The prose introducing [[keys.command]] describes its `type = ...`
    // choices before the commented table header. It looks assignment-shaped
    // but is not part of [keys].
    if (assignment && assignment[1] !== "type") {
      assignments.push(`${assignment[1]} = ${assignment[2]}`);
    }
  }

  if (!sawKeys) {
    throw new AgentkeysError(
      `Malformed herdr default config from ${source}: [keys] table not found`,
      "malformed_config",
    );
  }

  let keys: Record<string, unknown>;
  try {
    keys = objectValue(objectValue(parseToml(assignments.join("\n"))).keys);
  } catch (error) {
    throw new AgentkeysError(
      `Malformed herdr default config from ${tomlFailure(error, source)}`,
      "malformed_config",
    );
  }

  const prefix = typeof keys.prefix === "string" ? keys.prefix.trim() : "";
  if (prefix === "") {
    throw new AgentkeysError(
      `Malformed herdr default config from ${source}: keys.prefix not found`,
      "malformed_config",
    );
  }

  const defaults: HerdrDefault[] = [];
  const supportedActions = new Set<string>();
  for (const [action, raw] of Object.entries(keys)) {
    if (action === "prefix") continue;
    const labels = herdrValue(raw);
    if (labels === undefined) {
      throw new AgentkeysError(
        `Malformed herdr default config from ${source}: keys.${action} is not a key label`,
        "malformed_config",
      );
    }
    supportedActions.add(action);
    defaults.push({ action, keys: labels ?? [] });
  }

  return { prefix, defaults, supportedActions };
}

interface HerdrCandidate {
  binding: Binding;
  field: string;
}

interface HerdrParseResult {
  bindings: Binding[];
  displacements: Displacement[];
}

function parseHerdrInventory(
  path: string,
  defaultConfig: HerdrDefaultsConfig,
  defaultsLabel: string,
): HerdrParseResult {
  const text = readExistingText(path);
  let keys: Record<string, unknown> = {};
  if (text !== undefined) {
    try {
      keys = objectValue(objectValue(parseToml(text)).keys);
    } catch (error) {
      throw new AgentkeysError(
        `Malformed herdr TOML at ${tomlFailure(error, path)}`,
        "malformed_config",
      );
    }
  }

  const userCandidates: HerdrCandidate[] = [];
  const defaultCandidates: HerdrCandidate[] = [];
  const emit = (
    target: HerdrCandidate[],
    action: string,
    labels: readonly string[],
    fromFile: boolean,
    field: string,
    mode?: string,
    context?: string,
  ): void => {
    for (const label of labels) {
      for (const expanded of expandHerdrRange(label)) {
        const key = normalizeHerdrKey(expanded);
        if (key === undefined) continue;
        target.push({
          binding: new Binding({
            layer: "herdr",
            key,
            action,
            // A mode-scoped action keeps its mode whatever key it wears.
            mode: mode ?? "",
            scoped: mode !== undefined,
            context: context ?? "",
            sourceFile: fromFile ? path : defaultsLabel,
          }),
          field,
        });
      }
    }
  };

  // The prefix is a real global binding, exactly like tmux's: herdr swallows
  // it before any program in its panes sees it.
  const userPrefix = typeof keys.prefix === "string" && keys.prefix.trim() !== "";
  emit(
    userPrefix ? userCandidates : defaultCandidates,
    "herdr prefix key",
    [userPrefix ? String(keys.prefix) : defaultConfig.prefix],
    userPrefix,
    "keys.prefix",
  );

  const handled = new Set(["prefix", "command", "indexed"]);
  for (const entry of defaultConfig.defaults) {
    handled.add(entry.action);
    const user = herdrValue(keys[entry.action]);
    if (user === null) continue;
    const fromFile = user !== undefined;
    emit(
      fromFile ? userCandidates : defaultCandidates,
      entry.action,
      user ?? entry.keys,
      fromFile,
      `keys.${entry.action}`,
      HERDR_ACTION_MODES[entry.action] ?? entry.mode,
      HERDR_ACTION_CONTEXTS[entry.action] ?? entry.context,
    );
  }

  // A live dump names unset actions with an empty string, so every supported
  // action was handled above. The fallback predates that capability and keeps
  // its former permissive behavior for user fields absent from the snapshot.
  for (const [action, raw] of Object.entries(keys)) {
    if (handled.has(action)) continue;
    if (defaultConfig.supportedActions !== undefined) continue;
    const user = herdrValue(raw);
    if (user === undefined || user === null) continue;
    emit(
      userCandidates,
      action,
      user,
      true,
      `keys.${action}`,
      HERDR_ACTION_MODES[action],
      HERDR_ACTION_CONTEXTS[action],
    );
  }

  // [[keys.command]] rows bind a chord to a shell command or agent prompt.
  for (const [index, raw] of (Array.isArray(keys.command) ? keys.command : []).entries()) {
    const entry = objectValue(raw);
    const labels = herdrValue(entry.key);
    if (labels === undefined || labels === null) continue;
    const description =
      typeof entry.description === "string" && entry.description.trim() !== ""
        ? entry.description
        : typeof entry.command === "string"
          ? entry.command
          : "custom command";
    emit(userCandidates, description, labels, true, `keys.command[${index}]`);
  }

  // [keys.indexed] holds modifier combos expanded over the 1-9 row as direct
  // chords — the one herdr surface that claims nine global keys at once.
  for (const [group, combo] of Object.entries(objectValue(keys.indexed))) {
    if (typeof combo !== "string" || combo.trim() === "") continue;
    emit(
      userCandidates,
      `indexed ${group} 1-9`,
      Array.from({ length: 9 }, (_, index) => `${combo}+${index + 1}`),
      true,
      `keys.indexed.${group}`,
    );
  }

  const activeDefaults: HerdrCandidate[] = [];
  const displacements: Displacement[] = [];
  for (const candidate of defaultCandidates) {
    const winner = userCandidates.find(
      (user) =>
        user.binding.key === candidate.binding.key && user.binding.mode === candidate.binding.mode,
    );
    if (winner === undefined) {
      activeDefaults.push(candidate);
      continue;
    }
    displacements.push({
      layer: "herdr",
      key: candidate.binding.key,
      action: candidate.binding.action,
      source: candidate.binding.toRecord().source ?? "",
      displacedBy: {
        action: winner.binding.action,
        source: winner.binding.toRecord().source ?? "",
        field: winner.field,
      },
    });
  }

  return {
    bindings: [...userCandidates, ...activeDefaults].map((candidate) => candidate.binding),
    displacements,
  };
}

const HERDR_FALLBACK_CONFIG: HerdrDefaultsConfig = {
  prefix: HERDR_DEFAULT_PREFIX,
  defaults: [...HERDR_DEFAULTS],
};

export function parseHerdr(path: string): Binding[] {
  return parseHerdrInventory(
    path,
    HERDR_FALLBACK_CONFIG,
    `herdr ${HERDR_VERSION} defaults (vendored fallback)`,
  ).bindings;
}

export interface ConfigPaths {
  karabiner: string;
  skhd: string;
  ghosttyConfig: string;
  ghosttyBin: string;
  herdrConfig: string;
  herdrBin: string;
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

function resolveHerdrBin(): string {
  const override = process.env.AGENTKEYS_HERDR_BIN;
  if (override !== undefined) return override;
  return Bun.which("herdr") ?? "";
}

// Every layer is read from the location its own tool documents, so agentkeys
// works against a plain machine and against a dotfiles checkout stowed into
// place — they are the same paths.
export function defaultPaths(home = process.env.HOME ?? ""): ConfigPaths {
  const config = join(home, ".config");
  const env = process.env;
  // herdr documents XDG_CONFIG_HOME; the other tools document plain ~/.config.
  const herdrConfigRoot =
    env.XDG_CONFIG_HOME !== undefined && env.XDG_CONFIG_HOME !== "" ? env.XDG_CONFIG_HOME : config;
  return {
    karabiner: env.AGENTKEYS_KARABINER_CONFIG ?? join(config, "karabiner", "karabiner.json"),
    skhd: env.AGENTKEYS_SKHD_CONFIG ?? join(config, "skhd", "skhdrc"),
    ghosttyConfig: env.AGENTKEYS_GHOSTTY_CONFIG ?? join(config, "ghostty", "config"),
    ghosttyBin: resolveGhosttyBin(),
    herdrConfig: env.AGENTKEYS_HERDR_CONFIG ?? join(herdrConfigRoot, "herdr", "config.toml"),
    herdrBin: resolveHerdrBin(),
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
  // Present only on a Degraded layer, and the reason it holds no bindings.
  error?: string;
}

// A layer whose config could not be read. Every report names these, because a
// verdict computed without a layer is not the same answer as one computed with
// it — an unread layer's keys would otherwise read as free.
export interface LayerFailure {
  layer: Layer;
  source: string;
  code: string;
  message: string;
}

export interface Inventory {
  bindings: Binding[];
  displacements: Displacement[];
  sources: LayerSource[];
  degraded: LayerFailure[];
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

function collectHerdr(paths: ConfigPaths): {
  bindings: Binding[];
  displacements: Displacement[];
  source: LayerSource;
} {
  const configFound = existsSync(paths.herdrConfig);
  if (paths.herdrBin === "" && !configFound) {
    return {
      bindings: [],
      displacements: [],
      source: {
        layer: "herdr",
        source: `${paths.herdrConfig} (herdr not installed)`,
        found: false,
        bindings: 0,
      },
    };
  }

  let defaultConfig = HERDR_FALLBACK_CONFIG;
  let defaultsLabel = `herdr ${HERDR_VERSION} defaults (vendored fallback)`;
  let sourceLabel = `vendored fallback ${HERDR_VERSION} defaults`;
  if (paths.herdrBin !== "") {
    const dumped = Bun.spawnSync([paths.herdrBin, "--default-config"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    if (dumped.success) {
      const versionResult = Bun.spawnSync([paths.herdrBin, "--version"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const version = versionResult.success ? versionResult.stdout.toString().trim() : "";
      sourceLabel = `${paths.herdrBin} --default-config${version ? ` (${version})` : ""}`;
      defaultsLabel = sourceLabel;
      defaultConfig = parseHerdrDefaultConfig(dumped.stdout.toString(), sourceLabel);
    }
  }

  const parsed = parseHerdrInventory(paths.herdrConfig, defaultConfig, defaultsLabel);
  return {
    bindings: parsed.bindings,
    displacements: parsed.displacements,
    source: {
      layer: "herdr",
      source: configFound
        ? `${sourceLabel} + ${paths.herdrConfig}`
        : `${sourceLabel} (${paths.herdrConfig} not found)`,
      found: true,
      bindings: parsed.bindings.length,
    },
  };
}

interface LayerCollection {
  bindings: Binding[];
  displacements: Displacement[];
  source: LayerSource;
}

// One layer's bad config used to abort the process, so a malformed herdr file
// took every query about every other layer down with it. A domain failure here
// costs its own layer and nothing else. Anything that is not an AgentkeysError
// is a bug in a parser and still crashes: swallowing that would trade a loud
// failure for a wrong answer.
function collectLayer(
  layer: Layer,
  fallbackSource: string,
  collect: () => LayerCollection,
): { collection: LayerCollection; failure: LayerFailure | undefined } {
  try {
    return { collection: collect(), failure: undefined };
  } catch (error) {
    if (!(error instanceof AgentkeysError)) throw error;
    return {
      collection: {
        bindings: [],
        displacements: [],
        source: { layer, source: fallbackSource, found: false, bindings: 0, error: error.message },
      },
      failure: { layer, source: fallbackSource, code: error.code, message: error.message },
    };
  }
}

export function collectAll(paths: Partial<ConfigPaths> = {}): Inventory {
  const resolved = { ...defaultPaths(), ...paths };
  // Interception order, so bindings and the doctor source table both come out
  // in priority order without a second sort.
  const collected = [
    collectLayer("karabiner", resolved.karabiner, () => {
      const bindings = parseKarabiner(resolved.karabiner);
      return {
        bindings,
        displacements: [],
        source: {
          layer: "karabiner",
          source: resolved.karabiner,
          found: existsSync(resolved.karabiner),
          bindings: bindings.length,
        },
      };
    }),
    collectLayer("skhd", resolved.skhd, () => {
      const bindings = parseSkhd(resolved.skhd);
      return {
        bindings,
        displacements: [],
        source: {
          layer: "skhd",
          source: resolved.skhd,
          found: existsSync(resolved.skhd),
          bindings: bindings.length,
        },
      };
    }),
    collectLayer("ghostty", resolved.ghosttyConfig, () => {
      const ghostty = collectGhostty(resolved);
      return { bindings: ghostty.bindings, displacements: [], source: ghostty.source };
    }),
    collectLayer("tmux", resolved.tmuxConf, () => {
      const files = tmuxFiles(resolved).filter((file) => existsSync(file));
      const bindings = parseTmux(files);
      return {
        bindings,
        displacements: [],
        source: {
          layer: "tmux",
          source: files.length > 0 ? fileSourceLabel(files) : resolved.tmuxConf,
          found: files.length > 0,
          bindings: bindings.length,
        },
      };
    }),
    collectLayer("herdr", resolved.herdrConfig, () => collectHerdr(resolved)),
    collectLayer("nvim", resolved.nvimInit, () => {
      const files = nvimFiles(resolved).filter((file) => existsSync(file));
      const bindings = parseNvim(files);
      return {
        bindings,
        displacements: [],
        source: {
          layer: "nvim",
          source: files.length > 0 ? fileSourceLabel(files) : resolved.nvimInit,
          found: files.length > 0,
          bindings: bindings.length,
        },
      };
    }),
  ];

  return {
    bindings: collected.flatMap((entry) => entry.collection.bindings),
    displacements: collected.flatMap((entry) => entry.collection.displacements),
    sources: collected.map((entry) => entry.collection.source),
    degraded: collected.flatMap((entry) => entry.failure ?? []),
  };
}
