# MCP Express SSE Server Example

A complete, production-grade implementation of a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server using **Express** and **Server-Sent Events (SSE / Streamable HTTP)** transport with multi-session lifecycle management.

## Why this example matters

While standard Stdio transport works well for local CLI tools, web and mobile client applications (such as simulated voice agents or browser extensions) require HTTP-based transports. Express remains the most widely deployed Node.js web framework, but setting up MCP over Express with SSE requires handling nuances that trip up developers:

1. **Session-to-Transport Mapping:** Each client SSE connection generates a unique `sessionId`. Subsequent JSON-RPC requests via `POST /messages?sessionId=...` must be routed to the exact matching transport.
2. **Socket & Memory Leak Prevention:** When clients disconnect or reload pages, `req.on('close')` must clean up the transport and remove the session from in-memory maps.
3. **Inactivity TTL Eviction:** Stale or abandoned connections must be periodically swept to prevent memory exhaustion in long-running processes.

This example solves all three issues in a clean, self-contained architecture.

---

## Architecture Overview

```
                      +-----------------------------------+
                      |         Express Server            |
                      |                                   |
                      |  Active Sessions Map              |
                      |  [sessionId] -> { transport }     |
                      +-----------------+-----------------+
                                        |
      1. GET /sse                       |  2. SSE stream open
Client -------------> (Creates Transport) ---------------> Client
                                        |
      3. POST /messages?sessionId=...   |  4. JSON-RPC response
Client -------------> (Routes to Transport) --------------> Client
```

---

## Installation & Setup

```bash
npm install
npm run build
```

## Running the Server

```bash
npm start
# Server listens on http://localhost:3005
```

## Testing with the Included MCP Client

In a second terminal:

```bash
npm run client
```

The client will:
1. Connect via SSE to `http://localhost:3005/sse`.
2. Discover tools (`calculate`, `echo`).
3. Call the `calculate` tool.
4. Call the `echo` tool.
5. Gracefully disconnect.

---

## License

Apache-2.0
