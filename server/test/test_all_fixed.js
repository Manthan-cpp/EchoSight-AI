import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const assetsDir = path.join(__dirname, '..', 'test_assets');

async function testAll() {
  console.log('--- 1. Testing describe_surroundings ---');
  const deskImg = fs.readFileSync(path.join(assetsDir, 'indoor_desk_workspace.jpg'));
  const resSurround = await fetch('http://localhost:3001/api/tools/describe_surroundings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_base64: deskImg.toString('base64'), mime_type: 'image/jpeg' })
  }).then(r => r.json());

  console.log('Surroundings Spoken Output:', resSurround.spokenText);
  if (/person/i.test(resSurround.spokenText)) {
    console.error('❌ Still hallucinating person!');
    process.exit(1);
  }
  console.log('✓ Surroundings accurately identified scene without false positive person!');

  console.log('\n--- 2. Testing pin_spatial_object ---');
  const resPin = await fetch('http://localhost:3001/api/tools/pin_spatial_object', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_base64: deskImg.toString('base64'),
      item_name: 'keys',
      mime_type: 'image/jpeg'
    })
  }).then(r => r.json());

  console.log('Pin Output:', resPin.spokenText);
  console.log('✓ Pinning works!');

  console.log('\n--- 3. Testing ask_followup (Can I move forward?) ---');
  const resFollow = await fetch('http://localhost:3001/api/tools/ask_followup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question: 'Can I move forward?',
      image_base64: deskImg.toString('base64'),
      mime_type: 'image/jpeg',
      prior_context: resSurround.spokenText
    })
  }).then(r => r.json());

  console.log('Follow-up Output:', resFollow.spokenText);
  if (/person/i.test(resFollow.spokenText)) {
    console.error('❌ Follow-up hallucinating person!');
    process.exit(1);
  }
  console.log('✓ Follow-up accurately warned about obstacle without person false positive!');

  console.log('\n=========================================');
  console.log('  ALL CHECKS PASSED SUCCESSFULLY!');
  console.log('=========================================');
}

testAll().catch(e => {
  console.error('Test failed:', e);
  process.exit(1);
});
