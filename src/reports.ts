import { stringify } from "yaml";
import { type Binding, bindingsToRecords, LAYERS, type Layer, priorityIndex } from "./model.ts";
import { buildKey, normalizeModifierCombo } from "./normalize.ts";
import type { LayerSource } from "./parsers.ts";
import { type Reservation, reservationsFor } from "./reserved.ts";

export type OutputFormat = "json" | "yaml" | "table";

export const ALPHA_KEYS = Array.from({ length: 26 }, (_, index) =>
  String.fromCharCode("a".charCodeAt(0) + index),
);
export const DIGIT_KEYS = Array.from({ length: 10 }, (_, index) => String(index));
export const PUNCT_KEYS = ["-", "=", "[", "]", "\\", ";", "'", ",", ".", "/", "`"] as const;
export const SPECIAL_KEYS = [
  "return",
  "escape",
  "tab",
  "space",
  "backspace",
  "delete",
  "up",
  "down",
  "left",
  "right",
  "f1",
  "f2",
  "f3",
  "f4",
  "f5",
  "f6",
  "f7",
  "f8",
  "f9",
  "f10",
  "f11",
  "f12",
] as const;
export const ALL_KEYS = [...ALPHA_KEYS, ...DIGIT_KEYS, ...PUNCT_KEYS, ...SPECIAL_KEYS];

export interface BindingFilters {
  layer?: Layer | undefined;
  modifier?: string | undefined;
}

export interface Conflict {
  key: string;
  kind: "shadow" | "conditional shadow";
  higherLayer: Layer;
  lowerLayer: Layer;
  higherAction: string;
  lowerAction: string;
  higherContexts: string[];
}

function distinct(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value !== ""))];
}

function modifierMatches(binding: Binding, modifier: string): boolean {
  const canonical = normalizeModifierCombo(modifier);
  if (canonical.includes("+")) return binding.modifierCombo === canonical;
  return binding.key.split("+").includes(canonical);
}

export function filterBindings(bindings: readonly Binding[], filters: BindingFilters): Binding[] {
  return bindings.filter((binding) => {
    if (filters.layer !== undefined && binding.layer !== filters.layer) return false;
    if (filters.modifier !== undefined && !modifierMatches(binding, filters.modifier)) {
      return false;
    }
    return true;
  });
}

function tableEscape(value: string): string {
  return value.replaceAll("\n", " ");
}

export function renderBindings(bindings: readonly Binding[], format: OutputFormat): string {
  if (format === "json") return `${JSON.stringify(bindingsToRecords(bindings), null, 2)}\n`;
  if (format === "yaml") return stringify(bindingsToRecords(bindings));
  if (bindings.length === 0) return "No bindings found.\n";

  const header = ["LAYER", "KEY", "ACTION", "CONTEXT"];
  const dataRows = bindings.map((binding) => [
    binding.layer,
    binding.key,
    binding.action,
    `${binding.context}${binding.mode ? ` [${binding.mode}]` : ""}`,
  ]);
  const rows = [header, ...dataRows];
  const widths = rows[0]?.map((_, col) =>
    Math.max(...rows.map((row) => tableEscape(row[col] ?? "").length)),
  ) ?? [0, 0, 0, 0];
  const separator = widths.map((width) => "-".repeat(width));
  return `${[header, separator, ...dataRows]
    .map((row) =>
      row
        .map((cell, col) => tableEscape(cell).padEnd(widths[col] ?? 0))
        .join("  ")
        .trimEnd(),
    )
    .join("\n")}\n`;
}

