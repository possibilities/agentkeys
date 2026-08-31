#!/usr/bin/env bun
import { stringify } from "yaml";
import {
  buildContract,
  renderAgentHelp,
  renderCommandHelp,
  renderTeaser,
  renderTopHelp,
} from "./contract.ts";
import {
  COMMANDS,
  type CommandDescriptor,
  type FlagDescriptor,
  GLOBAL_FLAGS,
} from "./descriptor.ts";
import { failure, success } from "./envelope.ts";
import { AgentkeysError, UsageError } from "./errors.ts";
import { isLayer, type Layer } from "./model.ts";
import { collectAll, type Inventory } from "./parsers.ts";
import {
  degradedNotice,
  explainKey,
  filterBindings,
  findAvailable,
  type OutputFormat,
  renderAvailable,
  renderBindings,
  renderCheatsheet,
  renderDoctor,
  renderExplain,
} from "./reports.ts";

// Every render below reads the one contract this CLI publishes as
// `guide --json`. There is no hand-written help text in this file.
const CONTRACT = buildContract();

type ParsedFlags = Record<string, string | boolean>;

function writeStdout(text: string): void {
  process.stdout.write(text);
}

function writeStderr(text: string): void {
  process.stderr.write(text);
}

function commandByName(name: string): CommandDescriptor | undefined {
  return COMMANDS.find((command) => command.name === name);
}

function flagByName(descriptor: CommandDescriptor, name: string): FlagDescriptor | undefined {
  const flags: readonly FlagDescriptor[] = [...GLOBAL_FLAGS, ...descriptor.flags];
  return flags.find((flag) => flag.name === name);
}

function parseFlags(args: readonly string[], descriptor: CommandDescriptor): ParsedFlags {
  const values: ParsedFlags = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    if (!arg.startsWith("--")) throw new UsageError(`Unexpected argument: ${arg}`);
    const [rawName, inlineValue] = arg.slice(2).split("=", 2);
    const name = rawName ?? "";
    const flag = flagByName(descriptor, name);
    if (!flag) throw new UsageError(`Unknown option for ${descriptor.name}: --${name}`);
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

  if (values.help === true) return values;
  for (const flag of descriptor.flags) {
    if (flag.required === true && values[flag.name] === undefined) {
      throw new UsageError(`Missing required option: --${flag.name}`);
    }
  }
  return values;
}

