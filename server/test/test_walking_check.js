import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const assetsDir = path.join(__dirname, '..', 'test_assets');

async function testWalkingCheck() {
  console.log('\n=============================================================');
  console.log('   Testing check_walking_path (Instant Latency & No Person Hallucination)');
  console.log('=============================================================\n');

  const transport = new StdioClientTransport({
    command: 'node',
    args: [path.join(__dirname, '..', 'dist', 'index.js'), '--stdio'],
  });

  const client = new Client(
    { name: 'echosight-walking-test', version: '1.0.0' },
    { capabilities: {} }
  );

  await client.connect(transport);
  console.log('✓ Connected MCP client to EchoSight server.');

  const deskImg = fs.readFileSync(path.join(assetsDir, 'indoor_desk_workspace.jpg'));
  
  console.log('\n--- Calling check_walking_path on indoor workspace ---');
  const startTime = Date.now();
  const res = await client.callTool({
    name: 'check_walking_path',
    arguments: {
      image_base64: deskImg.toString('base64'),
      mime_type: 'image/jpeg',
    },
  });
  const elapsedMs = Date.now() - startTime;

  const text = res.content[0].text;
  console.log(`Latency: ${elapsedMs}ms`);
  console.log(`Tool Result: "${text}"`);

  // Verify no false positive person
  if (/person/i.test(text)) {
    console.error('❌ FAILED: Still mentioning person when there is none!');
    process.exit(1);
  } else {
    console.log('✓ PASSED: No false positive person detected!');
  }

  // Also test ask_followup with "Can I move forward?"
  console.log('\n--- Calling ask_followup ("Can I move forward?") ---');
  const startFollowup = Date.now();
  const resFollowup = await client.callTool({
    name: 'ask_followup',
    arguments: {
      question: 'Can I move forward?',
      image_base64: deskImg.toString('base64'),
      mime_type: 'image/jpeg',
      prior_context: 'User is navigating an indoor office space.',
    },
  });
  const elapsedFollowup = Date.now() - startFollowup;
  const followupText = resFollowup.content[0].text;
  console.log(`Latency: ${elapsedFollowup}ms`);
  console.log(`Follow-up Result: "${followupText}"`);

  if (/person/i.test(followupText)) {
    console.error('❌ FAILED: ask_followup still mentions person!');
    process.exit(1);
  } else {
    console.log('✓ PASSED: ask_followup has zero person hallucination!');
  }

  await client.close();
  console.log('\n✓ All tests passed successfully!\n');
}

testWalkingCheck().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
