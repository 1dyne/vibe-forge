import { NextRequest, NextResponse } from "next/server";
import { SERVER_INSTRUCTIONS, TOOLS, callTool } from "../../../../lib/mcp-tools";
import { publicUrl } from "../../../../lib/request-security";
import { findUserByToken } from "../../../../lib/users";

// MCP Streamable HTTP endpoint, stateless with plain JSON responses. The
// secret token in the path identifies the invited user, so the URL works as a
// claude.ai custom connector or a Claude Code plugin server without OAuth.
const SUPPORTED_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
type RpcRequest = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };

const rpcError = (id: RpcRequest["id"], code: number, message: string) => ({ jsonrpc: "2.0" as const, id: id ?? null, error: { code, message } });

export async function POST(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const user = await findUserByToken(token);
  if (!user) return NextResponse.json(rpcError(null, -32001, "커넥터 주소가 올바르지 않거나 사용이 중지됐어요. 운영자에게 새 주소를 받아주세요."), { status: 404 });
  let message: RpcRequest;
  try {
    message = await request.json();
  } catch {
    return NextResponse.json(rpcError(null, -32700, "Parse error"), { status: 400 });
  }
  if (Array.isArray(message) || !message || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return NextResponse.json(rpcError(null, -32600, "Invalid Request"), { status: 400 });
  }
  // Notifications and responses carry no id and get no body back.
  if (message.id === undefined || message.id === null) return new Response(null, { status: 202 });

  const dashboardUrl = publicUrl(request, `/u/${token}`).toString();
  const reply = (result: unknown) => NextResponse.json({ jsonrpc: "2.0", id: message.id, result });
  switch (message.method) {
    case "initialize": {
      const requested = String(message.params?.protocolVersion ?? "");
      return reply({
        protocolVersion: SUPPORTED_VERSIONS.includes(requested) ? requested : SUPPORTED_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "dalgeurak-forge", title: "달그락 대장간", version: "0.2.0" },
        instructions: `${SERVER_INSTRUCTIONS}\n사용자: ${user.name}\n대시보드: ${dashboardUrl}`
      });
    }
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, ...(annotations ? { annotations } : {}) })) });
    case "tools/call": {
      const name = String(message.params?.name ?? "");
      return reply(await callTool(name, message.params?.arguments, { user, dashboardUrl }));
    }
    default:
      return NextResponse.json(rpcError(message.id, -32601, `Method not found: ${message.method}`));
  }
}

// No server-initiated stream and no sessions to end.
export function GET() {
  return new Response(null, { status: 405, headers: { allow: "POST" } });
}
export function DELETE() {
  return new Response(null, { status: 405, headers: { allow: "POST" } });
}
