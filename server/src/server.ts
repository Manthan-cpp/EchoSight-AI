import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function createEchoSightServer(): McpServer {
  const server = new McpServer({
    name: 'EchoSight',
    version: '0.1.0',
  });

  // Baseline tool for Phase 2: ping
  server.tool(
    'ping',
    'Verify EchoSight MCP server connectivity, protocol spec, and health status.',
    {
      message: z.string().optional().describe('Optional message string to echo back'),
    },
    async ({ message }) => {
      const payload = {
        status: 'online',
        service: 'EchoSight Voice-First Spatial Co-Pilot',
        version: '0.1.0',
        timestamp: new Date().toISOString(),
        protocol: 'MCP Spec 2025-11-25+',
        transport: 'Streamable HTTP / SSE',
        message: message ? `pong: ${message}` : 'pong',
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(payload, null, 2),
          },
        ],
      };
    }
  );

  return server;
}
