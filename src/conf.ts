import dotenv from 'dotenv'
dotenv.config()
export const IS_DEBUG = process.env.DEBUG === 'true'
export const TOKEN = process.env.TOKEN

export const MAX_THINK_TIME = 5000

// Which AI class to load — must match a key in src/ai/registry.ts.
export const AI_NAME = process.env.AI ?? 'CarcaBot'

// undefined allowed, will use default
export const SERVER: string | null = process.env.SERVER ?? null
export const ALLOW_TRAIN = process.env.NO_TRAIN !== 'true'
export const MAX_TABLES = process.env.MAX_TABLES
  ? parseInt(process.env.MAX_TABLES)
  : 0

if (!TOKEN) {
  throw new Error('TOKEN is not defined')
}
