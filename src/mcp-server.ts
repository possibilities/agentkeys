/**
 * The MCP server `agentkeys mcp` serves, constructed but not connected.
 *
 * Two things make this a generated surface rather than a second one. The
 * tools come from the CLI's own contract (`CONTRACT` in `commands.ts`)
 * through `mcp-tools.ts`, so adding a command to `descriptor.ts` adds a tool
 * with no edit here. And every call is dispatched through `commands.ts`'s own
 * `runCommand`, in this process — the same functions `agentkeys list-bindings`
 * and its siblings call for a terminal invocation, with nothing spawned and no
 * argv re-parsed.
 *
 * `mcp.ts` is the entrypoint that connects a transport to what this returns.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { CONTRACT, runCommand } from "./commands.ts";
import { failure, success } from "./envelope.ts";
import { AgentkeysError, UsageError } from "./errors.ts";
import { type AgentTool, agentTools, serverInstructions } from "./mcp-tools.ts";

export function createAgentkeysMcpServer(): McpServer {
  const server = new McpServer(
    { name: CONTRACT.meta.name, version: CONTRACT.meta.version },
    { instructions: serverInstructions(CONTRACT) },
  );
  for (const tool of agentTools(CONTRACT)) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.input,
        annotations: tool.annotations,
      },
      // The SDK infers the callback's argument type from the input schema,
      // which is built at runtime and so infers to nothing useful. The shape
      // is whatever the schema just validated: a plain object of argument
      // values, keyed the same way `runCommand` reads them.
      (args: unknown) => callTool(tool, (args ?? {}) as Record<string, unknown>),
    );
  }
  return server;
}

/** One tool call, dispatched in process through `runCommand` — the same
 * command table a terminal invocation of this same leaf goes through. */
function callTool(tool: AgentTool, args: Record<string, unknown>): CallToolResult {
  try {
    const data = runCommand(tool.command.name, args);
    return { content: [{ type: "text", text: JSON.stringify(success(data), null, 2) }] };
  } catch (error) {
    return toolError(error);
  }
}

/**
 * A refusal, as MCP.md rules: the message leads with `error.code`, then the
 * message, then `recovery` when the contract gives one for that code — the
 * recovery line is the difference between a caller that retries correctly
 * and one that retries identically. The envelope follows, so anything already
 * parsing agentkeys's own output parses the same shape here.
 *
 * A usage fault is not an envelope anywhere: at a terminal it is exit 2 with
 * a message on stderr and no `error.code` at all (`main`'s `UsageError`
 * branch never reaches the envelope branch below it). It comes back here as a
 * plain tool error for the same reason.
 */
function toolError(error: unknown): CallToolResult {
  if (error instanceof UsageError) {
    return { isError: true, content: [{ type: "text", text: `invalid call: ${error.message}` }] };
  }
  const domain =
    error instanceof AgentkeysError
      ? error
      : new AgentkeysError(error instanceof Error ? error.message : String(error));
  // agentkeys's own AgentkeysError does not carry a per-instance `recovery` —
  // only the contract's error_codes table does — so the code is looked up
  // there rather than read off the thrown error.
  const entry = (
    CONTRACT.concepts as { error_codes: { code: string; recovery?: string }[] }
  ).error_codes.find((candidate) => candidate.code === domain.code);
  const lines = [`${domain.code}: ${domain.message}`];
  if (entry?.recovery !== undefined) lines.push(`recovery: ${entry.recovery}`);
  lines.push(JSON.stringify(failure(domain), null, 2));
  return { isError: true, content: [{ type: "text", text: lines.join("\n") }] };
}
