const REDACTED = '[REDACTED]'

// Ordered most-specific first so a narrow pattern claims the match before a
// broader one does (e.g. `sk-ant-` before the generic `sk-` key shape).
const SECRET_PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bsk-ant-[A-Za-z0-9_-]{20,}/g,
  /\bsk-[A-Za-z0-9_-]{20,}/g,
  /\bAIza[0-9A-Za-z_-]{35}\b/g,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/g,
  /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/g
]

// The screen-text delimiter, in both well-formed and truncated shapes. OCR text
// is sliced to a fixed length, so a crafted tag can arrive without its closing
// `>` and still read as a delimiter to the model.
const DELIMITER_PATTERNS: RegExp[] = [
  /<\/?\s*untrusted-screen-text[^>]*>/gi,
  /<\/?\s*untrusted-screen-text/gi
]

export function redactSecrets(text: string): string {
  let result = text
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0
    result = result.replace(pattern, REDACTED)
  }
  return result
}

export function sanitizeUntrustedScreenText(text: string): string {
  let result = redactSecrets(text)

  for (const pattern of DELIMITER_PATTERNS) {
    pattern.lastIndex = 0
    result = result.replace(pattern, '[removed-tag]')
  }

  return result.replace(/\0/g, '')
}
