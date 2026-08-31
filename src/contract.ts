import {
  type Audience,
  COMMANDS,
  type CommandDescriptor,
  type FlagDescriptor,
  GLOBAL_FLAGS,
  PROGRAM,
  TOP_LEVEL_FLAGS,
} from "./descriptor.ts";

/**
 * The fleet agent contract, version 1 — the one authored description of this
 * CLI. `guide --json` publishes it; `--help`, `--agent-help`, and
 * `--agent-teaser` render it. Nothing here may be restated in prose elsewhere:
 * a second copy is exactly what the contract exists to delete.
 *
 * The mechanical half is derived from `descriptor.ts`, which the parser
 * already runs on, so a flag cannot be published without being accepted.
 */

export type ArgumentType = "string" | "boolean" | "integer" | "number";

export interface ContractArgument {
  name: string;
  type: ArgumentType;
  description: string;
  required?: boolean;
  positional?: boolean;
  choices?: readonly string[];
  default?: string;
}

export interface ContractCommand {
  name: string;
  summary: string;
  audience: Audience;
  mutates: boolean;
  guidance?: string;
  arguments: ContractArgument[];
}

export interface Contract {
  contract_version: 1;
  meta: {
    name: string;
    version: string;
    purpose: string;
    audience: "agent";
  };
  guidance: string;
  concepts: Record<string, unknown>;
  global_arguments: ContractArgument[];
  commands: ContractCommand[];
}

const PURPOSE =
  "Inventory keyboard shortcuts across Karabiner, skhd, Ghostty, tmux, Herdr, and Neovim; detect shadows and find open slots.";

const GUIDANCE = `When to use
- Before assigning a hotkey: check whether the combo is already taken in any layer.
- When a shortcut misfires: find which higher-priority layer shadows it.
- When surveying what is bound: list bindings or render the cheatsheet.

How it resolves
- Reads each layer from the location its own tool documents, under
  $HOME/.config: karabiner/karabiner.json, skhd/skhdrc, ghostty/config,
  tmux/tmux.conf plus tmux/conf.d/*.conf, and nvim/init.lua plus
  nvim/lua/plugins; plus herdr/config.toml (XDG_CONFIG_HOME honored) for
  herdr. Ghostty prefers \`ghostty +list-keybinds\` when the binary is
  installed, because that reports defaults the config file omits. Herdr
  prefers \`herdr --default-config\`, with a labeled vendored fallback for
  older binaries; its config file overlays the defaults. Missing files
  contribute zero bindings; a readable but malformed file fails loudly for its
  own layer only — the command still answers from the layers that parsed,
  names the degraded ones, and says the verdict was computed without them.
  Every path is overridable: AGENTKEYS_KARABINER_CONFIG,
  AGENTKEYS_SKHD_CONFIG, AGENTKEYS_GHOSTTY_CONFIG, AGENTKEYS_GHOSTTY_BIN,
  AGENTKEYS_HERDR_CONFIG, AGENTKEYS_HERDR_BIN, AGENTKEYS_TMUX_CONFIG,
  AGENTKEYS_NVIM_CONFIG.
- Layer priority is interception order along hosting paths: karabiner > skhd >
  Ghostty, then what it hosts — tmux or herdr — then nvim. A higher layer
  shadows the same canonical key in a lower one on the same path. Sibling
  layers tmux and herdr never see the same keystroke and cannot shadow each
  other. Keys that are local to a layer never conflict across layers: Neovim
  leader and space keys, tmux and herdr prefix and mode keys, and Ghostty
  chord sequences. A scoped owner is taken within its own table even though it
  is free across layers. Herdr user bindings displace defaults on the same
  key; explain reports that Displacement without treating the default as live.
  A binding that forwards the key onward rather than consuming it — skhd
  \`* ~\`, Ghostty \`text:\` and \`esc:\` — shadows nothing.
- Well-known shortcuts owned by software with no readable config (macOS,
  browsers, readline) are reported as advisory reservations, never conflicts.
- Every command is read-only. Nothing here edits a config file; deciding a
  shortcut is this tool's job, writing it is yours.`;

