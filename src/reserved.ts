// Shortcuts owned by software that keeps no config file agentkeys can read:
// macOS itself, the app a user is most likely inside, the shell's line editor.
// None of them shadow a binding in the layer sense — they lose to Karabiner and
// skhd, and most apply only while one app is focused — but binding over one
// still costs the user something they already know. Advisory, never a conflict.
export interface Reservation {
  key: string;
  owner: string;
  action: string;
}

export const RESERVATIONS: readonly Reservation[] = [
  // macOS, system-wide.
  {
    key: "cmd+space",
    owner: "macOS",
    action: "Spotlight (commonly remapped to a launcher)",
  },
  {
    key: "alt+space",
    owner: "Raycast",
    action: "Default launcher hotkey on a Spotlight-remapped machine",
  },
  { key: "cmd+tab", owner: "macOS", action: "Application switcher" },
  {
    key: "cmd+shift+tab",
    owner: "macOS",
    action: "Application switcher, backwards",
  },
  { key: "cmd+alt+escape", owner: "macOS", action: "Force Quit" },
  { key: "ctrl+cmd+q", owner: "macOS", action: "Lock screen" },
  { key: "ctrl+cmd+f", owner: "macOS", action: "Toggle full screen" },
  { key: "cmd+shift+3", owner: "macOS", action: "Screenshot the screen" },
  { key: "cmd+shift+4", owner: "macOS", action: "Screenshot a selection" },
  {
    key: "cmd+shift+5",
    owner: "macOS",
    action: "Screenshot and recording tools",
  },
  { key: "cmd+shift+/", owner: "macOS", action: "Search the Help menu" },
  { key: "ctrl+up", owner: "macOS", action: "Mission Control" },
  { key: "ctrl+down", owner: "macOS", action: "Application windows" },
  { key: "ctrl+left", owner: "macOS", action: "Previous Space" },
  { key: "ctrl+right", owner: "macOS", action: "Next Space" },

  // The menu-bar shortcuts nearly every macOS app inherits.
  { key: "cmd+q", owner: "macOS app menu", action: "Quit" },
  { key: "cmd+w", owner: "macOS app menu", action: "Close window" },
  { key: "cmd+h", owner: "macOS app menu", action: "Hide application" },
  { key: "cmd+m", owner: "macOS app menu", action: "Minimize" },
  { key: "cmd+n", owner: "macOS app menu", action: "New" },
  { key: "cmd+o", owner: "macOS app menu", action: "Open" },
  { key: "cmd+s", owner: "macOS app menu", action: "Save" },
  { key: "cmd+p", owner: "macOS app menu", action: "Print" },
  { key: "cmd+f", owner: "macOS app menu", action: "Find" },
  { key: "cmd+z", owner: "macOS app menu", action: "Undo" },
  { key: "cmd+shift+z", owner: "macOS app menu", action: "Redo" },
  { key: "cmd+x", owner: "macOS app menu", action: "Cut" },
  { key: "cmd+c", owner: "macOS app menu", action: "Copy" },
  { key: "cmd+v", owner: "macOS app menu", action: "Paste" },
  { key: "cmd+a", owner: "macOS app menu", action: "Select all" },
  { key: "cmd+,", owner: "macOS app menu", action: "Settings" },

  // Browsers, where a terminal-focused binding is most likely to surprise.
  { key: "cmd+l", owner: "browser", action: "Focus the address bar" },
  { key: "cmd+t", owner: "browser", action: "New tab" },
  { key: "cmd+shift+t", owner: "browser", action: "Reopen closed tab" },
  { key: "cmd+r", owner: "browser", action: "Reload" },
  { key: "cmd+shift+n", owner: "browser", action: "New private window" },
  { key: "cmd+[", owner: "browser", action: "Back" },
  { key: "cmd+]", owner: "browser", action: "Forward" },
  { key: "ctrl+tab", owner: "browser", action: "Next tab" },

  // Readline and the terminal line discipline: bound inside every shell,
  // every REPL, and most TUI prompts.
  { key: "ctrl+a", owner: "shell (readline)", action: "Beginning of line" },
  { key: "ctrl+e", owner: "shell (readline)", action: "End of line" },
  { key: "ctrl+k", owner: "shell (readline)", action: "Kill to end of line" },
  { key: "ctrl+u", owner: "shell (readline)", action: "Kill to start of line" },
  {
    key: "ctrl+w",
    owner: "shell (readline)",
    action: "Kill the previous word",
  },
  {
    key: "ctrl+r",
    owner: "shell (readline)",
    action: "Reverse history search",
  },
  { key: "ctrl+l", owner: "shell (readline)", action: "Clear the screen" },
  { key: "ctrl+c", owner: "terminal", action: "Interrupt (SIGINT)" },
  { key: "ctrl+d", owner: "terminal", action: "End of input" },
  { key: "ctrl+z", owner: "terminal", action: "Suspend (SIGTSTP)" },
  { key: "ctrl+s", owner: "terminal", action: "Stop output (flow control)" },
  { key: "ctrl+q", owner: "terminal", action: "Resume output (flow control)" },
];

export function reservationsFor(key: string): Reservation[] {
  return RESERVATIONS.filter((reservation) => reservation.key === key);
}
