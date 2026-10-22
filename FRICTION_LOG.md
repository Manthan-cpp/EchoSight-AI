# Developer Friction Log: EchoSight & Model Context Protocol (MCP)

> **Project:** EchoSight (Alexa+ Track)  
> **Repository:** https://github.com/Manthan-cpp/EchoSight-AI  
> **Author:** Manthan (`Manthan-cpp`)  
> **Context:** Hackathon Developer Feedback for Model Context Protocol (MCP) & Alexa+ Voice Assistant Ecosystem

---

### Friction Entry 1: SSE Transport Session Lifecycle & Dangling Sockets
* **Specific Task Attempted:** Connect a browser-based voice assistant client to an Express MCP server using Server-Sent Events (`SSEServerTransport`) for real-time camera tool streaming.
* **Steps Taken:**
  1. Instantiated `new SSEServerTransport('/messages', res)` on incoming `GET /sse`.
  2. Registered active session in server state.
  3. Simulated user closing or refreshing browser tab during active walking navigation.
* **Expected vs. Actual Result:**
  * *Expected:* SDK transport provides a built-in `onClose` hook or auto-detects socket hang-up to cleanly garbage-collect internal streams and session listeners.
  * *Actual:* The underlying Node socket remained open in `CLOSE_WAIT` / half-closed state, leaking memory and leaving dangling JSON-RPC session IDs until the process crashed under repeated reconnections.
* **Severity Rating:** **Critical** (Production blocker for web/remote agent deployments).
* **Workaround Used:** Manually attached listeners to Express request lifecycle (`req.on('close', ...)`) and built an active session registry with an automated 60-second inactivity TTL sweeper.
* **Actionable Suggestion:** Incorporate official Express/Fastify adapter middleware directly into `@modelcontextprotocol/sdk` with built-in heartbeat and auto-teardown handlers.

---

### Friction Entry 2: Lack of Native Deadline / Timeout Propagation in MCP Tool Handlers
* **Specific Task Attempted:** Enforce hard 4-second latency deadlines on real-time walking path safety checks (`check_walking_path`) so blind users are never left waiting without guidance.
* **Steps Taken:**
  1. Dispatched a safety tool call from client to MCP server over `/sse`.
  2. Upstream inference encountered temporary network jitter.
* **Expected vs. Actual Result:**
  * *Expected:* MCP tool protocol specification supports standard gRPC-style deadline propagation or `AbortSignal` passed into `server.setRequestHandler(CallToolRequestSchema, (req, { signal }) => ...)`.
  * *Actual:* The tool handler does not expose an abort controller or caller-specified timeout header. Tool calls block indefinitely until upstream completes or client forcibly disconnects.
* **Severity Rating:** **Important** (Safety-critical for assistive and real-time robotics use cases).
* **Workaround Used:** Wrapped every internal tool execution in an external `Promise.race()` with a local hard timeout, manually discarding late responses.
* **Actionable Suggestion:** Add an optional `deadlineMs` field to `CallToolRequestSchema` and pass a standard `AbortSignal` into MCP tool execution handlers.

---

### Friction Entry 3: Conversational Barge-In & Speech Feedback Loops
* **Specific Task Attempted:** Allow visually impaired users to interrupt long system speech synthesis by uttering urgent navigation commands (*"Stop"* or *"Can I turn?"*).
* **Steps Taken:**
  1. Enabled continuous `webkitSpeechRecognition` while `window.speechSynthesis` played walking instructions.
  2. Tested user speaking while system was reading guidance.
* **Expected vs. Actual Result:**
  * *Expected:* Built-in audio stack cleanly cancels playback without hearing its own speaker output.
  * *Actual:* The microphone repeatedly transcribed the device's own synthesized speech, creating recursive feedback loops and false collision triggers.
* **Severity Rating:** **Important** (UX friction for voice-first assistive products).
* **Workaround Used:** Built a software acoustic gate that tracks utterance playback timestamps and immediately invokes `window.speechSynthesis.cancel()` the millisecond user-initiated speech confidence crosses threshold.
* **Actionable Suggestion:** Provide standard audio loopback suppression guidelines or WebRTC AEC (Acoustic Echo Cancellation) primitives in developer documentation for voice-first agent integrations.

---

### Friction Entry 4: Binary Media Ingestion Over SSE Protocol
* **Specific Task Attempted:** Stream continuous high-framerate camera frames (640x480 JPEG) to the MCP server for 2.5-second walking radar scans.
* **Steps Taken:**
  1. Captured canvas snapshot from `<video>` element.
  2. Encoded frame as Base64 data URI in tool call arguments.
* **Expected vs. Actual Result:**
  * *Expected:* High throughput with low payload overhead.
  * *Actual:* Base64 encoding over JSON-RPC inflated payload sizes by ~33%, introducing unnecessary encoding latency and network serialization overhead.
* **Severity Rating:** **Nice-to-Have** (Optimization).
* **Workaround Used:** Downscaled canvas snapshots to 640px at 0.70 quality and optimized JSON serialization pipelines.
* **Actionable Suggestion:** Consider supporting binary chunk streaming (e.g., Multipart MIME or WebSocket binary frames) for visual/multimodal MCP tools.
