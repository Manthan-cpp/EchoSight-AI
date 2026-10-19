import { spawn } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function isServerRunning() {
  try {
    const res = await fetch('http://localhost:3001/health');
    return res.ok;
  } catch {
    return false;
  }
}

async function testSSE() {
  console.log('[Test] Verifying Streamable HTTP/SSE transport on port 3001...');
  let child = null;

  const running = await isServerRunning();
  if (!running) {
    console.log('[Test] Server not currently running. Spawning server instance on port 3001...');
    child = spawn('node', ['dist/index.js'], {
      stdio: 'inherit',
      shell: true,
    });
    // Wait for server to be ready
    for (let i = 0; i < 10; i++) {
      await sleep(500);
      if (await isServerRunning()) break;
    }
  }

  try {
    const url = new URL('http://localhost:3001/sse');
    const transport = new SSEClientTransport(url);

    const client = new Client(
      { name: 'echosight-test-sse', version: '1.0.0' },
      { capabilities: {} }
    );

    await client.connect(transport);
    console.log('[Test] SSE Client connected successfully.');

    const tools = await client.listTools();
    console.log('[Test] Available tools via SSE:', tools.tools.map((t) => t.name).join(', '));

    const result = await client.callTool({
      name: 'ping',
      arguments: { message: 'Streamable HTTP transport validation' },
    });

    console.log('[Test] Tool Call Result:');
    console.log(JSON.stringify(result, null, 2));

    await client.close();
    console.log('[Test] Streamable HTTP / SSE transport test passed.\n');
  } finally {
    if (child) {
      console.log('[Test] Cleaning up spawned server process...');
      child.kill('SIGTERM');
    }
  }
}

testSSE().catch((err) => {
  console.error('[Test] SSE test failed:', err);
  process.exit(1);
});
