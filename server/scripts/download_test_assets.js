import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const assetsDir = path.join(__dirname, '..', 'test_assets');

if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

const assets = [
  {
    name: 'global_temperature.jpg',
    url: 'https://upload.wikimedia.org/wikipedia/commons/e/e3/Global_temperature_anomaly.jpg',
  },
  {
    name: 'race_income_demographics.png',
    url: 'https://upload.wikimedia.org/wikipedia/commons/a/ac/Race_Income.png',
  },
  {
    name: 'transit_map.png',
    url: 'https://upload.wikimedia.org/wikipedia/commons/5/53/Transit_Map_Solo.png',
  },
  {
    name: 'cricket_scorecard.jpg',
    url: 'https://upload.wikimedia.org/wikipedia/commons/e/e0/Kumar%27s_cricket_scores.jpg',
  },
  {
    name: 'cricket_scoreboard_match2.jpg',
    url: 'https://upload.wikimedia.org/wikipedia/commons/c/c5/Cricket_Scoreboard_-_geograph.org.uk_-_286372.jpg',
  },
  {
    name: 'sample_video.webm',
    url: 'https://upload.wikimedia.org/wikipedia/commons/1/18/Mp4_web_test.webm',
  },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function download() {
  console.log('Downloading real test assets from Wikimedia Commons...');
  for (const asset of assets) {
    const dest = path.join(assetsDir, asset.name);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
      console.log(`- Already downloaded: ${asset.name} (${(fs.statSync(dest).size / 1024).toFixed(1)} KB)`);
      continue;
    }
    await sleep(2000);
    try {
      console.log(`- Fetching ${asset.name} from ${asset.url}`);
      const res = await fetch(asset.url, {
        headers: {
          'User-Agent': 'EchoSightBot/1.0 (https://github.com/Manthan-cpp/EchoSight-AI; open-source accessibility project)',
          'Accept': '*/*',
        },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(dest, buffer);
      console.log(`  Saved ${asset.name} (${(buffer.length / 1024).toFixed(1)} KB)`);
    } catch (err) {
      console.warn(`  Failed to fetch ${asset.name}:`, err.message);
    }
  }

  // Create a deliberately degraded/blurry test image for error handling verification
  const badImagePath = path.join(assetsDir, 'bad_blurry_input.jpg');
  if (!fs.existsSync(badImagePath)) {
    // 10x10 tiny dark pixel buffer representing unusable camera capture
    const tinyJpegHeader = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
      0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
      0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
      0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20,
      0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x0a, 0x00, 0x0a, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00,
      0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0xff, 0xda,
      0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0xbf, 0xff, 0xd9,
    ]);
    fs.writeFileSync(badImagePath, tinyJpegHeader);
    console.log('Created bad_blurry_input.jpg for edge case testing.');
  }

  console.log('\nAll test assets ready in server/test_assets/');
}

download();
