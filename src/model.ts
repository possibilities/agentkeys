// Interception order: a keystroke reaches Karabiner's virtual HID driver first,
// then the skhd hotkey daemon, then the terminal app, then tmux inside it, then
// the editor inside that. Whatever a higher layer claims never arrives below.
export const LAYERS = ["karabiner", "skhd", "ghostty", "tmux", "nvim"] as const;
export type Layer = (typeof LAYERS)[number];

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
      record.source = this.sourceLine
        ? `${this.sourceFile}:${this.sourceLine}`
        : this.sourceFile;
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
    return (
      this.scoped ||
      SCOPE_PREFIXES.some((prefix) => this.key.startsWith(prefix))
    );
  }

  // Only a binding that consumes the key hides one below it. A layer that
  // forwards the keystroke onward — skhd's `* ~`, Ghostty's `text:` — is
  // transparent to everything downstream.
  get isInterception(): boolean {
    return !this.passthrough;
  }
}

export function bindingsToRecords(
  bindings: readonly Binding[],
): BindingRecord[] {
  return bindings.map((binding) => binding.toRecord());
}

export function isLayer(value: string): value is Layer {
  return LAYERS.includes(value as Layer);
}

export function priorityIndex(layer: Layer): number {
  return LAYERS.indexOf(layer);
}
