import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

export interface AnalysisOptions {
  focus?: string;
  priorContext?: string;
}

export interface PipelineResult {
  spokenText: string;
  detailedText: string;
  confidence: 'high' | 'medium' | 'low';
  proactiveInsight?: string;
  isUnchanged?: boolean;
}

// Hard limits governed by PLAN.md Sections 1a and 5
export const HARD_LIMITS = {
  MAX_IMAGE_SIZE_BYTES: 10 * 1024 * 1024, // 10 MB
  MAX_VIDEO_SIZE_BYTES: 25 * 1024 * 1024, // 25 MB
  MAX_VIDEO_DURATION_SECONDS: 30,
  MAX_SURROUNDINGS_SESSION_MINUTES: 5,
  CADENCE_SECONDS: 5,
  SUPPORTED_IMAGE_MIME: ['image/jpeg', 'image/png', 'image/webp'],
  SUPPORTED_VIDEO_MIME: ['video/mp4', 'video/webm'],
};

// Singleton Gemini client
let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not defined in server environment');
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

const CANDIDATE_MODELS = [
  process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-flash-lite-latest',
  'gemini-3.1-flash-lite',
];

function getModelName(): string {
  return CANDIDATE_MODELS[0];
}

/**
 * Resilient caller with automatic multi-model fallback cascade and exponential backoff.
 */
