import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createEchoSightServer } from './server.js';

dotenv.config();

const isStdioMode = process.argv.includes('--stdio');

if (isStdioMode) {
  // Stdio transport mode for direct CLI / inspector execution
  async function runStdio() {
    const server = createEchoSightServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('[EchoSight] MCP Server running on Stdio transport');
  }

  runStdio().catch((error) => {
    console.error('[EchoSight] Stdio Server error:', error);
    process.exit(1);
  });
} else {
  // Streamable HTTP / SSE transport mode (Spec 2025-11-25+)
  const app = express();
  const PORT = parseInt(process.env.PORT || '3001', 10);

  app.use(cors());
  app.use(express.json({ limit: '25mb' }));

  // Map of active SSE client sessions
  const sessions = new Map<string, SSEServerTransport>();

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'EchoSight MCP Server',
      version: '0.1.0',
      activeSessions: sessions.size,
      timestamp: new Date().toISOString(),
    });
  });

  // SSE connection endpoint
  app.get('/sse', async (_req, res) => {
    console.log('[EchoSight] New incoming SSE connection request');
    const transport = new SSEServerTransport('/messages', res);
    const server = createEchoSightServer();

    sessions.set(transport.sessionId, transport);

    transport.onclose = () => {
      console.log(`[EchoSight] SSE session closed: ${transport.sessionId}`);
      sessions.delete(transport.sessionId);
    };

    await server.connect(transport);
    console.log(`[EchoSight] SSE session established with ID: ${transport.sessionId}`);
  });

  // Message posting endpoint for JSON-RPC
  app.post('/messages', async (req, res) => {
    const sessionId = req.query.sessionId as string;
    if (!sessionId) {
      res.status(400).send('Missing sessionId query parameter');
      return;
    }

    const transport = sessions.get(sessionId);
    if (!transport) {
      res.status(404).send(`Session not found: ${sessionId}`);
      return;
    }

    try {
      await transport.handlePostMessage(req, res, req.body);
    } catch (error) {
      console.error(`[EchoSight] Error handling message for session ${sessionId}:`, error);
      if (!res.headersSent) {
        res.status(500).send('Internal Server Error');
      }
    }
  });

  app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`  EchoSight MCP Server (Alexa+ Track) Online`);
    console.log(`  Transport: Streamable HTTP / SSE`);
    console.log(`  Endpoint:  http://localhost:${PORT}/sse`);
    console.log(`  Health:    http://localhost:${PORT}/health`);
    console.log(`======================================================\n`);
  });
}
