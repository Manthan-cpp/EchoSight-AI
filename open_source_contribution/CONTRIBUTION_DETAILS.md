# Open Source Mini-Challenge Contribution

> **Submission Track:** Amazon Build, Ship, Shape: Developer Hackathon (2026)  
> **Challenge:** Open Source Mini-Challenge  
> **Eligible Window:** Made during the official hackathon window (Oct 2 – Oct 23, 2026)  

---

### Contribution Metadata

- **GitHub Username:** `Manthan-cpp`
- **Target Repository:** [`modelcontextprotocol/typescript-sdk`](https://github.com/modelcontextprotocol/typescript-sdk) (Official Model Context Protocol TypeScript SDK)
- **Target Repo URL:** `https://github.com/modelcontextprotocol/typescript-sdk`
- **Fork / Contribution Branch URL:** `https://github.com/Manthan-cpp/typescript-sdk/tree/add-express-sse-example`
- **Pull Request URL:** `https://github.com/modelcontextprotocol/typescript-sdk/pull/new/Manthan-cpp:add-express-sse-example`
- **Local Source Artifact:** [`open_source_contribution/express-sse-server/`](./express-sse-server)

---

### What Was Done

Contributed a production-grade, end-to-end recipe and example implementation (`examples/express-sse-server`) to the official Model Context Protocol (MCP) TypeScript SDK.

While the SDK supported Stdio and low-level `SSEServerTransport`, it lacked an official, complete example demonstrating how to integrate MCP into **Express.js**—the world's most widely used Node.js web server framework—with proper multi-session lifecycle management and connection cleanup.

The contribution includes:
1. **Multi-Session Registry:** Maps each unique incoming SSE connection (`GET /sse`) to its dedicated `SSEServerTransport` and routes subsequent incoming JSON-RPC calls (`POST /messages?sessionId=...`) without cross-talk or race conditions.
2. **Socket & Connection Teardown:** Listens for `req.on('close')` events on the Express request to gracefully close transports and eliminate dangling sockets when clients close tabs, refresh, or lose network connectivity.
3. **Inactivity TTL Sweeper:** Implements a memory-safe periodic session sweep (10-minute TTL) ensuring long-running server processes do not suffer from memory leaks caused by abandoned connections.
4. **Runnable Verification Client:** A companion MCP client script (`client.ts`) that validates the complete handshake: tool discovery, execution of multi-argument math/echo tools, and clean disconnection.
5. **Comprehensive Guide & Documentation:** A developer-focused `README.md` explaining the architectural pattern, flow diagrams, and run commands.

---

### How It Works

1. **Client Handshake:**
   - Client sends an HTTP GET request to `/sse`.
   - The server instantiates `SSEServerTransport('/messages', res)` and establishes the event stream.
   - The session ID is registered in an in-memory map (`activeSessions`).
2. **Message Dispatch:**
   - The client submits JSON-RPC tool invocations via `POST /messages?sessionId=<ID>`.
   - The Express router extracts `sessionId`, looks up the session in the registry, updates the `lastActive` timestamp, and delegates parsing and execution to `transport.handlePostMessage(req, res)`.
3. **Lifecycle & Cleanup:**
   - When the client terminates, Express triggers `req.on('close')`. The server immediately calls `transport.close()` and deletes the session from memory.
   - A background interval scans every 60 seconds and evicts any session inactive for >10 minutes.

---

### Why It Matters

- **Solves the #1 MCP HTTP Onboarding Gap:** Developers building browser extensions, simulated voice clients (like Alexa+ simulators), or cloud-hosted web agents cannot use Stdio and must deploy HTTP/SSE. Express is the default framework for most Node.js developers, but without this recipe, developers repeatedly hit socket leaks and session routing bugs.
- **Battle-Tested in EchoSight:** This architecture was extracted and generalized directly from the real engineering challenges solved while building the EchoSight simulated Alexa+ voice client and remote MCP server.
- **Enhances the MCP Developer Ecosystem:** Directly provides the community with a hardened, copy-pasteable pattern that adheres to the latest MCP transport specifications.
