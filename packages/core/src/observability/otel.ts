/**
 * Lightweight OpenTelemetry-style trace emitter (I1).
 *
 * We deliberately don't pull `@opentelemetry/api` as a hard dep — instead we
 * emit OTLP/JSON spans to a local NDJSON file (or stdout) that the user can
 * forward to Honeycomb / Grafana / Tempo / Jaeger via the OTel collector.
 *
 * Set `ARIX_OTEL_FILE=/path/to/spans.jsonl` to enable file output, or
 * `ARIX_OTEL_STDOUT=1` for stdout, or `ARIX_OTEL_HTTP=https://...` to POST
 * each batch to an OTLP/HTTP endpoint.
 */

import { appendFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'

export interface SpanRecord {
  traceId: string
  spanId: string
  parentSpanId?: string
  name: string
  startTimeUnixNano: number
  endTimeUnixNano: number
  attributes: Record<string, string | number | boolean>
  status: 'ok' | 'error'
  errorMessage?: string
}

function id(bytes: number): string { return randomBytes(bytes).toString('hex') }
function now(): number { return Date.now() * 1_000_000 }

export class Tracer {
  private readonly file: string | undefined
  private readonly stdout: boolean
  private readonly http: string | undefined
  private readonly buffer: SpanRecord[] = []

  constructor() {
    this.file = process.env['ARIX_OTEL_FILE']
    this.stdout = process.env['ARIX_OTEL_STDOUT'] === '1'
    this.http = process.env['ARIX_OTEL_HTTP']
  }

  enabled(): boolean { return Boolean(this.file || this.stdout || this.http) }

  newTraceId(): string { return id(16) }
  newSpanId(): string { return id(8) }

  /** Wrap an async block; emits a span whose status reflects success/throw. */
  async withSpan<T>(
    name: string,
    fn: () => Promise<T>,
    opts: { traceId?: string; parentSpanId?: string; attributes?: SpanRecord['attributes'] } = {},
  ): Promise<T> {
    if (!this.enabled()) return fn()
    const traceId = opts.traceId ?? this.newTraceId()
    const spanId = this.newSpanId()
    const startTimeUnixNano = now()
    try {
      const result = await fn()
      await this._emit({
        traceId, spanId, name, startTimeUnixNano,
        endTimeUnixNano: now(),
        ...(opts.parentSpanId ? { parentSpanId: opts.parentSpanId } : {}),
        attributes: opts.attributes ?? {},
        status: 'ok',
      })
      return result
    } catch (err) {
      await this._emit({
        traceId, spanId, name, startTimeUnixNano,
        endTimeUnixNano: now(),
        ...(opts.parentSpanId ? { parentSpanId: opts.parentSpanId } : {}),
        attributes: opts.attributes ?? {},
        status: 'error',
        errorMessage: err instanceof Error ? err.message : String(err),
      })
      throw err
    }
  }

  private async _emit(span: SpanRecord): Promise<void> {
    const line = JSON.stringify(span)
    if (this.stdout) process.stdout.write(line + '\n')
    if (this.file) {
      try { await appendFile(this.file, line + '\n', 'utf-8') } catch { /* swallow */ }
    }
    if (this.http) {
      this.buffer.push(span)
      if (this.buffer.length >= 16) await this._flush()
    }
  }

  async flush(): Promise<void> { await this._flush() }

  private async _flush(): Promise<void> {
    if (!this.http || this.buffer.length === 0) return
    const batch = this.buffer.splice(0, this.buffer.length)
    try {
      await fetch(this.http, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resourceSpans: batch }),
      })
    } catch { /* swallow — telemetry must never break the agent */ }
  }
}

export const tracer = new Tracer()
