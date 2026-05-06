# Arix — Dünyanın En İyi Kodlama Aracı

> **1. KURAL (DEĞİŞMEZ):** Arix her zaman Claude Code ve OpenClaude'dan daha iyi,
> daha fonksiyonel olmalıdır. Dünyadaki en mükemmel kodlama aracı.
>
> Durum: 295 test, MCP entegrasyonu aktif, parallel ask çalışıyor, CoordinatorAgent paralel.

---

## ✅ TAMAMLANDI

### Foundation
- [x] Multi-provider: Anthropic, OpenAI, Gemini, OpenRouter, Bedrock, Azure, Vertex, Ollama
- [x] AgentLoop: streaming, tool use, multi-turn
- [x] ModelCatalogue: 35+ model, pricing, recommend(), estimateCost()
- [x] CostTracker: per-turn USD tracking, persist ~/.arix/costs.json
- [x] ContextCompactor: 80% threshold'da otomatik compress
- [x] ProjectMemory: session-spanning project knowledge
- [x] ParallelAgentPool: bounded concurrency, multi-worker
- [x] CoordinatorAgent: task decomposition + team memory (sequential)
- [x] ModelRouter: task-type aware routing (coding/reasoning/cheap/fast/local)
- [x] PluginLoader: disk-based ESM plugins, hot-reload
- [x] FallbackProvider: rate limit / auth hatalarında otomatik provider geçişi
- [x] MCP client: stdio + HTTP transport, tool discovery, registry, AgentLoop entegrasyon
- [x] `arix mcp` CLI: list, add, remove, tools, test, enable/disable
- [x] `arix ask --parallel`: 3 model aynı anda yanıt verir
- [x] `arix chat --auto`: ModelCatalogue.recommend() ile auto model routing
- [x] `arix chat --resume <id>` + `--continue`: session devam
- [x] REPL history: readline + `~/.arix/history.txt`
- [x] `/commands` in REPL: /model, /cost, /clear, /save, /memory, /help
- [x] Git-aware context: git log + git status inject
- [x] Session memory extraction: session bitince otomatik fact extraction
- [x] Markdown rendering (terminal ANSI)
- [x] Tool timing: `▶ tool... ✓ (42ms)`
- [x] 295 unit test, sıfır build hatası
- [x] **Z1** — Ollama tool calling fix: tools + tool_choice gönderiliyor
- [x] **Z2** — Global `--resume <id>` flag + REPL `/sessions` komutu
- [x] **Z3** — Elite coding identity system prompt (staff engineer standartı)
- [x] **Z4** — Anthropic prompt caching (cache_control: ephemeral, %40-90 maliyet düşürme)
- [x] **Z5** — Session timestamp sort fix (stable tie-break, test düzeltildi)
- [x] **Z6** — `arix design <feature>` komutu: full architecture spec + Mermaid + --build
- [x] **Z7** — `arix team <task>`: parallel multi-agent execution (Promise.allSettled)
- [x] **Z7b** — CoordinatorAgent: parallel: true/false seçeneği, maxSubTasks: 10

---

## 🔴 P0 — KRİTİK (Bu sprint)

### Z1 — Ollama Tool Calling Fix [BUG]
**Sorun:** `OllamaProvider.chat()` tools parametresini request'e hiç göndermiyor.
`supportsTools()` true dönüyor ama tool calling çalışmıyor.
**Fix:**
- `/v1/chat/completions` body'ye `tools` + `tool_choice: "auto"` ekle
- Response delta'dan `tool_calls` parse et
- Destekleyen modeller: llama3.2, qwen2.5-coder, mistral-nemo
- Desteklemeyenlerde graceful fallback: "Tool calling not supported on this model"

### Z2 — Global `--resume` Flag (Claude Code tarzı)
**Durum:** `arix chat --resume <id>` çalışıyor ama `chat` subcommand'ın içinde.
**Hedef:** `arix --resume xxxxx` → doğrudan chat REPL'a girer (Claude Code UX'i)
**Ek:** REPL'da `/sessions` komutu → son 10 session listesi, seçip devam et

### Z3 — Coding Identity: Elite System Prompt
**Sorun:** Arix generic chatbot gibi davranıyor.
**Hedef:** Dünyaca tanınan, kodlama odaklı bir AI mühendis kimliği.
**Değişiklikler:**
- `packages/cli/src/bootstrap.ts`: Güçlü coding-specialist system prompt
- Her prompt öncesi: research → plan → code → verify döngüsü
- Mimari tasarım, klasör yapısı, görsel üretim (Mermaid, ASCII) yetenekleri
- "Bir staff engineer bunu approve eder mi?" filtresi

