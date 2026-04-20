import type { BotSDK } from 'gga-bots'
import type { GameAI } from './GameAI.js'
import RandomMoveAI from './RandomMove/RandomMoveAI.js'
import CarcaBotAI from './CarcaBot/CarcaBotAI.js'

/**
 * Registry of all AI implementations that can be selected at startup via
 * the `AI` environment variable. Add new entries here when a new AI class
 * is introduced — the key is the user-facing name.
 */
export const AI_REGISTRY: Record<string, new (sdk: BotSDK) => GameAI> = {
  CarcaBot: CarcaBotAI,
  RandomMove: RandomMoveAI,
}

export const DEFAULT_AI = 'CarcaBot'

export function createAI(name: string, sdk: BotSDK): GameAI {
  const Ctor = AI_REGISTRY[name]
  if (!Ctor) {
    const available = Object.keys(AI_REGISTRY).join(', ')
    throw new Error(
      `Unknown AI "${name}". Set AI in .env to one of: ${available}`,
    )
  }
  return new Ctor(sdk)
}
