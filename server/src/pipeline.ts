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
  process.env.GEMINI_MODEL || 'gemini-3.7-flash',
  'gemini-3.7-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.8-flash',
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
  // If frame changed less than 6% and we had a previous frame, skip API call to conserve quota and avoid repetitive speech
  if (prevFrameBuffer && diff < 0.06) {
    return {
      spokenText: 'Path remains clear.',
      detailedText: 'Frame difference is negligible (<6%). Skipped redundant LLM call.',
      confidence: 'high',
      isUnchanged: true,
      proactiveInsight: 'Scene is static.',
    };
  }

  const ai = getAiClient();
  const prompt = `You are EchoSight delivering real-time walking assistance to a blind user.
CRITICAL MANDATE FOR WALKING SPEED:
- Keep your response extremely brief: strictly 1 to 2 short, punchy sentences (maximum 15 to 20 words total).
- State ONLY what is vital for safe movement right now:
  1. Is the walkway ahead open or blocked?
  2. Note any immediate obstacle or opening with relative direction ("straight ahead", "to your right", "to your left").
- Do NOT describe wallpaper patterns, colors, lighting, or distant background items.
${
  priorContext
    ? `Prior observation was: "${priorContext}".
If the walkway is largely the same or remains open, do NOT repeat the previous description. Say strictly: "Path ahead remains clear." or "Still clear ahead." (under 4 words).`
    : ''
}
Format as clean, rapid spoken text.`;

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
      temperature: 0.2,
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
  mimeType?: string
): Promise<PipelineResult> {
  if (!question || !question.trim()) {
    throw new Error('Follow-up question cannot be empty.');
  }

  const isExhaustive = /tell me everything|exhaustive|all details|deep dive|explain in detail/i.test(question);
  const brevityInstruction = isExhaustive
    ? 'Provide an exhaustive, structured, line-by-line description covering all elements.'
    : 'Provide a direct, punchy answer in strictly 1 to 2 short sentences (under 20 words). Answer immediately without introductory filler or restating the entire prior scene.';

  const isScorecardContext = /scorecard|cricket|overs|wickets|batsman|bowler|runs/i.test(priorContext);
  const contextSubject = isScorecardContext ? 'match scorecard' : 'visual surroundings';

  const prompt = `You are EchoSight answering a follow-up question from a blind or low-vision user about their ${contextSubject}.
Prior Context / Recent Description:
"""
${priorContext || 'No previous context recorded.'}
"""

User Follow-Up Question: "${question}"

${brevityInstruction} Maintain calm, clear speech phrasing. Do not ask for or mention scorecards unless the prior context was explicitly a sports match.`;

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
      temperature: 0.2,
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
