import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createEchoSightServer } from './server.js';
import {
  describeSurroundingsFrame,
  analyzeStillImage,
  narrateVideoClip,
  analyzeScorecard,
  answerFollowup,
  pinSpatialObject,
  locateSpatialObject,
} from './pipeline.js';

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

  // Direct tool invocation endpoint for the Alexa+ Simulated Voice Client
  app.post('/api/tools/:name', async (req, res) => {
    const toolName = req.params.name;
    const args = req.body || {};

    try {
      if (toolName === 'ping') {
        res.json({
          status: 'ok',
          spokenText: 'EchoSight MCP server is online and operational.',
          detailedText: 'EchoSight MCP Server v0.1.0 on Streamable HTTP/SSE.',
        });
      } else if (toolName === 'describe_surroundings') {
        if (!args.image_base64) {
          res.status(400).json({ error: 'Missing required image_base64 parameter' });
          return;
        }
        const frameBuffer = Buffer.from(args.image_base64, 'base64');
        const prevRaw = args.prev_frame_base64 || args.previous_frame_base64;
        const prevBuffer = prevRaw ? Buffer.from(prevRaw, 'base64') : null;
        const result = await describeSurroundingsFrame(
          frameBuffer,
          args.mime_type || 'image/jpeg',
          prevBuffer,
          args.prior_context || ''
        );
        res.json(result);
      } else if (toolName === 'analyze_visual') {
        if (!args.image_base64) {
          res.status(400).json({ error: 'Missing required image_base64 parameter' });
          return;
        }
        const imageBuffer = Buffer.from(args.image_base64, 'base64');
        const result = await analyzeStillImage(imageBuffer, args.mime_type || 'image/png', {
          focus: args.focus,
          priorContext: args.prior_context,
        });
        res.json(result);
      } else if (toolName === 'analyze_video') {
        if (!args.video_base64) {
          res.status(400).json({ error: 'Missing required video_base64 parameter' });
          return;
        }
        const videoBuffer = Buffer.from(args.video_base64, 'base64');
        const result = await narrateVideoClip(videoBuffer, args.mime_type || 'video/mp4');
        res.json(result);
      } else if (toolName === 'analyze_scorecard') {
        if (!args.image_base64) {
          res.status(400).json({ error: 'Missing required image_base64 parameter' });
          return;
        }
        const imageBuffer = Buffer.from(args.image_base64, 'base64');
        const result = await analyzeScorecard(imageBuffer, args.mime_type || 'image/jpeg');
        res.json(result);
      } else if (toolName === 'ask_followup') {
        if (!args.question) {
          res.status(400).json({ error: 'Missing required question parameter' });
          return;
        }
        const imageBuffer = args.image_base64 ? Buffer.from(args.image_base64, 'base64') : undefined;
        const result = await answerFollowup(
          args.question,
          args.prior_context || '',
          imageBuffer,
          args.mime_type,
          args.spatial_pins_json
        );
        res.json(result);
      } else if (toolName === 'pin_spatial_object') {
        if (!args.image_base64) {
          res.status(400).json({ error: 'Missing required image_base64 parameter' });
          return;
        }
        const imageBuffer = Buffer.from(args.image_base64, 'base64');
        const result = await pinSpatialObject(
          imageBuffer,
          args.item_name || 'auto',
          args.mime_type || 'image/jpeg'
        );
        res.json(result);
      } else if (toolName === 'locate_spatial_object') {
        if (!args.query) {
          res.status(400).json({ error: 'Missing required query parameter' });
          return;
        }
        const imgRaw = args.image_base64 || args.current_frame_base64;
        const imageBuffer = imgRaw ? Buffer.from(imgRaw, 'base64') : undefined;
        const result = await locateSpatialObject(
          args.query,
          args.spatial_pins_json || '[]',
          imageBuffer,
          args.mime_type
        );
        res.json(result);
      } else {
        res.status(404).json({ error: `Tool not found: ${toolName}` });
      }
    } catch (err: any) {
      console.error(`[EchoSight] Tool error on ${toolName}:`, err.message);
      res.status(500).json({ error: err.message });
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
