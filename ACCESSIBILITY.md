# EchoSight — Accessibility Specification

> This file governs interaction behavior the same way DESIGN.md governs visuals and PLAN.md governs build phases. The product's entire audience includes people who cannot see the screen at all — this is not a nice-to-have checklist, it is the actual correctness bar for the product.

---

## 1. Core principle

Everything that matters must be reachable and usable **by voice alone**, start to finish. The visual UI (governed by DESIGN.md) is a secondary surface — useful for a sighted person helping with setup, or for a low-vision user who wants to see something — never the required path.

---

## 2. First-time use, step by step

1. **App opens → speaks immediately.** No silent screen. First thing the user hears: what the app is and what to do first ("Welcome to EchoSight. Tap anywhere or just start talking.").
2. **Permissions (camera, microphone):** handled through the browser's standard, already-accessible permission prompts — no custom UI needed or wanted here.
3. **User states intent by voice** ("describe my surroundings," "what's in this photo," "read this scorecard").
4. **Capture (photo/video/live camera):** app gives a simple spoken instruction ("point the camera and say 'capture', or just start Surroundings Mode"). See Section 3 for the honest limitation here.
5. **Response is spoken aloud**, structured for listening (short sentences, natural pauses, not a wall of text read flatly).
6. **Follow-up questions** are answered by voice, using session context, without the user needing to repeat themselves or navigate anywhere.

---

## 3. The aiming problem — stated honestly, not glossed over

A blind user cannot aim a camera by sight. This project does **not** attempt to solve real-time visual aiming guidance (e.g. "move left," "move right") in this build — that is a significantly larger problem than this scope allows, and promising it would be dishonest.

**What we do instead:**
- **Still photo path:** an image-quality confidence check runs after capture. If the photo is unusable (too blurry, too dark, subject not identifiable), the system says so plainly and asks for a retake — reactive, not predictive.
- **Surroundings Mode path:** this is actually a better fit for the aiming problem than single-photo capture, by design — the user doesn't need to aim precisely once, they just hold the phone up and move naturally, and the system continuously describes whatever is currently in view, updating roughly every 5 seconds. Imprecise aiming is tolerated by the mode itself rather than needing to be corrected.

---

## 4. Screen-reader compliance (baseline requirement, not a polish pass)

- Semantic HTML throughout — real `<button>`, `<nav>`, `<main>`, headings in order, not divs styled to look like things.
- Every interactive element has a real, descriptive accessible name — never "button," "click here," or an icon with no label.
- Logical, predictable focus order matching reading order.
- Visible, solid focus indicators (per DESIGN.md — no glow effects, but genuinely visible, sufficient-contrast focus rings).
- Live regions (`aria-live`) used correctly for the Surroundings Mode transcript and spoken responses, so screen-reader users following along visually/by touch get updates announced appropriately — without being so aggressive that it interrupts constantly.
- Minimum touch target sizes respected throughout, for users navigating by touch exploration.
- Tested for real with an actual screen reader (VoiceOver on iOS or TalkBack on Android, whichever is available) before Phase 9 sign-off — not assumed to work from following the rules above alone.

---

## 5. Surroundings Mode — specific interaction rules

- **Starting:** a single clear voice command starts it ("start Surroundings Mode" / "describe my surroundings" / similar natural phrasing) — the system should recognize reasonable variations, not require one exact phrase.
- **While active:** the user can interrupt at any time with a follow-up question, and the system answers using the current/recent context without requiring the user to stop the mode first.
- **Stopping:** a clear, equally natural voice command stops it ("stop," "stop watching," "that's enough").
- **Session limits:** if a session reaches its maximum duration (Section 5 of PLAN.md), the system tells the user plainly that it's stopping and why, rather than silently cutting off.
- **Positioning language:** always relative and honest ("just ahead of you," "to your right," "close by") — never a fabricated precise distance or measurement the system cannot actually know.

---

## 6. What "done" looks like for this file

Every rule above reflected in real, tested behavior by Phase 9 (Final QA), confirmed with at least one full real test relying only on audio output, eyes closed or screen reader active, no visual reference used to complete the task.
