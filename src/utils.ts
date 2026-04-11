import type { PositionInfo } from 'gga-bots'
import type { GamePosition } from './ai/types.js'

export const simpleHash = (str: string): number => {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return hash
}

export const getPositionKey = (p: PositionInfo<GamePosition>): string => {
  return `${p.tableId}:${simpleHash(JSON.stringify(p.position))}`
}
