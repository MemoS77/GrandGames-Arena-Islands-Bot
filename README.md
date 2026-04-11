# A basic template for quickly creating bots for the island game

https://arena.grandgames.net/en/islands

All the rough work on connecting the platform, obtaining the position, various functions for analyzing game entities, and obtaining a list of possible moves has been completed.

- Install dependencies `npm i`
- Create your AI based on `src/ai/GameAI.ts`. Example: `src/ai/RandomMove/RandomMoveAI.ts`
- To test answers of your AI you can change `/src/test/testPos.ts` and run `npm run test`.
- Helper functions to simplify your AI development are in `src/utils/` folder.

## When your AI ready to play

- Create bot account. See for more info about it: https://github.com/MemoS77/GrandGames-Arena-Bots-SDK

- Get token from GrandGames Arena and put it in `.env` file
- `npm run build` to build the project
- `npm run start` to start the bot
