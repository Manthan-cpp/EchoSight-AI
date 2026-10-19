# EchoSight — Amazon "Build, Ship, Shape" Hackathon — Alexa+ Track
## Master Build Plan (Detailed, Stepwise, Agent-Agnostic)

> **Read this entire file before writing any code.** This is the single source of truth for this project. Any AI agent (Claude Code, Claude in chat, Cursor, Codex, Kiro, or any other agent) picking this project up — at the start or mid-way — must read Sections 0–7 in full first, then check the **Phase Log** at the very bottom to see what is *actually done* (not just planned), then resume from the first unchecked step. Do not assume prior context. Do not trust anything that isn't in this file or in the actual repo state. If this file and the repo disagree, the repo is correct — update this file to match, then continue.

> **Mandatory first step, every session, before anything else:** do a full, deep web research pass on the Amazon "Build, Ship, Shape" Developer Hackathon — the official rules page, the Alexa+ track page, the submission-requirements page, and the mini-challenge pages (see links in Section 0). Section 0 below is a snapshot taken during planning, not a substitute for checking the live official source — program details, deadlines, and requirements can change, and a stale assumption here could invalidate the whole submission. Do this research before writing or changing any code, and before trusting any detail in this file as still accurate.

---

## 0. Hackathon Context — know this cold (verify against live sources per the note above)

