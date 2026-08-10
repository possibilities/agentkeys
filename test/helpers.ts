import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const temporaryRoots: string[] = [];

// Every suite builds a fixture tree per case, and nothing reclaimed them: a
// thousand directories had accumulated in TMPDIR. The install suite's fork
// checkouts are the expensive ones, since each runs a frozen `bun install`
// and leaves ~85M behind. Using the helper is what earns cleanup, so a new
// suite gets it without remembering to write its own teardown.
export function makeTempDir(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryRoots.push(directory);
  return directory;
}

// Each suite registers this itself. This module is evaluated once and shared,
// so an afterAll in here would bind to whichever suite imported it first and
// abandon every later suite's directories; Bun's runner does not emit a
// process "exit" event to fall back on either.
export function removeTempDirs(): void {
  for (const directory of temporaryRoots.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
}

export function fixturePath(root: string, relative: string): string {
  return join(root, relative);
}

export function writeFixture(root: string, relative: string, content: string): string {
  const path = fixturePath(root, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return path;
}

export function writeDefaultConfigs(root: string): {
  karabiner: string;
  skhd: string;
  nvimInit: string;
  nvimPlugins: string;
} {
  const karabiner = writeFixture(
    root,
    ".config/karabiner/karabiner.json",
    JSON.stringify({
      profiles: [
        {
          complex_modifications: {
            rules: [
              {
                description: "Move focus",
                manipulators: [
                  {
                    from: {
                      key_code: "h",
                      modifiers: { mandatory: ["left_command", "shift"] },
                    },
                    to: [{ shell_command: "yabai -m window --focus west" }],
                  },
                  {
                    from: {
                      key_code: "j",
                      modifiers: { mandatory: ["command"] },
                    },
                    conditions: [
                      {
                        type: "frontmost_application_if",
                        bundle_identifiers: ["^com.apple.Terminal$"],
                      },
                    ],
                    to: [{ key_code: "down_arrow" }],
                  },
                ],
              },
            ],
          },
        },
      ],
    }),
  );
  const skhd = writeFixture(
    root,
    ".config/skhd/skhdrc",
    "cmd + shift - h : skhd focus west\nalt - x : echo one \\\n  && echo two\n",
  );
  const nvimInit = writeFixture(
    root,
    ".config/nvim/init.lua",
    "vim.keymap.set('n', '<Leader>h', ':help<CR>', { desc = 'Help' })\nvim.keymap.set('n', '<D-S-h>', ':cmd<CR>')\n",
  );
  const nvimPlugins = fixturePath(root, ".config/nvim/lua/plugins");
  return { karabiner, skhd, nvimInit, nvimPlugins };
}

export async function runCli(
  args: readonly string[],
  env: Record<string, string> = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["bun", fixturePath(import.meta.dir, "../src/cli.ts"), ...args], {
    cwd: "/tmp",
    // Empty binary paths keep the Ghostty probe and the orca/herdr presence
    // checks from reaching the real installed apps, and an empty
    // XDG_CONFIG_HOME keeps herdr discovery inside the fixture HOME, so a
    // fixture HOME describes the whole inventory. They must land after the
    // process env, or real values in the parent environment would silently
    // re-enable the probes.
    env: {
      ...process.env,
      AGENTKEYS_GHOSTTY_BIN: "",
      AGENTKEYS_ORCA_BIN: "",
      AGENTKEYS_HERDR_BIN: "",
      XDG_CONFIG_HOME: "",
      ...env,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}