### Z4 — Token Efficiency Engine (Arix özel kurallar)
**Maliyet %40-60 düşürme hedefi:**
- Anthropic prompt cache headers (5-min TTL) → system prompt cache
- Tool result truncation: max 2000 chars, özet ekle
- Smart context: sadece ilgili dosya bölümleri, tüm dosya değil
- Structured intermediate output: JSON > prose
- Context window kullanım göstergesi REPL'da: `[ctx: 12k/200k]`
- `estimateTokens()` → gerçek Anthropic token sayısı (tiktoken benzeri)

### Z5 — Per-Task Model Profiles + Akıllı Öneri
**Durum:** ModelRouter var ama user-facing değil.
**Hedef:**
```
arix config model coding=claude-sonnet-4-6 planning=claude-opus-4-6 simple=gpt-4.1-nano
```
- Task detection: prompt analizi → coding/planning/review/simple sınıflandırma
- Interactive öneri: "Bu karmaşık bir kodlama görevi. claude-opus-4-6 ($0.003 tahmin)? [y/N]"
- `/model suggest` REPL komutu
- Named profiles: `--profile budget` | `--profile power` | `--profile local`

---

## 🟡 P1 — ÖNEMLİ (Sonraki sprint)

### Z6 — `/design` Komutu (Architecture-First Development)
**Claude Code'daki `/design`'dan daha güçlüsü:**
```
arix design "kullanıcı auth sistemi"
```
**Çıktı üretir:**
1. High-level architecture + component breakdown
2. Data model / schema (Mermaid ERD)
3. API contracts (OpenAPI snippet)
4. User flow (ASCII akış diyagramı)
5. Trade-off analizi
6. Edge case listesi
7. Implementation sırası + tahminli süre

**Biz daha fazlasını da yaparız:**
- Mermaid diagram otomatik render (terminal + `docs/design/` dosyası)
- ASCII wireframe UI sketches
- `--build` flag: tasarım spec → production-ready project scaffold
- `--figma` flag: Figma-compatible JSON token çıktısı

### Z7 — Team Agent: Paralel Subtask Execution
**Durum:** `CoordinatorAgent` sequential çalışıyor.
**Hedef:** Promise.allSettled ile paralel subtask execution.
**Eklemeler:**
- `arix team "karmaşık görev"` CLI komutu
- Per-type model assignment: coding→Sonnet, review→Opus, search→Flash/cheap
- Live progress dashboard: subtask'ların durumu (running/done/failed)
- Shared team memory arasında geçiş (global context)
- Max subtask 10 (şu an 5)

### Z8 — Gerçek Token Sayımı (Y9)
**Durum:** `estimateTokens()` char/4 kullanıyor → hatalı maliyet hesabı.
**Fix:** Anthropic streaming `message_delta` usage field'ını yakala, CostTracker'a ilet.
**Providers:** Anthropic, OpenAI, Gemini hepsi usage döndürüyor.

### Z9 — Budget Mode (Y13)
```
arix chat --budget 0.10   # max $0.10 harca
```
- CostTracker.cumulativeUsd → threshold kontrolü
- %80'de uyarı: "Budget'ın %80'i harcandı ($0.08/$0.10)"
- Aşıldığında: AgentLoop'tan `budget_exceeded` event yayınla, graceful stop

### Z10 — Multi-file Context (Y16)
```
arix chat --file src/auth.ts --file src/user.ts "bu iki dosyayı refactor et"
```
- Dosya içerikleri system prompt'a eklenir (token budget kontrolüyle)
- `--dir src/` ile klasör bazlı context
- Auto-detect: git diff'teki değişen dosyaları otomatik ekle

---

## 🟢 P2 — DIFFERENTIATOR (Claude Code'da yok)

### Z11 — Magic Build Mode ✅
```
arix build "Next.js + Supabase e-ticaret sitesi"
```
- Tam proje scaffold: klasör yapısı, config dosyaları, temel kod
- Interactive: her adımda onay iste
- Tech stack seçimi: "React mi Vue mi?" gibi sorular
- `arix build --template saas` | `--template cli` | `--template api`

### Z12 — Semantic Code Search (ripgrep + symbol context) ✅
- Tool: `semantic_search(query, file_pattern?, definitionsOnly?)` → ripgrep + grep fallback
- `arix find "authentication logic"` → semantik arama
- Enclosing function/class context her [use] match için (`↪ in: ...`)
- `--defs` flag: sadece definition matches (functions, classes, types)
- treesitter (AST) ileri faz — şimdilik regex-based DEFINITION_RE yeterli

