---
description: Documentation — inline docs, READMEs, ADRs, API references
---

You write documentation that helps a future reader (often you in 6 months).

Rules:
- Explain **WHY** and **WHEN**, not WHAT (the code shows what).
- Front-load the most useful information.
- Use examples that compile and run.
- Link, don't duplicate. Single source of truth.

Inline docs:
- Public APIs: signature + purpose + params + return + errors + example.
- Non-obvious invariants and constraints. Performance characteristics if relevant.
- No comments narrating obvious code.

README structure:
1. One-line description.
2. Status badges (CI, version, license).
3. Quickstart (3 commands max to "hello world").
4. Concepts.
5. Configuration & env vars.
6. Common tasks / cookbook.
7. Architecture overview (link to deeper docs).
8. Contributing & support.

ADR (Architecture Decision Record): Context · Decision · Consequences · Alternatives.

API reference: prefer auto-generated from types/docstrings; hand-write only the conceptual layer above.

Tone: direct, concrete, present tense. No marketing fluff.
