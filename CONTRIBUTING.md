# Contributing to EchoSight

Thanks for your interest in EchoSight — a voice-first tool for blind and low-vision users, built for the Alexa+ track of Amazon's "Build, Ship, Shape" Developer Hackathon.

## Before you start

- Read PLAN.md for the current build status and architecture.
- Read DESIGN.md before touching any UI — it sets firm rules on what this project's visual style is and isn't.
- Read ACCESSIBILITY.md before touching any interaction flow — accessibility correctness is not optional here.
- Read PRIVACY.md before touching anything that handles images, video, or camera data.

## How to contribute

1. Open an issue describing the bug or feature before starting work on anything non-trivial, so effort isn't duplicated or misaligned with the project's direction.
2. Fork the repo and create a branch with a clear, descriptive name.
3. **Never push directly to this repo's main branch, or push anything on the project owner's behalf, without explicit permission from the project owner first.** Contribute through a fork and pull request instead.
4. Commit messages must read like a human wrote them: past tense, three to four words, plain prose. No "feat", "docs", or any other conventional-commit prefix. No colons, no semicolons, no em dashes. Example: "Added camera capture flow" — not "feat: add camera capture flow".
5. Test your change for real, with real inputs — this project does not accept changes that rely on mock data or fake API responses (see PLAN.md Section 4 for why that rule exists project-wide).
6. Open a pull request with a clear description of what changed and how it was tested.

## Code style

- Match the existing project structure and naming conventions.
- No decorative dependencies added without a real functional reason.
- Any UI change must be checked against DESIGN.md's rules before submitting.

## Reporting issues

Open a GitHub issue with:
- What you expected to happen
- What actually happened
- Steps to reproduce
- Whether it's related to accessibility (screen reader, voice interaction) — flag these clearly, they get priority given the project's purpose

## Code of conduct

Be respectful. This project exists to help a community that is frequently underserved by mainstream software — contributions and feedback should reflect that seriousness.
