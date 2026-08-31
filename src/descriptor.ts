import packageJson from "../package.json" with { type: "json" };
import { LAYERS } from "./model.ts";

export type FlagType = "boolean" | "string";

export interface FlagDescriptor {
  name: string;
  type: FlagType;
  summary: string;
  /**
   * The closed value set. Authored once: the parser rejects anything outside
   * it and every render lists it, so a summary must never spell it again.
   */
  allowed?: readonly string[];
  required?: boolean;
  /** The value used when the flag is absent, for the same reason. */
  default?: string;
}

export type Audience = "agent" | "operator" | "internal";

export interface CommandDescriptor {
  name: string;
  summary: string;
  audience: Audience;
  /**
   * Whether a successful call can change durable state anywhere. Every
   * agentkeys command reads configs and prints; nothing here is true, and a
   * command that made it true would be a different tool.
   */
  mutates: boolean;
  /** Prose the one-line summary cannot carry. Rendered by help and by guide. */
  guidance?: string;
  flags: readonly FlagDescriptor[];
}

const LAYER_FLAG = {
  name: "layer",
  type: "string",
  summary: "Filter to a binding layer",
  allowed: LAYERS,
} as const satisfies FlagDescriptor;

/**
 * Accepted by every command and at the top level, so it is declared once here
 * and published as the contract's global_arguments rather than repeated on
 * each command.
 */
export const GLOBAL_FLAGS = [
  { name: "help", type: "boolean", summary: "Show this command's help" },
] as const satisfies readonly FlagDescriptor[];

/** Top-level-only flags. Each one renders the contract; none reaches a command. */
export const TOP_LEVEL_FLAGS = [
  {
    name: "agent-help",
    type: "boolean",
    summary: "Show the agent runbook (same as `agentkeys guide`)",
  },
  {
    name: "agent-teaser",
    type: "boolean",
    summary: "Show a one-line capability summary",
  },
] as const satisfies readonly FlagDescriptor[];

export const COMMANDS = [
  {
    name: "list-bindings",
    summary: "List keyboard bindings across all layers",
    audience: "agent",
    mutates: false,
    guidance:
      "The verification step, after find-available has proposed a key. json is the default; table is the human read.",
    flags: [
      LAYER_FLAG,
      {
        name: "modifier",
        type: "string",
        summary: "Filter by canonical modifier combo or scope prefix",
      },
      {
        name: "format",
        type: "string",
        summary: "Output format",
        allowed: ["json", "yaml", "table"],
        default: "json",
      },
    ],
  },
  {
    name: "show-cheatsheet",
    summary: "Show Markdown bindings grouped by layer priority",
    audience: "agent",
    mutates: false,
    flags: [LAYER_FLAG],
  },
  {
    name: "doctor",
    summary: "Report shadowed and conditionally shadowed shortcuts",
    audience: "agent",
    mutates: false,
    // Not the fleet's usual operator-audience `doctor`: it diagnoses the
    // machine's keymap, not this tool's health, and it is the first move the
    // runbook tells an agent to make.
    guidance:
      "Start here. It names the config each layer was read from, so a layer that was never found is never mistaken for a layer with nothing bound.",
    flags: [],
  },
  {
    name: "find-available",
    summary: "Find priority-safe unused keys for a modifier combo or scope prefix",
    audience: "agent",
    mutates: false,
    guidance:
      "Ask before binding anything new. Scope prefixes use the same flag: --modifier prefix for tmux and herdr, --modifier space for a Neovim leader table.",
    flags: [
      {
        name: "modifier",
        type: "string",
        summary: "Modifier combo or scope prefix to check",
        required: true,
      },
      {
        ...LAYER_FLAG,
        summary: "Target layer the key must be safe in",
        required: true,
      },
    ],
  },
  {
    name: "explain",
    summary: "Show every layer and well-known app claiming one key",
    audience: "agent",
    mutates: false,
    guidance:
      "The single-key answer: every layer that binds it, every advisory reservation, and the verdict. Reach for it when a shortcut misfires.",
    flags: [
      {
        name: "key",
        type: "string",
        summary: "Key or chord to explain, such as cmd+shift+v",
        required: true,
      },
      {
        name: "format",
        type: "string",
        summary: "Output format",
        allowed: ["text", "json"],
        default: "text",
      },
    ],
  },
  {
    name: "guide",
    summary: "Print this CLI's own contract — the runbook, or the machine-readable document",
    audience: "agent",
    mutates: false,
    guidance:
      "`guide --json` is the fleet agent contract, version 1: every command, every argument, the envelope, and every error code. --help, --agent-help, and --agent-teaser are renders of it.",
    flags: [
      {
        name: "json",
        type: "boolean",
        summary: "Emit the contract as one envelope instead of the prose runbook",
      },
    ],
  },
] as const satisfies readonly CommandDescriptor[];

export const PROGRAM = {
  name: "agentkeys",
  version: packageJson.version,
  description:
    "Inventory keyboard shortcuts across Karabiner, skhd, Ghostty, tmux, Herdr, and Neovim",
} as const;
