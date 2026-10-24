import { apiError, type ApiError } from '../shared/api.ts'
import { ConfigError } from '../shared/model.ts'

export type Answer = { t: string } | ApiError

export const OK = { t: 'ok' } as const

/** A thrown error as the API answers it: a config error as `config`, anything else as `internal`. */
export const errorOf = (err: unknown): ApiError => apiError(err instanceof ConfigError ? 'config' : 'internal', (err as Error).message)
