import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });
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
  safety?: WalkingSafetyAssessment;
}

export type WalkingSafetyStatus = 'clear' | 'stop' | 'caution' | 'left' | 'right' | 'slow' | 'unknown';

export interface WalkingSafetyAssessment {
  status: WalkingSafetyStatus;
  direction: 'left' | 'right' | 'none';
  hazard?: string;
  confidence: 'high' | 'medium' | 'low';
}

// Hard limits governed by PLAN.md Sections 1a and 5
export const HARD_LIMITS = {
  MAX_IMAGE_SIZE_BYTES: 10 * 1024 * 1024, // 10 MB
  MAX_VIDEO_SIZE_BYTES: 25 * 1024 * 1024, // 25 MB
  MAX_VIDEO_DURATION_SECONDS: 30,
  MAX_SURROUNDINGS_SESSION_MINUTES: 5,
  CADENCE_SECONDS: 2.5,
  SUPPORTED_IMAGE_MIME: ['image/jpeg', 'image/png', 'image/webp'],
  SUPPORTED_VIDEO_MIME: ['video/mp4', 'video/webm'],
};

interface GeminiClientSlot {
  keyName: string;
  client: GoogleGenAI;
  requestTimes: number[];
  blockedUntil: number;
  failureCount: number;
}

let geminiClientSlots: GeminiClientSlot[] | null = null;
let nextGeminiSlot = 0;

export function getConfiguredGeminiKeyCount(): number {
  const keyNames = ['GEMINI_API_KEY', 'GEMINI_API_KEY1', 'GEMINI_API_KEY2', 'GEMINI_API_KEY3'];
  return new Set(
    keyNames
      .map((keyName) => process.env[keyName]?.trim())
      .filter((value): value is string => Boolean(value))
  ).size;
}

function getGeminiClientSlots(): GeminiClientSlot[] {
  if (geminiClientSlots) return geminiClientSlots;

  const keyNames = ['GEMINI_API_KEY', 'GEMINI_API_KEY1', 'GEMINI_API_KEY2', 'GEMINI_API_KEY3'];
  const seenKeys = new Set<string>();
  geminiClientSlots = keyNames
    .map((keyName) => ({ keyName, value: process.env[keyName]?.trim() || '' }))
    .filter(({ value }) => value && !seenKeys.has(value))
    .map(({ keyName, value }) => {
      seenKeys.add(value);
      return {
        keyName,
        client: new GoogleGenAI({ apiKey: value }),
        requestTimes: [],
        blockedUntil: 0,
        failureCount: 0,
      };
    });

  if (geminiClientSlots.length === 0) {
    throw new Error('No Gemini API key is configured. Set GEMINI_API_KEY or GEMINI_API_KEY1/2/3.');
  }

  console.log(`[EchoSight] Gemini key pool ready: ${geminiClientSlots.length} unique project key(s).`);
  return geminiClientSlots;
}

function acquireGeminiClient(): GeminiClientSlot {
  const slots = getGeminiClientSlots();
  const now = Date.now();
  const perKeyRpm = Math.max(1, Number.parseInt(process.env.GEMINI_RPM_PER_KEY || '15', 10));

  for (let offset = 0; offset < slots.length; offset += 1) {
    const index = (nextGeminiSlot + offset) % slots.length;
    const slot = slots[index];
    slot.requestTimes = slot.requestTimes.filter((timestamp) => now - timestamp < 60_000);
    if (slot.blockedUntil > now) continue;
    if (slot.requestTimes.length < perKeyRpm) {
      slot.requestTimes.push(now);
      nextGeminiSlot = (index + 1) % slots.length;
      return slot;
    }
  }

  throw new Error(`All configured Gemini projects are at their ${perKeyRpm} RPM request limit.`);
}

function isQuotaOrTransientError(error: any): boolean {
  const message = String(error?.message || '');
  return (
    error?.status === 429 ||
    error?.status === 503 ||
    message.includes('429') ||
    message.includes('503') ||
    message.includes('quota') ||
    message.includes('RESOURCE_EXHAUSTED') ||
    message.includes('high demand') ||
    message.includes('timed out')
  );
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Gemini request timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}

