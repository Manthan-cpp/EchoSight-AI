# EchoSight — Privacy Policy (Project Scope)

> This formalizes the data-handling hard rule from PLAN.md Section 4 into an actual policy. This is a tool that processes real images, videos, and continuous live-camera frames from people who often cannot see what's being captured — privacy here is a real design requirement, not boilerplate.

---

## 1. What the system ever sees

- A single photo the user provides, when asking for a description.
- A video clip the user provides, when asking for narration.
- A continuous stream of camera frames while Surroundings Mode is active.
- The text of spoken questions and the system's spoken responses, within a session.

## 2. What is never stored beyond the active session

- No photo, video, or Surroundings Mode frame is retained after the session that produced it ends.
- No persistent library of a user's past images or video is kept.
- No account system, login, or cross-session history exists in this build — each session starts clean.

## 3. What is sent to Gemini (Google's API)

- Images, video clips, and Surroundings Mode frames are sent to the Gemini API for processing, as required for the system to function.
- No data is sent to Gemini beyond what's needed to answer the specific request in front of it.
- This project does not control Google's own data handling for API requests — users should be told, in the app itself, that visual data is processed by a third-party AI service (Gemini) to generate descriptions, in plain language, before first use.

## 4. Surroundings Mode specifically

- Frames are captured, sent for processing, described, and discarded — not accumulated into a session-long archive.
- A session has a maximum duration (set in PLAN.md Section 5) specifically to prevent an accidentally-open session from continuously capturing a user's surroundings for an unbounded period.
- Stopping Surroundings Mode stops capture immediately — no background capture after a stop command.

## 5. What this means for implementation (checked in Phase 9)

- No image/video/frame data written to disk or a database beyond what's needed in-memory for the current request/response cycle.
- No analytics or logging pipeline that captures raw visual content.
- Error logs, if any, must never include the actual image/video data — only metadata needed for debugging (e.g. file size, format, timestamp).

## 6. Scope note

This document covers this hackathon project's own handling of data. It does not and cannot make claims about Google's Gemini API's own data retention or training-use policies — users relying on this for real sensitive use should be pointed to Google's own API terms for that detail, which is out of scope for this project to summarize or guarantee.
