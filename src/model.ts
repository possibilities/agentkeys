// Interception order: a keystroke reaches Karabiner's virtual HID driver
// first, then the skhd hotkey daemon, then whichever app holds focus, then
// whatever that app hosts. The array is a topological order over the hosting
// paths below; priority questions go through intercepts(), because array
// position alone cannot say that tmux and herdr never see the same keystroke.
export const LAYERS = ["karabiner", "skhd", "ghostty", "tmux", "herdr", "nvim"] as const;
export type Layer = (typeof LAYERS)[number];

// Who hands keystrokes to whom: tmux and herdr run inside Ghostty, never
// inside each other; Neovim runs bare in Ghostty or inside tmux or herdr. A
// layer's bindings can only steal from layers it transitively hosts — sibling
// layers tmux and herdr share no hosting path, so neither can shadow the other.
const HOSTS: Record<Layer, readonly Layer[]> = {
  karabiner: [],
  skhd: ["karabiner"],
  ghostty: ["skhd"],
  tmux: ["ghostty"],
  herdr: ["ghostty"],
  nvim: ["ghostty", "tmux", "herdr"],
};

const ANCESTORS: ReadonlyMap<Layer, ReadonlySet<Layer>> = (() => {
  const map = new Map<Layer, Set<Layer>>();
  const resolve = (layer: Layer): Set<Layer> => {
    const cached = map.get(layer);
    if (cached) return cached;
    const ancestors = new Set<Layer>();
    map.set(layer, ancestors);
    for (const host of HOSTS[layer]) {
      ancestors.add(host);
      for (const above of resolve(host)) ancestors.add(above);
    }
    return ancestors;
  };
  for (const layer of LAYERS) resolve(layer);
  return map;
})();

// Whether a binding at `higher` can take the keystroke before `lower` sees it.
export function intercepts(higher: Layer, lower: Layer): boolean {
  return ANCESTORS.get(lower)?.has(higher) ?? false;
}

export function interceptorsOf(layer: Layer): Layer[] {
  return LAYERS.filter((candidate) => intercepts(candidate, layer));
}

export interface BindingInit {
  layer: Layer;
  key: string;
  action: string;
  mode?: string;
  context?: string;
  passthrough?: boolean;
  scoped?: boolean;
  sourceFile?: string;
  sourceLine?: number;
}

export interface BindingRecord {
  layer: Layer;
  key: string;
  action: string;
  mode?: string;
  context?: string;
  passthrough?: boolean;
  source?: string;
}

// Same-layer precedence is not a Shadow: the displaced default never becomes
// a live Binding and therefore cannot intercept or block an available slot.
export interface Displacement {
  layer: Layer;
  key: string;
  action: string;
  source: string;
  displacedBy: {
    action: string;
    source: string;
    field: string;
  };
}

const SCOPE_PREFIXES = ["prefix+", "space+", "leader+"];

export class Binding {
  readonly layer: Layer;
  readonly key: string;
  readonly action: string;
  readonly mode: string;
  readonly context: string;
  readonly passthrough: boolean;
  readonly sourceFile: string;
  readonly sourceLine: number;
  private readonly scoped: boolean;

  constructor(init: BindingInit) {
    this.layer = init.layer;
    this.key = init.key;
    this.action = init.action;
    this.mode = init.mode ?? "";
    this.context = init.context ?? "";
    this.passthrough = init.passthrough ?? false;
    this.scoped = init.scoped ?? false;
    this.sourceFile = init.sourceFile ?? "";
    this.sourceLine = init.sourceLine ?? 0;
  }

  toRecord(): BindingRecord {
    const record: BindingRecord = {
      layer: this.layer,
      key: this.key,
      action: this.action,
    };
    if (this.mode !== "") record.mode = this.mode;
    if (this.context !== "") record.context = this.context;
    if (this.passthrough) record.passthrough = true;
    if (this.sourceFile !== "") {
      record.source = this.sourceLine ? `${this.sourceFile}:${this.sourceLine}` : this.sourceFile;
    }
    return record;
  }

  get modifierCombo(): string {
    const parts = this.key.split("+");
    if (parts.length <= 1) return "";
    return parts.slice(0, -1).join("+");
  }

  get baseKey(): string {
    const parts = this.key.split("+");
    return parts[parts.length - 1] ?? "";
  }

  // A key only a layer's own users can press — behind that layer's prefix, or
  // live only in one of its modes — so it cannot collide across layers. Some
  // parsers know this outright; the rest declare it by naming the prefix.
  get isLayerScoped(): boolean {
    return this.scoped || SCOPE_PREFIXES.some((prefix) => this.key.startsWith(prefix));
  }

  // Only a binding that consumes the key hides one below it. A layer that
  // forwards the keystroke onward — skhd's `* ~`, Ghostty's `text:` — is
  // transparent to everything downstream.
  get isInterception(): boolean {
    return !this.passthrough;
  }
}

export function bindingsToRecords(bindings: readonly Binding[]): BindingRecord[] {
  return bindings.map((binding) => binding.toRecord());
}

export function isLayer(value: string): value is Layer {
  return LAYERS.includes(value as Layer);
}

export function priorityIndex(layer: Layer): number {
  return LAYERS.indexOf(layer);
}
