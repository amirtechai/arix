import { describe, it, expect } from 'vitest'
import { ArixError } from '../errors.js'

describe('ArixError', () => {
  it('is an instance of Error', () => {
    const err = new ArixError('AUTH_ERROR', 'Invalid API key')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(ArixError)
  })

  it('stores code, message, retryable', () => {
    const err = new ArixError('RATE_LIMIT', 'Too many requests', { retryable: true, provider: 'openrouter' })
    expect(err.code).toBe('RATE_LIMIT')
    expect(err.message).toBe('Too many requests')
    expect(err.retryable).toBe(true)
    expect(err.provider).toBe('openrouter')
  })

  it('defaults retryable to false', () => {
    const err = new ArixError('AUTH_ERROR', 'Bad key')
    expect(err.retryable).toBe(false)
  })

  it('has correct name for stack traces', () => {
    const err = new ArixError('UNKNOWN', 'oops')
    expect(err.name).toBe('ArixError')
  })
})
