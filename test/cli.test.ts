import { afterAll, expect, test } from "bun:test";
import {
  makeTempDir,
  removeTempDirs,
  runCli,
  writeDefaultConfigs,
  writeFixture,
} from "./helpers.ts";

afterAll(removeTempDirs);

function tempHome(): string {
  return makeTempDir("agentkeys-cli-");
}

test("top-level and leaf help are descriptor-backed", async () => {
  const bare = await runCli([]);
  expect(bare.exitCode).toBe(0);
  expect(bare.stdout).toContain("Usage:");

  const top = await runCli(["--help"]);
  expect(top.exitCode).toBe(0);
  expect(top.stdout).toContain("list-bindings");
  expect(top.stdout).toContain("find-available");

  const leaf = await runCli(["find-available", "--help"]);
  expect(leaf.exitCode).toBe(0);
  expect(leaf.stdout).toContain("--modifier");
  expect(leaf.stdout).toContain("--layer");
});

const LAYER_CHOICES = ["karabiner", "skhd", "ghostty", "orca", "tmux", "herdr", "nvim"];
const LAYER_SUMMARY = "Filter to a binding layer: karabiner|skhd|ghostty|orca|tmux|herdr|nvim";

test("leaf help-json projects stable public discovery schema", async () => {
  const expected = {
    "list-bindings": {
      name: "list-bindings",
      description: "List keyboard bindings across all layers",
      arguments: [
        {
          name: "--layer",
          type: "choice",
          required: false,
          choices: LAYER_CHOICES,
          positional: false,
          description: LAYER_SUMMARY,
        },
        {
          name: "--modifier",
          type: "text",
          required: false,
          positional: false,
          description: "Filter by canonical modifier or modifier combo",
        },
        {
          name: "--format",
          type: "choice",
          required: false,
          choices: ["json", "yaml", "table"],
          positional: false,
          description: "Output format: json|yaml|table (default json)",
        },
      ],
    },
    "show-cheatsheet": {
      name: "show-cheatsheet",
      description: "Show Markdown bindings grouped by layer priority",
      arguments: [
        {
          name: "--layer",
          type: "choice",
          required: false,
          choices: LAYER_CHOICES,
          positional: false,
          description: LAYER_SUMMARY,
        },
      ],
    },
    doctor: {
      name: "doctor",
      description: "Report shadowed and conditionally shadowed shortcuts",
      arguments: [],
    },
    "find-available": {
      name: "find-available",
      description: "Find priority-safe unused keys for a modifier combo",
      arguments: [
        {
          name: "--modifier",
          type: "text",
          required: true,
          positional: false,
          description: "Required modifier combo to check",
        },
        {
          name: "--layer",
          type: "choice",
          required: true,
          choices: LAYER_CHOICES,
          positional: false,
          description: `Required target layer: ${LAYER_CHOICES.join("|")}`,
        },
      ],
    },
    explain: {
      name: "explain",
      description: "Show every layer and well-known app claiming one key",
      arguments: [
        {
          name: "--key",
          type: "text",
          required: true,
          positional: false,
          description: "Required key or chord to explain, such as cmd+shift+v",
        },
        {
          name: "--format",
          type: "choice",
          required: false,
          choices: ["text", "json"],
          positional: false,
          description: "Output format: text|json (default text)",
        },
      ],
    },
  };

  for (const [command, schema] of Object.entries(expected)) {
    const result = await runCli([command, "--help-json"]);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(schema);
  }
});

test("top-level agent discovery flags work", async () => {
  const teaser = await runCli(["--agent-teaser"]);
  expect(teaser.exitCode).toBe(0);
  expect(teaser.stdout).toContain("Inventory keyboard shortcuts");

  const help = await runCli(["--agent-help"]);
  expect(help.exitCode).toBe(0);
  expect(help.stdout).toContain("Layer priority");
});

test("CLI lists, filters, and renders default JSON", async () => {
  const home = tempHome();
  writeDefaultConfigs(home);
  const result = await runCli(["list-bindings", "--layer", "skhd", "--modifier", "shift+cmd"], {
    HOME: home,
  });
  expect(result.exitCode).toBe(0);
  const envelope = JSON.parse(result.stdout) as {
    schema_version: number;
    ok: boolean;
    error: null;
    data: Array<{ layer: string; key: string; action: string; source: string }>;
  };
  expect(envelope.schema_version).toBe(1);
  expect(envelope.ok).toBe(true);
  expect(envelope.error).toBeNull();
  expect(envelope.data).toEqual([
    {
      layer: "skhd",
      key: "cmd+shift+h",
      action: "skhd focus west",
      source: expect.any(String),
    },
  ]);
});

