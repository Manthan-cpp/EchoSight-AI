import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

async function testSSE() {
  console.log('[Test] Connecting MCP Client via Streamable HTTP/SSE transport (port 3001)...');
  const url = new URL('http://localhost:3001/sse');
  const transport = new SSEClientTransport(url);

  const client = new Client(
    { name: 'echosight-test-sse', version: '1.0.0' },
    { capabilities: {} }
  );

  await client.connect(transport);
  console.log('[Test] SSE Client connected successfully.');

  const tools = await client.listTools();
  console.log('[Test] Available tools:', tools.tools.map((t) => t.name));

  const result = await client.callTool({
    name: 'ping',
    arguments: { message: 'Streamable HTTP transport validation' },
  });

  console.log('[Test] Tool Call Result:');
  console.log(JSON.stringify(result, null, 2));

  await client.close();
  console.log('[Test] Streamable HTTP / SSE transport test passed.\n');
}

testSSE().catch((err) => {
  console.error('[Test] SSE test failed:', err);
  process.exit(1);
});
