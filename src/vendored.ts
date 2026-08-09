// Vendored defaults for layers whose binaries expose no dump command
// (docs/adr/0007). Transcribed by hand from the upstream sources named per
// table; chord spellings are verbatim from upstream, and normalize.ts owns
// turning them into canonical keys. Refresh by re-reading the source when
// the version stamp falls behind the installed binary.

// From src/shared/keybindings.ts KEYBINDING_DEFINITIONS, darwin column.
// Actions whose darwin default is empty are omitted: nothing to intercept.
export const ORCA_VERSION = "1.4.177-rc.0";

// Orca's scope decides whether a chord competes across layers: global, tabs,
// and terminal chords fire while a terminal pane has focus (the default
// terminalShortcutPolicy is orca-first), so they intercept above whatever
// the pane hosts. The remaining scopes only fire in Orca's own non-terminal
// panes and are layer-scoped.
export type OrcaScope =
  | "global"
  | "tabs"
  | "terminal"
  | "editor"
  | "browser"
  | "fileExplorer"
  | "settings";

export interface OrcaDefault {
  action: string;
  scope: OrcaScope;
  keys: readonly string[];
  // A representative chord whose digit stands for the whole 1-9 row.
  digitRange?: boolean;
}

export const ORCA_DEFAULTS: readonly OrcaDefault[] = [
  { action: "worktree.quickOpen", scope: "global", keys: ["Mod+P"] },
  { action: "app.settings", scope: "global", keys: ["Mod+Comma"] },
  { action: "app.forceReload", scope: "global", keys: ["Mod+Shift+R"] },
  { action: "worktree.palette", scope: "global", keys: ["Mod+J"] },
  { action: "worktree.navigateUp", scope: "global", keys: ["Mod+Shift+ArrowUp"] },
  { action: "worktree.navigateDown", scope: "global", keys: ["Mod+Shift+ArrowDown"] },
  { action: "workspace.create", scope: "global", keys: ["Mod+N", "Mod+Shift+N"] },
  { action: "workspace.rename", scope: "global", keys: ["Mod+Alt+R"] },
  { action: "workspace.selectByIndex", scope: "global", keys: ["Mod+1"], digitRange: true },
  { action: "voice.dictation", scope: "global", keys: ["Mod+E"] },
  { action: "sidebar.left.toggle", scope: "global", keys: ["Mod+B"] },
  { action: "sidebar.right.toggle", scope: "global", keys: ["Mod+L"] },
  { action: "sidebar.explorer.toggle", scope: "global", keys: ["Mod+Shift+E"] },
  { action: "sidebar.search.toggle", scope: "global", keys: ["Mod+Shift+F"] },
  { action: "sidebar.sourceControl.toggle", scope: "global", keys: ["Mod+Shift+G"] },
  { action: "sidebar.ports.toggle", scope: "global", keys: ["Mod+Shift+I"] },
  { action: "sidebar.focusWorktreeList", scope: "global", keys: ["Mod+Shift+0"] },
  { action: "floatingTerminal.toggle", scope: "global", keys: ["Mod+Alt+A"] },
  { action: "floatingWorkspace.maximize", scope: "global", keys: ["Mod+Alt+Shift+A"] },
  { action: "zoom.in", scope: "global", keys: ["Mod+Equal", "Mod+Shift+Plus", "Mod+NumpadAdd"] },
  { action: "zoom.out", scope: "global", keys: ["Mod+Minus", "Mod+NumpadSubtract"] },
  { action: "zoom.reset", scope: "global", keys: ["Mod+0"] },
  { action: "worktree.history.back", scope: "global", keys: ["Mod+Alt+ArrowLeft"] },
  { action: "worktree.history.forward", scope: "global", keys: ["Mod+Alt+ArrowRight"] },
  { action: "tab.newTerminal", scope: "tabs", keys: ["Mod+T"] },
  { action: "tab.newAgent", scope: "tabs", keys: ["Mod+Alt+T"] },
  { action: "tab.newBrowser", scope: "tabs", keys: ["Mod+Shift+B"] },
  { action: "tab.newSimulator", scope: "tabs", keys: ["Mod+Alt+Shift+E"] },
  { action: "tab.newMarkdown", scope: "tabs", keys: ["Mod+Shift+M"] },
  { action: "tab.openMarkdown", scope: "tabs", keys: ["Mod+Shift+O"] },
  { action: "tab.close", scope: "tabs", keys: ["Mod+W"] },
  { action: "tab.closeAll", scope: "tabs", keys: ["Mod+Alt+W"] },
  { action: "tab.rename", scope: "tabs", keys: ["Mod+R"] },
  { action: "tab.reopenClosed", scope: "tabs", keys: ["Mod+Shift+T"] },
  { action: "tab.nextSameType", scope: "tabs", keys: ["Mod+Alt+BracketRight"] },
  { action: "tab.previousSameType", scope: "tabs", keys: ["Mod+Alt+BracketLeft"] },
  { action: "tab.nextAllTypes", scope: "tabs", keys: ["Mod+Shift+BracketRight"] },
  { action: "tab.previousAllTypes", scope: "tabs", keys: ["Mod+Shift+BracketLeft"] },
  { action: "tab.previousRecent", scope: "tabs", keys: ["Ctrl+Tab"] },
  { action: "tab.nextTerminal", scope: "tabs", keys: ["Ctrl+PageDown"] },
  { action: "tab.previousTerminal", scope: "tabs", keys: ["Ctrl+PageUp"] },
  { action: "tab.selectByIndex", scope: "tabs", keys: ["Ctrl+1"], digitRange: true },
  { action: "terminal.copySelection", scope: "terminal", keys: ["Mod+Shift+C"] },
  { action: "terminal.paste", scope: "terminal", keys: ["Mod+V"] },
  { action: "terminal.search", scope: "terminal", keys: ["Mod+F"] },
  { action: "terminal.clear", scope: "terminal", keys: ["Mod+K"] },
  { action: "terminal.focusNextPane", scope: "terminal", keys: ["Mod+BracketRight"] },
  { action: "terminal.focusPreviousPane", scope: "terminal", keys: ["Mod+BracketLeft"] },
  { action: "terminal.expandPane", scope: "terminal", keys: ["Mod+Shift+Enter"] },
  { action: "terminal.closePane", scope: "terminal", keys: ["Mod+W"] },
  { action: "terminal.splitRight", scope: "terminal", keys: ["Mod+D"] },
  { action: "terminal.splitDown", scope: "terminal", keys: ["Mod+Shift+D"] },
  { action: "browser.find", scope: "browser", keys: ["Mod+F"] },
  { action: "browser.back", scope: "browser", keys: ["Mod+BracketLeft"] },
  { action: "browser.forward", scope: "browser", keys: ["Mod+BracketRight"] },
  { action: "browser.reload", scope: "browser", keys: ["Mod+R"] },
  { action: "browser.hardReload", scope: "browser", keys: ["Mod+Shift+R"] },
  { action: "browser.focusAddressBar", scope: "browser", keys: ["Mod+L"] },
  { action: "browser.grabElement", scope: "browser", keys: ["Mod+C"] },
  { action: "editor.find", scope: "editor", keys: ["Mod+F"] },
  { action: "editor.replace", scope: "editor", keys: ["Mod+Alt+F"] },
  { action: "editor.save", scope: "editor", keys: ["Mod+S"] },
  { action: "editor.markdownPreview", scope: "editor", keys: ["Mod+Shift+V"] },
  { action: "editor.toggleWordWrap", scope: "editor", keys: ["Alt+Z"] },
  { action: "editor.copyContext", scope: "editor", keys: ["Mod+Alt+C"] },
  { action: "editor.previousChange", scope: "editor", keys: ["Shift+F7"] },
  { action: "editor.nextChange", scope: "editor", keys: ["F7"] },
  { action: "editor.addReviewNote", scope: "editor", keys: ["Mod+Shift+A"] },
  { action: "fileExplorer.undo", scope: "fileExplorer", keys: ["Mod+Z"] },
  { action: "fileExplorer.redo", scope: "fileExplorer", keys: ["Mod+Shift+Z"] },
  { action: "fileExplorer.copyPath", scope: "fileExplorer", keys: ["Mod+Alt+C"] },
  { action: "fileExplorer.copyRelativePath", scope: "fileExplorer", keys: ["Mod+Alt+Shift+C"] },
  { action: "fileExplorer.delete", scope: "fileExplorer", keys: ["Mod+Backspace", "Delete"] },
  { action: "settings.search", scope: "settings", keys: ["Mod+F"] },
];

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
