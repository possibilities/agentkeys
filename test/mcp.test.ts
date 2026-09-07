/**
 * The generated MCP surface.
 *
 * Two halves, and both matter. The mapping is checked in process against
 * `mcp-tools.ts` — what becomes a tool, what is suppressed, how the
 * annotations are derived. Then a real `agentkeys mcp` is spawned and driven
 * over stdio by a real MCP client: initialize, tools/list, tools/call. A
 * mapping that is only unit-tested is a mapping that has never once been
 * spoken to.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import * as z4mini from "zod/v4-mini";
import { buildContract } from "../src/contract.ts";
import { agentTools, serverInstructions } from "../src/mcp-tools.ts";

const CLI = new URL("../src/cli.ts", import.meta.url).pathname;

const DOCUMENT = buildContract();
const TOOLS = agentTools(DOCUMENT);

/** The advertised JSON Schema, as a host sees it after the SDK converts. */
function schemaOf(name: string): Record<string, unknown> {
  const tool = TOOLS.find((candidate) => candidate.name === name);
  if (tool === undefined) throw new Error(`no tool ${name}`);
  return z4mini.toJSONSchema(tool.input, { target: "draft-2020-12", io: "input" }) as Record<
    string,
    unknown
  >;
}

describe("which commands become tools", () => {
  test("exactly the agent leaves, and every one of them", () => {
    const wanted = DOCUMENT.commands
      .filter((command) => command.audience === "agent")
      .map((command) => command.name);
    expect(TOOLS.map((tool) => tool.name).sort()).toEqual([...wanted].sort());
  });

  test("no operator or internal leaf is exposed, mcp included", () => {
    const exposed = new Set(TOOLS.map((tool) => tool.name));
    const hidden = DOCUMENT.commands.filter((command) => command.audience !== "agent");
    expect(hidden.map((command) => command.name)).toEqual(["mcp"]);
    for (const command of hidden) expect(exposed.has(command.name)).toBe(false);
  });

  test("mcp declares itself internal, mutating, and blocking", () => {
    const mcp = DOCUMENT.commands.find((command) => command.name === "mcp");
    expect(mcp).toBeDefined();
    expect(mcp?.audience).toBe("internal");
    expect(mcp?.mutates).toBe(true);
    expect(mcp?.blocking).toBe(true);
  });

  test("never prefixed with the CLI name — the host namespaces by server", () => {
    expect(TOOLS.every((tool) => !tool.name.startsWith("agentkeys"))).toBe(true);
  });
});

describe("the input schema", () => {
  test("--help is suppressed: it is role meta, not a call knob", () => {
    for (const global of DOCUMENT.global_arguments) {
      if (global.name === "--help") expect(global.role).toBe("meta");
    }
    for (const tool of TOOLS) {
      expect(Object.keys(schemaOf(tool.name).properties ?? {})).not.toContain("help");
    }
  });

  test("--layer stays a string enum of the six interception points", () => {
    const schema = schemaOf("list-bindings") as {
      properties: Record<string, { type: string; enum?: string[] }>;
    };
    expect(schema.properties["layer"]?.type).toBe("string");
    expect(schema.properties["layer"]?.enum).toContain("karabiner");
    expect(schema.properties["layer"]?.enum).toContain("nvim");
  });

  test("a required argument is required, an optional one is not", () => {
    const findAvailable = schemaOf("find-available") as { required?: string[] };
    expect(findAvailable.required).toEqual(expect.arrayContaining(["modifier", "layer"]));
    const listBindings = schemaOf("list-bindings") as { required?: string[] };
    expect(listBindings.required ?? []).not.toContain("modifier");
  });
});

describe("annotations", () => {
  test("every tool is readOnlyHint and idempotentHint, and nothing is destructive", () => {
    for (const tool of TOOLS) {
      expect(tool.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      });
    }
  });

  test("nothing reaches the network", () => {
    for (const tool of TOOLS) expect(tool.annotations.openWorldHint).toBe(false);
  });
});

