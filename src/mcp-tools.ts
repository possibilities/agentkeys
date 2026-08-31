/**
 * The contract → MCP mapping, whole, in one file.
 *
 * `agentstart/config/agent-contract/MCP.md` is the normative specification
 * and this module implements it for agentkeys: which leaves become tools, how
 * names and input schemas are built, how the annotations are derived, and
 * what the server's instructions carry. Nothing here decides which commands
 * an agent may call — the contract already answered that in `audience`, and a
 * mapper that second-guessed it would have moved the decision back to the
 * consumer.
 *
 * This is a smaller mapping than AgentBoard's reference implementation
 * because agentkeys's contract is smaller: every command is a leaf (no
 * `subcommands` groups, so a tool name is the command's own name with no path
 * to join), and no argument uses `positional` or `format`. The parts of
 * MCP.md that govern those are simply unreached code here, not omitted on
 * purpose — a sibling contract that grows one of those shapes should extend
 * this file rather than treat its absence as a precedent. `minimum`,
 * `maximum`, `csv`, `repeatable`, and `constraints` (including
 * `at_least_one`) are mapped below even though no agentkeys command sets one
 * today, because the local contract types now carry them and a caller of
 * this module should not have to know which fleet-contract features this one
 * CLI happens to exercise.
 *
 * Nothing in here imports the MCP SDK: the mapping is a description of tools,
 * and `mcp-server.ts` is what hands that description to a server.
 */

import * as z from "zod/v4";
import {
  type Contract,
  type ContractArgument,
  type ContractCommand,
  constraintSentence,
} from "./contract.ts";

/** The four hints MCP carries. Declared here rather than imported so this
 * file stays SDK-free; the shape is `ToolAnnotations` and is checked
 * structurally. */
