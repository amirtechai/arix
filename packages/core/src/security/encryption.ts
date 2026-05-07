import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

/**
 * Local-first AES-256-GCM encryption for session/memory blobs.
 *
 * Format (base64-encoded):  v1.<salt:16>.<iv:12>.<tag:16>.<ciphertext>
 * Key is derived from a user passphrase via scrypt(N=2^15).
 */

const VERSION = 'v1'
const SALT_LEN = 16
const IV_LEN = 12
const TAG_LEN = 16
const KEY_LEN = 32
const SCRYPT_COST = 1 << 15 // 32768

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  // maxmem must be > 128 * N * r (default 32MB blocks scrypt at N=2^15)
  return scryptSync(passphrase, salt, KEY_LEN, { N: SCRYPT_COST, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
}

export function encrypt(plaintext: string, passphrase: string): string {
  const salt = randomBytes(SALT_LEN)
  const iv = randomBytes(IV_LEN)
  const key = deriveKey(passphrase, salt)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [
    VERSION,
    salt.toString('base64'),
    iv.toString('base64'),
    tag.toString('base64'),
    ct.toString('base64'),
  ].join('.')
}

export function decrypt(payload: string, passphrase: string): string {
  const parts = payload.split('.')
  if (parts.length !== 5 || parts[0] !== VERSION) {
    throw new Error('Invalid ciphertext envelope')
  }
  const [, saltB, ivB, tagB, ctB] = parts as [string, string, string, string, string]
  const salt = Buffer.from(saltB, 'base64')
  const iv   = Buffer.from(ivB, 'base64')
  const tag  = Buffer.from(tagB, 'base64')
  const ct   = Buffer.from(ctB, 'base64')
  if (salt.length !== SALT_LEN || iv.length !== IV_LEN || tag.length !== TAG_LEN) {
    throw new Error('Invalid ciphertext lengths')
  }
  const key = deriveKey(passphrase, salt)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const pt = Buffer.concat([decipher.update(ct), decipher.final()])
  return pt.toString('utf-8')
}

export function isEncrypted(payload: string): boolean {
  return typeof payload === 'string' && payload.startsWith(VERSION + '.')
}
