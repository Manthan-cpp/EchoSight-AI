# Contributing to EchoSight

Thanks for your interest in EchoSight — a 100% hands-free, voice-first spatial co-pilot for blind and low-vision users, built for the Alexa+ track.

## Before you start

- Review [README.md](README.md) for the current architecture, Model Context Protocol (MCP) setup, and voice interaction model.
- Accessibility correctness is mandatory — all navigation flows must remain 100% operable via voice without touchscreen dependency.
- Privacy & safety first — camera streams and sensory frames must be handled securely with zero unnecessary retention.
- Real-time safety guarantees — directional and obstacle warning latency must never be compromised.

## How to contribute

1. Open an issue describing the bug or feature before starting work on anything non-trivial, so effort isn't duplicated or misaligned with the project's direction.
2. Fork the repo and create a branch with a clear, descriptive name.
3. **Never push directly to this repo's main branch without explicit permission from the project owner first.** Contribute through a fork and pull request instead.
4. Commit messages must read like a human wrote them: past tense, three to four words, plain prose. Example: "Added camera capture flow".
5. Test your change with real inputs — this project does not accept changes that rely on mock data or fake API responses.
6. Open a pull request with a clear description of what changed and how it was tested.

## Code style

- Match the existing project structure and TypeScript strict typing standards.
- No decorative dependencies added without a functional purpose.
- Any interaction change must maintain the 100% hands-free voice-first paradigm.

## Reporting issues

Open a GitHub issue with:
- What you expected to happen
- What actually happened
- Steps to reproduce
- Whether it's related to accessibility (voice interaction, audio feedback) — flag these clearly, as they receive priority.

## Code of conduct

Be respectful. This project exists to empower a community that is frequently underserved by mainstream software — contributions and feedback should reflect that seriousness.
