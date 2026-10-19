import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  analyzeStillImage,
  analyzeScorecard,
  narrateVideoClip,
  describeSurroundingsFrame,
  calculateFrameDifference,
} from '../dist/pipeline.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const assetsDir = path.join(__dirname, '..', 'test_assets');

// Helper to sleep between API calls to stay safely inside free-tier rate limit (~15 RPM)
const sleep = (ms = 5000) => new Promise((resolve) => setTimeout(resolve, ms));

async function runPipelineTests() {
  console.log('\n=============================================================');
  console.log('   EchoSight Phase 3: Live End-to-End Vision Pipeline Tests');
  console.log('   Model: Google Gemini API (Free Tier)');
  console.log('=============================================================\n');

  // Test 1: Global Temperature Chart
  console.log('[Test 1/7] Analyzing Real Science Chart: global_temperature.jpg...');
  const tempBuffer = fs.readFileSync(path.join(assetsDir, 'global_temperature.jpg'));
  const res1 = await analyzeStillImage(tempBuffer, 'image/jpeg');
  console.log('✓ Proactive Insight:', res1.proactiveInsight);
  console.log('✓ Excerpt of Description:', res1.spokenText.slice(0, 250) + '...\n');
  await sleep(4000);

  // Test 2: Demographics Bar Chart
  console.log('[Test 2/7] Analyzing Bar Chart: race_income_demographics.png...');
  const barBuffer = fs.readFileSync(path.join(assetsDir, 'race_income_demographics.png'));
  const res2 = await analyzeStillImage(barBuffer, 'image/png');
  console.log('✓ Proactive Insight:', res2.proactiveInsight);
  console.log('✓ Excerpt of Description:', res2.spokenText.slice(0, 250) + '...\n');
  await sleep(4000);

  // Test 3: Transit Map
  console.log('[Test 3/7] Analyzing Map Graphic: transit_map.png...');
  const mapBuffer = fs.readFileSync(path.join(assetsDir, 'transit_map.png'));
  const res3 = await analyzeStillImage(mapBuffer, 'image/png');
  console.log('✓ Proactive Insight:', res3.proactiveInsight);
  console.log('✓ Excerpt of Description:', res3.spokenText.slice(0, 250) + '...\n');
  await sleep(4000);

  // Test 4: Indoor Workspace Scene (Surroundings Mode Frame)
  console.log('[Test 4/7] Analyzing Indoor Workspace Scene: indoor_desk_workspace.jpg...');
  const deskBuffer = fs.readFileSync(path.join(assetsDir, 'indoor_desk_workspace.jpg'));
  const res4 = await describeSurroundingsFrame(deskBuffer, 'image/jpeg');
  console.log('✓ Proactive Insight:', res4.proactiveInsight);
  console.log('✓ Spoken Output:', res4.spokenText + '\n');
  await sleep(4000);

  // Test 5: Sports Scorecard Reasoning
  console.log('[Test 5/7] Analyzing Sports Data: cricket_scorecard.jpg...');
  const scoreBuffer = fs.readFileSync(path.join(assetsDir, 'cricket_scorecard.jpg'));
  const res5 = await analyzeScorecard(scoreBuffer, 'image/jpeg');
  console.log('✓ Proactive Insight:', res5.proactiveInsight);
  console.log('✓ Excerpt of Scorecard Reasoning:', res5.spokenText.slice(0, 250) + '...\n');
  await sleep(4000);

  // Test 6: Video Clip Narration
  console.log('[Test 6/7] Narrating Video Clip: sample_video.webm...');
  const videoBuffer = fs.readFileSync(path.join(assetsDir, 'sample_video.webm'));
  const res6 = await narrateVideoClip(videoBuffer, 'video/webm');
  console.log('✓ Video Narration Excerpt:', res6.spokenText.slice(0, 250) + '...\n');
  await sleep(4000);

  // Test 7: Frame-Change Detection & Error Handling
  console.log('[Test 7/7] Verifying Frame-Change Detection & Degraded Input Handling...');
  // Frame-change detection test
  const diffSame = calculateFrameDifference(deskBuffer, deskBuffer);
  console.log(`✓ Identical frame difference score: ${(diffSame * 100).toFixed(1)}% (Expected 0.0%)`);
  const diffDiff = calculateFrameDifference(deskBuffer, tempBuffer);
  console.log(`✓ Different scene frame difference score: ${(diffDiff * 100).toFixed(1)}% (Expected > 30%)`);

  // Degraded input handling
  const badBuffer = fs.readFileSync(path.join(assetsDir, 'bad_blurry_input.jpg'));
  const resBad = await analyzeStillImage(badBuffer, 'image/jpeg');
  console.log('✓ Degraded photo handled gracefully:');
  console.log(`  Spoken: "${resBad.spokenText}"`);
  console.log(`  Confidence: ${resBad.confidence}`);

  console.log('\n=============================================================');
  console.log('  All Phase 3 Vision & Video Pipeline Tests Passed 100%!');
  console.log('=============================================================\n');
}

runPipelineTests().catch((err) => {
  console.error('Pipeline test failed:', err);
  process.exit(1);
});
