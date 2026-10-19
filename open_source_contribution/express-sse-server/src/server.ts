import express from 'express';
import cors from 'cors';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3005;
const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes session TTL

interface ActiveSession {
  transport: SSEServerTransport;
  server: McpServer;
  createdAt: number;
  lastActive: number;
}

// In-memory registry of active client sessions
const activeSessions = new Map<string, ActiveSession>();

/**
 * Factory creating a pre-configured MCP Server instance with tools.
 */
function createServerInstance(): McpServer {
  const server = new McpServer({
    name: 'mcp-express-sse-example',
    version: '1.0.0',
  });

  // Example Tool 1: Mathematical Calculation
  server.tool(
    'calculate',
    'Perform basic arithmetic calculations',
    {
      operation: z.enum(['add', 'subtract', 'multiply', 'divide']).describe('The operation to perform'),
      a: z.number().describe('First operand'),
      b: z.number().describe('Second operand'),
    },
    async ({ operation, a, b }) => {
      let result: number;
      switch (operation) {
        case 'add':
          result = a + b;
          break;
        case 'subtract':
          result = a - b;
          break;
        case 'multiply':
          result = a * b;
          break;
        case 'divide':
          if (b === 0) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Division by zero is not allowed.' }],
            };
          }
          result = a / b;
          break;
      }
      return {
        content: [{ type: 'text', text: `Result of ${operation} on ${a} and ${b}: ${result}` }],
      };
    }
  );

  // Example Tool 2: Server Echo/Ping
  server.tool(
    'echo',
    'Echo back a message with timestamp and session metadata',
    {
      message: z.string().describe('Message string to echo back'),
    },
    async ({ message }) => {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              echo: message,
              timestamp: new Date().toISOString(),
              framework: 'Express + SSE',
            }),
          },
        ],
      };
    }
  );

  return server;
}

const app = express();
app.use(cors());
app.use(express.json());

// Routine inactivity sweep to prevent memory leaks from forgotten sessions
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of activeSessions.entries()) {
    if (now - session.lastActive > SESSION_TTL_MS) {
      console.log(`[MCP-Express] Evicting stale session ${sessionId}`);
      try {
        session.transport.close();
      } catch {
        // Ignore errors on closing expired sockets
      }
      activeSessions.delete(sessionId);
    }
  }
}, 60 * 1000);

/**
 * Health check endpoint reporting active session metrics
 */
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'mcp-express-sse-example',
    activeSessions: activeSessions.size,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /sse
 * Initiates a Server-Sent Events stream for the client.
 */
app.get('/sse', async (req, res) => {
  console.log('[MCP-Express] Client initiating SSE connection...');

  const server = createServerInstance();
  const transport = new SSEServerTransport('/messages', res);

  // Connect server to transport
  await server.connect(transport);

  const sessionId = transport.sessionId;
  const now = Date.now();

  activeSessions.set(sessionId, {
    transport,
    server,
    createdAt: now,
    lastActive: now,
  });

  console.log(`[MCP-Express] Session established: ${sessionId} (Active: ${activeSessions.size})`);

  // Handle client disconnection (tab close, network drop, client abort)
  req.on('close', () => {
    console.log(`[MCP-Express] Connection closed by client: ${sessionId}`);
    activeSessions.delete(sessionId);
    try {
      transport.close();
    } catch {
      // Ignore already closed transport
    }
  });
});

/**
 * POST /messages
 * Delivers client-to-server JSON-RPC requests via the established SSE session.
 */
app.post('/messages', async (req, res) => {
  const sessionId = req.query.sessionId as string;

  if (!sessionId) {
    res.status(400).json({ error: 'Missing sessionId query parameter.' });
    return;
  }

  const session = activeSessions.get(sessionId);
  if (!session) {
    res.status(404).json({ error: `Session not found or expired: ${sessionId}` });
    return;
  }

  session.lastActive = Date.now();

  try {
    // Pass pre-parsed req.body from express.json() to prevent "stream is not readable" errors
    await session.transport.handlePostMessage(req, res, req.body);
  } catch (err: any) {
    console.error(`[MCP-Express] Error handling post message for session ${sessionId}:`, err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Internal error handling message' });
    }
  }
});

app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`  Model Context Protocol (MCP) Express SSE Server`);
  console.log(`  Port: ${PORT}`);
  console.log(`  SSE Endpoint:    http://localhost:${PORT}/sse`);
  console.log(`  Health & Status: http://localhost:${PORT}/health`);
  console.log(`======================================================\n`);
});
