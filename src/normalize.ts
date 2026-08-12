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

// Every layer spells the same physical punctuation key its own way — Karabiner
// key_codes, Ghostty names, Neovim angle names — while tmux and Neovim also
// emit the bare symbol. The symbol is canonical; a spelling that escapes this
// table splits one key into two and hides a real conflict.
const PUNCTUATION_NAMES: Record<string, string> = {
  comma: ",",
  period: ".",
  hyphen: "-",
  minus: "-",
  equal_sign: "=",
  equal: "=",
  open_bracket: "[",
  left_bracket: "[",
  close_bracket: "]",
  right_bracket: "]",
  semicolon: ";",
  quote: "'",
  apostrophe: "'",
  slash: "/",
  backslash: "\\",
  bslash: "\\",
  grave_accent_and_tilde: "`",
  grave_accent: "`",
  backquote: "`",
  bracketleft: "[",
  bracketright: "]",
  underscore: "_",
  bar: "|",
  lt: "<",
};

// skhd has no names for punctuation keys; configs reach them through macOS
// virtual keycodes (kVK_ANSI_*), already lowercased by the caller.
const SKHD_KEYCODES: Record<string, string> = {
  "0x18": "=",
  "0x1b": "-",
  "0x1e": "]",
  "0x21": "[",
  "0x27": "'",
  "0x29": ";",
  "0x2a": "\\",
  "0x2b": ",",
  "0x2c": "/",
  "0x2f": ".",
  "0x32": "`",
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

const TMUX_KEYS: Record<string, string> = {
  enter: "return",
  bspace: "backspace",
  space: "space",
  tab: "tab",
  escape: "escape",
  up: "up",
  down: "down",
  left: "left",
  right: "right",
  ppage: "pageup",
  npage: "pagedown",
  pageup: "pageup",
  pagedown: "pagedown",
  home: "home",
  end: "end",
  ic: "insert",
  dc: "delete",
};

// tmux reports pointer input through the same binding table as keys. Nothing
// downstream can shadow a mouse event, so these never become bindings.
const TMUX_POINTER = /^(mouse|wheel|(double|triple|second)click)/i;

const GHOSTTY_MODS: Record<string, string> = {
  super: "cmd",
  cmd: "cmd",
  command: "cmd",
  ctrl: "ctrl",
  control: "ctrl",
  alt: "alt",
  opt: "alt",
  option: "alt",
  shift: "shift",
};

const GHOSTTY_KEYS: Record<string, string> = {
  arrow_up: "up",
  arrow_down: "down",
  arrow_left: "left",
  arrow_right: "right",
  page_up: "pageup",
  page_down: "pagedown",
  enter: "return",
  backspace: "backspace",
  escape: "escape",
  tab: "tab",
  space: "space",
  delete: "delete",
  insert: "insert",
  home: "home",
  end: "end",
  // Ghostty folds the plus spelling to the physical `=` key; that shift-level
  // collapse is Ghostty's own convention, so it stays out of the shared table.
  plus: "=",
  "+": "=",
};

// Ghostty qualifies a trigger with flags that change when or how it fires,
// never which chord it is.
const GHOSTTY_TRIGGER_PREFIXES = ["global:", "all:", "performable:", "unconsumed:", "physical:"];

export function normalizeModifiers(mods: readonly string[]): string[] {
  const seen = new Set(mods.map((mod) => mod.toLowerCase()).filter((mod) => mod !== ""));
  const ordered = MODIFIER_ORDER.filter((mod) => seen.has(mod));
  const extras = [...seen].filter((mod) => !MODIFIER_ORDER.includes(mod as Modifier));
  return [...ordered, ...extras];
}

export function buildKey(modifiers: readonly string[], base: string, prefix = ""): string {
  const parts: string[] = [];
  if (prefix !== "") parts.push(prefix.toLowerCase());
  parts.push(...normalizeModifiers(modifiers));
  parts.push(base.toLowerCase());
  return parts.join("+");
}

function normalizePlainNvimSegment(segment: string): string {
  if (/^[A-Z]$/.test(segment)) return buildKey(["shift"], segment.toLowerCase());
  return segment.toLowerCase();
}

// What a person types on the command line, in any of the spellings the five
// layers have taught them.
const USER_MODS: Record<string, string> = {
  ...SKHD_MODS,
  super: "cmd",
  meta: "cmd",
  opt: "alt",
  m: "alt",
  c: "ctrl",
  s: "shift",
};

export function normalizeModifierCombo(input: string): string {
  const parts = input
    .split("+")
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part !== "")
    .map((part) => USER_MODS[part] ?? part);
  return normalizeModifiers(parts).join("+");
}

// The canonical spelling for a base key a user types, or that any layer's
// table has no opinion on: fold the punctuation aliases, keep the rest.
export function normalizeBaseKey(base: string): string {
  const lower = base.toLowerCase();
  return PUNCTUATION_NAMES[lower] ?? lower;
}

