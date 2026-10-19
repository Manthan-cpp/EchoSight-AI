import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function testStdio() {
  console.log('[Test] Connecting MCP Client via Stdio transport...');
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['dist/index.js', '--stdio'],
  });

  const client = new Client(
    { name: 'echosight-test-stdio', version: '1.0.0' },
    { capabilities: {} }
  );

  await client.connect(transport);
  console.log('[Test] Stdio Client connected successfully.');

  const tools = await client.listTools();
  console.log('[Test] Available tools:', tools.tools.map((t) => t.name));

  const result = await client.callTool({
    name: 'ping',
    arguments: { message: 'Stdio verification handshake' },
  });

  console.log('[Test] Tool Call Result:');
  console.log(JSON.stringify(result, null, 2));

  await client.close();
  console.log('[Test] Stdio transport test passed.\n');
}

testStdio().catch((err) => {
  console.error('[Test] Stdio test failed:', err);
  process.exit(1);
});