const CANDIDATE_MODELS = [
  process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest',
];

function getModelName(): string {
  return CANDIDATE_MODELS[0];
}

/**
 * Low-latency Gemini caller with project-key rotation and a hard request deadline.
 * Key rotation is round-robin and quota-aware; it never exposes keys to the client.
 */
async function generateWithRetry(
  baseParams: any,
  maxAttempts = 2,
  timeoutMs = Number.parseInt(process.env.GEMINI_REQUEST_TIMEOUT_MS || '12000', 10)
): Promise<any> {
  const modelsToTry = Array.from(new Set(CANDIDATE_MODELS));
  let lastError: any = null;

  for (let attempt = 0; attempt < Math.max(1, maxAttempts); attempt += 1) {
    const slot = acquireGeminiClient();
    const model = modelsToTry[Math.min(attempt, modelsToTry.length - 1)];

    try {
      const params = { ...baseParams, model };
      const response = await withTimeout(
        slot.client.models.generateContent(params),
        timeoutMs
      );
      slot.failureCount = 0;
      slot.blockedUntil = 0;
      return response;
    } catch (err: any) {
      lastError = err;
      const quotaOrTransient = isQuotaOrTransientError(err);

      if (quotaOrTransient) {
        slot.failureCount += 1;
        const cooldownMs = Math.min(30_000, 2_000 * 2 ** Math.min(slot.failureCount - 1, 4));
        slot.blockedUntil = Date.now() + cooldownMs;
        console.warn(`[EchoSight] ${slot.keyName} failed; cooling it down for ${cooldownMs}ms: ${err.message}`);
      }

      if (!quotaOrTransient || attempt + 1 >= maxAttempts) {
        throw err;
      }

      console.warn(`[EchoSight] ${slot.keyName} unavailable; rotating Gemini project key.`);
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
  const prompt = `You are EchoSight, real-time walking eyes and navigational guide for a completely blind person.
Analyze the camera frame to guide their physical footsteps safely right now.

GROUND TRUTH & DIRECTIONAL NAVIGATION RULES:
1. COLLISION PREVENTION & OBSTACLES (HIGHEST PRIORITY):
   - What is DIRECTLY in front of the user's forward walking path (12 o'clock)?
     - If blocked by a wall, closed door, bed, desk, or barrier: Warn them immediately! E.g. "Hold on. Stop right there, wall directly ahead." or "Stop, bed directly in your path."
     - If blocked ahead, identify where the passage or doorway is: e.g. "The door is to your right—turn right." or "Opening is on your left."
     - If an open doorway or corridor is directly ahead, guide them: e.g. "Doorway directly ahead. Step through carefully into the room."
     - Always warn of low or side hazards: e.g. "Watch out for water jugs on your right", "A large bed sits to your left".
2. WALKING CONFIRMATION:
   - If the floor and path straight ahead is completely unobstructed: "Open hallway ahead, path is clear to walk."
   - Always give relative spatial positioning ("straight ahead", "to your left", "to your right").
   - NEVER say "path is clear" if the camera is facing a wall, closed door, bed, or obstacle!
3. ONLY REPORT REAL LIVING PEOPLE:
   - ONLY report a person if an actual living human being is clearly standing in front. Never guess or mistake doors, curtains, jackets, shadows, or furniture for a person.
4. SPOKEN STYLE & CADENCE:
   - Deliver 1 to 2 short, vigilant, spoken sentences (maximum 15 words) with calm authority, like a vigilant sighted companion walking right beside them.
   - If the view has genuinely not changed from prior observation ("${priorContext || ''}"), give a brief update like "Path still clear ahead" or "Wall still ahead".

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
      maxOutputTokens: 35,
    },
  });

  const text = response.text?.trim() || 'Path status unclear. Stop and wait.';
  return {
    spokenText: text,
    detailedText: text,
    confidence: 'medium',
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
STRICT VISUAL GROUND TRUTH & DIRECTIONAL NAVIGATION RULES:
1. If an image or camera frame is attached, inspect the image directly as the single source of ground truth.
2. Only report physical objects and obstacles that are genuinely visible in the camera frame.
3. If the user asks if they can walk, move forward, or where to move:
   - Check what is DIRECTLY in front of their forward walking path (12 o'clock):
     - If blocked by a wall, closed door, bed, desk, or barrier: Command them firmly to stop! E.g. "Stop, wall directly in front of you." or "Stop right there, bed directly in your path."
     - If the doorway, gate, or exit is to the right or left, direct them clearly: "The door is to your right—turn right." or "Doorway is to your left—turn left."
     - If the walkway directly ahead is completely unobstructed: "Yes, open hallway ahead, safe to walk forward."
     - If approaching a doorway directly ahead: "Doorway directly ahead, step through carefully into the room."
   - ONLY report a person if an actual living human being is clearly standing in the path. Never mistake doors, curtains, jackets, coats, shadows, or furniture for a person!
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
      maxOutputTokens: isExhaustive ? 250 : 40,
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

function normalizeWalkingSafety(rawText: string): WalkingSafetyAssessment {
  const text = rawText.trim().replace(/^```(?:json)?|```$/gi, '').trim();
  const lower = text.toLowerCase();
  const direction = /\bleft\b/.test(lower) && !/\bright\b/.test(lower)
    ? 'left'
    : /\bright\b/.test(lower) && !/\bleft\b/.test(lower)
      ? 'right'
      : 'none';

  let status: WalkingSafetyStatus = 'unknown';
  if (/\b(stop|blocked|wall|closed door|barrier|desk|bed|chair|obstacle)\b/.test(lower)) {
    status = 'stop';
  } else if (/\b(slow|cautious|narrow|congested|doorway|opening|careful)\b/.test(lower)) {
    status = 'slow';
  } else if (direction === 'left') {
    status = 'left';
  } else if (direction === 'right') {
    status = 'right';
  } else if (/\b(clear|safe|open|unobstructed)\b/.test(lower)) {
    status = 'clear';
  }

  const hazard = status === 'clear' || status === 'unknown'
    ? undefined
    : text.replace(/^(stop|move|turn|walk|go|slow down|proceed)\b[,:]?\s*/i, '').trim();

  return {
    status,
    direction,
    hazard: hazard || undefined,
    confidence: status === 'unknown' ? 'low' : 'medium',
  };
}

/**
 * Low-latency walking path verification.
 * Missing or ambiguous output never becomes "path clear".
 */
export async function instantPathCheck(
  imageBuffer: Buffer,
  mimeType: string
): Promise<PipelineResult> {
  if (!imageBuffer.length || imageBuffer.length > HARD_LIMITS.MAX_IMAGE_SIZE_BYTES) {
    throw new Error('Walking frame is empty or exceeds the 10MB image limit.');
  }
  if (!HARD_LIMITS.SUPPORTED_IMAGE_MIME.includes(mimeType)) {
    throw new Error(`Unsupported walking frame format: ${mimeType}.`);
  }

  const prompt = `You are EchoSight's urgent walking-safety camera.
Inspect only the immediate path directly ahead and nearby side hazards.
Respond with ONE short spoken instruction, 4 to 12 words.

RULES:
1. If the immediate floor is genuinely clear: "Path clear ahead."
2. If anything blocks the next step: "Stop. [object] directly ahead."
3. If a safe side route is clearly visible: "Move slightly left/right; path open."
4. If the area is narrow, crowded, or a doorway needs care: "Slow down; narrow passage." or "Doorway ahead; move carefully."
5. If visibility or certainty is insufficient: "Stop. Path not verified."
6. Only report a person when an actual living human is clearly visible. Never guess from furniture, shadows, doors, or clothing.
7. Never say "path clear" when a wall, closed door, bed, desk, chair, or barrier is ahead.`;

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
      temperature: 0.0,
      maxOutputTokens: 24,
    },
  }, 1, 4000);

  const text = response.text?.trim() || 'Stop. Path not verified.';
  const safety = normalizeWalkingSafety(text);
  const safeText = safety.status === 'unknown' ? 'Stop. Path not verified.' : text;
  return {
    spokenText: safeText,
    detailedText: safeText,
    confidence: safety.confidence,
    proactiveInsight: safeText,
    safety,
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