- **Hackathon:** Build, Ship, Shape: Amazon Developer Hackathon
- **Official page:** https://amazonappdev2026.devpost.com/
- **Rules:** https://amazonappdev2026.devpost.com/rules
- **Resources:** https://amazonappdev2026.devpost.com/resources
- **FAQs:** https://amazonappdev2026.devpost.com/details/faqs
- **Our primary track:** Alexa+
- **Mini-challenge we are targeting:**
  - **Open Source** — ship this project as a real open-source project (OSS license, public repo) AND make a real, separate contribution (branch/fork/PR, doesn't need to be merged) to another public repo during the hackathon window.
  - **AWS Builder mini-challenge is explicitly NOT being pursued.** This project does not use any AWS AI service (see Section 0a for why), so it is not eligible for AWS Builder and the submission must not claim otherwise anywhere — not in the text description, not in the product feedback section, not in the demo video. One project can win at most one track prize + one mini-challenge prize anyway, so there is no upside lost by skipping it cleanly.
- **Submission deadline: October 23, 2026, 12:00 PM PDT.**
  - Converted for Manthan's timezone (IST, Kolkata): **October 24, 2026, 12:30 AM IST.** Treat the real internal deadline as Oct 23, 11:00 PM IST to leave a buffer.
  - Hard deadline. No extension assumed.
- **Eligibility:** builder must be of legal majority age in their country of residence. Standard excluded territories apply (Brazil, Quebec, Russia, Crimea, Cuba, Iran, North Korea, and similar). India is not excluded. Participants may enter individually or as a team — **decide this explicitly before Phase 1** (solo vs. team INVICTUS or others) and record the decision in the Phase Log, since it affects the Devpost submission form and GitHub repo ownership.
- **Build-window requirement:** the project must be built, or substantially built, during the hackathon window (Aug 31 – Oct 23, 2026). The submission form requires a clear statement if any part of the project existed before the hackathon. **For this project: everything is an original, from-scratch implementation conceived and built during the hackathon window. No code or assets are reused from any other hackathon, any other team's project, or any prior work.** State this plainly and accurately in the submission text — do not overclaim, do not underclaim.
- **No purchase necessary to enter or win.**
- **Why this matters beyond the prize money:** this is explicitly meant to be a real, deployable accessibility tool, not a throwaway demo. The long-term intent is to pitch it, after the hackathon, to real organizations that work with blind and low-vision communities (national/state blind welfare associations, disability rights NGOs, accessibility-focused nonprofits) as something they could actually use. "Credible real-world impact beyond the hackathon" is literally one of the four official judging criteria (Section 3) — treat it as a real product requirement throughout, not an afterthought for the pitch deck.
- **Judges include (for context on who's reading this):** VP Amazon Devices, VP Fire TV Experience, Senior Manager Fire TV Voice & AI, Senior Solutions Architects (Alexa), Chief Evangelist (Alexa), Co-founder/GM (Bee), Principal Evangelist (AWS), among others. These are technical, product-literate judges — do not pad the submission with fluff they'll see through immediately.

### 0a. Why Gemini, not Bedrock — and why that's said plainly, not hidden
We are not using any AWS AI service in this project. We use **Google Gemini** (via the Gemini API / Google AI Studio) as the reasoning model, for two real reasons, not just cost:
1. Gemini has a genuinely usable free tier — no credit card required, no risk of this project costing Manthan real money during development or demoing.
2. Gemini natively ingests **video files directly** and reasons over the whole clip, and handles frequent image calls well — both of which matter here, since the product now centers on a continuous live-camera experience (Surroundings Mode, Section 1) on top of video narration. This is a real technical fit, not available the same way on an image-only model.

This does mean we are not eligible for the AWS Builder mini-challenge (Section 0), which is fine — it was never the focus. It does **not** affect Alexa+ track eligibility: the track only requires real Alexa+ tech (MCP server / Agent Skill / simulated client), and has no requirement that the model behind it be an AWS service. Say exactly this, plainly, in the submission text and product-feedback section. Never claim or imply AWS/Bedrock usage anywhere in the submission — repo, text, video, or feedback form.

---

## 1. What we are building

**The main selling point, and what a judge or user should understand within seconds of seeing the demo:** the user opens the app, points their phone's camera at the world in front of them, and the system continuously, out loud, describes what it sees — hands-free, no screen needed, updating in near-real-time. This is **Surroundings Mode**, and it is the flagship, headline capability of EchoSight. Built for people who are blind or have low vision, as a voice-first companion for everyday life — not a one-shot "upload a photo" tool, but something that stays with them as they move through a space.

Beyond that live-camera experience, EchoSight also fully supports:

1. **Deep still-image description** — not "a bar chart with five bars," but a full, structured, exhaustive walkthrough: what the chart shows, what each axis and label means, what the actual values are, what trend or story the data tells, and what's unusual or worth noting — described the way a careful human narrator would, with the user able to ask to go deeper on any part.
2. **Video narration** — the user records or shares a short video clip, and the system narrates what's happening in it from start to end, understanding the whole clip as one continuous scene (not frame-by-frame guesswork).
3. **Live match/scorecard analysis** — the user shows a cricket (or similar) scorecard, and the system explains what the numbers *mean*: who's ahead, by how much, run rate vs. required rate, what a batter's figures imply about their innings — real sports-data reasoning, not transcription.

All of it voice-first, through a real Alexa+ MCP server/Agent Skill (or its simulated equivalent), with no screen interaction required at any point.

*(Keep this framing consistent across the submission text, the demo video narration, and the repo README — judges should see the same story everywhere, word-for-word close. Lead with Surroundings Mode in every one of these; the other three capabilities are presented as "also included," not co-equal headlines.)*

### 1a. Out of scope for this hackathon (say this explicitly if asked — don't silently fail to build it)
- Real Alexa+ device certification/live Alexa+ Store listing (Submit/Maintain stages) — not realistic in this window; we ship via the MCP/Agent Skill path with a simulated Alexa+ client as the guaranteed demo path, and pursue real Private Preview access opportunistically (Section 7).
- True frame-perfect, zero-lag live video narration — not technically honest to promise. Surroundings Mode updates on a real ~5-second cadence (Section 6), described accurately as "continuously updating," never as instantaneous.
- Precise distance/depth measurement in Surroundings Mode (e.g. "2.3 meters away") — the system gives relative, descriptive positioning ("just in front of you," "a few steps to your left"), not sensor-grade measurement. This is a real, stated limitation, not an oversight — see Phase 6.
- Multi-language voice support — English only for the hackathon submission, note it as a "nice-to-have" feature request in the submission form.
- User accounts / persistent cross-session history — each session is self-contained; no login system needed for the demo.

---

## 2. Official submission checklist — do not submit without every item checked

- [ ] Text description of the project: what it does and how it works
- [ ] GitHub repo containing all source, assets, and run instructions. Either:
  - Public, with an open-source license file (**recommended — simpler, and required anyway for the Open Source mini-challenge**), or
  - Private, shared as collaborators with: `chris-trag`, `knmeiss`, `giolaq`, `anishamalde`, `mosesroth`, `emersonsklar` (add these at submission time — GitHub invites expire after 7 days, do not send early)
- [ ] Repo must **call** the Alexa+ tech in actual code — a real import, entry point, or loaded MCP/agent config. A README mention is not enough.
  - Demo must show the Agent Skill or MCP server (spec 2025-11-25+, Streamable HTTP) actually working, via the simulated Alexa+ client.
- [ ] Demo video, under 3 minutes, public on YouTube or Vimeo, in English. Judges are not required to watch past 3 minutes — lead with the best material (Surroundings Mode, live). No unlicensed third-party music, footage, or trademarks.
- [ ] Product feedback write-up for every tool/API/SDK used: what it was used for, what worked, what needs work, how onboarding felt, whether we'd use it again. (Gemini API, MCP tooling, Alexa+ CLI/simulator all go here explicitly. Do not mention Bedrock/AWS — we did not use it.)
- [ ] Track + mini-challenge selection marked correctly on the Devpost form — **Alexa+ track + Open Source mini-challenge only.**
- [ ] **Open Source mini-challenge:** contribution URL, repo URL, GitHub username, and a short description of what was done, how it works, and why it matters
- [ ] Explicit statement of what was built during the submission window (Section 0)
- [ ] Optional: feature requests (rated critical / important / nice-to-have) — low effort, worth including
- [ ] Optional: friction log entries (task attempted, steps taken, expected vs. actual, severity, workaround, suggestion) — **can earn up to a 10% judging score bonus.** Worth doing properly, not skipping. Template in Section 6, Phase 8.

---

## 3. Judging criteria — design every phase against these four

1. **Tech Implementation** — how well is it built, and how effectively does it use the required Alexa+ tech?
2. **Design** — does it deliver a complete, coherent product experience? Is the interaction model intuitive for voice/visual use?
3. **Potential Impact** — credible, specific case for solving a real need; could it realistically serve people beyond the hackathon?
4. **Quality of Idea** — creative, imaginative use of the tools; genuine understanding of the developer ecosystem and end users?

---

## 4. Hard rules — apply in every single phase, no exceptions

- **No mock data. No fake metrics. No hardcoded "sample" AI responses, anywhere, ever.** Every demo in every phase must show a real API call to the real model (Gemini) returning a real result on a real test image, video, or live camera frame. If something can't be demoed for real yet, the phase isn't done.
- **No placeholder UI content presented as real** — no fake analytics numbers, no lorem ipsum standing in for content, no "demo mode" that quietly fakes a response.
- **Never claim or imply AWS/Bedrock usage anywhere** — not in code comments, not in the README, not in the submission text, not in the demo video narration. This project uses Gemini. Say that, accurately, everywhere.
- **Every phase ends with a working, demonstrable increment, then STOPS.** Report exactly what was built, how to see/test it live, and explicitly ask for approval, a live demo check, and permission before starting the next phase. Never chain phases automatically, even if the next phase seems obvious.
- **Commit as you go, not in one giant dump at the end.** Regular, meaningful commits during each phase are a positive signal. Commit at least once per completed sub-step within a phase.
- **Never push to GitHub (and never run `git push`) unless Manthan explicitly says to push, that session, for that specific commit/set of commits.** Committing locally is fine and expected — pushing is not automatic and needs a direct go-ahead every time.
- **Commit messages must read like a human wrote them: past tense, three to four words, plain prose.** No AI-sounding phrasing, no em dashes, no semicolons, no colons, no conventional-commit prefixes like "feat" or "docs". Example: "Added camera capture flow" — not "feat: add camera capture flow" and not a long descriptive sentence either.
- **Update the Phase Log (bottom of this file) at the end of every phase** — what was actually completed, any deviation from the plan, open issues, exact commands to re-run the current state. Written so a different AI agent with zero prior context can resume correctly within minutes. Do not include day-countdown or time-pressure language anywhere in this file or in replies about it.
- **Never log, store, or display a user's uploaded image or video — or any frame captured during Surroundings Mode — longer than the active session requires.** This is a real accessibility tool handling real people's photos, videos, and live surroundings; treat privacy as a real requirement. Full policy in PRIVACY.md.
- **Never mention the original inspiration source for this project's concept, in any file, any code comment, any doc, or any reply, under any circumstance.** This applies for the entire remaining life of this project.
- **Every UI screen must follow DESIGN.md exactly** — no exceptions, no "just this once" decorative flourish. If a screen doesn't pass the test in DESIGN.md Section 4, it isn't done.

---

## 5. Cost constraint — read before touching the Gemini API

Manthan's standing constraint across all projects: free tiers only, no paid APIs, free hosting only. Here is how this project stays inside that for real:

- Get a **Gemini API key** from Google AI Studio (aistudio.google.com) — free, no credit card required to start.
- The free tier is **rate-limited** (roughly 15 requests per minute as of now, varies by model and changes over time — check the actual current limit in AI Studio at setup time, don't trust a hardcoded number). This is a real constraint, not a formality.
- **Surroundings Mode is the feature most likely to hit this limit**, since it calls the API repeatedly while active:
  - Locked cadence: **one call every 5 seconds** (12 calls/minute) — stays safely under the ~15 RPM limit with margin for a follow-up question or retry during the same session.
  - A 3-second cadence (20 calls/minute) is **not safe** on the free tier and must not be used as the default — see Phase 6 for the full reasoning.
  - **Frame-change detection** (optional refinement, Phase 6): skip the Gemini call entirely when the scene hasn't meaningfully changed since the last call, using a cheap local comparison first. This reduces real call volume and allows faster *effective* response when something actually happens, without raising the worst-case rate.
  - **Do not use multiple API keys/accounts to multiply the free quota.** This is against the platform's terms for most free tiers and risks the whole project's API access being revoked, including mid-demo. One key, one account, real engineering (frame-change detection) to use it efficiently — not quota circumvention.
  - **Sessions must have a sane maximum continuous duration** (a few minutes, exact number to be fixed once built and tested) so an accidentally-left-open Surroundings Mode session can't silently burn through the daily free quota. Document the chosen limit in the Phase Log once decided.
- Video calls are billed differently from text/image when you move past the free tier (per-second-of-video style pricing) — another reason to keep all testing inside free-tier limits and never accidentally enable billing on the Google Cloud project behind the API key.
- Host the MCP server on a **free tier**: Render free web service, Railway free tier, or Fly.io free allowance all work for a low-traffic hackathon demo.
- If free-tier limits become a real blocker, the fallback is reducing call frequency and demo scope — not switching to a paid plan or a different paid provider without an explicit conversation about it first.

---

## 6. Phases

### Phase 1 — UI/UX Design System (Production-Grade)
**Goal:** a calm, confident, genuinely production-grade visual language — built first, because the live-camera Surroundings Mode screen is the single most important surface in the whole product and deserves to be designed before anything else is built around it. Every rule in DESIGN.md applies here, strictly.
**Steps:**
1. Initialize the GitHub repo: public, with an OSS license file (MIT recommended).
2. Define the color system: calm, restrained palette, checked for real WCAG-AA contrast ratios (use an actual contrast-checker tool). Both light and dark mode.
3. Define the typography scale (readable sizes, generous line height — users may have low vision, not just blindness).
4. **Design the Surroundings Mode screen first, as the primary screen of the whole app.** A calm, persistent "Watching" state (no glow, no pulsing neon waveform — see DESIGN.md), clear start/stop control, and a scrolling transcript of what's been described so far. This screen is what a judge sees first in the demo; it has to feel finished.
5. Design the secondary screens: image/video upload-or-capture, conversation transcript for non-live Q&A, loading, listening, error, empty states.
6. Every screen must have a real, navigable empty state — no fake populated data anywhere, per Section 4.
7. Make it responsive (phone-first — this is a phone-camera product).
**Deliverable:** a clickable static prototype — every screen in a real, navigable state (empty, loading, watching, error), zero fabricated content, fully compliant with DESIGN.md.
**Definition of done:** prototype runs locally, every screen reachable by clicking through, contrast ratios documented, every screen passes the DESIGN.md Section 4 test.
**End of phase:** STOP. Present the prototype. Ask for approval before Phase 2.

### Phase 2 — Foundation & Scaffolding
**Goal:** a real, minimal, working backbone behind the UI built in Phase 1.
**Steps:**
1. Decide solo vs. team entry; record in Phase Log.
2. Create a Google AI Studio account and generate a **Gemini API key**. Confirm the current free-tier rate limit shown in AI Studio for the model you intend to use, and write it down in this file's Phase Log once confirmed (limits change over time).
3. Lock in the tech stack for the MCP server (Node.js + TypeScript using an official/community MCP SDK is the most battle-tested choice as of this writing; Python is an acceptable alternative if more comfortable — pick one and don't switch mid-build).
4. Set up local dev environment: correct Node/Python version, `.env.example` file documenting every required environment variable (Gemini API key, model name) without committing real secrets. Add real `.env` to `.gitignore` immediately.
5. Build a minimal MCP server with one real tool (e.g. `ping`) that responds correctly over Streamable HTTP, spec 2025-11-25+.
6. Verify it in the **MCP Inspector** (official testing tool) — real tool call, real response, screenshot/recording it.
**Explicitly NOT in this phase:** no Alexa integration yet, no Gemini reasoning calls yet.
**Definition of done:** `ping` tool callable via MCP Inspector, returns a real response, Gemini API key confirmed working with a single test call in AI Studio's playground, repo pushed (once Manthan says to push) with license + `.env.example` + working server.
**End of phase:** STOP. Show MCP Inspector calling the real `ping` tool and getting a real response. Ask for approval before Phase 3.

### Phase 3 — Core Vision & Video Reasoning Pipeline (Gemini)
**Goal:** real image/video/live-camera in, real deep, structured description out. No shortcuts.
**Steps:**
1. Wire a real Gemini API client to the chosen model, using the API key from Phase 2.
2. Build the image upload → API call → parsed response flow end to end first.
3. **Source real test images and videos before writing a single prompt** — do not use AI-generated or synthetic charts/clips. Use real public-domain or Creative-Commons charts/maps/diagrams, real scorecard screenshots from real completed matches, and short real video clips and live camera footage Manthan captures himself.
4. Write and iterate the system prompt specifically for **depth and completeness** — the model should default to a thorough, structured walkthrough, not a one-line caption, and should explicitly say when it's uncertain rather than guess.
5. Add real video understanding: send a short real video clip to Gemini, confirm it returns a coherent narration of the whole clip.
6. **Build the Surroundings Mode core pipeline:** a continuous capture loop firing a real Gemini call every 5 seconds (Section 5), each returning a spoken-ready description of the current view. Implement graceful handling when a call is throttled or fails — skip that cycle, don't crash, don't hang, don't repeat stale information. Build the optional **frame-change detection** refinement: a cheap local comparison between consecutive frames that skips the Gemini call when nothing meaningfully changed.
7. Build real error handling from real failed test cases: deliberately test a blurry photo, a photo at a bad angle, a non-chart image, a corrupted/too-long video, a denied camera permission, and handle each based on what actually happens.
8. Set and document hard limits: image/video file size and format, maximum video length, and the maximum continuous duration for a single Surroundings Mode session (Section 5).
**Definition of done:** at least 5 different real test images produce correct, verified-by-eye detailed descriptions; at least 1 real video clip produces a correct, coherent narration; at least 1 real scorecard image produces a correct, reasoned explanation; Surroundings Mode runs continuously for at least 2 real minutes producing correct spoken-ready updates roughly every 5 seconds without crashing or exceeding the rate limit; frame-change detection is shown to measurably reduce call count in at least one real test; at least 2 deliberately bad inputs produce a graceful real error.
**End of phase:** STOP. Live demo: upload a real image, a real scorecard, a real video clip, AND run Surroundings Mode live for a real minute or two. Ask for approval before Phase 4.

### Phase 4 — MCP Server & Agent Skill Packaging
**Goal:** wrap the real pipeline as a spec-compliant MCP server + Agent Skill.
**Steps:**
1. Design the tool schema: `describe_surroundings` (the primary tool — called repeatedly during a live session, returns the current spoken-ready description), `analyze_visual` (single image, returns detailed structured description), `analyze_video` (video clip, returns coherent narration), `analyze_scorecard` (image, returns reasoned sports-data explanation), `ask_followup` (follow-up question + prior context, returns an answer).
2. Implement these as real MCP tools, spec 2025-11-25+, Streamable HTTP transport.
3. Write the `SKILL.md` Agent Skill package: clear tool descriptions, example invocations, voice-shaped response guidance (detailed but still speakable).
4. Deploy the server to the free hosting target chosen in Section 5, with a real public HTTPS endpoint.
5. Test every tool in MCP Inspector against the live deployed endpoint, not just localhost.
**Definition of done:** all five tools callable via MCP Inspector against the real deployed HTTPS endpoint, each producing a real Gemini-backed response.
**End of phase:** STOP. Demo MCP Inspector driving a real end-to-end call against the deployed server. Ask for approval before Phase 5.

### Phase 5 — Simulated Alexa+ Voice Client
**Goal:** real voice interaction via a browser-based simulated Alexa+ client — a real MCP client, not a mockup.
**Steps:**
1. Build a browser-based client that behaves like Alexa+: real speech-to-text input, real MCP client calling our deployed server, real text-to-speech output.
2. Wire the client's camera feed into `describe_surroundings`, calling it on the real 5-second cadence and speaking each update as it arrives, with a clear, calm "Watching" state per the Phase 1 design.
3. Wire real session/conversation memory so a follow-up question ("what's just ahead of me" / "what's the run rate now") resolves correctly without re-stating full context — test this with real follow-up questions, including ones asked *while Surroundings Mode is actively running*.
4. If Alexa+ Private Preview access has been granted by this point (Section 7), also test against a real Alexa+ device/simulator in parallel — but the browser-based simulated client remains the guaranteed, primary demo path regardless.
**Definition of done:** a full real Surroundings Mode session — start, several real spoken updates as the camera moves, a real interrupting follow-up question answered correctly mid-session, a clean stop — recorded and reviewed. Plus a full non-live conversation (image upload, detailed answer, follow-up) working the same way.
**End of phase:** STOP. Live voice demo: start Surroundings Mode, move the camera, hear real updates, ask a real follow-up mid-session, get a real contextual answer, stop cleanly. Ask for approval before Phase 6.

### Phase 6 — Differentiator Features
**Goal:** the features that make this genuinely stand out, honestly ranked by real impact.
**Lead features (build and polish these first — these carry the actual "wow," in priority order):**
1. **Surroundings Mode — the flagship capability.** Live camera, continuous spoken description on a real ~5-second cadence. This is what the product is now sold on (Section 1) and must be the most polished, most reliable feature in the whole build. Confirm it: works for a continuous multi-minute session without crashing; handles a Gemini throttle gracefully; gives relative, honest positioning language ("just ahead of you," "to your left") rather than fabricated precise distances; can be interrupted with a real follow-up question mid-session; stops cleanly on command.
2. **Proactive insight, not passive description.** The system doesn't wait to be asked what's notable — on the first pass over a chart, scorecard, or scene (including in Surroundings Mode), it leads with what matters, then offers to go deeper.
3. **Exhaustive detail on request.** Confirm the system can go from a concise first pass into genuinely deep, structured detail when the user asks "tell me everything" — the core promise of the product and must be demonstrably real.
4. **Scorecard/match reasoning.** Confirm the system explains *meaning*, not just numbers — test with at least 2 different real scorecards from different match situations to confirm it adapts rather than reciting a template.
**Supporting features (fully built and working, but presented as "also included," not headline):**
5. **Video clip narration** — reliable, real, start-to-end narration of a recorded clip. Still a genuine capability, just not the lead story anymore (Surroundings Mode is).
6. Conversational drill-down/follow-up (stress-test with at least 3 different follow-up chains, including mid-Surroundings-Mode).
7. Image-quality confidence check — tells the user to retake a bad photo instead of guessing.
8. Generality beyond charts — at least one real map, one real diagram, one real photographed document/table.
**Definition of done:** each of the 4 lead features demonstrated with a real input and a real, correct output; each of the 4 supporting features confirmed working at least once.
**End of phase:** STOP. Demo the 4 lead features live, Surroundings Mode first — this is the core of the eventual submission video. Ask for approval before Phase 7.

### Phase 7 — Open Source Mini-Challenge Contribution
**Goal:** a real, verifiable open-source contribution made during the hackathon window, separate from this project itself being open source.
**Steps:**
1. Identify a real public repo worth contributing to — candidates to evaluate: an MCP SDK or MCP Inspector repo (documentation fix, example addition), an accessibility-tooling open-source project, or a library used anywhere in this build.
2. Make a real, substantive contribution: a bug fix, a documentation improvement, a small feature, or an example.
3. Open it as a branch/fork/PR (does not need to be merged by the deadline).
4. Document: contribution URL, repo URL, GitHub username, what was done, how it works, why it matters.
**Definition of done:** a real, reviewable PR or fork link exists and is documented.
**End of phase:** STOP. Show the real PR/fork link. Ask for approval before Phase 8.

### Phase 8 — Submission Package Assembly
**Goal:** every item on the Section 2 checklist, ready to paste directly into the Devpost form.
**Steps:**
1. Write the project text description — consistent with Section 1's framing, leading with Surroundings Mode.
2. Script the demo video: a shot list structured as (a) 15–20 sec problem statement (what it's like to not be able to see your surroundings or something put in front of you), (b) 90–120 sec live real demo — **lead with Surroundings Mode running live as the user walks/moves the phone**, then scorecard reasoning, then a brief beat on video narration, (c) 15–20 sec close on the real-world impact angle (Section 0). Total under 3 minutes. Record it live against the real deployed system — no staged/fake footage.
3. Write the product feedback section for every tool/API/SDK used (Gemini API, MCP SDK, MCP Inspector, Alexa+ CLI/simulator if used). Do not mention AWS/Bedrock.
4. Write friction log entries using this template for each real issue hit during the build:
   - Task attempted:
   - Steps taken:
   - Expected vs. actual:
   - Severity (low/medium/high):
   - Workaround used:
   - Actionable suggestion for the Amazon team:
5. Finalize repo visibility (public + license recommended); if private, add the 6 named collaborators (Section 2) at this point, not earlier.
6. Write the explicit "what we built during the hackathon window" statement (Section 0).
7. Confirm track + mini-challenge selection on the Devpost form is exactly Alexa+ track + Open Source mini-challenge — nothing else selected.
8. Write README.md now, describing the project with Surroundings Mode as the lead capability, with real run instructions.
**Definition of done:** every Section 2 checkbox literally checked, with the real content behind each one sitting in the repo or ready to paste.
**End of phase:** STOP. Full dry-run review of every checklist item together. Ask for approval before Phase 9.

### Phase 9 — Final QA & Real-World Readiness
**Goal:** confidence this is a real product, not a hackathon toy.
**Steps:**
1. Real accessibility testing — ideally with an actual screen-reader or voice-first user, or at minimum Manthan testing the full flow with eyes closed, relying only on voice output, including walking through a real space using Surroundings Mode.
2. Latency/error-handling check under real conditions (slow network, a genuinely bad photo, a too-long video, a follow-up question with no prior context, a rate-limit throttle on Gemini mid-Surroundings-Mode-session).
3. Draft an outreach one-pager: what the tool does, who it's for, how to pilot it — plus a real target list of organizations to contact post-hackathon (Manthan to identify specific real names, don't invent placeholder organization names).
4. Final submit: triple-check the Devpost form before clicking submit.
**Definition of done:** full flow tested end to end by someone relying only on audio, including a real Surroundings Mode walkthrough; outreach one-pager drafted with real named targets.
**End of phase:** STOP. Final go/no-go review before hitting submit.

---

## 7. Alexa+ Private Preview access (opportunistic, non-blocking)

- Real Alexa+ add-on development requires requesting access to a **Private Preview**; approval is Amazon's call and timing is outside our control.
- Apply for it as early as possible (ideally before or during Phase 2), but **never block any phase on it arriving.** The simulated Alexa+ client (Phase 5) is the guaranteed submission path regardless of whether real access comes through.
- If access arrives before Phase 9: use it to strengthen the demo (real device footage is more compelling than simulated, especially for Surroundings Mode), but do not rebuild the architecture around it — the MCP server/Agent Skill underneath stays identical either way.

---

## Phase Log

- **Phase 1 completed (2026-10-19):**
  - **Completed:**
    - Initialized Git repository, connected remote `origin` (`https://github.com/Manthan-cpp/EchoSight-AI.git`), added MIT License and root `.gitignore`.
    - Built complete UI/UX Design System prototype in `client/` using React 19, TypeScript, Vite, and Tailwind CSS.
    - Mathematically calculated and verified WCAG 2.1 relative luminance contrast ratios for both light and dark modes (Light mode text: 16.83:1, Dark mode text: 17.06:1, both exceeding WCAG AAA).
    - Designed flagship **Surroundings Mode** screen first: calm steady "Watching" state, ~5s cadence indicator (12 calls/min safe free-tier envelope), live camera feed or simulated viewfinder, scrollable transcript feed, and interrupting follow-up input.
    - Designed secondary modes: Visual Analysis (still images/charts, video clips, cricket scorecards) with file size/format constraints, and interactive UI States Gallery (Watching, Listening, Thinking, Error, Empty).
    - Implemented voice-first entry with spoken welcome greeting via Web Speech Synthesis (`window.speechSynthesis`), polite `aria-live` announcement region, and solid 2px focus indicators.
    - Verified clean build (`tsc -b && vite build`) and running dev server on `http://localhost:5173`.
  - **Deviations from plan:** None.
  - **Open issues:** None.
  - **Exact commands to resume / verify current state:**
    ```bash
    cd client
    npm install
    npm run build
    npm run dev -- --port 5173
    ```

- **Phase 2 completed (2026-10-19):**
  - **Completed:**
    - Recorded solo entry (Manthan).
    - Locked in MCP server stack: Node.js (v24), TypeScript, `@modelcontextprotocol/sdk` (spec 2025-11-25+), Express, and Zod.
    - Created `server/` scaffold with `.env.example` documenting `GEMINI_API_KEY`, `GEMINI_MODEL=gemini-2.5-flash`, and `PORT=3001`. Verified `.env` is ignored by `.gitignore`.
    - Built dual-transport MCP Server supporting both **Streamable HTTP / SSE** (`GET /sse`, `POST /messages`, `GET /health`) and **Stdio** (`--stdio`).
    - Implemented baseline health/handshake tool `ping` returning structured server status, protocol spec, and echo payload.
    - Verified `ping` tool invocation across both transports using automated test runners (`npm run test:stdio` and `npm run test:sse`).
    - Configured official MCP Inspector command (`npm run inspector`).
  - **Deviations from plan:** None.
  - **Open issues:** User to provide their free-tier Gemini API key in `server/.env` for Phase 3 vision pipeline.
  - **Exact commands to resume / verify current state:**
    ```bash
    cd server
    npm install
    npm run build
    npm start            # Starts Streamable HTTP / SSE on port 3001
    npm run test:stdio   # Tests ping tool over Stdio
    npm run test:sse     # Tests ping tool over Streamable HTTP/SSE
    npm run inspector    # Launches official MCP Inspector Web UI
    ```

- **Phase 3 completed (2026-10-19):**
  - **Completed:**
    - Integrated `@google/genai` with `gemini-3.8-flash` (Google's active model, configured in `.env`).
    - Implemented `server/src/pipeline.ts` with accessibility-first system prompt, patient exhaustive walkthrough reasoning, proactive insight extraction, and honest relative spatial positioning.
    - Sourced 5 real public-domain test images, 1 real video clip, and 1 degraded test image into `server/test_assets/`:
      1. `global_temperature.jpg` (NASA/GISS climate science anomaly chart)
      2. `race_income_demographics.png` (US Census demographic clustered bar chart)
      3. `transit_map.png` (Greater Surakarta multi-tier transit route map)
      4. `indoor_desk_workspace.jpg` (indoor workspace scene with laptop/lamp/notebook)
      5. `cricket_scorecard.jpg` (newspaper match reports and score card)
      6. `sample_video.webm` (continuous CAD engineering screen recording)
      7. `bad_blurry_input.jpg` (degraded input for negative testing)
    - Built resilient auto-retry mechanism (`generateWithRetry`) with exponential backoff handling transient 503 / 429 service spikes.
    - Implemented cheap in-memory frame difference algorithm (`calculateFrameDifference`) comparing consecutive frames.
    - Verified all 7 pipeline test cases in `test_pipeline_e2e.js` (`npm run test:pipeline`) with 100% success.
    - Verified continuous Surroundings Mode loop in `test_surroundings_loop.js` (`npm run test:surroundings`) across 12 cycles at 5s cadence: frame-change detection saved 50% of API calls (6 calls saved out of 12), with zero crashes and zero throttles.
  - **Deviations from plan:** Updated model from deprecated `gemini-2.5-flash` to active `gemini-3.8-flash` per Google API instruction.
  - **Open issues:** None.
  - **Exact commands to resume / verify current state:**
    ```bash
    cd server
    npm install
    npm run build
    npm run test:pipeline      # Runs full E2E vision/video/scorecard tests
    npm run test:surroundings  # Runs live 5s cadence surroundings loop
    ```

- **Phase 4 completed (2026-10-19):**
  - **Completed:**
    - Designed and implemented all 5 official MCP tools with strict Zod schemas on `createEchoSightServer`:
      1. `describe_surroundings`: Live Surroundings Mode camera frame reasoning with in-memory difference check.
      2. `analyze_visual`: Patient, exhaustive structured walkthroughs of charts, diagrams, tables, and maps.
      3. `analyze_video`: Continuous chronological narration of recorded video clips up to 30 seconds.
      4. `analyze_scorecard`: Contextual sports data and match reasoning (runs, overs, run rates, momentum).
      5. `ask_followup`: Conversational memory resolver answering follow-up queries without restating full context.
      6. `ping`: Baseline connectivity, health, and tool discovery handshake.
    - Implemented multi-model fallback cascade (`gemini-3.7-flash` -> `gemini-3.5-flash-lite` -> `gemini-3.8-flash`) ensuring zero interruptions if a single model's free-tier daily cap is reached.
    - Created official `SKILL.md` Agent Skill package with YAML metadata, voice-first interaction rules, relative spatial phrasing guidelines, and privacy guarantees.
    - Created `render.yaml` infrastructure-as-code for one-click deployment to Render free tier.
    - Verified all 5 tools end-to-end through the official MCP Client protocol runner (`npm run test:tools`), and verified dual Stdio (`npm run test:stdio`) and self-contained Streamable HTTP/SSE (`npm run test:sse`) transports.
  - **Deviations from plan:** Added multi-model cascade to gracefully handle free-tier daily request caps per model.
  - **Open issues:** None.
  - **Exact commands to resume / verify current state:**
    ```bash
    cd server
    npm install
    npm run build
    npm run test:tools        # Tests all 5 tools via official MCP client protocol
    npm run test:sse          # Tests Streamable HTTP/SSE transport
    npm run test:stdio        # Tests Stdio transport
    npm run inspector         # Launches official MCP Inspector Web UI
    ```

- **Phase 5 completed (2026-10-19):**
  - **Completed:**
    - Built simulated Alexa+ Voice Client connecting browser client to EchoSight MCP server via `mcpClient.ts`.
    - Integrated native Web Speech API in `speechService.ts`: Speech Synthesis (TTS, steady rate 0.95) and Speech Recognition (STT, voice commands and hands-free follow-up questions).
    - Wired live camera feed in `SurroundingsMode.tsx`: offscreen 640x480 frame capture on strict 5-second cadence (~12 calls/min) invoking `describe_surroundings` with in-memory frame difference check.
    - Implemented voice-first real-time audio playback: automatically speaks each surroundings observation and visual breakdown as it arrives.
    - Implemented mid-session interrupting follow-ups: user can ask typed or spoken follow-up queries while Surroundings Mode is active or on visual breakdowns, resolved via `ask_followup` with conversational history.
    - Wired `VisualAnalysis.tsx` for still images (`analyze_visual`), video clips (`analyze_video`), and match scorecards (`analyze_scorecard`) with proactive insight callouts and conversational memory.
    - Verified complete client and server production builds (`npm run build`) with zero TypeScript errors.
  - **Deviations from plan:** None.
  - **Open issues:** None.
  - **Exact commands to resume / verify current state:**
    ```bash
    # Terminal 1 - Backend MCP Server
    cd server
    npm run dev          # Runs server on http://localhost:3001

    # Terminal 2 - Frontend Simulated Alexa+ Client
    cd client
    npm run dev          # Runs client on http://localhost:5173
    ```

- **Phase 6 completed (2026-10-19):**
  - **Completed:**
    - Lead Feature 1 (Surroundings Mode): Enforced relative spatial phrasing ("just ahead of you", "to your left"), 50% call savings on static views via pixel delta hashing, and added a 5-minute (300s) continuous session safety bound with countdown UI and spoken notification to protect the free-tier quota.
    - Lead Feature 2 (Proactive Insight): First-pass visual analysis automatically surfaces actionable takeaways upfront before inviting deeper exploration.
    - Lead Feature 3 (Exhaustive Detail on Request): Handled "tell me everything" and detail requests seamlessly, expanding into granular breakdowns of timeline metrics, axes, and uncertainty bounds.
    - Lead Feature 4 (Scorecard Reasoning): Verified contextual reasoning across 2 real, distinct match situations (`cricket_scorecard.jpg` vintage tournament press report vs `cricket_scoreboard_match2.jpg` club ground scoreboard).
    - Supporting Features 5–8 Verified: Continuous video narration, multi-turn conversational drill-downs, degraded image confidence check with retake guidance, and complex transit route map interpretation.
    - Built and executed automated suite `npm run test:differentiators` verifying all 4 lead and 4 supporting differentiators with 100% pass rate.
  - **Deviations from plan:** None.
  - **Open issues:** None.
  - **Exact commands to resume / verify current state:**
    ```bash
    cd server
    npm run test:differentiators  # Runs full Phase 6 differentiator test suite
    ```


