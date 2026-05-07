# Arix — Upgrade Backlog v2

> v1'in büyük kısmı tamamlandı (skills, MCP catalog, providers, B-tier tools, K differentiator çekirdeği, observability). Bkz. `upgrade-v1.md`.
> Bu dosya sıradaki dalgayı planlar. Etki + Effort: S=<1g, M=1-3g, L=>3g.

---

## L. Wire-up — yeni modülleri agent loop'a entegre et

Yeni eklenen modüller (cache, undo, encryption, arbitrage, tracer, audit, spec, workspace) çalışıyor ama AgentLoop'a opsiyonel olarak takılı değil. **En yüksek değer/efor oranı burada.**

| #   | İş | Etki | Effort |
|-----|---|---|---|
| L1  | `AgentLoop.options.toolCache` — read-only tool'ları otomatik sar | Cost-15% | S |
| L2  | Write/Edit/ApplyDiff tool'larında otomatik `UndoStack.snapshot()` çağrısı | UX | S |
| L3  | `ModelRouter`'a `chooseArbitrage` adapter — config'le eşik geçince provider swap | Cost-30% | M |
| L4  | `AgentLoop.options.planFirst: true` → her turn öncesi `planTurn()` | Quality+ | S |
| L5  | `AgentLoop.options.reflectAfter: true` → assistant turn sonrası kritik | Quality+ | S |
| L6  | `Tracer.withSpan` AgentLoop'taki provider call + tool exec sarması | Ops | S |
| L7  | `AuditLog` her tool call + confirmation kararını otomatik yazsın | Compliance | S |
| L8  | `SkillManager.loadBundled()` bootstrap'a default olarak | UX | S |
| L9  | `arix --workspace <name>` flag — WorkspaceManager allowedPaths'e besler | Feature | S |
| L10 | `arix spec <file> --execute` → SpecManager'dan AgentLoop'a otomatik task pipeline | Feature | M |
| L11 | `SessionManager`'a opsiyonel encryption (passphrase env'den) | Privacy | M |
| L12 | `tools/web/web-fetch.ts` SSRF guard'ını `http_client`'taki gibi sıkılaştır | Security | S |

---

## M. Eval & quality assurance

| #   | İş | Detay | Effort |
|-----|---|---|---|
| M1  | `arix eval` komutu | SWE-Bench Lite + HumanEval + repo-içi custom eval'ler | L |
| M2  | Golden trace replay | `tests/golden/*.jsonl` — known-good session deterministik replay | M |
| M3  | Prompt regression tests | Bundled skill'lerin output snapshot'ları (vitest snapshots) | S |
| M4  | Tool-call quality metrics | Başarı oranı, ortalama retry, hata tipleri — dashboard'da | M |
| M5  | Provider conformance suite | Her provider için aynı 20 test, tools/streaming/usage doğrula | S |
| M6  | Cost benchmark | Aynı 10 prompt, tüm provider'larda — kalite vs maliyet tablosu | M |

---

## N. Eksik native tool'lar (MCP'ye gitmeden)

| #   | Tool | Use case | Effort |
|-----|---|---|---|
| N1  | `db_query` (pg/mysql2/better-sqlite3) | EXPLAIN, schema, sample query — connection-string env'den | M |
| N2  | `browser_automation` (Playwright wrapper, native) | Form, click, screenshot, scrape — MCP playwright'a alternatif | M |
| N3  | `screenshot` + `image_analyze` | Vision-capable provider'lara base64 image | S |
| N4  | `lsp_diagnostics` | tsserver/gopls/pyright çıktısını parse et | M |
| N5  | `code_graph` (tree-sitter) | `find_references`, `find_definition`, `call_hierarchy` | L |
| N6  | `secrets_scan` | gitleaks tarzı diff'te secret detection | S |
| N7  | `coverage_report` | nyc/c8/coverage.py output parse → focus low-coverage files | S |
| N8  | `bench_runner` | hyperfine/wrk/k6 wrapper — perf regression | S |

---

## O. UX / TUI / dashboard