describe("the server's instructions", () => {
  const instructions = serverInstructions(DOCUMENT);

  test("carry the guidance, the envelope, every error code, and the opening moves", () => {
    expect(instructions).toContain("schema_version");
    for (const entry of DOCUMENT.concepts["error_codes"] as { code: string; recovery?: string }[]) {
      expect(instructions).toContain(entry.code);
      if (entry.recovery !== undefined) expect(instructions).toContain(entry.recovery);
    }
    for (const line of DOCUMENT.concepts["agent_defaults"] as string[]) {
      expect(instructions).toContain(line);
    }
  });
});

/**
 * The round trip. A real server process, a real client, a real handshake —
 * the one thing that cannot be faked by agreeing with the mapping module.
 */
describe("a live stdio server", () => {
  let directory: string;
  let client: Client;

  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), "agentkeys-mcp-"));
    client = new Client({ name: "agentkeys-test", version: "0" });
    await client.connect(
      new StdioClientTransport({
        command: "bun",
        args: [CLI, "mcp"],
        // Fixture HOME with no configs: every layer reports zero bindings
        // rather than reaching the real machine's keymap, and the Ghostty
        // and Herdr probes stay off so the call cannot hang on a real binary.
        env: {
          ...(process.env as Record<string, string>),
          HOME: directory,
          AGENTKEYS_GHOSTTY_BIN: "",
          AGENTKEYS_HERDR_BIN: "",
          XDG_CONFIG_HOME: "",
        },
      }),
    );
  });

  afterAll(async () => {
    await client.close();
    rmSync(directory, { recursive: true, force: true });
  });

  test("initialize names the CLI and hands back the contract's instructions", () => {
    expect(client.getServerVersion()?.name).toBe("agentkeys");
    expect(client.getInstructions() ?? "").toContain("schema_version");
  });

  test("tools/list is exactly the agent leaves the mapping generated", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(TOOLS.map((tool) => tool.name).sort());
    expect(tools.map((tool) => tool.name)).toContain("doctor");
    expect(tools.map((tool) => tool.name)).not.toContain("mcp");
  });

  test("every advertised tool is read-only and idempotent", async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.annotations).toMatchObject({ readOnlyHint: true, idempotentHint: true });
    }
  });

  test("a read-only tool returns the CLI's own envelope", async () => {
    const result = (await client.callTool({ name: "doctor", arguments: {} })) as {
      isError?: boolean;
      content: { type: string; text: string }[];
    };
    expect(result.isError ?? false).toBe(false);
    const envelope = JSON.parse(result.content[0]!.text);
    expect(result).toHaveProperty("structuredContent", envelope);
    expect(envelope).toMatchObject({ schema_version: 1, ok: true, error: null });
    expect(envelope.data).toHaveProperty("sources");
    expect(envelope.data).toHaveProperty("conflicts");
  });

  test("guide returns this same contract", async () => {
    const result = (await client.callTool({ name: "guide", arguments: {} })) as {
      isError?: boolean;
      content: { text: string }[];
    };
    expect(result.isError ?? false).toBe(false);
    const envelope = JSON.parse(result.content[0]!.text);
    expect(result).toHaveProperty("structuredContent", envelope);
    expect(envelope.data).toMatchObject({ contract_version: 1 });
  });

  test("a required argument missing from a call is rejected before dispatch", async () => {
    // Every required agentkeys argument is already `required: true` in the
    // generated schema, so the SDK's own zod validation refuses this call
    // itself — `runCommand`'s UsageError backstop is never reached over MCP,
    // only from a terminal invocation that bypassed schema validation
    // entirely.
    const result = (await client.callTool({ name: "explain", arguments: {} })) as {
      isError?: boolean;
      content: { text: string }[];
    };
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("Invalid arguments");
  });

  test("find-available answers for an empty keymap without crashing", async () => {
    const result = (await client.callTool({
      name: "find-available",
      arguments: { modifier: "cmd+shift", layer: "skhd" },
    })) as { isError?: boolean; content: { text: string }[] };
    expect(result.isError ?? false).toBe(false);
    const envelope = JSON.parse(result.content[0]!.text);
    expect(result).toHaveProperty("structuredContent", envelope);
    expect(envelope.ok).toBe(true);
  });
});
