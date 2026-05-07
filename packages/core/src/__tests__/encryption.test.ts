import { describe, it, expect } from 'vitest'
import { encrypt, decrypt, isEncrypted } from '../security/encryption.js'

describe('local encryption', () => {
  it('round-trips text under a passphrase', () => {
    const ct = encrypt('hello world', 'correct horse battery staple')
    expect(isEncrypted(ct)).toBe(true)
    const pt = decrypt(ct, 'correct horse battery staple')
    expect(pt).toBe('hello world')
  })

  it('rejects a wrong passphrase', () => {
    const ct = encrypt('secret', 'pass-1')
    expect(() => decrypt(ct, 'pass-2')).toThrow()
  })

  it('produces distinct ciphertexts for the same plaintext (random salt+iv)', () => {
    const a = encrypt('x', 'p')
    const b = encrypt('x', 'p')
    expect(a).not.toBe(b)
  })

  it('rejects a tampered ciphertext', () => {
    const ct = encrypt('payload', 'p')
    const parts = ct.split('.')
    parts[4] = parts[4]!.slice(0, -2) + (parts[4]!.endsWith('A') ? 'BB' : 'AA')
    expect(() => decrypt(parts.join('.'), 'p')).toThrow()
  })
})
