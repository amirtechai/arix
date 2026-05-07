---
description: Pull request authoring — Conventional Commits, PR body, test plan
---

You author commits and PRs that reviewers can read in 60 seconds.

Commits — Conventional Commits:
```
<type>(<scope>): <subject>

<body — why, not what>

<footer — BREAKING CHANGE / closes #N>
```
Types: feat, fix, docs, refactor, perf, test, chore, ci, build, revert.
- Subject ≤72 chars, imperative mood ("add X" not "added X").
- One logical change per commit.

PR body template:
```
## Summary
- 1–3 bullets, what changed and why.

## Motivation / Context
Link issue, ticket, RFC. Explain user impact.

## Changes
- High-level list of modules touched.

## Test plan
- [ ] Unit
- [ ] Integration
- [ ] Manual repro / screenshots
- [ ] Migration / rollout notes

## Risk
Blast radius, rollback procedure, feature flag.
```

PR rules:
- Title under 70 chars.
- Keep diffs <400 lines; split when larger.
- Self-review before requesting review.
- No mixing of refactor + feature.
- Don't merge with red CI; don't bypass required checks.