function parseTop(args: readonly string[]): {
  command?: string | undefined;
  rest: string[];
} {
  if (args.length === 0) {
    writeStdout(renderTopHelp(CONTRACT));
    return { rest: [] };
  }
  const [first, ...rest] = args;
  if (first === "--help" || first === "-h") {
    writeStdout(renderTopHelp(CONTRACT));
    return { command: undefined, rest: [] };
  }
  if (first === "--agent-teaser") {
    writeStdout(renderTeaser(CONTRACT));
    return { command: undefined, rest: [] };
  }
  if (first === "--agent-help") {
    writeStdout(renderAgentHelp(CONTRACT));
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

// Where a Degraded layer gets announced. A human report carries it on stdout,
// beside the answer it qualifies; a machine format cannot, because its stdout
// is one fixed envelope, so it goes to stderr. "report" is for the commands
// that render the degradation themselves. Never both, or a terminal shows the
// same warning twice.
function takeInventory(notify: "stdout" | "stderr" | "report"): Inventory {
  const inventory = collectAll();
  const notice = notify === "report" ? "" : degradedNotice(inventory.degraded);
  if (notice === "") return inventory;
  if (notify === "stdout") writeStdout(`${notice}\n`);
  else writeStderr(notice);
  return inventory;
}

function dispatch(command: CommandDescriptor, flags: ParsedFlags): number {
  if (flags.help === true) {
    writeStdout(renderCommandHelp(CONTRACT, command.name));
    return 0;
  }

  if (command.name === "guide") {
    writeStdout(
      flags.json === true
        ? `${JSON.stringify(success(CONTRACT), null, 2)}\n`
        : renderAgentHelp(CONTRACT),
    );
    return 0;
  }

  if (command.name === "list-bindings") {
    // The json and yaml envelopes are a fixed shape, so their degradation
    // notice stays on stderr; the table is a human report and carries it.
    const inventory = takeInventory(asFormat(flags.format) === "table" ? "stdout" : "stderr");
    const bindings = filterBindings(inventory.bindings, {
      layer: asLayer(flags.layer),
      modifier: typeof flags.modifier === "string" ? flags.modifier : undefined,
    });
    writeStdout(renderBindings(bindings, asFormat(flags.format)));
    return 0;
  }

  if (command.name === "show-cheatsheet") {
    const allBindings = takeInventory("stdout").bindings;
    const filtered = filterBindings(allBindings, {
      layer: asLayer(flags.layer),
    });
    writeStdout(renderCheatsheet(filtered, allBindings));
    return 0;
  }

  if (command.name === "doctor") {
    // The source table names every unreadable layer already; a second copy
    // above it would say the same thing twice.
    const inventory = takeInventory("report");
    writeStdout(renderDoctor(inventory.bindings, inventory.sources));
    return 0;
  }

  if (command.name === "find-available") {
    const layer = asLayer(flags.layer);
    if (!layer || typeof flags.modifier !== "string") {
      throw new UsageError("find-available requires --modifier and --layer");
    }
    writeStdout(
      renderAvailable(findAvailable(takeInventory("stdout").bindings, flags.modifier, layer)),
    );
    return 0;
  }

  if (command.name === "explain") {
    if (typeof flags.key !== "string") {
      throw new UsageError("explain requires --key");
    }
    // renderExplain prints the notice itself, and the json envelope carries it
    // as data.degraded.
    const inventory = takeInventory(flags.format === "json" ? "stderr" : "report");
    const explanation = explainKey(
      inventory.bindings,
      flags.key,
      inventory.displacements,
      inventory.degraded,
    );
    writeStdout(
      flags.format === "json"
        ? `${JSON.stringify(success(explanation), null, 2)}\n`
        : renderExplain(explanation),
    );
    return 0;
  }

  throw new UsageError(`Unknown command: ${command.name}`);
}

// The formats whose outcomes are envelopes. Resolved before dispatch so a
// domain failure mid-command can still honor the machine contract.
function machineFormat(
  command: CommandDescriptor,
  flags: ParsedFlags,
): "json" | "yaml" | undefined {
  if (command.name === "list-bindings") {
    const format = asFormat(flags.format);
    return format === "table" ? undefined : format;
  }
  if (command.name === "explain" && flags.format === "json") return "json";
  if (command.name === "guide" && flags.json === true) return "json";
  return undefined;
}

export function main(argv = process.argv.slice(2)): number {
  let format: "json" | "yaml" | undefined;
  try {
    const top = parseTop(argv);
    if (top.command === undefined) return 0;
    const command = commandByName(top.command);
    if (!command) throw new UsageError(`Unknown command: ${top.command}`);
    const flags = parseFlags(top.rest, command);
    format = machineFormat(command, flags);
    return dispatch(command, flags);
  } catch (error) {
    if (error instanceof UsageError) {
      writeStderr(`${error.message}\n`);
      return error.exitCode;
    }
    // A parse failure no longer arrives here — collectLayer degrades its own
    // layer instead — but the envelope contract promises an ok:false outcome
    // for any domain failure, so this stays the backstop for one raised
    // outside layer collection.
    if (error instanceof AgentkeysError) {
      if (format === undefined) {
        writeStderr(`${error.message}\n`);
      } else {
        const envelope = failure(error);
        writeStdout(
          format === "json" ? `${JSON.stringify(envelope, null, 2)}\n` : stringify(envelope),
        );
      }
      return error.exitCode;
    }
    const message = error instanceof Error ? error.message : String(error);
    writeStderr(`agentkeys failed: ${message}\n`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(main());
}
