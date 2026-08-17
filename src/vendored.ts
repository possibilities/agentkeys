// Fallback defaults for Herdr binaries that cannot expose --default-config.
// The live binary is the source of record; this 0.8.0 snapshot keeps older
// installations useful while making its age explicit in the source manifest.
// Chord spellings are verbatim from upstream, and normalize.ts owns turning
// them into canonical keys.

// From src/config/model.rs KeysConfig::default(). Fields whose default is
// unset are omitted; the parser still classifies them when a user sets one.
export const HERDR_VERSION = "0.8.0";

export const HERDR_DEFAULT_PREFIX = "ctrl+b";

export interface HerdrDefault {
  action: string;
  keys: readonly string[];
  // The action only listens inside this herdr mode, whatever key it wears.
  mode?: string;
  context?: string;
}

export const HERDR_DEFAULTS: readonly HerdrDefault[] = [
  { action: "help", keys: ["prefix+?"] },
  { action: "settings", keys: ["prefix+s"] },
  { action: "new_workspace", keys: ["prefix+shift+n"] },
  { action: "new_worktree", keys: ["prefix+shift+g"] },
  { action: "rename_workspace", keys: ["prefix+shift+w"] },
  { action: "close_workspace", keys: ["prefix+shift+d"] },
  { action: "workspace_picker", keys: ["prefix+w"] },
  { action: "goto", keys: ["prefix+g"] },
  { action: "navigate_workspace_up", keys: ["up"], mode: "navigate" },
  { action: "navigate_workspace_down", keys: ["down"], mode: "navigate" },
  { action: "navigate_pane_left", keys: ["h"], mode: "navigate" },
  { action: "navigate_pane_down", keys: ["j"], mode: "navigate" },
  { action: "navigate_pane_up", keys: ["k"], mode: "navigate" },
  { action: "navigate_pane_right", keys: ["l"], mode: "navigate" },
  { action: "detach", keys: ["prefix+q"] },
  { action: "reload_config", keys: ["prefix+shift+r"] },
  { action: "open_notification_target", keys: ["prefix+o"] },
  { action: "remote_image_paste", keys: ["ctrl+v"], context: "remote client only" },
  { action: "new_tab", keys: ["prefix+c"] },
  { action: "rename_tab", keys: ["prefix+shift+t"] },
  { action: "previous_tab", keys: ["prefix+p"] },
  { action: "next_tab", keys: ["prefix+n"] },
  { action: "switch_tab", keys: ["prefix+1..9"] },
  { action: "close_tab", keys: ["prefix+shift+x"] },
  { action: "rename_pane", keys: ["prefix+shift+p"] },
  { action: "edit_scrollback", keys: ["prefix+e"] },
  { action: "copy_mode", keys: ["prefix+["] },
  { action: "focus_pane_left", keys: ["prefix+h"] },
  { action: "focus_pane_down", keys: ["prefix+j"] },
  { action: "focus_pane_up", keys: ["prefix+k"] },
  { action: "focus_pane_right", keys: ["prefix+l"] },
  { action: "swap_pane_left", keys: ["prefix+shift+h"] },
  { action: "swap_pane_down", keys: ["prefix+shift+j"] },
  { action: "swap_pane_up", keys: ["prefix+shift+k"] },
  { action: "swap_pane_right", keys: ["prefix+shift+l"] },
  { action: "cycle_pane_next", keys: ["prefix+tab"] },
  { action: "cycle_pane_previous", keys: ["prefix+shift+tab"] },
  { action: "split_vertical", keys: ["prefix+v"] },
  { action: "split_horizontal", keys: ["prefix+minus"] },
  { action: "close_pane", keys: ["prefix+x"] },
  { action: "zoom", keys: ["prefix+z"] },
  { action: "resize_mode", keys: ["prefix+r"] },
  { action: "toggle_sidebar", keys: ["prefix+b"] },
];

// Actions that only listen inside a herdr mode keep that mode whatever key a
// user rebinds them to; everything here mirrors the field docs in model.rs.
export const HERDR_ACTION_MODES: Readonly<Record<string, string>> = {
  navigate_workspace_up: "navigate",
  navigate_workspace_down: "navigate",
  navigate_pane_left: "navigate",
  navigate_pane_down: "navigate",
  navigate_pane_up: "navigate",
  navigate_pane_right: "navigate",
  resize_pane_left: "resize",
  resize_pane_down: "resize",
  resize_pane_up: "resize",
  resize_pane_right: "resize",
};

export const HERDR_ACTION_CONTEXTS: Readonly<Record<string, string>> = {
  remote_image_paste: "remote client only",
};