export function detectConflicts(bindings: readonly Binding[]): Conflict[] {
  const byKey = new Map<string, Binding[]>();
  for (const binding of bindings) {
    const entries = byKey.get(binding.key) ?? [];
    entries.push(binding);
    byKey.set(binding.key, entries);
  }

  const conflicts: Conflict[] = [];
  for (const [key, entries] of [...byKey.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    if (entries.some((binding) => binding.isLayerScoped)) continue;
    const realEntries = entries.filter((binding) => binding.isInterception);
    const byLayer = LAYERS.map((layer) => ({
      layer,
      bindings: realEntries.filter((binding) => binding.layer === layer),
    })).filter((group) => group.bindings.length > 0);
    if (byLayer.length < 2) continue;

    for (let higherIndex = 0; higherIndex < byLayer.length; higherIndex += 1) {
      const higher = byLayer[higherIndex];
      if (!higher) continue;
      for (let lowerIndex = higherIndex + 1; lowerIndex < byLayer.length; lowerIndex += 1) {
        const lower = byLayer[lowerIndex];
        if (!lower) continue;
        const unconditional = higher.bindings.filter((binding) => binding.context === "");
        const relevantHigher = unconditional.length > 0 ? unconditional : higher.bindings;
        conflicts.push({
          key,
          kind: unconditional.length > 0 ? "shadow" : "conditional shadow",
          higherLayer: higher.layer,
          lowerLayer: lower.layer,
          higherAction: distinct(relevantHigher.map((binding) => binding.action)).join("; "),
          lowerAction: distinct(lower.bindings.map((binding) => binding.action)).join("; "),
          higherContexts: distinct(higher.bindings.map((binding) => binding.context)),
        });
      }
    }
  }
  return conflicts;
}

export function renderDoctor(
  bindings: readonly Binding[],
  sources: readonly LayerSource[],
): string {
  const conflicts = detectConflicts(bindings);
  const shadows = conflicts.filter((conflict) => conflict.kind === "shadow");
  const conditionals = conflicts.filter((conflict) => conflict.kind === "conditional shadow");

  // A layer whose config was never found reads exactly like a layer with
  // nothing to report, so say which files were actually read before saying
  // anything about conflicts.
  const lines: string[] = [
    "## Sources",
    "",
    "| Layer | Source | Bindings |",
    "|-------|--------|----------|",
  ];
  for (const source of sources) {
    lines.push(
      `| ${source.layer} | ${source.found ? source.source : `${source.source} (not found)`} | ${source.found ? source.bindings : "—"} |`,
    );
  }
  lines.push("");

  if (shadows.length > 0) {
    lines.push(
      `## Shadows (${shadows.length})`,
      "",
      "| Key | Higher | Lower (shadowed) |",
      "|-----|--------|------------------|",
    );
    for (const conflict of shadows) {
      lines.push(
        `| \`${conflict.key}\` | ${conflict.higherLayer}: ${conflict.higherAction} | ${conflict.lowerLayer}: ${conflict.lowerAction} |`,
      );
    }
    lines.push("");
  }

  if (conditionals.length > 0) {
    lines.push(
      `## Conditional shadows (${conditionals.length})`,
      "",
      "| Key | Higher | Lower |",
      "|-----|--------|-------|",
    );
    for (const conflict of conditionals) {
      const context =
        conflict.higherContexts.length > 0 ? ` (${conflict.higherContexts.join("; ")})` : "";
      lines.push(
        `| \`${conflict.key}\` | ${conflict.higherLayer}: ${conflict.higherAction}${context} | ${conflict.lowerLayer}: ${conflict.lowerAction} |`,
      );
    }
    lines.push("");
  }

  lines.push(
    conflicts.length === 0
      ? "No cross-layer conflicts detected."
      : `${conflicts.length} conflict${conflicts.length === 1 ? "" : "s"} found.`,
  );
  return `${lines.join("\n")}\n`;
}

export function renderCheatsheet(
  requestedBindings: readonly Binding[],
  allBindings: readonly Binding[],
): string {
  if (requestedBindings.length === 0) return "No bindings found.\n";
  const byLayer = new Map<Layer, Binding[]>();
  for (const binding of requestedBindings) {
    const entries = byLayer.get(binding.layer) ?? [];
    entries.push(binding);
    byLayer.set(binding.layer, entries);
  }

  const keyLayers = new Map<string, Set<Layer>>();
  for (const binding of allBindings) {
    if (!binding.isInterception) continue;
    const layers = keyLayers.get(binding.key) ?? new Set<Layer>();
    layers.add(binding.layer);
    keyLayers.set(binding.key, layers);
  }

  const lines: string[] = [];
  for (const layer of LAYERS) {
    const layerBindings = byLayer.get(layer);
    if (!layerBindings) continue;
    lines.push(`## ${layer}`, "", "| Key | Action | Notes |", "|-----|--------|-------|");
    for (const binding of [...layerBindings].sort((left, right) =>
      left.key.localeCompare(right.key),
    )) {
      const layers = [...(keyLayers.get(binding.key) ?? new Set<Layer>())];
      let conflict = "";
      if (layers.length > 1 && !binding.isLayerScoped && binding.isInterception) {
        const highest = layers.sort((left, right) => priorityIndex(left) - priorityIndex(right))[0];
        conflict = binding.layer === highest ? "**\\***" : "(shadowed)";
      }
      const notes = [binding.context, binding.mode ? `[${binding.mode}]` : "", conflict]
        .filter((part) => part !== "")
        .join(" ");
      lines.push(`| \`${binding.key}\` | ${binding.action.replaceAll("|", "\\|")} | ${notes} |`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

export interface AvailabilityResult {
  modifier: string;
  layer: Layer;
  available: string[];
  used: string[];
  reserved: Reservation[];
}

export function findAvailable(
  bindings: readonly Binding[],
  modifierInput: string,
  layer: Layer,
): AvailabilityResult {
  const modifier = normalizeModifierCombo(modifierInput);
  const blockingLayers = new Set(LAYERS.slice(0, priorityIndex(layer) + 1));
  const used = new Set<string>();
  for (const binding of bindings) {
    if (!blockingLayers.has(binding.layer)) continue;
    if (binding.modifierCombo === modifier) used.add(binding.baseKey);
  }
  const available = ALL_KEYS.filter((key) => !used.has(key));
  return {
    modifier,
    layer,
    available,
    used: ALL_KEYS.filter((key) => used.has(key)),
    // Still free — nothing in the layer chain claims them — but well known
    // enough elsewhere that taking one has a cost worth naming.
    reserved: available.flatMap((key) => reservationsFor(buildKey(modifier.split("+"), key))),
  };
}

export function renderAvailable(result: AvailabilityResult): string {
  if (result.available.length === 0) {
    return `No available slots for ${result.modifier}+* at ${result.layer} layer.\n`;
  }
  const lines = [
    `Available slots for ${result.modifier}+* at ${result.layer} layer:`,
    `(${result.available.length} of ${ALL_KEYS.length} keys free)`,
    "",
  ];
  const groups: Array<[string, readonly string[]]> = [
    ["Letters", ALPHA_KEYS],
    ["Digits", DIGIT_KEYS],
    ["Punct", PUNCT_KEYS],
    ["Special", SPECIAL_KEYS],
  ];
  for (const [label, universe] of groups) {
    const available = result.available.filter((key) => universe.includes(key));
    if (available.length > 0) lines.push(`  ${`${label}:`.padEnd(9)} ${available.join(" ")}`);
  }
  if (result.reserved.length > 0) {
    lines.push("", "Free here, but well known elsewhere:");
    for (const reservation of result.reserved) {
      lines.push(`  ${reservation.key.padEnd(16)} ${reservation.owner}: ${reservation.action}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

export interface KeyOwner {
  layer: Layer;
  action: string;
  context: string;
  mode: string;
  passthrough: boolean;
  source: string;
  verdict: "wins" | "wins in context" | "shadowed" | "scoped" | "transparent";
}

export interface KeyExplanation {
  key: string;
  owners: KeyOwner[];
  reserved: Reservation[];
  verdict: string;
}

export function explainKey(bindings: readonly Binding[], keyInput: string): KeyExplanation {
  const parts = keyInput
    .split("+")
    .map((part) => part.trim())
    .filter((part) => part !== "");
  const base = (parts.pop() ?? "").toLowerCase();
  const combo = normalizeModifierCombo(parts.join("+"));
  const key = combo === "" ? base : `${combo}+${base}`;

  const matches = [...bindings.filter((binding) => binding.key === key)].sort(
    (left, right) => priorityIndex(left.layer) - priorityIndex(right.layer),
  );
  let winnerFound = false;
  const owners: KeyOwner[] = matches.map((binding) => {
    let verdict: KeyOwner["verdict"];
    if (binding.isLayerScoped) verdict = "scoped";
    else if (!binding.isInterception) verdict = "transparent";
    else if (winnerFound) verdict = "shadowed";
    else if (binding.context === "") {
      winnerFound = true;
      verdict = "wins";
    } else {
      // A conditional binding claims the key only inside its context, so the
      // layers beneath it still receive it everywhere else.
      verdict = "wins in context";
    }
    return {
      layer: binding.layer,
      action: binding.action,
      context: binding.context,
      mode: binding.mode,
      passthrough: binding.passthrough,
      source: binding.toRecord().source ?? "",
      verdict,
    };
  });

  const reserved = reservationsFor(key);
  const outright = distinct(owners.filter((owner) => owner.verdict === "wins").map((o) => o.layer));
  const conditional = distinct(
    owners.filter((owner) => owner.verdict === "wins in context").map((o) => o.layer),
  );
  let verdict: string;
  if (outright.length > 0) {
    verdict = `taken by ${outright.join(", ")}`;
  } else if (conditional.length > 0) {
    verdict = `taken by ${conditional.join(", ")}, but only in their listed contexts`;
  } else if (reserved.length > 0) {
    verdict = `free in your config, but ${reserved[0]?.owner} uses it`;
  } else {
    verdict = "free";
  }

  return { key, owners, reserved, verdict };
}

export function renderExplain(explanation: KeyExplanation): string {
  const lines = [explanation.key, ""];

  if (explanation.owners.length === 0) {
    lines.push("No binding in any layer.");
  } else {
    lines.push("Bindings, highest priority first:");
    for (const owner of explanation.owners) {
      const notes = [owner.context, owner.mode ? `[${owner.mode}]` : ""]
        .filter((note) => note !== "")
        .join(" ");
      lines.push(
        `  ${owner.layer.padEnd(10)} ${owner.action}${notes ? ` (${notes})` : ""}`,
        `  ${" ".repeat(10)} ${owner.verdict}${owner.source ? ` — ${owner.source}` : ""}`,
      );
    }
  }

  lines.push("");
  if (explanation.reserved.length > 0) {
    lines.push("Well known elsewhere:");
    for (const reservation of explanation.reserved) {
      lines.push(`  ${reservation.owner}: ${reservation.action}`);
    }
  } else {
    lines.push("Well known elsewhere: nothing on record.");
  }

  lines.push("", `Verdict: ${explanation.verdict}.`);
  return `${lines.join("\n")}\n`;
}
