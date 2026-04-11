import dotenv from 'dotenv'
dotenv.config()
export const IS_DEBUG = process.env.DEBUG === 'true'
export const TOKEN = process.env.TOKEN
// undefined allowed, will use default
export const SERVER: string | null = process.env.SERVER ?? null

if (!TOKEN) {
  throw new Error('TOKEN is not defined')
}
