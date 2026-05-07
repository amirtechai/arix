# Arix — Upgrade Backlog

> Geliştirme yol haritası. Kategori bazlı, her madde için **etki + tahmini effort** (S=<1g, M=1-3g, L=>3g).

---

## A. Agent çekirdeği — derinleştir

| #  | Özellik | Etki | Effort |
|----|---|---|---|
| A1 | **Plan-Act-Reflect döngüsü** — her turn öncesi 1-shot planning, sonrası 1-shot reflection (self-critique). Hatalı tool call'ları erken yakalar. | Quality+ | M |
| A2 | **Speculative tool execution** — read-only tool'ları paralel başlat, write tool'larında onay öncesi pre-fetch et. | Latency-30% | M |
| A3 | **Diff-aware editing** — `apply_diff` tool'u: LLM tüm dosyayı yazmak yerine `<<<<<< SEARCH ... ====== ... >>>>>>> REPLACE` blokları üretir, atomik uygula. Aider tarzı. | Cost-60% | M |
| A4 | **Compact summarization checkpoints** — sonsuz session: 80%'de compact + structured snapshot, geri yüklemede recall. (var ama yüzeysel — yapılandırılmış memory'e yaz) | UX | M |
| A5 | **Sub-agent isolation** — coordinator subtask'ları kendi context window'unda çalıştır, kirletmesin. | Quality+ | S |
| A6 | **Tool result caching** — `read_file`, `git_diff` gibi idempotent çağrıları (cwd+input-hash) cache'le. Aynı turn'de 2. çağrıda anında dön. | Cost-15% | S |
| A7 | **Repository graph indeksi** — proje açılırken tree-sitter ile sembol/import grafiği çıkar, `find_references` / `find_definition` tool'larını hızlandır. | Quality+ | L |

---

## B. Yeni tool'lar (yüksek talep, yok)

| #   | Tool | Use case | Effort |
|-----|---|---|---|
| B1  | `apply_diff` (search-replace patch) | A3 ile birlikte — token tasarrufu | M |
| B2  | `db_query` (PostgreSQL/MySQL/SQLite) | Schema introspection, sample query, EXPLAIN | M |
| B3  | `browser_automation` (Playwright headless) | Form doldur, screenshot, scrape, test | M |
| B4  | `screenshot` & `image_analyze` | Bug raporlarını görsel okumak | S |
| B5  | `package_manager` (npm/pnpm/yarn/pip/cargo/go) | Bağımlılık ekle/kaldır/audit | S |
| B6  | `test_runner` (vitest/jest/pytest/go test) | Selektif test çalıştırma + parse | S |
| B7  | `linter` (eslint/ruff/clippy/golangci) | Inline fix önerisi | S |
| B8  | `git_advanced` (rebase, cherry-pick, bisect, blame) | Var olan git tool'unu genişlet | S |
| B9  | `docker_exec` | Sandbox container'da kod çalıştır | M |
| B10 | `http_client` (richer than `web_fetch`) | API testi, OAuth, multipart | S |
| B11 | `clipboard_read` / `clipboard_write` | Kullanıcı snippet'leriyle çalış | S |
| B12 | `editor_diff_apply` (LSP-aware) | LSP server üstünden semantic edit | L |

---

## C. First-party skill kütüphanesi (`~/.arix/skills/`)

Şu an sadece `example.md` var. Bundle'lanacak skill'ler:

| #   | Skill | İçerik |
|-----|---|---|
| C1  | `tdd` | RED-GREEN-REFACTOR döngüsü, test-first zorlama |
| C2  | `code-reviewer` | Security, perf, maintainability checklist |
| C3  | `debugger` | Hipotez → repro → bisect → root-cause workflow |
| C4  | `refactor` | SOLID, naming, abstraction extraction kuralları |
| C5  | `security-auditor` | OWASP Top 10, secret detection, dependency CVE |
| C6  | `perf-analyzer` | Profiling önerisi, hot path tespiti |
| C7  | `architect` | Mermaid + ADR + trade-off analizi |
| C8  | `migrator` | Framework version upgrade (React 18→19, Next 14→15 vs.) |
| C9  | `documenter` | Inline docs + README + ADR üretimi |
| C10 | `i18n` | String extract, locale file management |
| C11 | `pr-author` | Conventional commit + PR body + test plan |
| C12 | `data-engineer` | SQL optimization, schema design, ETL pipelines |