async function generateWithRetry(baseParams: any, maxRetries = 2): Promise<any> {
  const ai = getAiClient();
  const modelsToTry = Array.from(new Set(CANDIDATE_MODELS));
  let lastError: any = null;

  for (const model of modelsToTry) {
    let delay = 2000;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const params = { ...baseParams, model };
        return await ai.models.generateContent(params);
      } catch (err: any) {
        lastError = err;
        const msg = String(err.message || '');
        const isQuotaExhausted =
          err.status === 429 ||
          msg.includes('429') ||
          msg.includes('quota') ||
          msg.includes('RESOURCE_EXHAUSTED');
        const isTransient503 =
          err.status === 503 ||
          msg.includes('503') ||
          msg.includes('high demand');

        if (isQuotaExhausted) {
          console.warn(`[EchoSight] Model ${model} quota limit reached, cascading to next model...`);
          break; // Cascade to next model immediately
        }

        if (isTransient503 && attempt < maxRetries) {
          console.warn(`[EchoSight] Transient 503 spike on ${model}, retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 1.5;
          continue;
        }

        break;
      }
    }
  }

  throw lastError;
}

/**
 * System prompt designed specifically for voice-first accessibility depth.
 * Explains like a thoughtful, patient sighted companion rather than a 1-sentence caption.
 */
const SYSTEM_INSTRUCTION = `You are EchoSight, a voice-first visual and spatial co-pilot built for blind and low-vision users.
Your guiding principle: Do not just label what is in an image or video with shallow captions. Explain it in patient, exhaustive, structured detail, the way a sighted friend would describe a scene to a blind companion.

Guidelines:
1. Spoken Clarity: Format your primary response in clean, spoken English with natural pauses. Avoid markdown symbols in spoken lines.
2. Structure & Completeness:
   - For charts/diagrams: Identify title, axes, scale, exact values, trends, outliers, and what the data actually means.
   - For scorecards/sports: Reason about match context, run rates, required rates, momentum, player innings, and who is in control.
   - For surroundings/scenes: Give clear relative spatial positioning ("just ahead of you", "to your right", "on the table"). Point out navigation hazards or open pathways.
   - For video: Narrate the sequence of events chronologically from start to end as one continuous scene.
3. Proactive Insights: Lead with the most important finding or anomaly first.
4. Honesty & Integrity: If an image is blurry, poorly lit, or details are illegible, state this plainly and suggest a retake rather than hallucinating or guessing. Never fabricate precise distance measurements (e.g. do not say "2.3 meters", say "a few steps ahead" or "close by").
`;

/**
 * Analyze a still image (charts, maps, diagrams, documents).
 */
export async function analyzeStillImage(
  imageBuffer: Buffer,
  mimeType: string,
  options: AnalysisOptions = {}
): Promise<PipelineResult> {
  // Validate limits
  if (imageBuffer.length > HARD_LIMITS.MAX_IMAGE_SIZE_BYTES) {
    throw new Error(`Image exceeds maximum allowed size of 10MB (${(imageBuffer.length / 1024 / 1024).toFixed(1)}MB)`);
  }
  if (!HARD_LIMITS.SUPPORTED_IMAGE_MIME.includes(mimeType)) {
    throw new Error(`Unsupported image format: ${mimeType}. Expected JPEG, PNG, or WebP.`);
  }

  // Blurry/unusable input pre-check
  if (imageBuffer.length < 500) {
    return {
      spokenText: 'That photo appears too degraded or blurry to identify details. Please retake it with steady focus and good lighting.',
      detailedText: 'Input image buffer is under 500 bytes and lacks legible visual features.',
      confidence: 'low',
      proactiveInsight: 'Retake needed with better lighting.',
    };
  }

  const ai = getAiClient();
  const prompt = `Perform an exhaustive, structured visual description of this image.
Lead with the single most notable insight, then describe layout, specific components, labels, and underlying meaning.
- If this is a sports scorecard or match graphic: Reason about match context, teams, current score, overs, wickets, run rate, required rate, momentum, player innings, and key match takeaways.
- If this is a chart, graph, or infographic: Identify title, axes, scale, exact values, trends, outliers, and what the data actually means.
- If this is a diagram, map, document, or scene: Break down key elements, spatial positioning, text, and primary meaning.
${options.focus ? `Focus area requested: ${options.focus}` : ''}
${options.priorContext ? `Prior conversation context: ${options.priorContext}` : ''}`;

  const response = await generateWithRetry({
    model: getModelName(),
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          {
            inlineData: {
              data: imageBuffer.toString('base64'),
              mimeType,
            },
          },
        ],
      },
    ],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      temperature: 0.2, // Low temperature for high factual accuracy
    },
  });

  const text = response.text?.trim() || 'No visual description could be generated.';
  const sentences = text.split(/(?<=[.?!])\s+/);
  const proactiveInsight = sentences.slice(0, 2).join(' ');

  return {
    spokenText: text,
    detailedText: text,
    confidence: 'high',
    proactiveInsight,
  };
}

/**
 * Reason over sports data and match scorecards.
 */
export async function analyzeScorecard(
  imageBuffer: Buffer,
  mimeType: string
): Promise<PipelineResult> {
  if (imageBuffer.length > HARD_LIMITS.MAX_IMAGE_SIZE_BYTES) {
    throw new Error('Scorecard image exceeds 10MB limit.');
  }

  const ai = getAiClient();
  const prompt = `Examine this sports scorecard/match graphic.
Do not merely transcribe raw numbers. Explain what they MEAN:
1. What teams/players are involved and what match stage is shown?
2. Current score, overs, wickets, run rate, and required rate (if applicable).
3. Who has the momentum and why? What does the batter/bowler figures tell us about performance?
4. Key takeaway for someone following the match by voice.`;

  const response = await generateWithRetry({
    model: getModelName(),
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          {
            inlineData: {
              data: imageBuffer.toString('base64'),
              mimeType,
            },
          },
        ],
      },
    ],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      temperature: 0.2,
    },
  });

  const text = response.text?.trim() || 'Unable to parse match scorecard.';
  const sentences = text.split(/(?<=[.?!])\s+/);

  return {
    spokenText: text,
    detailedText: text,
    confidence: 'high',
    proactiveInsight: sentences[0] || 'Scorecard analyzed.',
  };
}

/**
 * Narrate a short recorded video clip natively using Gemini video reasoning.
 */
export async function narrateVideoClip(
  videoBuffer: Buffer,
  mimeType: string
): Promise<PipelineResult> {
  if (videoBuffer.length > HARD_LIMITS.MAX_VIDEO_SIZE_BYTES) {
    throw new Error(`Video exceeds 25MB limit (${(videoBuffer.length / 1024 / 1024).toFixed(1)}MB).`);
  }
  if (!HARD_LIMITS.SUPPORTED_VIDEO_MIME.includes(mimeType)) {
    throw new Error(`Unsupported video format: ${mimeType}. Expected MP4 or WebM.`);
  }

  const ai = getAiClient();
  const prompt = `Narrate this video clip chronologically from start to finish as one continuous scene.
Describe who or what is present, what action occurs, how movement develops, and any changes in the environment.
Structure your narration in calm, natural spoken sentences.`;

  const response = await generateWithRetry({
    model: getModelName(),
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          {
            inlineData: {
              data: videoBuffer.toString('base64'),
              mimeType,
            },
          },
        ],
      },
    ],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      temperature: 0.2,
    },
  });

  const text = response.text?.trim() || 'No narration could be produced for this video clip.';
  return {
    spokenText: text,
    detailedText: text,
    confidence: 'high',
    proactiveInsight: 'Video narration completed.',
  };
}

/**
 * Cheap local frame comparison to detect whether a scene has changed.
 * Returns percentage difference (0.0 to 1.0).
 */
export function calculateFrameDifference(prevBuffer: Buffer | null, currentBuffer: Buffer): number {
  if (!prevBuffer || prevBuffer.length === 0 || currentBuffer.length === 0) {
    return 1.0; // Total difference
  }

  // Fast sample-based byte comparison across 100 sample points
  const sampleCount = Math.min(100, Math.min(prevBuffer.length, currentBuffer.length));
  const stepPrev = Math.floor(prevBuffer.length / sampleCount);
  const stepCurr = Math.floor(currentBuffer.length / sampleCount);

  let deltaSum = 0;
  for (let i = 0; i < sampleCount; i++) {
    const b1 = prevBuffer[i * stepPrev];
    const b2 = currentBuffer[i * stepCurr];
    deltaSum += Math.abs(b1 - b2) / 255;
  }

  return deltaSum / sampleCount;
}

/**
 * Surroundings Mode live frame description with cadence & change detection.
 */
export async function describeSurroundingsFrame(
  frameBuffer: Buffer,
  mimeType: string,
  prevFrameBuffer: Buffer | null = null,
  priorContext: string = ''
): Promise<PipelineResult> {
  // Check frame difference
  const diff = calculateFrameDifference(prevFrameBuffer, frameBuffer);
  // If frame changed less than 5% and we had a previous frame, skip LLM call to conserve quota and avoid repeating
  if (prevFrameBuffer && diff < 0.05) {
    return {
      spokenText: priorContext || 'Scene remains unchanged.',
      detailedText: 'Frame difference is negligible (<5%). Skipped redundant LLM call.',
      confidence: 'high',
      isUnchanged: true,
      proactiveInsight: 'Scene is static.',
    };
  }

  const ai = getAiClient();
  const prompt = `You are EchoSight, real-time walking eyes and collision prevention for a blind person.
Analyze what is directly in front of their camera right now.

GROUND TRUTH RULES:
1. OBSTACLES & PEOPLE TAKE HIGHEST PRIORITY:
   - If a person or face is directly in front of the camera, warn them immediately: e.g. "Stop, a person is standing directly in front of you."
   - If a wall, closed door, desk, screen, furniture, or barrier is close in front of the camera, state clearly: e.g. "Wall directly ahead, no path forward" or "Desk directly in front of you."
2. NEVER FABRICATE OR HALLUCINATE:
   - NEVER say "path is clear" or "open space" unless there is visible, unobstructed floor or ground to walk on.
   - If the camera is facing a person, a wall, an indoor room barrier, or is blocked, NEVER say the path is clear.
3. CONCISE WALKING GUIDANCE:
   - Strictly 1 to 2 short, punchy sentences (maximum 12 to 15 words).
   - If the view has genuinely not changed from prior observation ("${priorContext || ''}"), do not repeat long descriptions—give a brief update like "Person still directly ahead" or "Wall still ahead".

State current walking safety:`;

  const response = await generateWithRetry({
    model: getModelName(),
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          {
            inlineData: {
              data: frameBuffer.toString('base64'),
              mimeType,
            },
          },
        ],
      },
    ],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      temperature: 0.1,
    },
  });

  const text = response.text?.trim() || 'No distinct objects identified in current view.';
  return {
    spokenText: text,
    detailedText: text,
    confidence: 'high',
    isUnchanged: false,
    proactiveInsight: text.split('.')[0] || 'Surroundings updated.',
  };
}

/**
 * Answer conversational follow-up questions referencing recent visual context.
 */
export async function answerFollowup(
  question: string,
  priorContext: string,
  imageBuffer?: Buffer,
  mimeType?: string,
  spatialPinsJson?: string
): Promise<PipelineResult> {
  if (!question || !question.trim()) {
    throw new Error('Follow-up question cannot be empty.');
  }

  const isExhaustive = /tell me everything|exhaustive|all details|deep dive|explain in detail/i.test(question);
  const brevityInstruction = isExhaustive
    ? 'Provide an exhaustive, structured, line-by-line description covering all elements.'
    : 'Provide a direct, punchy answer in strictly 1 to 2 short sentences (under 20 words). Answer immediately without introductory filler or restating the entire prior scene.';

  const hasPins = spatialPinsJson && spatialPinsJson !== '[]' && spatialPinsJson.length > 5;

  const prompt = `You are EchoSight answering a question from a blind or low-vision user about their immediate surroundings, misplaced items, or loaded media.
User Question: "${question}"

PRIOR CONTEXT:
"""
${priorContext || 'No previous context recorded.'}
"""
${
  hasPins
    ? `
RECORDED SPATIAL MEMORY PINS (ITEMS USER ASKED TO REMEMBER):
"""
${spatialPinsJson}
"""
CRITICAL SPATIAL MEMORY RULE:
If the user's question asks where an item is or where they kept, placed, or left it (e.g., smartphone, keys, bottle, wallet), check the Recorded Spatial Memory Pins above. Tell them exactly where it was recorded (e.g. "Your smartphone was pinned on the bed to the right of the blue feature phone."). Do NOT say you cannot find it if it is recorded in the Spatial Memory Pins!
`
    : ''
}
STRICT VISUAL GROUND TRUTH RULES:
1. If an image or camera frame is attached, ALWAYS inspect the image directly as the single source of truth.
2. NEVER invent, fabricate, or hallucinate objects, benches, obstacles, or open spaces that do not physically exist in the image.
3. If the user asks if they can walk or move forward:
   - If a person is directly in front, warn them clearly: e.g. "No, a person is standing directly in front of you."
   - If a wall, desk, or barrier is directly in front, warn them clearly: e.g. "No, a wall is directly ahead."
   - Only say yes if there is genuine open, unobstructed floor space visible.
4. ${brevityInstruction} Maintain natural spoken phrasing for voice output.`;

  const parts: any[] = [{ text: prompt }];

  if (imageBuffer && mimeType) {
    parts.push({
      inlineData: {
        data: imageBuffer.toString('base64'),
        mimeType,
      },
    });
  }

  const response = await generateWithRetry({
    model: getModelName(),
    contents: [{ role: 'user', parts }],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      temperature: 0.1,
    },
  });

  const text = response.text?.trim() || 'Unable to resolve follow-up question.';
  return {
    spokenText: text,
    detailedText: text,
    confidence: 'high',
    proactiveInsight: text.split('.')[0] || 'Follow-up answered.',
  };
}

export interface SpatialPinResult {
  item: string;
  location: string;
  landmark: string;
  spokenText: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Pin an object in spatial memory relative to landmarks in the room.
 */
export async function pinSpatialObject(
  imageBuffer: Buffer,
  itemName: string = 'auto',
  mimeType: string = 'image/jpeg'
): Promise<SpatialPinResult> {
  const targetItem = itemName && itemName !== 'auto' ? itemName : 'the primary object in view';

  const prompt = `You are EchoSight's spatial localization engine for blind and low-vision users.
The user wants to remember the exact location of an item in this room: "${targetItem}".
Tasks:
1. Locate the item in the image. If item was "auto" or not specified, detect the most prominent personal item (e.g. keys, phone, water bottle, cane, bag, glasses, medication, wallet).
2. Determine its exact 3D spatial position relative to permanent landmarks (furniture, walls, appliances, doors, counters).
3. Generate a clear, comforting confirmation sentence suitable for speech to a blind person (e.g. "Pinned your water bottle on the wooden desk, approximately two feet to the right of the laptop.").

Format your response strictly as valid JSON matching this structure:
{
  "item": "Name of the item (e.g. Water bottle, Keys, Phone)",
  "location": "Exact spatial landmark description (e.g. On the wooden desk to the right of the laptop)",
  "landmark": "Primary anchor furniture or surface (e.g. Wooden desk, Coffee table, Kitchen counter)",
  "spokenText": "Spoken confirmation sentence for the blind user",
  "confidence": "high"
}`;

  const response = await generateWithRetry({
    model: getModelName(),
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          {
            inlineData: {
              data: imageBuffer.toString('base64'),
              mimeType,
            },
          },
        ],
      },
    ],
    config: {
      temperature: 0.1,
      responseMimeType: 'application/json',
    },
  });

  const rawText = response.text?.trim() || '{}';
  try {
    const parsed = JSON.parse(rawText);
    return {
      item: parsed.item || targetItem,
      location: parsed.location || 'On the surface in front of you',
      landmark: parsed.landmark || 'Current surface',
      spokenText: parsed.spokenText || `Pinned your ${parsed.item || targetItem}.`,
      confidence: parsed.confidence || 'high',
    };
  } catch {
    return {
      item: targetItem,
      location: rawText.slice(0, 100),
      landmark: 'Nearby surface',
      spokenText: `Pinned your ${targetItem} in view.`,
      confidence: 'medium',
    };
  }
}

/**
 * Locate a previously pinned object from spatial memory and guide user.
 */
export async function locateSpatialObject(
  query: string,
  spatialPinsJson: string,
  currentFrameBuffer?: Buffer,
  mimeType: string = 'image/jpeg'
): Promise<PipelineResult> {
  const prompt = `You are EchoSight guiding a blind or low-vision user to find an item they misplaced.
User Query: "${query}"

Previously Recorded Spatial Pins (with landmark positions and times):
"""
${spatialPinsJson || 'No pinned items recorded.'}
"""

Instructions:
1. Find the matching pinned item that best matches what the user is asking for.
2. If current camera frame is provided:
   - Check if the pinned object or its landmark is visible right now in the image.
   - If visible: Guide the user directly to it with immediate positioning (e.g., "I see your smartphone right in front of you on the bed, just to the right.").
   - If NOT in current view: ALWAYS recall the recorded location from memory! State clearly where it was pinned and instruct the user which way to turn (e.g., "Your smartphone was pinned on the bed to the right of the blue feature phone. Turn toward the bed to locate it."). NEVER simply say you cannot see it without stating its recorded memory location!
3. If no camera frame is provided:
   - Tell the user the recorded landmark and position in a clear, patient auditory sentence (e.g. "Your water bottle was pinned on the wooden dining table to the right of the laptop, seen 4 minutes ago.").
4. If no pin exists for this item:
   - Politely tell the user you don't have a record for it yet, and remind them they can point the camera at it and say "Remember where my [item] is".

Respond in 1 to 2 calm, direct, spoken sentences formatted for listening.`;

  const parts: any[] = [{ text: prompt }];

  if (currentFrameBuffer) {
    parts.push({
      inlineData: {
        data: currentFrameBuffer.toString('base64'),
        mimeType,
      },
    });
  }

  const response = await generateWithRetry({
    model: getModelName(),
    contents: [{ role: 'user', parts }],
    config: {
      temperature: 0.2,
    },
  });

  const text = response.text?.trim() || 'I could not locate that item.';
  return {
    spokenText: text,
    detailedText: text,
    confidence: 'high',
    proactiveInsight: text.split('.')[0] || 'Object located.',
  };
}
