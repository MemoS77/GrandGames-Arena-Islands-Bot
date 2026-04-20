import type { GameAI } from './ai/GameAI.js'
import { createAI } from './ai/registry.js'
import type { GamePosition } from './ai/types.js'
import { TOKEN, SERVER, MAX_TABLES, ALLOW_TRAIN, AI_NAME } from './conf.js'
import log from './log.js'
import { BotSDK, GameId } from 'gga-bots'
import { PositionQueue } from './queue.js'

console.clear()

const sdk = new BotSDK()
const queue = new PositionQueue(sdk)

sdk.onPosition<GamePosition>((p) => {
  queue.handlePosition(p)
})

console.info('Configuration loaded:', {
  SERVER,
  ALLOW_TRAIN,
  MAX_TABLES,
  AI_NAME,
})

const connect = () => {
  sdk
    .connect(TOKEN!, [GameId.Islands], {
      serverUrl: SERVER,
      maxTables: MAX_TABLES,
      allowTrain: ALLOW_TRAIN,
    })
    .then((v) => {
      log('Connected! User info: ', v)
      const ai: GameAI = createAI(AI_NAME, sdk)
      ai.init(v.login)
      queue.setAI(ai)
    })
    .catch((err) => {
      log(`Can't connect`, err)
    })
}

sdk.onDisconnect((code) => {
  log(`Disconnected with code: ${code}`)
  setTimeout(() => {
    connect()
  }, 3000)
})

connect()
