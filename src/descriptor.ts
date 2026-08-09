import { LAYERS } from "./model.ts";

export type FlagType = "boolean" | "string";

export interface FlagDescriptor {
  name: string;
  type: FlagType;
  summary: string;
  allowed?: readonly string[];
  required?: boolean;
}

export interface CommandDescriptor {
  name: string;
  summary: string;
  flags: readonly FlagDescriptor[];
}

const HELP_FLAGS = [
  { name: "help", type: "boolean", summary: "Show human help" },
  { name: "help-json", type: "boolean", summary: "Show machine-readable help" },
] as const satisfies readonly FlagDescriptor[];

const LAYER_LIST = LAYERS.join("|");

const LAYER_FLAG = {
  name: "layer",
  type: "string",
  summary: `Filter to a binding layer: ${LAYER_LIST}`,
  allowed: LAYERS,
} as const satisfies FlagDescriptor;

export const TOP_LEVEL_FLAGS = [
  { name: "help", type: "boolean", summary: "Show human help" },
  {
    name: "agent-help",
    type: "boolean",
    summary: "Show usage and workflow guidance for agents",
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
    flags: [
      ...HELP_FLAGS,
      LAYER_FLAG,
      {
        name: "modifier",
        type: "string",
        summary: "Filter by canonical modifier or modifier combo",
      },
      {
        name: "format",
        type: "string",
        summary: "Output format: json|yaml|table (default json)",
        allowed: ["json", "yaml", "table"],
      },
    ],
  },
  {
    name: "show-cheatsheet",
    summary: "Show Markdown bindings grouped by layer priority",
    flags: [...HELP_FLAGS, LAYER_FLAG],
  },
  {
    name: "doctor",
    summary: "Report shadowed and conditionally shadowed shortcuts",
    flags: HELP_FLAGS,
  },
  {
    name: "find-available",
    summary: "Find priority-safe unused keys for a modifier combo",
    flags: [
      ...HELP_FLAGS,
      {
        name: "modifier",
        type: "string",
        summary: "Required modifier combo to check",
        required: true,
      },
      {
        ...LAYER_FLAG,
        summary: `Required target layer: ${LAYER_LIST}`,
        required: true,
      },
    ],
  },
  {
    name: "explain",
    summary: "Show every layer and well-known app claiming one key",
    flags: [
      ...HELP_FLAGS,
      {
        name: "key",
        type: "string",
        summary: "Required key or chord to explain, such as cmd+shift+v",
        required: true,
      },
      {
        name: "format",
        type: "string",
        summary: "Output format: text|json (default text)",
        allowed: ["text", "json"],
      },
    ],
  },
] as const satisfies readonly CommandDescriptor[];

export const PROGRAM = {
  name: "agentkeys",
  description:
    "Inventory keyboard shortcuts across Karabiner, skhd, Ghostty, tmux, and Neovim",
} as const;
