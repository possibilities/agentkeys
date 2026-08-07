#!/usr/bin/env bun
import {
  COMMANDS,
  type CommandDescriptor,
  type FlagDescriptor,
  PROGRAM,
  TOP_LEVEL_FLAGS,
} from "./descriptor.ts";
import { AgentkeysError, UsageError } from "./errors.ts";
import { isLayer, type Layer } from "./model.ts";
import { collectAll } from "./parsers.ts";
import {
  filterBindings,
  findAvailable,
  type OutputFormat,
  renderAvailable,
  renderBindings,
  renderCheatsheet,
  renderDoctor,
} from "./reports.ts";

const AGENT_TEASER =
  "Inventory keyboard shortcuts across Karabiner, skhd, and Neovim; detect shadows and find open slots.";

const AGENT_HELP = `${PROGRAM.description}.

When to use
- Before assigning a hotkey: check whether the combo is already taken in any layer.
- When a shortcut misfires: find which higher-priority layer shadows it.
- When surveying what is bound: list bindings or render the cheatsheet.

How it resolves
- Reads live config from $HOME/code/dotfiles for Karabiner (karabiner.json),
  skhd (skhdrc), and Neovim (init.lua plus lua/plugins). Missing files
  contribute zero bindings; readable but malformed files fail loudly.
- Layer priority: karabiner > skhd > nvim. A higher layer shadows the same
  canonical key in a lower one. Leader and space-scoped Neovim keys are
  layer-local and never conflict across layers.

Workflow
1. agentkeys doctor
   Report shadowed and conditionally shadowed shortcuts.
2. agentkeys find-available --modifier cmd+shift --layer skhd
   Pick a priority-safe free key before binding anything new.
3. agentkeys list-bindings --layer skhd --modifier cmd+shift --format table
   Verify the result. Default format is json; yaml and table are available.
4. agentkeys show-cheatsheet
   Markdown overview of every binding, grouped by layer priority.

Contract
- list-bindings emits stable JSON by default; use it for scripting.
- Exit codes: 0 success, 2 usage fault, 1 any other failure.
- agentkeys <command> --help-json prints machine-readable flags per command.`;

type ParsedFlags = Record<string, string | boolean>;

function writeStdout(text: string): void {
  process.stdout.write(text);
}

function writeStderr(text: string): void {
  process.stderr.write(text);
}

function renderFlag(flag: FlagDescriptor): string {
  const value = flag.type === "string" ? ` <${flag.name.toUpperCase()}>` : "";
  const required = flag.required ? " Required." : "";
  return `  --${flag.name}${value}\n      ${flag.summary}.${required}`;
}

function topHelp(): string {
  return `${PROGRAM.name}: ${PROGRAM.description}

Usage:
  agentkeys <command> [options]

Commands:
${COMMANDS.map((command) => `  ${command.name.padEnd(16)} ${command.summary}`).join("\n")}

Options:
${TOP_LEVEL_FLAGS.map(renderFlag).join("\n")}

Run \`agentkeys <command> --help\` for command flags, and
\`agentkeys --agent-help\` for the agent runbook.
`;
}

function commandHelp(command: CommandDescriptor): string {
  return `${PROGRAM.name} ${command.name}: ${command.summary}

Usage:
  agentkeys ${command.name} [options]

Options:
${command.flags.map(renderFlag).join("\n")}
`;
}

type HelpArgument = {
  name: string;
  type: "choice" | "text" | "flag";
  required: boolean;
  choices?: readonly string[];
  positional: false;
  description: string;
};

function helpJson(command: CommandDescriptor): string {
  const implementationFlags = new Set(["help", "help-json"]);
  const args: HelpArgument[] = command.flags
    .filter((flag) => !implementationFlags.has(flag.name))
    .map((flag) => ({
      name: `--${flag.name}`,
      type: flag.type === "boolean" ? "flag" : flag.allowed ? "choice" : "text",
      required: flag.required === true,
      ...(flag.allowed ? { choices: flag.allowed } : {}),
      positional: false,
      description: flag.summary,
    }));
  return `${JSON.stringify(
    { name: command.name, description: command.summary, arguments: args },
    null,
    2,
  )}\n`;
}

function commandByName(name: string): CommandDescriptor | undefined {
  return COMMANDS.find((command) => command.name === name);
}

function flagByName(
  flags: readonly FlagDescriptor[],
  name: string,
): FlagDescriptor | undefined {
  return flags.find((flag) => flag.name === name);
}

