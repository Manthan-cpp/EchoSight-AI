import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const smallBase64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

const testModels = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.5-flash-lite'];

async function run() {
  for (const m of testModels) {
    const t0 = Date.now();
    try {
      const res = await ai.models.generateContent({
        model: m,
        contents: [
          {
            role: 'user',
            parts: [
              { text: 'Is path clear? Answer in under 5 words.' },
              { inlineData: { data: smallBase64, mimeType: 'image/jpeg' } }
            ]
          }
        ],
        config: { maxOutputTokens: 15, temperature: 0.0 }
      });
      console.log(`[SUCCESS] ${m} in ${Date.now() - t0}ms: ${res.text?.trim()}`);
    } catch (e) {
      console.log(`[FAILED]  ${m} in ${Date.now() - t0}ms: ${e.message?.slice(0, 100)}`);
    }
  }
}

run();