→ `arix skill install <name>` komutu (zaten var, içerik bundle'lansın).

---

## D. Bundled MCP server'lar (`arix mcp install <name>`)

| #   | MCP | Sağladığı |
|-----|---|---|
| D1  | **filesystem** (resmi, anthropic/mcp-server-filesystem) | Sandboxed FS — şu an custom, MCP'ye geç |
| D2  | **github** | Issue, PR, repo arama + file content |
| D3  | **gitlab** | GitLab muadili |
| D4  | **postgres** / **sqlite** | DB introspection + query |
| D5  | **slack** | Channel, message, user lookup |
| D6  | **linear** / **jira** / **notion** | Ticket sistemi |
| D7  | **playwright** / **puppeteer** | Web automation |
| D8  | **memory** (graph) | Kalıcı bilgi grafiği — proje memory'sinden zengin |
| D9  | **sequential-thinking** | Chain-of-thought scaffold |
| D10 | **time** | Tarih/zaman aritmetiği |
| D11 | **fetch** (lightweight web) | URL'den content extract |
| D12 | **sentry** | Hata izleme |
| D13 | **kubernetes** | k8s cluster query |
| D14 | **aws** / **gcp** / **azure** CLI wrapper | Cloud ops |
| D15 | **figma** | Design token export, frame inspect |

→ `arix mcp install github,postgres,playwright` ile tek komutla kur.

---

## E. Provider eklemeleri

| #   | Provider | Neden |
|-----|---|---|
| E1  | **xAI Grok** | Grok-4, real-time X verisi |
| E2  | **DeepSeek** (V3, R1) | $0.14/M ucuz, Chinese-perf strong |
| E3  | **Mistral** (Large-2, Codestral) | EU GDPR, Codestral coding-specialized |
| E4  | **Together AI** | Llama 3.3 405B, Qwen 2.5 72B, hızlı inference |
| E5  | **Groq** | LPU, 500+ tok/s — ultra-low latency completions |
| E6  | **Fireworks AI** | Open-weight modelleri ucuz host |
| E7  | **Perplexity** | Web-grounded answers (sonar models) |
| E8  | **Cohere** (Command R+) | Strong tool use, RAG-tuned |
| E9  | **Cerebras** | Inference hızı için (3000+ tok/s) |
| E10 | **Replicate** | Custom fine-tunes, image/video |

---

## F. DX / IDE entegrasyonu

| #  | Hedef | Detay |
|----|---|---|
| F1 | **JetBrains plugin** (IntelliJ/WebStorm/PyCharm/GoLand) | VS Code'daki tüm özellikler |
| F2 | **Neovim plugin** | telescope.nvim integration, inline completions via blink.cmp |
| F3 | **Zed extension** | Native Rust extension |
| F4 | **Warp/iTerm/Ghostty integration** | Block-aware terminal AI |
| F5 | **Browser extension** | GitHub PR sayfasında inline review |
| F6 | **Slack bot** | `/arix review PR-123` |
| F7 | **GitHub App** | Auto-review on PR open, /arix-fix komutu |

---

## G. UX / Dashboard / TUI

| #  | Özellik | Effort |
|----|---|---|
| G1 | **TUI'da split-pane diff editör** (Ink) | M |
| G2 | **Dashboard'da tool-call timeline** (Gantt-style) | S |
| G3 | **Dashboard'da plan görselleştirme** (Mermaid live render) | S |
| G4 | **Voice mode** — Whisper STT + ElevenLabs TTS, hands-free coding | M |
| G5 | **Inline screenshot annotation** — Cmd+Shift+4 → upload → AI okur | S |
| G6 | **Session sharing** — `arix session share <id>` → public URL | M |
| G7 | **Replay mode** — geçmiş session'ı turn-by-turn animate et | S |

---

## H. Cost / Budget intelligence

| #  | Özellik | Etki |
|----|---|---|
| H1 | **Adaptive caching** — sık kullanılan system prompt'u Anthropic prompt cache'e otomatik koy | -%30 maliyet |
| H2 | **Predictive routing** — turn'den önce maliyet+latency tahmini, eşiğe göre auto-downgrade | -%20 |
| H3 | **Hard budget kill-switch** — limite ulaşınca AgentLoop graceful stop (Z9 var ama warning-only) | UX |
| H4 | **Org-level pooling** — birden fazla kullanıcı tek API key havuzunu paylaşsın, audit + per-user limit | Team |
| H5 | **Cost regression alerts** — bir önceki haftaya göre 2x artış varsa uyarı | Ops |
| H6 | **Per-skill cost reports** | Granular insight |

---

## I. Quality / Observability

| #  | Özellik | Detay |
|----|---|---|
| I1 | **OpenTelemetry export** | Trace her tool call + LLM request, Honeycomb/Grafana'ya gönder |
| I2 | **Eval suite** (`arix eval`) | SWE-Bench / HumanEval + custom in-repo eval'ler |
| I3 | **Golden traces** — known-good session diff replay | Regression catcher |
| I4 | **Anonymous telemetry opt-in** | Anlamlı feature improvement metrikleri |
| I5 | **Audit log** (immutable) | Compliance — kim ne zaman ne yaptı |
| I6 | **Sandbox enforcement** — yazma tool'larını allow-list path zorunlu yap, escape catch | Security |

---

## J. Distribution / community

| #  | İş | Effort |
|----|---|---|
| J1 | **Plugin/skill marketplace sitesi** (`marketplace.arix.amirtech.ai`) | L |
| J2 | **Public docs sitesi** (`docs.arix.amirtech.ai`) — Mintlify/Docusaurus | M |
| J3 | **Quickstart videoları** | S |
| J4 | **Discord topluluğu** + `/arix help` Discord bot | S |
| J5 | **HN/Reddit/X launch** — post hazır + benchmark grafikleri | S |
| J6 | **Comparison page** — Cursor/Copilot/Claude Code ile head-to-head | S |
| J7 | **VSCode Marketplace yayını** + JetBrains Marketplace | S |

---

## K. Differentiator (kimsede olmayan)

| #  | Özellik | Neden farklı |
|----|---|---|
| K1 | **Cost arbitrage on-the-fly** — tier'lar arası real-time geçiş, "şu prompt'u Sonnet yerine DeepSeek'le %1 kalite kaybıyla %95 ucuz yap" | Yok |
| K2 | **Local-first encryption** — sessions/memory `~/.arix/` içinde AES-256, kullanıcı passphrase | Yok |
| K3 | **Multi-repo workspaces** — tek session'da N repo'ya bağlan, cross-repo refactor | Cursor sınırlı |
| K4 | **Reversible runs** — her tool çağrısı bir undo stack'e yazılır, `arix undo` | Yok |
| K5 | **Agent → CI köprüsü** — `arix loop --watch` PR oluşana kadar otomatik CI feedback ile düzelt | Cursor Background var, gizli |
| K6 | **Spec-driven** — `arix spec <feature.md>` → spec'i implementation'a expand, spec ile diff | Yok |

---