function parseFlags(
  args: readonly string[],
  descriptor: CommandDescriptor,
): ParsedFlags {
  const values: ParsedFlags = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    if (!arg.startsWith("--"))
      throw new UsageError(`Unexpected argument: ${arg}`);
    const [rawName, inlineValue] = arg.slice(2).split("=", 2);
    const name = rawName ?? "";
    const flag = flagByName(descriptor.flags, name);
    if (!flag)
      throw new UsageError(`Unknown option for ${descriptor.name}: --${name}`);
    if (flag.type === "boolean") {
      if (inlineValue !== undefined) {
        throw new UsageError(`Option --${name} does not take a value`);
      }
      values[name] = true;
      continue;
    }
    const value = inlineValue ?? args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new UsageError(`Option --${name} requires a value`);
    }
    if (inlineValue === undefined) index += 1;
    if (flag.allowed !== undefined && !flag.allowed.includes(value)) {
      throw new UsageError(
        `Invalid value for --${name}: ${value}. Expected ${flag.allowed.join("|")}`,
      );
    }
    values[name] = value;
  }

  if (values.help === true || values["help-json"] === true) return values;
  for (const flag of descriptor.flags) {
    if (flag.required === true && values[flag.name] === undefined) {
      throw new UsageError(`Missing required option: --${flag.name}`);
    }
  }
  return values;
}

function parseTop(args: readonly string[]): {
  command?: string;
  rest: string[];
} {
  if (args.length === 0) {
    writeStdout(topHelp());
    return { rest: [] };
  }
  const [first, ...rest] = args;
  if (first === "--help" || first === "-h") {
    writeStdout(topHelp());
    return { command: undefined, rest: [] };
  }
  if (first === "--agent-teaser") {
    writeStdout(`${AGENT_TEASER}\n`);
    return { command: undefined, rest: [] };
  }
  if (first === "--agent-help") {
    writeStdout(`${AGENT_HELP}\n`);
    return { command: undefined, rest: [] };
  }
  if (first?.startsWith("--")) throw new UsageError(`Unknown option: ${first}`);
  return { command: first, rest };
}

function asLayer(value: unknown): Layer | undefined {
  if (typeof value !== "string") return undefined;
  return isLayer(value) ? value : undefined;
}

function asFormat(value: unknown): OutputFormat {
  if (value === undefined) return "json";
  return value as OutputFormat;
}

async function dispatch(
  command: CommandDescriptor,
  flags: ParsedFlags,
): Promise<number> {
  if (flags.help === true) {
    writeStdout(commandHelp(command));
    return 0;
  }
  if (flags["help-json"] === true) {
    writeStdout(helpJson(command));
    return 0;
  }

  if (command.name === "list-bindings") {
    const bindings = filterBindings(collectAll(), {
      layer: asLayer(flags.layer),
      modifier: typeof flags.modifier === "string" ? flags.modifier : undefined,
    });
    writeStdout(renderBindings(bindings, asFormat(flags.format)));
    return 0;
  }

  if (command.name === "show-cheatsheet") {
    const allBindings = collectAll();
    const filtered = filterBindings(allBindings, {
      layer: asLayer(flags.layer),
    });
    writeStdout(renderCheatsheet(filtered, allBindings));
    return 0;
  }

  if (command.name === "doctor") {
    writeStdout(renderDoctor(collectAll()));
    return 0;
  }

  if (command.name === "find-available") {
    const layer = asLayer(flags.layer);
    if (!layer || typeof flags.modifier !== "string") {
      throw new UsageError("find-available requires --modifier and --layer");
    }
    writeStdout(
      renderAvailable(findAvailable(collectAll(), flags.modifier, layer)),
    );
    return 0;
  }

  throw new UsageError(`Unknown command: ${command.name}`);
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  try {
    const top = parseTop(argv);
    if (top.command === undefined) return 0;
    const command = commandByName(top.command);
    if (!command) throw new UsageError(`Unknown command: ${top.command}`);
    const flags = parseFlags(top.rest, command);
    return await dispatch(command, flags);
  } catch (error) {
    if (error instanceof AgentkeysError) {
      writeStderr(`${error.message}\n`);
      return error.exitCode;
    }
    const message = error instanceof Error ? error.message : String(error);
    writeStderr(`agentkeys failed: ${message}\n`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(await main());
}
