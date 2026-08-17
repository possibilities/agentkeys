#!/usr/bin/env bun
import { stringify } from "yaml";
import {
  COMMANDS,
  type CommandDescriptor,
  type FlagDescriptor,
  PROGRAM,
  TOP_LEVEL_FLAGS,
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

const AGENT_TEASER =
  "Inventory keyboard shortcuts across Karabiner, skhd, Ghostty, tmux, Herdr, and Neovim; detect shadows and find open slots.";

const AGENT_HELP = `${PROGRAM.description}.

When to use
- Before assigning a hotkey: check whether the combo is already taken in any layer.
- When a shortcut misfires: find which higher-priority layer shadows it.
- When surveying what is bound: list bindings or render the cheatsheet.

How it resolves
- Reads each layer from the location its own tool documents, under
  $HOME/.config: karabiner/karabiner.json, skhd/skhdrc, ghostty/config,
  tmux/tmux.conf plus tmux/conf.d/*.conf, and nvim/init.lua plus
  nvim/lua/plugins; plus herdr/config.toml (XDG_CONFIG_HOME honored) for
  herdr. Ghostty prefers
  \`ghostty +list-keybinds\` when the binary is installed, because that
  reports defaults the config file omits. Herdr prefers
  \`herdr --default-config\`, with a labeled vendored fallback for older
  binaries; its config file overlays the defaults. Missing files contribute
  zero bindings; a readable but malformed file fails loudly for its own layer
  only — the command still answers from the layers that parsed, names the
  degraded ones, and says the verdict was computed without them. Every path is
  overridable: AGENTKEYS_KARABINER_CONFIG, AGENTKEYS_SKHD_CONFIG,
  AGENTKEYS_GHOSTTY_CONFIG, AGENTKEYS_GHOSTTY_BIN, AGENTKEYS_HERDR_CONFIG,
  AGENTKEYS_HERDR_BIN, AGENTKEYS_TMUX_CONFIG, AGENTKEYS_NVIM_CONFIG.
- Layer priority is interception order along hosting paths: karabiner > skhd >
  Ghostty, then what it hosts — tmux or herdr — then nvim. A higher layer
  shadows the same canonical key in a lower one on the same path. Sibling
  layers tmux and herdr never see the same keystroke and cannot shadow each
  other. Keys that are local to a layer never conflict across layers: Neovim
  leader and space keys, tmux and herdr prefix and mode keys, and Ghostty
  chord sequences. A scoped owner is taken within its own table even though it
  is free across layers. Herdr user bindings displace defaults on the same key;
  explain reports that Displacement without treating the default as live. A
  binding that forwards the key onward rather than consuming it — skhd \`* ~\`,
  Ghostty \`text:\` and \`esc:\` — shadows nothing.
- Well-known shortcuts owned by software with no readable config (macOS,
  browsers, readline) are reported as advisory reservations, never conflicts.

Workflow
1. agentkeys doctor
   Report which config each layer was read from, then shadowed and
   conditionally shadowed shortcuts.
2. agentkeys explain --key cmd+shift+v
   Everything claiming one chord, across every layer plus reservations.
3. agentkeys find-available --modifier cmd+shift --layer skhd
   Pick a priority-safe free key before binding anything new.
   Prefix tables use the same flag: --modifier prefix for tmux and herdr,
   or --modifier space for this machine's Neovim leader table.
4. agentkeys list-bindings --layer skhd --modifier cmd+shift --format table
   Verify the result. Default format is json; yaml and table are available.
5. agentkeys show-cheatsheet
   Markdown overview of every binding, grouped by layer priority.

Contract
- Machine formats emit one stable {schema_version, ok, error, data} envelope
  on stdout: list-bindings --format json (the default) or yaml, and
  explain --format json for a single key. A domain failure there is the same
  envelope with ok:false and a snake_case error.code.
- A degraded run still exits 0 with a real answer. Every command names the
  unreadable layers on stderr; explain --format json also carries them in
  data.degraded, and doctor lists them under "Unreadable layers".
- Exit codes: 0 success, 2 usage fault, 1 any other failure. A usage fault
  exits before the command runs and is never an envelope.
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

function flagByName(flags: readonly FlagDescriptor[], name: string): FlagDescriptor | undefined {
  return flags.find((flag) => flag.name === name);
}

function parseFlags(args: readonly string[], descriptor: CommandDescriptor): ParsedFlags {
  const values: ParsedFlags = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    if (!arg.startsWith("--")) throw new UsageError(`Unexpected argument: ${arg}`);
    const [rawName, inlineValue] = arg.slice(2).split("=", 2);
    const name = rawName ?? "";
    const flag = flagByName(descriptor.flags, name);
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

  if (values.help === true || values["help-json"] === true) return values;
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
    writeStdout(commandHelp(command));
    return 0;
  }
  if (flags["help-json"] === true) {
    writeStdout(helpJson(command));
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
