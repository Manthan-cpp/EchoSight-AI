# EchoSight — Alexa+ MCP Server

This directory contains the Model Context Protocol (MCP) server for **EchoSight**, built to the **MCP Spec (2025-11-25+)** over **Streamable HTTP / SSE** and **Stdio** transports.

## Architecture & Transports
- **Streamable HTTP / SSE (`GET /sse` & `POST /messages`):** Primary transport required for Alexa+ integration and remote client streaming.
- **Stdio (`--stdio`):** Direct standard I/O transport for local tool testing with the official MCP Inspector.
- **Health Check (`GET /health`):** Endpoint reporting uptime and active client sessions.

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
