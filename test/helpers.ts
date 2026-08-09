import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

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
    // An empty binary path keeps the Ghostty probe from reaching the real
    // installed app, so a fixture HOME describes the whole inventory. It
    // must land after the process env, or a real AGENTKEYS_GHOSTTY_BIN in
    // the parent environment would silently re-enable the probe.
    env: { ...process.env, AGENTKEYS_GHOSTTY_BIN: "", ...env },
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
