import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3005';

async function runClient() {
  console.log(`Connecting MCP Client to Express SSE Server at ${SERVER_URL}/sse ...`);

  const transport = new SSEClientTransport(new URL(`${SERVER_URL}/sse`));
  const client = new Client(
    { name: 'mcp-express-test-client', version: '1.0.0' },
    { capabilities: {} }
  );

  await client.connect(transport);
  console.log('✓ Successfully connected to Express SSE server!');

  // 1. List available tools
  const toolsResponse = await client.listTools();
  console.log('\n--- Available Tools ---');
  for (const tool of toolsResponse.tools) {
    console.log(`- ${tool.name}: ${tool.description}`);
  }

  // 2. Call the 'calculate' tool
  console.log('\n--- Calling "calculate" Tool (multiply 7 * 9) ---');
  const calcResult = await client.callTool({
    name: 'calculate',
    arguments: {
      operation: 'multiply',
      a: 7,
      b: 9,
    },
  });
  console.log('Tool Response:', calcResult.content);

  // 3. Call the 'echo' tool
  console.log('\n--- Calling "echo" Tool ---');
  const echoResult = await client.callTool({
    name: 'echo',
    arguments: {
      message: 'Hello from MCP Express Client!',
    },
  });
  console.log('Tool Response:', echoResult.content);

  // 4. Disconnect cleanly
  console.log('\nClosing connection cleanly...');
  await transport.close();
  console.log('✓ Disconnected successfully. Exiting.');
}

runClient().catch((err) => {
  console.error('Client error:', err);
  process.exit(1);
});
