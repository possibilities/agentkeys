import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { AgentkeysError } from "./errors.ts";
import { Binding } from "./model.ts";
import {
  buildKey,
  normalizeKarabinerKey,
  normalizeKarabinerMods,
  normalizeNvimKey,
  normalizeSkhdMods,
} from "./normalize.ts";

function readExistingText(path: string): string | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AgentkeysError(`Cannot read ${path}: ${message}`);
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function objectValue(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function bundleIdsToLabel(bundleIds: readonly string[]): string {
  const names: string[] = [];
  for (const bundleId of bundleIds) {
    const clean = bundleId
      .replace(/^\^/, "")
      .replace(/\$$/, "")
      .replaceAll("\\.", ".");
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
    throw new AgentkeysError(`Malformed Karabiner JSON at ${path}: ${message}`);
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
    const description =
      typeof rule.description === "string" ? rule.description : "";
    const manipulators = Array.isArray(rule.manipulators)
      ? rule.manipulators
      : [];
    for (const rawManipulator of manipulators) {
      const manipulator = objectValue(rawManipulator);
      const from = objectValue(manipulator.from);
      const keyCode = typeof from.key_code === "string" ? from.key_code : "";
      if (keyCode === "" || isModifierOnlyKarabinerKey(keyCode)) continue;

      const modifiers = objectValue(from.modifiers);
      const mandatory = normalizeKarabinerMods(
        stringArray(modifiers.mandatory),
      );
      const optional = stringArray(modifiers.optional);
      const key = buildKey(mandatory, normalizeKarabinerKey(keyCode));
      const contextParts: string[] = [];
      const conditions = Array.isArray(manipulator.conditions)
        ? manipulator.conditions
        : [];
      for (const rawCondition of conditions) {
        const condition = objectValue(rawCondition);
        if (condition.type === "frontmost_application_if") {
          const bundleIds = stringArray(condition.bundle_identifiers);
          if (bundleIds.length > 0)
            contextParts.push(bundleIdsToLabel(bundleIds));
        } else if (condition.type === "device_if") {
          const identifiers = Array.isArray(condition.identifiers)
            ? condition.identifiers
            : [];
          for (const rawIdentifier of identifiers) {
            const identifier = objectValue(rawIdentifier);
            if (identifier.is_built_in_keyboard === true) {
              contextParts.push("built-in kbd");
            }
          }
        }
      }
      if (
        optional.length > 0 &&
        !(optional.length === 1 && optional[0] === "any")
      ) {
        contextParts.push(
          `${normalizeKarabinerMods(optional).join("+")} passthrough`,
        );
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
const SKHD_BLOCK_APP = /^\s*"([^"]+)"\s*:\s*(.+)$/;
const SKHD_BLOCK_DEFAULT = /^\s*\*\s*~\s*$/;

export function parseSkhd(path: string): Binding[] {
  const text = readExistingText(path);
  if (text === undefined) return [];
  const lines = text.split(/\r?\n/);
  const joined: Array<{ lineNumber: number; text: string }> = [];

  for (let index = 0; index < lines.length; index += 1) {
    let line = lines[index] ?? "";
    const lineNumber = index + 1;
    while (line.trimEnd().endsWith("\\") && index + 1 < lines.length) {
      line = `${line.trimEnd().slice(0, -1)} ${(lines[index + 1] ?? "").trim()}`;
      index += 1;
    }
    joined.push({ lineNumber, text: line });
  }

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
    if (blockMatch) {
      const normalized = buildKey(
        normalizeSkhdMods(blockMatch[1] ?? ""),
        (blockMatch[2] ?? "").toLowerCase(),
      );
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
              sourceFile: path,
              sourceLine: blockLine.lineNumber,
            }),
          );
        } else if (blockStripped !== "" && !blockStripped.startsWith("#")) {
          throw new AgentkeysError(
            `Malformed skhd block at ${path}:${blockLine.lineNumber}`,
          );
        }
        index += 1;
      }
      if (!closed)
        throw new AgentkeysError(
          `Unclosed skhd block at ${path}:${lineNumber}`,
        );
      continue;
    }

    const simpleMatch = stripped.match(SKHD_SIMPLE);
    if (simpleMatch) {
      bindings.push(
        new Binding({
          layer: "skhd",
          key: buildKey(
            normalizeSkhdMods(simpleMatch[1] ?? ""),
            (simpleMatch[2] ?? "").toLowerCase(),
          ),
          action: (simpleMatch[3] ?? "").trim(),
          sourceFile: path,
          sourceLine: lineNumber,
        }),
      );
    } else if (stripped.includes(":") || stripped.includes("-")) {
      throw new AgentkeysError(
        `Malformed skhd binding at ${path}:${lineNumber}`,
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

function keymapStatements(
  lines: readonly string[],
): Array<{ lineNumber: number; text: string }> {
  const statements: Array<{ lineNumber: number; text: string }> = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (
      line.trimStart().startsWith("--") ||
      !line.includes("vim.keymap.set(")
    ) {
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
  const matches = [...modeTable.matchAll(/["']([^"']+)["']/g)].map(
    (match) => match[1],
  );
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

export interface ConfigPaths {
  karabiner: string;
  skhd: string;
  nvimInit: string;
  nvimPlugins: string;
}

export function defaultPaths(home = process.env.HOME ?? ""): ConfigPaths {
  const root = join(home, "code", "dotfiles");
  return {
    karabiner: join(
      root,
      "karabiner",
      ".config",
      "karabiner",
      "karabiner.json",
    ),
    skhd: join(root, "skhd", ".config", "skhd", "skhdrc"),
    nvimInit: join(root, "nvim", ".config", "nvim", "init.lua"),
    nvimPlugins: join(root, "nvim", ".config", "nvim", "lua", "plugins"),
  };
}

export function nvimFiles(paths: ConfigPaths): string[] {
  const files = [paths.nvimInit];
  if (existsSync(paths.nvimPlugins)) {
    try {
      if (statSync(paths.nvimPlugins).isDirectory()) {
        files.push(
          ...readdirSync(paths.nvimPlugins)
            .filter((entry) => entry.endsWith(".lua"))
            .sort()
            .map((entry) => join(paths.nvimPlugins, entry)),
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new AgentkeysError(
        `Cannot inspect ${paths.nvimPlugins}: ${message}`,
      );
    }
  }
  return files;
}

export function collectAll(paths: Partial<ConfigPaths> = {}): Binding[] {
  const resolved = { ...defaultPaths(), ...paths };
  return [
    ...parseKarabiner(resolved.karabiner),
    ...parseSkhd(resolved.skhd),
    ...parseNvim(nvimFiles(resolved)),
  ];
}
