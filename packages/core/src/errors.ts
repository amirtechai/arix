export type ErrorCode =
  | 'AUTH_ERROR'
  | 'RATE_LIMIT'
  | 'CONTEXT_TOO_LONG'
  | 'MODEL_NOT_FOUND'
  | 'CONTENT_FILTERED'
  | 'PROVIDER_UNAVAILABLE'
  | 'ALL_PROVIDERS_FAILED'
  | 'PATH_FORBIDDEN'
  | 'TOOL_NOT_FOUND'
  | 'SHELL_BLOCKED'
  | 'TIMEOUT'
  | 'SESSION_NOT_FOUND'
  | 'CONFIG_ERROR'
  | 'MARKETPLACE_NOT_FOUND'
  | 'MARKETPLACE_UNAVAILABLE'
  | 'MARKETPLACE_FETCH_FAILED'
  | 'PROVIDER_ERROR'
  | 'UNKNOWN'

export interface ArixErrorOptions {
  retryable?: boolean
  provider?: string
  cause?: Error
}

export class ArixError extends Error {
  readonly code: ErrorCode
  readonly retryable: boolean
  readonly provider: string | undefined

  constructor(code: ErrorCode, message: string, options: ArixErrorOptions = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined)
    this.name = 'ArixError'
    this.code = code
    this.retryable = options.retryable ?? false
    this.provider = options.provider
  }
}
