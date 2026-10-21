import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const models = [
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.6-flash',
  'gemini-flash-lite-latest',
  'gemini-flash-latest'
];

async function check() {
  for (const m of models) {
    const t0 = Date.now();
    try {
      const res = await ai.models.generateContent({ model: m, contents: 'Say OK' });
      console.log(`[SUCCESS] ${m} in ${Date.now() - t0}ms: ${res.text?.trim()}`);
    } catch (e) {
      console.log(`[FAILED]  ${m} in ${Date.now() - t0}ms: ${e.message?.slice(0, 100)}`);
    }
  }
}

check();
