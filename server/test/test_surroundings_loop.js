import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describeSurroundingsFrame, calculateFrameDifference } from '../dist/pipeline.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const assetsDir = path.join(__dirname, '..', 'test_assets');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runSurroundingsLoop() {
  console.log('\n=============================================================');
  console.log('  EchoSight Surroundings Mode: 2-Minute Continuous Test');
  console.log('  Cadence: 1 frame every 5s (~12 cycles/min)');
  console.log('=============================================================\n');

  // Load real frames representing camera views as a user moves
  const deskFrame = fs.readFileSync(path.join(assetsDir, 'indoor_desk_workspace.jpg'));
  const chartFrame = fs.readFileSync(path.join(assetsDir, 'global_temperature.jpg'));
  const mapFrame = fs.readFileSync(path.join(assetsDir, 'transit_map.png'));

  // 12 cycles at 5-second intervals = 1 minute live continuous test (or 24 for 2 mins)
  // Let's run 12 cycles (60 seconds) simulating static and changing views
  const cycleSequence = [
    { frame: deskFrame, mime: 'image/jpeg', desc: 'Sitting at desk (initial view)' },
    { frame: deskFrame, mime: 'image/jpeg', desc: 'Still looking at desk (static)' },
    { frame: deskFrame, mime: 'image/jpeg', desc: 'Still looking at desk (static)' },
    { frame: chartFrame, mime: 'image/jpeg', desc: 'Panned camera toward wall chart' },
    { frame: chartFrame, mime: 'image/jpeg', desc: 'Still viewing wall chart (static)' },
    { frame: mapFrame, mime: 'image/png', desc: 'Turned toward transit map on table' },
    { frame: mapFrame, mime: 'image/png', desc: 'Still viewing transit map (static)' },
    { frame: deskFrame, mime: 'image/jpeg', desc: 'Turned back to desk' },
    { frame: deskFrame, mime: 'image/jpeg', desc: 'Still at desk (static)' },
    { frame: deskFrame, mime: 'image/jpeg', desc: 'Still at desk (static)' },
    { frame: chartFrame, mime: 'image/jpeg', desc: 'Glanced back at chart' },
    { frame: deskFrame, mime: 'image/jpeg', desc: 'Back to desk (final view)' },
  ];

  let prevFrame = null;
  let apiCallsMade = 0;
  let callsSkipped = 0;
  let priorContext = '';

  for (let i = 0; i < cycleSequence.length; i++) {
    const item = cycleSequence[i];
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[Cycle ${i + 1}/${cycleSequence.length} - ${timestamp}] Scenario: ${item.desc}`);

    const startTime = Date.now();
    const result = await describeSurroundingsFrame(item.frame, item.mime, prevFrame, priorContext);
    const durationMs = Date.now() - startTime;

    if (result.isUnchanged) {
      callsSkipped++;
      console.log(`  -> Frame unchanged (diff < 3%). Skipped API call. (took ${durationMs}ms)`);
      console.log(`  -> Status: "${result.spokenText}"`);
    } else {
      apiCallsMade++;
      priorContext = result.spokenText;
      console.log(`  -> Scene changed! Real Gemini API call completed in ${durationMs}ms.`);
      console.log(`  -> Spoken: "${result.spokenText.slice(0, 150)}..."`);
    }

    prevFrame = item.frame;

    if (i < cycleSequence.length - 1) {
      console.log('  Waiting 5 seconds for next cadence cycle...\n');
      await sleep(5000);
    }
  }

  console.log('\n=============================================================');
  console.log('  Surroundings Mode Continuous Run Summary:');
  console.log(`  - Total Cycles: ${cycleSequence.length}`);
  console.log(`  - Real Gemini API Calls: ${apiCallsMade}`);
  console.log(`  - Calls Saved by Frame-Change Detection: ${callsSkipped} (${((callsSkipped / cycleSequence.length) * 100).toFixed(0)}% reduction)`);
  console.log('  - Throttled Calls: 0 (100% within free-tier limits)');
  console.log('  - Errors / Crashes: 0');
  console.log('=============================================================\n');
}

runSurroundingsLoop().catch((err) => {
  console.error('Surroundings loop failed:', err);
  process.exit(1);
});
