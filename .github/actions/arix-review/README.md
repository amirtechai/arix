# Arix PR Review Action

Reusable GitHub Action that runs an automated code review on the changed files of a pull request using the [arix](https://github.com/amirtechai/arix) CLI.

## Usage

```yaml
name: PR Review
on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  arix-review:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write   # to comment
      contents: read
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: amirtechai/arix/.github/actions/arix-review@main
        with:
          provider: anthropic
          model: claude-sonnet-4-6
          api-key: ${{ secrets.ANTHROPIC_API_KEY }}
```

## Inputs

| Name              | Default                | Description |
|-------------------|------------------------|-------------|
| `provider`        | `anthropic`            | Provider id (any Arix-supported provider) |
| `model`           | `claude-sonnet-4-6`    | Model id |
| `api-key`         | (required)             | Provider API key — pass via `${{ secrets.* }}` |
| `skill`           | `code-reviewer`        | Skill name; bundled options listed via `arix skill list` |
| `fail-on-blocker` | `true`                 | Fail the job when `🔴 BLOCKER` is in the output |
| `comment`         | `true`                 | Post the review as a PR comment |

## What it does

1. Diffs the PR head against the base branch.
2. Runs `arix review --files …` with the chosen provider/model/skill.
3. Posts the result as a PR comment (configurable).
4. Fails the workflow if a `🔴 BLOCKER` is reported.

## Cost control

Combine with `arix cost preflight` in a previous step or use a cheaper model
(e.g. `deepseek-chat`, `groq llama-3.3-70b`) for routine reviews and reserve
`claude-sonnet-4-6` for the merge-gate workflow.

## Privacy

The action does not transmit anything outside of the model API call you
authenticate against. No telemetry to Arix maintainers.
