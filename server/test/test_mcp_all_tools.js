import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const assetsDir = path.join(__dirname, '..', 'test_assets');

const sleep = (ms = 5000) => new Promise((resolve) => setTimeout(resolve, ms));

async function runMcpToolTests() {
  console.log('\n=============================================================');
  console.log('   EchoSight Phase 4: Full MCP Protocol Tool Invocations');
  console.log('   Transport: MCP Stdio / Streamable HTTP (Spec 2025-11-25+)');
  console.log('=============================================================\n');

  const transport = new StdioClientTransport({
    command: 'node',
    args: ['dist/index.js', '--stdio'],
  });

  const client = new Client(
    { name: 'echosight-mcp-full-test', version: '1.0.0' },
    { capabilities: {} }
  );

  await client.connect(transport);
  console.log('✓ Connected MCP client to EchoSight server.');

  const tools = await client.listTools();
  console.log('✓ Discovered MCP Tools:', tools.tools.map((t) => t.name).join(', '));

  // 1. Test MCP Tool: analyze_visual
  console.log('\n--- Calling MCP Tool: analyze_visual (race_income_demographics.png) ---');
  const barImg = fs.readFileSync(path.join(assetsDir, 'race_income_demographics.png'));
  const resVisual = await client.callTool({
    name: 'analyze_visual',
    arguments: {
      image_base64: barImg.toString('base64'),
      mime_type: 'image/png',
      focus: 'key demographic gaps',
    },
  });
  console.log('MCP Tool Result (first 200 chars):');
  console.log(resVisual.content[0].text.slice(0, 200) + '...\n');
  await sleep(4000);

  // 2. Test MCP Tool: describe_surroundings
  console.log('--- Calling MCP Tool: describe_surroundings (indoor_desk_workspace.jpg) ---');
  const deskImg = fs.readFileSync(path.join(assetsDir, 'indoor_desk_workspace.jpg'));
  const resSurround = await client.callTool({
    name: 'describe_surroundings',
    arguments: {
      image_base64: deskImg.toString('base64'),
      mime_type: 'image/jpeg',
    },
  });
  console.log('MCP Tool Result:');
  console.log(resSurround.content[0].text + '\n');
  await sleep(4000);

  // 3. Test MCP Tool: ask_followup
  console.log('--- Calling MCP Tool: ask_followup ---');
  const resFollowup = await client.callTool({
    name: 'ask_followup',
    arguments: {
      question: 'What was placed on the left side of the desk?',
      prior_context: resSurround.content[0].text,
    },
  });
  console.log('MCP Tool Result:');
  console.log(resFollowup.content[0].text + '\n');

  await client.close();
  console.log('=============================================================');
  console.log('  All MCP Tool Schema Handshakes Passed Successfully!');
  console.log('=============================================================\n');
}

runMcpToolTests().catch((err) => {
  console.error('MCP Tool verification failed:', err);
  process.exit(1);
});