| #  | İş | Effort |
|----|---|---|
| O1 | TUI split-pane diff editor (Ink) | M |
| O2 | Dashboard'da tool-call Gantt timeline | S |
| O3 | Dashboard'da plan + spec progress (Mermaid live render) | S |
| O4 | Voice mode — Whisper STT + ElevenLabs/Coqui TTS | M |
| O5 | Replay mode — `arix replay <sessionId>` turn-by-turn animate | S |
| O6 | Inline screenshot annotation — Cmd+Shift+4 capture'ı oto-upload | S |
| O7 | TUI'da MCP server status panel (ping + tool count) | S |
| O8 | TUI'da workspace switcher (multi-repo) | S |
| O9 | Cost-of-this-turn rozeti (TUI status bar'da) | S |

---

## P. Cost / routing intelligence

| #  | İş | Effort |
|----|---|---|
| P1 | Predictive routing — turn öncesi cost+latency tahmini, eşik bazlı auto-downgrade | M |
| P2 | Per-skill cost reports (`arix cost --by-skill`) | S |
| P3 | Cost regression alerts (haftalık baseline 2x ise uyarı) | S |
| P4 | Org-level pooling (multi-user budget havuzu, per-user limit) | L |
| P5 | Adaptive prompt caching — Anthropic cache_control auto-injection | M |
| P6 | Token estimator pre-flight (turn göndermeden tahmin → onay) | S |

---

## Q. Distribution / community

| #  | İş | Effort |
|----|---|---|
| Q1 | `docs.arix.amirtech.ai` — Mintlify veya Docusaurus | M |
| Q2 | `marketplace.arix.amirtech.ai` — skill/plugin discovery + install | L |
| Q3 | VSCode Marketplace yayını | S |
| Q4 | JetBrains Marketplace yayını | M |
| Q5 | Discord topluluğu + `/arix help` bot | S |
| Q6 | Comparison page (vs Cursor/Copilot/Claude Code/Aider) | S |
| Q7 | HN/Reddit/X launch — benchmark grafikleri ile post | S |
| Q8 | Quickstart video serisi (5x 3 dk) | M |
| Q9 | `arix init` → opinionated CLAUDE.md/AGENTS.md template seçici | S |

---

## R. Yeni differentiator fikirler (kimsede yok)

| #  | Fikir | Neden farklı |
|----|---|---|
| R1 | **Agent-to-agent gossip** — birden fazla arix session'ı yerel pub-sub üzerinden konuşsun (CR worker + lint worker + test worker eş zamanlı) | Yok |
| R2 | **Time-travel debug** — her tool call'da state snapshot, timeline'da geri sar/oynat | Yok |
| R3 | **Cost-bounded refactor** — "X'i refactor et ama $0.50 altında kal" — bütçe biterse dur, kısmi sonuç ver | Yok |
| R4 | **CI drift watcher** — spec hash + code hash CI'da kontrol edilir, eskiyse PR yorumu açılır | Yok |
| R5 | **Privacy-aware routing** — hassas string (PII regex/secret) görüldüğünde otomatik local-only model'e düş | Yok |
| R6 | **Cross-session memory graph** — paylaşılan sembol grafiği üzerinden geçmiş session'ları auto-link | Yok |
| R7 | **Confidence calibration** — assistant her iddia için 0..1 self-confidence verir; düşük olanlar UI'da işaretli | Yok |
| R8 | **Reversible diff merge** — 3 farklı modelin önerdiği diff'i interactive merge-tool'la birleştir | Yok |
| R9 | **Token leak detector** — chat.md / log içinde API key sızıntısı varsa redact et | Privacy |
| R10| **Local fine-tune loop** — kullanıcının kabul/red ettiği diff'lerden LoRA dataset üret | Personalization |

---

## S. IDE & ecosystem (büyük effort — kendi sprint'leri)

| #  | İş | Effort |
|----|---|---|
| S1 | JetBrains plugin (IntelliJ/WebStorm/PyCharm/GoLand) | L |
| S2 | Neovim plugin (telescope + blink.cmp completions) | L |
| S3 | Zed extension (Rust) | L |
| S4 | GitHub App (auto PR review, `/arix-fix` comment trigger) | L |
| S5 | Slack bot (`/arix review PR-123`) | M |
| S6 | Warp/iTerm/Ghostty block-aware integration | M |
| S7 | Browser extension — GitHub PR sayfasında inline review | M |

---

## T. Hardening / DevOps

| #  | İş | Effort |
|----|---|---|
| T1 | tsup → bundler-only build, `tsc --emitDeclarationOnly` decouple | S |
| T2 | E2E smoke suite — `arix init → arix chat → arix session list` | S |
| T3 | Release pipeline — version bump + CHANGELOG + tag + npm publish + Homebrew formula update | M |
| T4 | Docker base image küçült (multi-stage, distroless) | S |
| T5 | Bun/Deno uyumluluk testi | M |
| T6 | Windows CI matrix (şu an sadece Linux) | S |
| T7 | Plugin sandbox (vm2/isolated-vm yerine vm.Module + permission gate) | L |

---

## Öneri: ilk 2 hafta

**Sprint 1 (S items, max etki):** L1, L2, L4, L5, L6, L7, L8, L11, M3, P6, O9, T2.
12 item, hepsi S, doğrudan kullanıcıya yansıyan UX/quality/cost kazançları.

**Sprint 2 (M items, derinlik):** L3, L10, M1 (lite), N1, N2, P1, Q1.
Routing zekası + eksik tool'lar + dokümantasyon temeli.

**Strateji:** S→M→L sırasında ilerle. Her sprint sonu `arix eval` (M1) baseline'ına karşı regression check.