const CONCEPTS = {
  model: {
    binding: "One key bound in one layer, normalized to a canonical key string.",
    layer: "karabiner, skhd, ghostty, tmux, herdr, nvim — the six interception points.",
    shadow:
      "A higher-priority layer consuming the same canonical key on the same hosting path, so the lower binding never fires.",
    reservation:
      "A well-known shortcut owned by software with no readable config. Advisory; never a shadow.",
    displacement:
      "A Herdr default made inactive by a user binding on the same key. Reported, but not live.",
    degraded: "A layer whose config was found but could not be parsed. Named, never silently free.",
  },
  output_contract: {
    envelope: {
      schema_version: "number",
      ok: "boolean",
      error: "{code,message} | null",
      data: "payload | null",
    },
    exit_codes: {
      "0": "success, including a degraded run that still produced a real answer",
      "1": "domain failure — an ok:false envelope in a machine format, a message on stderr otherwise",
      "2": "usage fault, raised before the command runs and never an envelope",
    },
    machine_formats: [
      "list-bindings --format json (the default)",
      "list-bindings --format yaml",
      "explain --format json",
      "guide --json",
    ],
    degradation:
      'A degraded run still exits 0. Every command names the unreadable layers on stderr; explain --format json also carries them in data.degraded, and doctor lists them under "Unreadable layers".',
  },
  error_codes: [
    {
      code: "unreadable_config",
      meaning: "A config path exists but could not be read, or a probe binary could not be run.",
      recovery:
        "Check permissions, or point the layer's AGENTKEYS_*_CONFIG override somewhere readable.",
    },
    {
      code: "malformed_config",
      meaning: "A config was read but its binding syntax did not parse.",
      recovery:
        "The named layer is dropped and the answer is computed without it; fix the file at the reported file:line, then rerun.",
    },
    {
      code: "usage",
      meaning: "A bad command, flag, or flag value. Exit 2, before the command runs.",
      recovery: "Re-read `agentkeys <command> --help`, or `agentkeys guide --json`.",
    },
    {
      code: "failed",
      meaning: "An unclassified domain failure.",
      recovery: "Report it; every expected failure carries a more specific code.",
    },
  ],
  read_only_commands: COMMANDS.map((command) => command.name),
  agent_defaults: [
    "agentkeys doctor — which config each layer came from, then the shadows.",
    "agentkeys explain --key cmd+shift+v — everything claiming one chord.",
    "agentkeys find-available --modifier cmd+shift --layer skhd — a priority-safe free key, before binding anything.",
    "agentkeys list-bindings --layer skhd --modifier cmd+shift --format table — verify the result.",
    "agentkeys show-cheatsheet — the Markdown overview, grouped by layer priority.",
  ],
} as const;

function toArgument(flag: FlagDescriptor): ContractArgument {
  return {
    name: `--${flag.name}`,
    type: flag.type,
    description: flag.summary,
    ...(flag.required === true ? { required: true } : {}),
    ...(flag.allowed ? { choices: flag.allowed } : {}),
    ...(flag.default === undefined ? {} : { default: flag.default }),
  };
}

function toCommand(command: CommandDescriptor): ContractCommand {
  return {
    name: command.name,
    summary: command.summary,
    audience: command.audience,
    mutates: command.mutates,
    ...(command.guidance === undefined ? {} : { guidance: command.guidance }),
    arguments: command.flags.map(toArgument),
  };
}

export function buildContract(): Contract {
  return {
    contract_version: 1,
    meta: {
      name: PROGRAM.name,
      version: PROGRAM.version,
      purpose: PURPOSE,
      audience: "agent",
    },
    guidance: GUIDANCE,
    concepts: JSON.parse(JSON.stringify(CONCEPTS)) as Record<string, unknown>,
    global_arguments: GLOBAL_FLAGS.map(toArgument),
    commands: COMMANDS.map(toCommand),
  };
}

// ---------------------------------------------------------------------------
// Renders. Every line of help below reads the contract; none of it restates it.
// ---------------------------------------------------------------------------

const WIDTH = 78;

