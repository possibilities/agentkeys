const MODIFIER_ORDER = ["ctrl", "alt", "cmd", "shift"] as const;
export type Modifier = (typeof MODIFIER_ORDER)[number];

const KARABINER_MODS: Record<string, string> = {
  command: "cmd",
  left_command: "cmd",
  right_command: "cmd",
  control: "ctrl",
  left_control: "ctrl",
  right_control: "ctrl",
  option: "alt",
  left_option: "alt",
  right_option: "alt",
  shift: "shift",
  left_shift: "shift",
  right_shift: "shift",
};

const KARABINER_KEYS: Record<string, string> = {
  left_arrow: "left",
  right_arrow: "right",
  up_arrow: "up",
  down_arrow: "down",
  return_or_enter: "return",
  spacebar: "space",
  delete_or_backspace: "backspace",
  delete_forward: "delete",
  escape: "escape",
  tab: "tab",
};

const SKHD_MODS: Record<string, string> = {
  cmd: "cmd",
  command: "cmd",
  shift: "shift",
  alt: "alt",
  option: "alt",
  ctrl: "ctrl",
  control: "ctrl",
};

const NVIM_KEYS: Record<string, string> = {
  cr: "return",
  enter: "return",
  esc: "escape",
  bs: "backspace",
  space: "space",
  tab: "tab",
};

export function normalizeModifiers(mods: readonly string[]): string[] {
  const seen = new Set(mods.map((mod) => mod.toLowerCase()));
  const ordered = MODIFIER_ORDER.filter((mod) => seen.has(mod));
  const extras = [...seen].filter(
    (mod) => !MODIFIER_ORDER.includes(mod as Modifier),
  );
  return [...ordered, ...extras];
}

export function buildKey(
  modifiers: readonly string[],
  base: string,
  prefix = "",
): string {
  const parts: string[] = [];
  if (prefix !== "") parts.push(prefix.toLowerCase());
  parts.push(...normalizeModifiers(modifiers));
  parts.push(base.toLowerCase());
  return parts.join("+");
}

function normalizePlainNvimSegment(segment: string): string {
  if (/^[A-Z]$/.test(segment))
    return buildKey(["shift"], segment.toLowerCase());
  return segment.toLowerCase();
}

export function normalizeModifierCombo(input: string): string {
  const parts = input
    .split("+")
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part !== "")
    .map((part) => SKHD_MODS[part] ?? part);
  return normalizeModifiers(parts).join("+");
}

export function normalizeKarabinerKey(keyCode: string): string {
  const lower = keyCode.toLowerCase();
  return KARABINER_KEYS[lower] ?? lower;
}

export function normalizeKarabinerMods(mods: readonly string[]): string[] {
  return mods.map((mod) => KARABINER_MODS[mod] ?? mod.toLowerCase());
}

export function normalizeSkhdMods(modString: string): string[] {
  return modString
    .split("+")
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part !== "")
    .map((part) => SKHD_MODS[part] ?? part);
}

function normalizeAngleKey(innerInput: string): string {
  let inner = innerInput;
  const mods: string[] = [];
  while (true) {
    const upper = inner.toUpperCase();
    if (upper.startsWith("C-")) {
      mods.push("ctrl");
      inner = inner.slice(2);
    } else if (upper.startsWith("M-") || upper.startsWith("A-")) {
      mods.push("alt");
      inner = inner.slice(2);
    } else if (upper.startsWith("D-")) {
      mods.push("cmd");
      inner = inner.slice(2);
    } else if (upper.startsWith("S-")) {
      mods.push("shift");
      inner = inner.slice(2);
    } else {
      break;
    }
  }

  if (inner.toLowerCase() === "leader") return "space";
  const base = NVIM_KEYS[inner.toLowerCase()] ?? inner.toLowerCase();
  return buildKey(mods, base);
}

export function normalizeNvimKey(lhs: string): string {
  const leaderMatch = lhs.match(/^<leader>(.*)$/i);
  if (leaderMatch) {
    const rest = leaderMatch[1] ?? "";
    if (rest === "") return "space";
    if (/^[A-Z]$/.test(rest)) return `space+shift+${rest.toLowerCase()}`;
    return `space+${rest.toLowerCase()}`;
  }

  const angleMatch = lhs.match(/^<([^>]+)>$/);
  if (angleMatch) return normalizeAngleKey(angleMatch[1] ?? "");

  return normalizePlainNvimSegment(lhs);
}
