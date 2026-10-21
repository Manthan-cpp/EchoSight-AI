import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  analyzeStillImage,
  analyzeScorecard,
  narrateVideoClip,
  describeSurroundingsFrame,
  answerFollowup,
  pinSpatialObject,
  locateSpatialObject,
  instantPathCheck,
} from './pipeline.js';

export function createEchoSightServer(): McpServer {
  const server = new McpServer({
    name: 'EchoSight',
    version: '0.1.0',
  });

  // Tool 1: describe_surroundings (Flagship tool for live camera loop)
  server.tool(
    'describe_surroundings',
    'Primary tool for live Surroundings Mode. Analyzes incoming camera frames for concise walking safety, relative spatial guidance, side hazards, and navigation landmarks.',
    {
      image_base64: z.string().describe('Base64-encoded JPEG/PNG/WebP camera frame'),
      mime_type: z.string().optional().default('image/jpeg').describe('MIME format of the frame (e.g. image/jpeg)'),
      prior_context: z.string().optional().default('').describe('Recent context or description to maintain conversational continuity'),
      prev_frame_base64: z.string().optional().describe('Optional previous frame to evaluate in-memory scene difference'),
    },
    async ({ image_base64, mime_type, prior_context, prev_frame_base64 }) => {
      try {
        const frameBuffer = Buffer.from(image_base64, 'base64');
        const prevBuffer = prev_frame_base64 ? Buffer.from(prev_frame_base64, 'base64') : null;

        const result = await describeSurroundingsFrame(frameBuffer, mime_type, prevBuffer, prior_context);
        return {
          content: [
            {
              type: 'text',
              text: result.spokenText,
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Error analyzing surroundings: ${err.message}`,
            },
          ],
        };
      }
    }
  );

  // Tool 2: analyze_visual (Still charts, maps, diagrams, documents)
  server.tool(
    'analyze_visual',
    'Provides patient, exhaustive, structured spoken walkthroughs of charts, diagrams, tables, maps, and photographs.',
    {
      image_base64: z.string().describe('Base64-encoded image content'),
      mime_type: z.string().optional().default('image/png').describe('Image MIME type (image/png, image/jpeg, image/webp)'),
      focus: z.string().optional().describe('Optional user focus area (e.g. "trend", "axes", "anomalies", "outliers")'),
      prior_context: z.string().optional().describe('Optional previous dialogue context'),
    },
    async ({ image_base64, mime_type, focus, prior_context }) => {
      try {
        const imageBuffer = Buffer.from(image_base64, 'base64');
        const result = await analyzeStillImage(imageBuffer, mime_type, { focus, priorContext: prior_context });
        return {
          content: [
            {
              type: 'text',
              text: result.spokenText,
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Error analyzing visual: ${err.message}`,
            },
          ],
        };
      }
    }
  );

  // Tool 3: analyze_video (Continuous short clip narration)
  server.tool(
    'analyze_video',
    'Narrates short recorded video clips (up to 30s) chronologically as a continuous scene.',
    {
      video_base64: z.string().describe('Base64-encoded video file content'),
      mime_type: z.string().optional().default('video/mp4').describe('Video MIME type (video/mp4 or video/webm)'),
    },
    async ({ video_base64, mime_type }) => {
      try {
        const videoBuffer = Buffer.from(video_base64, 'base64');
        const result = await narrateVideoClip(videoBuffer, mime_type);
        return {
          content: [
            {
              type: 'text',
              text: result.spokenText,
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Error narrating video: ${err.message}`,
            },
          ],
        };
      }
    }
  );

  // Tool 4: analyze_scorecard (Sports data and match reasoning)
  server.tool(
    'analyze_scorecard',
    'Contextually reasons over cricket and sports match scorecards, explaining match situation, momentum, and run rates.',
    {
      image_base64: z.string().describe('Base64-encoded match graphic or scorecard image'),
      mime_type: z.string().optional().default('image/jpeg').describe('Scorecard image MIME type'),
    },
    async ({ image_base64, mime_type }) => {
      try {
        const imageBuffer = Buffer.from(image_base64, 'base64');
        const result = await analyzeScorecard(imageBuffer, mime_type);
        return {
          content: [
            {
              type: 'text',
              text: result.spokenText,
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Error analyzing scorecard: ${err.message}`,
            },
          ],
        };
      }
    }
  );

  // Tool 5: ask_followup (Conversational memory and context resolution)
  server.tool(
    'ask_followup',
    'Answers follow-up conversational questions about a recently described scene, chart, or scorecard without restating full context.',
    {
      question: z.string().describe('The user follow-up question (e.g. "What did you say was on the left?", "Who was the bowler?")'),
      prior_context: z.string().describe('The previous description or transcript content'),
      image_base64: z.string().optional().describe('Optional base64 image if re-inspection is required'),
      mime_type: z.string().optional().default('image/jpeg').describe('Image MIME type if image_base64 is provided'),
    },
    async ({ question, prior_context, image_base64, mime_type }) => {
      try {
        const imageBuffer = image_base64 ? Buffer.from(image_base64, 'base64') : undefined;
        const result = await answerFollowup(question, prior_context, imageBuffer, image_base64 ? mime_type : undefined);
        return {
          content: [
            {
              type: 'text',
              text: result.spokenText,
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Error answering follow-up: ${err.message}`,
            },
          ],
        };
      }
    }
  );

  // Tool 6: pin_spatial_object (Spatial memory and object pinning)
  server.tool(
    'pin_spatial_object',
    'Pins an object in spatial memory relative to landmarks in the room for a blind user (e.g. "Remember where my keys are").',
    {
      image_base64: z.string().describe('Base64-encoded camera frame containing the object'),
      item_name: z.string().optional().default('auto').describe('Name of item to remember (e.g. "keys", "water bottle", "auto")'),
      mime_type: z.string().optional().default('image/jpeg').describe('Image MIME format'),
    },
    async ({ image_base64, item_name, mime_type }) => {
      try {
        const imageBuffer = Buffer.from(image_base64, 'base64');
        const result = await pinSpatialObject(imageBuffer, item_name, mime_type);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Error pinning spatial object: ${err.message}`,
            },
          ],
        };
      }
    }
  );

  // Tool 7: locate_spatial_object (Spatial memory retrieval and guidance)
  server.tool(
    'locate_spatial_object',
    'Guides a blind user to retrieve a previously pinned object based on spatial memory landmarks and current camera view.',
    {
      query: z.string().describe('User query looking for object (e.g. "Where did I put my water bottle?")'),
      spatial_pins_json: z.string().describe('JSON array of recorded spatial pins with landmarks and timestamps'),
      image_base64: z.string().optional().describe('Optional current camera frame for real-time visual guidance'),
      mime_type: z.string().optional().default('image/jpeg').describe('Image MIME format'),
    },
    async ({ query, spatial_pins_json, image_base64, mime_type }) => {
      try {
        const imageBuffer = image_base64 ? Buffer.from(image_base64, 'base64') : undefined;
        const result = await locateSpatialObject(query, spatial_pins_json, imageBuffer, image_base64 ? mime_type : undefined);
        return {
          content: [
            {
              type: 'text',
              text: result.spokenText,
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Error locating spatial object: ${err.message}`,
            },
          ],
        };
      }
    }
  );

  // Tool 8: check_walking_path (Instant sub-second collision radar)
  server.tool(
    'check_walking_path',
    'Instant ultra-low-latency walking safety and collision avoidance check. Answers in under 6 words whether it is safe to step forward right now.',
    {
      image_base64: z.string().describe('Base64-encoded camera frame'),
      mime_type: z.string().optional().default('image/jpeg').describe('Image MIME format'),
    },
    async ({ image_base64, mime_type }) => {
      try {
        const imageBuffer = Buffer.from(image_base64, 'base64');
        const result = await instantPathCheck(imageBuffer, mime_type);
        return {
          content: [
            {
              type: 'text',
              text: result.spokenText,
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Error checking path: ${err.message}`,
            },
          ],
        };
      }
    }
  );

  // Baseline tool: ping
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
        availableTools: [
          'describe_surroundings',
          'analyze_visual',
          'analyze_video',
          'analyze_scorecard',
          'ask_followup',
          'pin_spatial_object',
          'locate_spatial_object',
          'check_walking_path',
          'ping',
        ],
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
