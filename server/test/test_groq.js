import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') });
const groqKey = process.env.GROQ_API_KEY;

async function checkModels() {
  const res = await fetch('https://api.groq.com/openai/v1/models', {
    headers: { 'Authorization': 'Bearer ' + groqKey }
  });
  const data = await res.json();
  console.log('Groq models:', data.data?.map(m => m.id));
}

checkModels();