// Regression: a Karabiner rule on key_code "comma" and a tmux binding on M-,
// are the same physical chord. Before the punctuation alias table they parsed
// as two different keys, each explain saw one layer, and doctor missed the
// conditional shadow entirely.
test("punctuation spelled by name and by symbol is one key", async () => {
  const home = tempHome();
  writeFixture(
    home,
    ".config/karabiner/karabiner.json",
    JSON.stringify({
      profiles: [
        {
          complex_modifications: {
            rules: [
              {
                description: "Orca tab navigation",
                manipulators: [
                  {
                    from: { key_code: "comma", modifiers: { mandatory: ["option"] } },
                    conditions: [
                      {
                        type: "frontmost_application_if",
                        bundle_identifiers: ["^com.orca.app$"],
                      },
                    ],
                    to: [{ key_code: "close_bracket", modifiers: ["command", "shift"] }],
                  },
                ],
              },
            ],
          },
        },
      ],
    }),
  );
  writeFixture(home, ".config/tmux/tmux.conf", "bind -n M-, select-pane -t :.- -Z\n");

  const byName = await runCli(["explain", "--key", "alt+comma"], { HOME: home });
  const bySymbol = await runCli(["explain", "--key", "alt+,"], { HOME: home });
  expect(byName.exitCode).toBe(0);
  expect(byName.stdout).toBe(bySymbol.stdout);
  expect(byName.stdout).toContain("karabiner");
  expect(byName.stdout).toContain("tmux");

  const doctor = await runCli(["doctor"], { HOME: home });
  expect(doctor.exitCode).toBe(0);
  expect(doctor.stdout).toContain("## Conditional shadows (1)");
  expect(doctor.stdout).toContain("`alt+,`");
});

test("CLI cheatsheet, doctor, table, and availability reports", async () => {
  const home = tempHome();
  writeDefaultConfigs(home);

  const table = await runCli(["list-bindings", "--format", "table"], {
    HOME: home,
  });
  expect(table.exitCode).toBe(0);
  expect(table.stdout).toContain("LAYER");

  const cheatsheet = await runCli(["show-cheatsheet"], { HOME: home });
  expect(cheatsheet.exitCode).toBe(0);
  expect(cheatsheet.stdout).toContain("## karabiner");
  expect(cheatsheet.stdout).toContain("(shadowed)");

  const doctor = await runCli(["doctor"], { HOME: home });
  expect(doctor.exitCode).toBe(0);
  expect(doctor.stdout).toContain("conflict");
  expect(doctor.stdout).toContain("## Sources");
  expect(doctor.stdout).toContain("| tmux |");

  const available = await runCli(["find-available", "--modifier", "shift+cmd", "--layer", "skhd"], {
    HOME: home,
  });
  expect(available.exitCode).toBe(0);
  expect(available.stdout).toContain("Available slots for cmd+shift+* at skhd layer");

  const explain = await runCli(["explain", "--key", "cmd+shift+h"], {
    HOME: home,
  });
  expect(explain.exitCode).toBe(0);
  expect(explain.stdout).toContain("Verdict: taken by karabiner.");

  const explainJson = await runCli(["explain", "--key", "cmd+shift+4", "--format", "json"], {
    HOME: home,
  });
  expect(explainJson.exitCode).toBe(0);
  expect(JSON.parse(explainJson.stdout)).toMatchObject({
    schema_version: 1,
    ok: true,
    error: null,
    data: {
      key: "cmd+shift+4",
      owners: [],
      verdict: "free in your config, but macOS uses it",
    },
  });
});

test("CLI no-match output stays machine-readable for machine formats", async () => {
  const home = tempHome();

  const emptyEnvelope = { schema_version: 1, ok: true, error: null, data: [] };

  const json = await runCli(["list-bindings", "--format", "json"], {
    HOME: home,
  });
  expect(json.exitCode).toBe(0);
  expect(JSON.parse(json.stdout)).toEqual(emptyEnvelope);

  const yaml = await runCli(["list-bindings", "--format", "yaml"], {
    HOME: home,
  });
  expect(yaml.exitCode).toBe(0);
  expect(yaml.stdout).toBe("schema_version: 1\nok: true\nerror: null\ndata: []\n");

  const table = await runCli(["list-bindings", "--format", "table"], {
    HOME: home,
  });
  expect(table.exitCode).toBe(0);
  expect(table.stdout).toBe("No bindings found.\n");
});

test("CLI rejects bad arguments with nonzero status", async () => {
  const missing = await runCli(["find-available", "--modifier", "cmd"]);
  expect(missing.exitCode).toBe(2);
  expect(missing.stderr).toContain("Missing required option");

  const badFormat = await runCli(["list-bindings", "--format", "xml"]);
  expect(badFormat.exitCode).toBe(2);
  expect(badFormat.stderr).toContain("Invalid value");
});

test("CLI reports malformed readable config without a stack trace", async () => {
  const home = tempHome();
  writeFixture(home, ".config/karabiner/karabiner.json", "{");

  // A machine format honors the envelope contract even on failure.
  const machine = await runCli(["list-bindings"], { HOME: home });
  expect(machine.exitCode).toBe(1);
  expect(JSON.parse(machine.stdout)).toMatchObject({
    schema_version: 1,
    ok: false,
    error: {
      code: "malformed_config",
      message: expect.stringContaining("Malformed Karabiner JSON"),
    },
    data: null,
  });
  expect(machine.stdout).not.toContain("\n    at ");

  // A human format keeps the failure on stderr.
  const human = await runCli(["doctor"], { HOME: home });
  expect(human.exitCode).toBe(1);
  expect(human.stderr).toContain("Malformed Karabiner JSON");
  expect(human.stderr).not.toContain("\n    at ");
});