export interface ToolAnnotations {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

export interface AgentTool {
  /** The command's own name — agentkeys has no command groups, so MCP.md's
   * "full path joined with `_`" is a no-op path of one segment here. */
  name: string;
  title: string;
  description: string;
  input: z.ZodObject<Record<string, z.ZodType>>;
  annotations: ToolAnnotations;
  /** Exactly the arguments the schema above exposes: the leaf's own plus any
   * `call`-role global. */
  arguments: ContractArgument[];
  command: ContractCommand;
}

// --- Which commands become tools ---

/** Exactly the leaves whose `audience` is `agent` — not `operator`, and not
 * `internal`, which is `mcp` itself. Every agentkeys command is already a
 * leaf, so this is a filter, not a tree walk. */
function agentLeaves(commands: readonly ContractCommand[]): ContractCommand[] {
  return commands.filter((command) => command.audience === "agent");
}

// --- Input schema ---

/** `--layer` → `layer`. agentkeys has no positional arguments, so every
 * property strips exactly the leading dashes a flag always carries. */
function propertyName(name: string): string {
  return name.replace(/^--/, "");
}

function scalar(argument: ContractArgument): z.ZodType {
  if (argument.type === "boolean") return z.boolean();
  if (argument.choices !== undefined) return z.enum(argument.choices as [string, ...string[]]);
  if (argument.type === "string") return z.string();
  let numeric = argument.type === "integer" ? z.number().int() : z.number();
  if (argument.minimum !== undefined) numeric = numeric.min(argument.minimum);
  if (argument.maximum !== undefined) numeric = numeric.max(argument.maximum);
  return numeric;
}

/** MCP.md: a `csv` argument stays a scalar string in the schema — a caller
 * comma-joins the values itself — and the description must say so even when
 * the authored text already does, so a mapper that only checked the prose
 * cannot silently stop saying it the day the prose is reworded. */
function csvNote(argument: ContractArgument): string {
  return argument.format === "ref"
    ? "Comma-joined into one string, each entry a label or unambiguous phrase."
    : "Comma-joined into one string.";
}

function propertyDescription(argument: ContractArgument): string {
  if (argument.csv === true) return `${argument.description} ${csvNote(argument)}`;
  return argument.description;
}

function property(argument: ContractArgument): z.ZodType {
  // `repeatable` without `csv` is an array of the scalar type; `repeatable`
  // AND `csv` is still an array here (the joining happens at invocation).
  const base = argument.repeatable === true ? z.array(scalar(argument)) : scalar(argument);
  const described = base.describe(propertyDescription(argument));
  // A default makes the property optional in the input schema on its own,
  // which is why it is checked before `required`.
  if (argument.default !== undefined) return described.default(argument.default as never);
  return argument.required === true ? described : z.optional(described);
}

/** A leaf's own arguments, plus the globals whose `role` is `call` (the
 * default when `role` is absent). agentkeys's only global is `--help`, role
 * `meta`, so this suppresses it from every tool — a caller does not choose
 * whether to see help text, it always gets the tool's own description. */
function callArguments(document: Contract, leaf: ContractCommand): ContractArgument[] {
  const globals = document.global_arguments.filter(
    (argument) => (argument.role ?? "call") === "call",
  );
  return [...leaf.arguments, ...globals];
}

// --- Constraints ---

/**
 * Expressed in the schema where JSON Schema can, and in the description
 * always — a schema-only rule is invisible in most host UIs, and a caller
 * that cannot see it will break it. Zod cannot express a cross-field rule
 * itself, so the keywords are attached through `.meta()`, which the SDK's
 * schema converter merges into the emitted JSON Schema; they are advisory
 * either way, since the command itself is the real enforcement.
 */
interface MappedConstraints {
  keywords: Record<string, unknown>;
  sentences: string[];
}

/** `oneOf`/`anyOf` of single-property `required` shapes, per MCP.md. */
function eitherOf(members: string[]): { required: string[] }[] {
  return members.map((member) => ({ required: [member] }));
}

function mapConstraints(leaf: ContractCommand): MappedConstraints {
  const keywords: Record<string, unknown> = {};
  const sentences: string[] = [];
  for (const constraint of leaf.constraints ?? []) {
    sentences.push(constraintSentence(constraint, propertyName));
    const members = constraint.arguments.map(propertyName);
    switch (constraint.kind) {
      case "one_of":
        // Nothing in JSON Schema says "at most one" without `not`, which is
        // legal and unreadable in practice; there the sentence is the whole
        // mapping.
        if (constraint.required === true) keywords["oneOf"] = eitherOf(members);
        break;
      case "at_least_one":
        keywords["anyOf"] = eitherOf(members);
        break;
      case "requires": {
        const [first, ...rest] = members;
        if (first !== undefined) keywords["dependentRequired"] = { [first]: rest };
        break;
      }
      case "conflicts":
        // Expressible as `not`/`allOf` and unreadable as either; described only.
        break;
    }
  }
  return { keywords, sentences };
}

// --- Annotations ---

/**
 * Every agentkeys command answers a question about the local keymap and
 * changes nothing: `mutates` is `false` on every agent leaf. That collapses
 * MCP.md's four-hint derivation to one fixed answer, which is the sanity
 * check this repo's task asked for — a mapper that computed something other
 * than `readOnlyHint: true, idempotentHint: true` here would be wrong.
 */
function annotations(_leaf: ContractCommand): ToolAnnotations {
  return {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    // No agent command reaches the network: everything is a local config or
    // a local probe binary (`ghostty +list-keybinds`, `herdr --default-config`).
    openWorldHint: false,
  };
}

// --- Description ---

function toolDescription(document: Contract, leaf: ContractCommand, sentences: string[]): string {
  const parts: string[] = [];
  // MCP.md: a blocking command says so in the FIRST sentence. No agent leaf
  // sets `blocking` today — only `mcp` itself does, and `mcp` is never
  // exposed as a tool — but the check stays so a future blocking agent
  // command is not silently exposed without the warning.
  if (leaf.blocking === true) {
    parts.push("Blocks: this waits on something outside the CLI and may not return promptly.");
  }
  parts.push(`${leaf.summary}.`);
  parts.push(`Runs \`${document.meta.name} ${leaf.name}\` in this process.`);
  parts.push(...sentences);
  if (leaf.guidance !== undefined) parts.push(leaf.guidance);
  return parts.join("\n\n");
}

// --- The surface ---

export function agentTools(document: Contract): AgentTool[] {
  return agentLeaves(document.commands).map((leaf) => {
    const exposed = callArguments(document, leaf);
    const shape: Record<string, z.ZodType> = {};
    for (const argument of exposed) {
      shape[propertyName(argument.name)] = property(argument);
    }
    const { keywords, sentences } = mapConstraints(leaf);
    return {
      name: leaf.name,
      title: leaf.summary,
      description: toolDescription(document, leaf, sentences),
      input: z.object(shape).meta(keywords),
      annotations: annotations(leaf),
      arguments: exposed,
      command: leaf,
    };
  });
}

/** The half of `concepts` this mapping reads, named so it can be read. */
interface AgentkeysConcepts {
  output_contract: {
    envelope: Record<string, string>;
    exit_codes: Record<string, string>;
  };
  error_codes: { code: string; meaning: string; recovery?: string }[];
  agent_defaults: string[];
}

/**
 * The server's `instructions`: the contract's `guidance`, then what
 * `concepts` says a caller must know — the envelope, the error codes with
 * their recovery, and `agent_defaults`. This is the half of the contract a
 * tool schema cannot carry, and dropping it ships a surface that works and is
 * used wrongly.
 *
 * Exit codes are left out: there is no process to exit here, and a refusal
 * arrives as a tool error instead.
 */
export function serverInstructions(document: Contract): string {
  const concepts = document.concepts as unknown as AgentkeysConcepts;
  const envelope = Object.entries(concepts.output_contract.envelope)
    .map(([field, meaning]) => `  ${field}: ${meaning}`)
    .join("\n");
  const errors = concepts.error_codes
    .map((entry) =>
      entry.recovery === undefined
        ? `  ${entry.code} — ${entry.meaning}`
        : `  ${entry.code} — ${entry.meaning} → ${entry.recovery}`,
    )
    .join("\n");
  const defaults = concepts.agent_defaults.map((line) => `  ${line}`).join("\n");
  return `${document.guidance}

Every tool returns ${document.meta.name}'s own envelope as JSON text:
${envelope}

A refusal comes back as a tool error whose first line is the error code, then
the message, then the recovery when there is one. The recovery line is the
difference between a caller that retries correctly and one that retries
identically, so read it before calling again.

Error codes
${errors}

Opening moves
${defaults}
`;
}