/** Wrap authored prose to terminal width. Nothing here re-authors it. */
function wrap(text: string, indent: string): string {
  const limit = WIDTH - indent.length;
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter((token) => token !== "")) {
    if (line === "") line = word;
    else if (`${line} ${word}`.length <= limit) line = `${line} ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line !== "") lines.push(line);
  return lines.map((entry) => `${indent}${entry}`).join("\n");
}

/** A wrapped list item: the marker on the first line, the rest hanging under it. */
function bullet(text: string, indent = ""): string {
  const hang = `${indent}  `;
  return indent + wrap(text, hang).slice(hang.length);
}

/** Everything a caller must know about one argument beyond its description. */
function argumentFacts(argument: ContractArgument): string {
  const facts: string[] = [];
  if (argument.choices !== undefined) facts.push(`One of ${argument.choices.join("|")}.`);
  if (argument.default !== undefined) facts.push(`Default ${argument.default}.`);
  if (argument.required === true) facts.push("Required.");
  return facts.join(" ");
}

function renderArgument(argument: ContractArgument): string {
  const value = argument.type === "string" ? ` <${argument.name.slice(2).toUpperCase()}>` : "";
  const facts = argumentFacts(argument);
  const body = `${argument.description}.${facts === "" ? "" : ` ${facts}`}`;
  return `  ${argument.name}${value}\n${wrap(body, "      ")}`;
}

function renderFlagList(args: readonly ContractArgument[]): string {
  return args.map(renderArgument).join("\n");
}

export function renderTeaser(contract: Contract): string {
  return `${contract.meta.purpose}\n`;
}

export function renderTopHelp(contract: Contract): string {
  const width = Math.max(...contract.commands.map((command) => command.name.length)) + 2;
  return `${contract.meta.name}: ${PROGRAM.description}

Usage:
  ${contract.meta.name} <command> [options]

Commands:
${contract.commands.map((command) => `  ${command.name.padEnd(width)}${command.summary}`).join("\n")}

Options:
${renderFlagList(TOP_LEVEL_FLAGS.map(toArgument))}

Every command also accepts:
${renderFlagList(contract.global_arguments)}

Run \`${contract.meta.name} <command> --help\` for command flags, and
\`${contract.meta.name} guide\` for the agent runbook.
`;
}

export function renderCommandHelp(contract: Contract, name: string): string {
  const command = contract.commands.find((candidate) => candidate.name === name);
  if (command === undefined) return renderTopHelp(contract);
  const guidance = command.guidance === undefined ? "" : `\n${wrap(command.guidance, "")}\n`;
  const options = [...command.arguments, ...contract.global_arguments];
  return `${contract.meta.name} ${command.name}: ${command.summary}
${guidance}
Usage:
  ${contract.meta.name} ${command.name} [options]

Options:
${renderFlagList(options)}
`;
}

function renderCommandBlock(contract: Contract): string {
  return contract.commands
    .map((command) => {
      const head = bullet(`${contract.meta.name} ${command.name} — ${command.summary}`);
      const note = command.guidance === undefined ? "" : `\n${wrap(command.guidance, "  ")}`;
      const args = command.arguments
        .map((argument) => {
          const facts = argumentFacts(argument);
          const body = `${argument.name} — ${argument.description}.${
            facts === "" ? "" : ` ${facts}`
          }`;
          return bullet(body, "    ");
        })
        .join("\n");
      return [head, note, args === "" ? "" : `\n${args}`].join("");
    })
    .join("\n\n");
}

export function renderAgentHelp(contract: Contract): string {
  const concepts = contract.concepts as typeof CONCEPTS;
  const exitCodes = Object.entries(concepts.output_contract.exit_codes)
    .map(([code, meaning]) => bullet(`- ${code}: ${meaning}`, "  "))
    .join("\n");
  const errorCodes = concepts.error_codes
    .map((entry) =>
      [bullet(`- ${entry.code}: ${entry.meaning}`, "  "), wrap(entry.recovery, "      ")].join(
        "\n",
      ),
    )
    .join("\n");
  const workflow = concepts.agent_defaults
    .map((line, index) => bullet(`${index + 1}. ${line}`))
    .join("\n");
  const vocabulary = Object.entries(concepts.model)
    .map(([term, meaning]) => bullet(`- ${term}: ${meaning}`))
    .join("\n");

  return `${contract.meta.name} ${contract.meta.version} — ${contract.meta.purpose}

${contract.guidance}

Vocabulary
${vocabulary}

Workflow
${workflow}

Commands
${renderCommandBlock(contract)}

Contract
${bullet(
  `- Machine formats emit one stable {${Object.keys(concepts.output_contract.envelope).join(
    ", ",
  )}} envelope on stdout: ${concepts.output_contract.machine_formats.join(
    ", ",
  )}. A domain failure there is the same envelope with ok:false and a snake_case error.code.`,
)}
${bullet(`- ${concepts.output_contract.degradation}`)}
- Exit codes:
${exitCodes}
- Error codes:
${errorCodes}
${bullet(
  `- \`${contract.meta.name} guide --json\` is this document as the fleet agent contract, version 1. This help is a render of it.`,
)}
`;
}
