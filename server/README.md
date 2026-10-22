# EchoSight — Alexa+ MCP Server

This directory contains the Model Context Protocol (MCP) server for **EchoSight**, built to the **MCP Spec (2025-11-25+)** over **Streamable HTTP / SSE** and **Stdio** transports.

## Architecture & Transports
- **Streamable HTTP / SSE (`GET /sse` & `POST /messages`):** Primary transport required for Alexa+ integration and remote client streaming.
- **Stdio (`--stdio`):** Direct standard I/O transport for local tool testing with the official MCP Inspector.
- **Health Check (`GET /health`):** Endpoint reporting uptime and active client sessions.

## Gemini Key Pool

The server reads `GEMINI_API_KEY` plus the optional `GEMINI_API_KEY1`, `GEMINI_API_KEY2`, and `GEMINI_API_KEY3` variables. Unique configured keys are kept server-side and rotated with a per-project rolling RPM budget. The health response reports the configured key count and the recommended radar cadence without exposing key values.

## Baseline Tooling (Phase 2)
- **`ping`:** Verifies protocol handshake, schema validation, service health, and transport status.

## Getting Started
```bash
# Install dependencies
npm install

# Build TypeScript to dist/
npm run build

# Start Streamable HTTP server on port 3001
npm start

# Run automated Stdio test
npm run test:stdio

# Run automated Streamable HTTP / SSE test
npm run test:sse

# Launch official MCP Inspector Web UI
npm run inspector
```

For local configuration, add the keys to `server/.env` and never expose them in the client bundle or commit them to source control:

```ini
GEMINI_API_KEY=your_primary_project_key
GEMINI_API_KEY1=your_second_project_key
GEMINI_API_KEY2=your_third_project_key
GEMINI_API_KEY3=optional_fourth_project_key
GEMINI_RPM_PER_KEY=15
GEMINI_REQUEST_TIMEOUT_MS=12000
GEMINI_WALKING_ATTEMPT_TIMEOUT_MS=4200
GEMINI_WALKING_TOTAL_TIMEOUT_MS=11500
```
