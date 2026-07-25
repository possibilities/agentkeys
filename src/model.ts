export const LAYERS = ["karabiner", "skhd", "nvim"] as const;
export type Layer = (typeof LAYERS)[number];

export interface BindingInit {
  layer: Layer;
  key: string;
  action: string;
  mode?: string;
  context?: string;
  sourceFile?: string;
  sourceLine?: number;
}

export interface BindingRecord {
  layer: Layer;
  key: string;
  action: string;
  mode?: string;
  context?: string;
  source?: string;
}

export class Binding {
  readonly layer: Layer;
  readonly key: string;
  readonly action: string;
  readonly mode: string;
  readonly context: string;
  readonly sourceFile: string;
  readonly sourceLine: number;

  constructor(init: BindingInit) {
    this.layer = init.layer;
    this.key = init.key;
    this.action = init.action;
    this.mode = init.mode ?? "";
    this.context = init.context ?? "";
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

  get isLayerScoped(): boolean {
    return (
      this.key.startsWith("prefix+") ||
      this.key.startsWith("space+") ||
      this.key.startsWith("leader+")
    );
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