### Z13 — OpenClaude v0.4 Provider Eklemeleri ✅
- NVIDIA NIM (`nvidia` / `nim`) — OpenAI-compatible, 4 model (Llama 3.3 70B, 3.1 405B, Nemotron, Mixtral)
- MiniMax (`minimax`) — 1M context, MiniMax-Text-01 + M1
- Error classification: AUTH / RATE_LIMIT / CONTEXT_TOO_LONG / MODEL_NOT_FOUND / CONTENT_FILTERED / PROVIDER_UNAVAILABLE / PROVIDER_ERROR
- User-facing messages provider tag'i ile (`[anthropic]`, vb.)

### Z14 — Cost Intelligence & Arbitrage ✅
- `arix cost optimize` — geçmiş ledger analiz → cheaper alternative öneri (Y26)
- `arix cost compare <prompt>` — tier'da tüm modellerde tahmini maliyet (Y21)
- `arix cost breakdown --by-model | --by-day` — ASCII bar chart
- Simple-tier sessions için Ollama önerisi (Y27)

### Z15 — VS Code Extension (Geliştirilmiş)
- Terminal entegrasyon: VS Code içinden `arix` çalıştır ✅
- Sidebar: session history, memory viewer, cost dashboard ✅
- Inline suggestions: cursor position'a göre context-aware öneri ✅
  - `arix complete` CLI: tek-atımlık FIM-style code completion (provider direkt, agent loop yok)
  - `ArixInlineProvider`: VS Code `InlineCompletionItemProvider` — debounce + cancel + timeout
  - Config: `inlineCompletions.{enabled,model,provider,maxTokens,debounceMs,timeoutMs}` + toggle command

### Z16 — Web UI Dashboard ✅
```
arix serve  # http://localhost:7432  (--grpc to also start gRPC, --grpc-only headless)
```
- Session history browser ✅
- Cost charts (model/gün bazlı) ✅
- Memory viewer + editor ✅
- Real-time streaming chat interface ✅ (POST /api/chat SSE → ChatTab)

---

## 🔵 P3 — POLISH

### Monitoring & Distribution
- [x] **Y40** — `arix cost breakdown --by-model` + `--by-day`
- [x] **Y41** — ASCII maliyet grafiği (bar chart)
- [x] **Y43** — `npm install -g arix`
- [x] **Y44** — GitHub Actions CI: test + lint + publish
- [x] **Y45** — Homebrew formula
- [x] **Y46** — Windows support

---

## ÖNCELIK SIRASI — Hemen Başla

```
Z1  → Ollama tool calling fix          [1 saat, kritik bug]
Z2  → Global --resume flag             [30 dk, UX]
Z3  → Coding identity system prompt   [1 saat, kimlik]
Z4  → Token efficiency (cache+trunc)   [2 saat, maliyet]
Z5  → Per-task model profiles          [2 saat, UX+maliyet]
Z6  → /design command                  [3 saat, killer feature]
Z7  → Parallel team agents             [2 saat, differentiator]
Z8  → Real token counting              [1 saat, accuracy]
Z9  → Budget mode                      [1 saat, UX]
Z10 → Multi-file context               [1 saat, UX]
```

---

## Rakip Karşılaştırma (Güncel)

| Özellik | Claude Code | OpenClaude v0.4 | Arix (şimdi) | Arix (hedef) |
|---------|-------------|-----------------|-----------------|-----------------|
| Multi-provider | ❌ Anthropic only | ✅ 6 provider | ✅ 8 provider | ✅ 10+ |
| MCP support | ✅ Full | ✅ | ✅ | ✅ |
| Cost tracking | ❌ | ❌ | ✅ | ✅+ |
| Parallel agents | ❌ | ❌ | ✅ | ✅+ |
| Team agents | ⚠️ Basic | ❌ | ✅ Sequential | ✅ Parallel |
| Local models | ❌ | ✅ Ollama | ✅ Ollama | ✅ + NIM |
| Tool calling local | N/A | ⚠️ Broken | ⚠️ Broken | ✅ Z1 |
| Per-task routing | ❌ | ✅ Basic | ✅ ModelRouter | ✅ + UX Z5 |
| /design command | ✅ Basic | ❌ | ❌ | ✅ Enhanced Z6 |
| Magic build | ❌ | ❌ | ❌ | ✅ Z11 |
| Budget mode | ❌ | ❌ | ❌ | ✅ Z9 |
| Project memory | ⚠️ | ❌ | ✅ | ✅+ |
| Token efficiency | ⚠️ | ❌ | ⚠️ | ✅ Z4 |
| Open source | ❌ | ✅ | ✅ | ✅ |
| Ripgrep search | ✅ | ✅ v0.4 | ⚠️ | ✅ Z12 |
| ASCII/Mermaid viz | ❌ | ❌ | ❌ | ✅ Z6 |
| Web UI | ❌ | ❌ | ❌ | ✅ Z16 |
