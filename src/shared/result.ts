export type Result<T> = { success: true; data: T } | { success: false; error: string }

export function ok<T>(data: T): Result<T> {
  return { success: true, data }
}

export function err(error: string): Result<never> {
  return { success: false, error }
}

export function toErrorMessage(value: unknown): string {
  if (value instanceof Error) return value.message
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return 'Unknown error'
  }
}

export function unwrap<T>(result: Result<T>): T {
  if (result.success) return result.data
  throw new Error(result.error)
}
