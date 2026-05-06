import { logger } from '../logger/index.js'
import { ArixError } from '../errors.js'

/** User-facing messages for each error code */
const ERROR_MESSAGES: Record<string, string> = {
  AUTH_ERROR:            'API key invalid or missing. Run: arix config set providers.<name>.apiKey <key>',
  RATE_LIMIT:            'Rate limit hit. Wait a moment or switch provider with -p <provider>.',
  CONTEXT_TOO_LONG:      'Conversation exceeds model context window. Try /clear or pick a longer-context model (e.g. -p minimax).',
  MODEL_NOT_FOUND:       'Model not found on this provider. Run: arix models list',
  CONTENT_FILTERED:      'Request blocked by provider content policy.',
  PROVIDER_UNAVAILABLE:  'Provider unavailable. Check your internet connection or try -p <other>.',
  ALL_PROVIDERS_FAILED:  'All providers failed. Check your API keys and connection.',
  PROVIDER_ERROR:        'Provider returned an unexpected error. Run with --debug for details.',
  PATH_FORBIDDEN:        'Operation blocked: path is outside the allowed sandbox.',
  TOOL_NOT_FOUND:        'Tool not found.',
  SHELL_BLOCKED:         'Shell command blocked by security policy.',
  TIMEOUT:               'Request timed out.',
  SESSION_NOT_FOUND:     'Session not found.',
  CONFIG_ERROR:          'Configuration error. Run: arix config list',
}

export function formatUserError(err: unknown): string {
  if (err instanceof ArixError) {
    const base = ERROR_MESSAGES[err.code] ?? err.message
    const provider = err.provider ? ` [${err.provider}]` : ''
    return `${base}${provider}`
  }
  return err instanceof Error ? err.message : String(err)
}

/** Install process-level handlers — call once at CLI entry point */
export function installGlobalErrorHandlers(): void {
  process.on('uncaughtException', (err: Error) => {
    logger.error('Uncaught exception', { message: err.message, stack: err.stack })
    process.stderr.write(`\n\x1b[31mFatal error:\x1b[0m ${formatUserError(err)}\n`)
    process.exit(1)
  })

  process.on('unhandledRejection', (reason: unknown) => {
    const msg = reason instanceof Error ? reason.message : String(reason)
    const stack = reason instanceof Error ? reason.stack : undefined
    logger.error('Unhandled rejection', { message: msg, stack })
    process.stderr.write(`\n\x1b[31mFatal error:\x1b[0m ${formatUserError(reason)}\n`)
    process.exit(1)
  })
}
