# EchoSight — Design System

> Read this before building or touching any UI. This file governs visual decisions the same way PLAN.md governs build phases. If a screen looks "AI-generated" by the standard this file sets, it's wrong, no matter how functional the code behind it is.

---

## 1. The actual goal

Production-grade, calm, confident, accessible. The kind of interface a real accessibility-focused company would ship, not a hackathon demo that screams "built with an AI website generator in one evening." Judges will see dozens of AI-slop UIs at this scale — a genuinely restrained, intentional one stands out.

---

## 2. Explicitly banned — do not do these, ever, anywhere in this project

- **No pill-shaped anything.** No pill buttons, no pill tags, no pill badges, no pill nav items. Use rectangles with small, consistent corner radii (4–8px) instead.
- **No glowing text.** No text-shadow glow, no neon text effects, no gradient-filled headline text.
- **No glowing borders.** No box-shadow glow rings around cards, buttons, or inputs. No "neon outline" focus states — use a real solid focus ring instead (still accessible, just not glowing).
- **No colorful status tags/badges** used decoratively. No rainbow of small colored pill labels scattered across a screen.
- **No gratuitous color** — no green/blue/purple gradients as decoration, no "AI purple" gradient backgrounds, no multi-color blob shapes behind content.
- **No glassmorphism-by-default** (frosted blur cards) unless there's an actual functional reason for it on a specific screen — not used as a blanket aesthetic.
- **No excessive bullet-point lists dressed up with colored icons** for every single line. If something is genuinely a list, it's a plain list — not every item wrapped in its own colored chip.
- **No decorative emoji in the UI.** This is a serious accessibility tool, not a landing page.
- **No stock "AI assistant" visual clichés** — no glowing orb/sphere avatar, no pulsing gradient waveform used purely as decoration, no sparkle/star icons to indicate "AI-powered."
- **No "Live" / "Live Server" / "Live Demo" labeling anywhere in the UI itself.** That kind of status language doesn't belong in a shipped product's actual interface — if a status needs to be shown, describe what's actually happening in plain words (e.g. "Listening" / "Thinking" / "Ready"), not "LIVE."
- **No overuse of bold saturated greens** (or any single color) as a recurring "success/positive" signal plastered everywhere. Status should be communicated through clear language first, color second, and sparingly.

---

## 3. What to do instead

### Color
- A small, restrained palette: one neutral scale (backgrounds, text, borders) + one accent color used sparingly and purposefully (primary actions only, not everywhere).
- Every text/background pairing checked against real WCAG-AA contrast ratios — not eyeballed.
- Dark and light mode both planned for, not just one default theme.
- Color never carries meaning alone — pair any status color with text/icon, for actual accessibility, not just taste.

### Typography
- One primary typeface, used consistently. A highly legible, slightly larger-than-typical base size (this product's users may have low vision, not just blindness) — generous line height, generous paragraph spacing.
- Clear, limited type scale (e.g. 4–5 sizes total) — not ten arbitrary font sizes across the app.

### Shape and structure
- Rectangular cards and inputs with small, consistent corner radii. Clean 1px borders in a neutral tone — not shadows used as the only separation technique.
- Generous whitespace. Let content breathe instead of filling every pixel.
- A clear, consistent grid/spacing scale (e.g. multiples of 4px or 8px) — not arbitrary spacing per element.

### Motion
- Minimal, functional only — a loading state transitions smoothly, a new message appears without a jarring pop. No decorative animation for its own sake (no floating particles, no auto-playing background motion).

### States (the ones that matter most for this product specifically)
- **Watching state (Surroundings Mode — the primary screen of the app):** calm, steady visual + the word "Watching," never a pulsing neon ring, never a glowing camera-lens animation, never a dramatic scanning effect. A simple, solid indicator plus a plain-language status line is enough. The live transcript of what's been described scrolls below it in the same restrained style as the rest of the app — treat it as a normal conversation log, not a special "AI is working" effect.
- **Listening state:** calm, clear visual + the word "Listening," not a flashy waveform animation competing for attention.
- **Thinking/processing state:** honest and simple — "Thinking" or "Analyzing," not a cute spinner trying to look clever.
- **Error state:** plain language explaining what happened and what to do next ("That photo was too blurry to read — try again with better lighting"), styled calmly, not alarm-red and aggressive.
- **Empty state:** real, useful guidance on what to do first — never a fake placeholder implying content exists.

### Components
- Buttons: rectangular (small radius), one primary style (filled, accent color) and one secondary style (outlined or ghost) — not five different button treatments across the app.
- Inputs: simple bordered fields, clear labels, visible focus states (solid ring, not glow).
- Cards: bordered or very subtle shadow, never both heavy shadow and heavy border at once.

---

## 4. The test before shipping any screen

Look at it and ask: "Could this be mistaken for a template AI website generator produced in 30 seconds?" If yes, it's wrong — simplify, remove decoration, tighten the palette, and lean on typography/spacing/real content to carry the design instead of effects.

---

## 5. Accessibility is part of the design system, not separate from it

- Every interactive element reachable and operable by keyboard alone.
- Every interactive element has a real, descriptive accessible name (not "button" or "click here").
- Focus order follows visual/logical reading order.
- Minimum touch target size respected on mobile.
- Full detail in ACCESSIBILITY.md — this file covers the visual language; that file covers screen-reader behavior and voice-first interaction flow.
