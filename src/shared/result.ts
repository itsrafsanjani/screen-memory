export type Result<T> = { success: true; data: T } | { success: false; error: string }

export function ok<T>(data: T): Result<T> {
  return { success: true, data }
}

export function err(error: string): Result<never> {
  return { success: false, error }
}

function isString(cause: unknown): cause is string {
  return typeof cause === 'string'
}

export function toErrorMessage(cause: unknown): string {
  if (cause instanceof Error) return cause.message
  if (isString(cause)) return cause
  try {
    return JSON.stringify(cause)
  } catch {
    return 'Unknown error'
  }
}

export function unwrap<T>(result: Result<T>): T {
  if (result.success) return result.data
  throw new Error(result.error)
}