export function normalizeKarabinerKey(keyCode: string): string {
  const lower = keyCode.toLowerCase();
  return KARABINER_KEYS[lower] ?? PUNCTUATION_NAMES[lower] ?? lower;
}

export function normalizeSkhdKey(key: string): string {
  const lower = key.toLowerCase();
  return SKHD_KEYCODES[lower] ?? PUNCTUATION_NAMES[lower] ?? lower;
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
  const base =
    NVIM_KEYS[inner.toLowerCase()] ?? PUNCTUATION_NAMES[inner.toLowerCase()] ?? inner.toLowerCase();
  return buildKey(mods, base);
}

// tmux writes `M-S-H`, `C-Space`, `^A`, and `M-'\'` for the same class of thing
// the other layers spell three other ways. Returns undefined for pointer input.
export function normalizeTmuxKey(raw: string): string | undefined {
  let inner = raw.trim();
  if (
    (inner.startsWith("'") && inner.endsWith("'") && inner.length > 1) ||
    (inner.startsWith('"') && inner.endsWith('"') && inner.length > 1)
  ) {
    inner = inner.slice(1, -1);
  }
  if (inner === "") return undefined;
  if (TMUX_POINTER.test(inner)) return undefined;

  const mods: string[] = [];
  while (inner.length > 2) {
    const flag = inner.slice(0, 2).toUpperCase();
    if (flag === "C-") mods.push("ctrl");
    else if (flag === "M-") mods.push("alt");
    else if (flag === "S-") mods.push("shift");
    else break;
    inner = inner.slice(2);
  }
  // `^A` is the caret spelling of Ctrl+A, where the uppercase letter is only
  // convention — unlike `M-H`, which really does carry shift.
  let caret = false;
  if (inner.length > 1 && inner.startsWith("^")) {
    mods.push("ctrl");
    inner = inner.slice(1);
    caret = true;
  }

  if (!caret && /^[A-Z]$/.test(inner)) {
    mods.push("shift");
    inner = inner.toLowerCase();
  }
  const base = TMUX_KEYS[inner.toLowerCase()] ?? inner.toLowerCase();
  return buildKey(mods, base);
}

// Ghostty triggers arrive identically from the config file and from
// `ghostty +list-keybinds`, so one normalizer serves both sources.
export function normalizeGhosttyKey(trigger: string): string | undefined {
  let inner = trigger.trim();
  for (;;) {
    const prefix = GHOSTTY_TRIGGER_PREFIXES.find((candidate) =>
      inner.toLowerCase().startsWith(candidate),
    );
    if (prefix === undefined) break;
    inner = inner.slice(prefix.length);
  }
  if (inner === "") return undefined;

  // A chord sequence is Ghostty's own prefix table: only its first chord is
  // ever seen by another layer, so the whole sequence is local to Ghostty.
  if (inner.includes(">")) {
    const chords = inner
      .split(">")
      .map((chord) => normalizeGhosttyKey(chord))
      .filter((chord): chord is string => chord !== undefined);
    return chords.length > 0 ? chords.join(">") : undefined;
  }

  const parts = inner.split("+");
  let base = parts.pop() ?? "";
  if (base === "") {
    // Ghostty writes the plus key as a trailing `+`, so `super++` is cmd and
    // the plus key, not a chord with an empty base.
    if (parts.length === 0) return undefined;
    base = "+";
    if (parts[parts.length - 1] === "") parts.pop();
  }
  const mods = parts.map((part) => GHOSTTY_MODS[part.toLowerCase()] ?? part);
  return buildKey(mods, GHOSTTY_KEYS[base.toLowerCase()] ?? normalizeBaseKey(base));
}

const HERDR_KEYS: Record<string, string> = {
  esc: "escape",
  enter: "return",
};

// herdr labels are lowercase chords ("ctrl+b", "prefix+shift+n", "f12"). A
// leading `prefix+` survives normalization verbatim: it is the layer-scope
// marker the model already understands.
export function normalizeHerdrKey(label: string): string | undefined {
  const trimmed = label.trim().toLowerCase();
  if (trimmed === "") return undefined;
  const scoped = trimmed.startsWith("prefix+");
  const body = scoped ? trimmed.slice("prefix+".length) : trimmed;
  const parts = body
    .split("+")
    .map((part) => part.trim())
    .filter((part) => part !== "");
  // `prefix+` ended the label: the plus key itself, as in tmux's trailing +.
  if (parts.length === 0) parts.push("+");
  const base = parts.pop() ?? "";
  const mods = parts.map((part) => USER_MODS[part] ?? part);
  const key = buildKey(mods, HERDR_KEYS[base] ?? normalizeBaseKey(base));
  return scoped ? `prefix+${key}` : key;
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
