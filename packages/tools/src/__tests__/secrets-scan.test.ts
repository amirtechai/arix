import { describe, it, expect } from 'vitest'
import { scanString, redact } from '../security/secrets-scan.js'

describe('secrets-scan', () => {
  it('detects an AWS access key', () => {
    const findings = scanString('AKIAIOSFODNN7EXAMPLE')
    expect(findings.find((f) => f.patternId === 'aws-access-key')).toBeTruthy()
  })

  it('detects a GitHub token', () => {
    const findings = scanString('export GH=ghp_abcdefghijklmnopqrstuvwxyz0123456789')
    expect(findings.find((f) => f.patternId === 'github-token')).toBeTruthy()
  })

  it('masks tokens in preview', () => {
    const findings = scanString('AKIAIOSFODNN7EXAMPLE')
    expect(findings[0]?.preview).toMatch(/AKIA…/)
    expect(findings[0]?.preview).not.toContain('IOSFODNN')
  })

  it('redact replaces secrets with placeholder', () => {
    const r = redact('key=ghp_abcdefghijklmnopqrstuvwxyz0123456789')
    expect(r).toContain('<redacted:github-token>')
    expect(r).not.toContain('ghp_abcdefg')
  })

  it('produces no findings on safe text', () => {
    expect(scanString('hello world').length).toBe(0)
  })

  it('reports correct line numbers', () => {
    const findings = scanString('safe\nsk-ant-1234567890abcdefghijklmnop\nalso safe')
    expect(findings[0]?.line).toBe(2)
  })
})
