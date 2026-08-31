/**
 * The command table every agent-audience report is computed through — the
 * single place that turns parsed flags into data, with no printing anywhere
 * in it.
 *
 * `cli.ts`'s `dispatch` calls these and then renders and prints their `data`
 * in whichever human or machine format was asked for. `mcp-server.ts` calls
 * the exact same functions and returns their `data` as a tool result. Neither
 * caller re-parses argv or spawns the other; both go through this module,
 * which is what makes the MCP surface generated rather than a second
 * implementation of what each command answers.
 */

import { buildContract, type Contract } from "./contract.ts";
import { UsageError } from "./errors.ts";
import { type Binding, bindingsToRecords, isLayer, type Layer } from "./model.ts";
import { collectAll, type Inventory, type LayerFailure } from "./parsers.ts";
import {
  type AvailabilityResult,
  type Conflict,
  detectConflicts,
  explainKey,
  filterBindings,
  findAvailable,
  type KeyExplanation,
  renderCheatsheet,
} from "./reports.ts";

// The full contract is fixed for the process, same as `cli.ts`'s own
// module-level CONTRACT — `guide` and the MCP server's instructions both read
// this one build rather than each calling `buildContract()` again.
export const CONTRACT: Contract = buildContract();

/** Every command that reads the local keymap collects the same inventory
 * once. Failed layers are never silently read as free, so every result below
 * carries them rather than only the ones with a --format json today. */
function inventory(): Inventory {
  return collectAll();
}

export interface ListBindingsArgs {
  layer?: Layer | undefined;
  modifier?: string | undefined;
}

export interface ListBindingsResult {
  // Domain objects, not records: the CLI's own table render reads fields
  // (`.mode`, `.context`) a record only carries when they are non-empty. The
  // MCP mapping converts with `bindingsToRecords` at its own serialization
  // boundary, same as the CLI does for its json/yaml formats.
  bindings: Binding[];
  degraded: LayerFailure[];
}

export function runListBindings(args: ListBindingsArgs): ListBindingsResult {
  const inv = inventory();
  const bindings = filterBindings(inv.bindings, {
    layer: args.layer,
    modifier: args.modifier,
  });
  return { bindings, degraded: inv.degraded };
}

export interface ShowCheatsheetArgs {
  layer?: Layer | undefined;
}

export interface ShowCheatsheetResult {
  markdown: string;
  degraded: LayerFailure[];
}

export function runShowCheatsheet(args: ShowCheatsheetArgs): ShowCheatsheetResult {
  const inv = inventory();
  const filtered = filterBindings(inv.bindings, { layer: args.layer });
  return { markdown: renderCheatsheet(filtered, inv.bindings), degraded: inv.degraded };
}

export interface DoctorResult {
  // Kept only for the CLI's own `renderDoctor`, which walks bindings itself
  // (headers, per-layer grouping) beyond what `sources` and `conflicts`
  // carry. The MCP mapping exposes `sources` and `conflicts` only.
  bindings: Binding[];
  sources: Inventory["sources"];
  conflicts: Conflict[];
}

export function runDoctor(): DoctorResult {
  const inv = inventory();
  // Unreadable layers are already named per-source in `sources` (each one's
  // `error` field), so this does not also carry `degraded` — that would be
  // the same fact under two names in the same result.
  return { bindings: inv.bindings, sources: inv.sources, conflicts: detectConflicts(inv.bindings) };
}

export interface FindAvailableArgs {
  modifier: string;
  layer: Layer;
}

export interface FindAvailableResult extends AvailabilityResult {
  degraded: LayerFailure[];
}

export function runFindAvailable(args: FindAvailableArgs): FindAvailableResult {
  const inv = inventory();
  const result = findAvailable(inv.bindings, args.modifier, args.layer);
  return { ...result, degraded: inv.degraded };
}

export interface ExplainArgs {
  key: string;
}

export function runExplain(args: ExplainArgs): KeyExplanation {
  const inv = inventory();
  // `explainKey` already folds `degraded` into its own result and into its
  // `verdict` sentence — the one command whose JSON format already did this
  // before `mcp` existed.
  return explainKey(inv.bindings, args.key, inv.displacements, inv.degraded);
}

export function runGuide(): Contract {
  return CONTRACT;
}

/**
 * The command table `mcp-server.ts` dispatches a tool call through: an
 * agent-audience command's own name to the same typed function `cli.ts`
 * calls for a terminal invocation, fed the same argument values the MCP
 * input schema just validated — the property names strip agentkeys's own
 * leading dashes, exactly like the flags a terminal call would have parsed.
 *
 * Every value here has already passed the generated zod schema (required,
 * enum membership, type), so the `UsageError`s below are a backstop, not the
 * enforcement — the same relationship `cli.ts`'s own `parseFlags` has to the
 * commands it dispatches to.
 */
export function runCommand(name: string, values: Record<string, unknown>): unknown {
  const layer =
    typeof values.layer === "string" && isLayer(values.layer) ? values.layer : undefined;
  const modifier = typeof values.modifier === "string" ? values.modifier : undefined;

  switch (name) {
    case "list-bindings": {
      const result = runListBindings({ layer, modifier });
      return { bindings: bindingsToRecords(result.bindings), degraded: result.degraded };
    }
    case "show-cheatsheet":
      return runShowCheatsheet({ layer });
    case "doctor": {
      const result = runDoctor();
      return { sources: result.sources, conflicts: result.conflicts };
    }
    case "find-available": {
      if (layer === undefined || modifier === undefined) {
        throw new UsageError("find-available requires --modifier and --layer");
      }
      return runFindAvailable({ modifier, layer });
    }
    case "explain": {
      const key = values.key;
      if (typeof key !== "string") throw new UsageError("explain requires --key");
      return runExplain({ key });
    }
    case "guide":
      return runGuide();
    default:
      throw new UsageError(`Unknown command: ${name}`);
  }
}
