# CarcaBot

Bot for the Carcassonne ("Islands") variant on GrandGames Arena.

## Architecture

The bot is split into four small modules:

- `deck.ts` — tracks the multiset of tiles whose identity is still unknown
  (deck + hidden hands). Built by subtracting every visible tile from the
  full 72-tile standard set. Exposes `computeDeck()` and `deckStrength()`.
- `simulate.ts` — pure function `applyMove(tiles, move, playerIdx)` that
  places a player's hand tile on the board and sets meeple ownership on
  the chosen segment. Does not mutate the input.
- `evaluate.ts` — the static evaluator. Runs `utils.analyzeGameEntities`
  on the candidate position and scores every meeple-owning structure
  (road / city / monastery / field). For structures that are not yet
  closed, the raw scoring value is blended with a completion probability
  derived from the remaining deck size and the structure complexity
  (`closeProb` / `monasteryCloseProb`). Adds a meeple-reserve bonus and
  the already-awarded board points differential.
- `CarcaBotAI.ts` — the driver. Does an iterative search bounded by
  `MAX_THINK_TIME`:
  1. Generate every legal move with `utils.getAllMoves`.
  2. Score each move via 1-ply lookahead + static evaluation.
  3. While time is left, refine the top-K candidates with a 1-ply
     worst-case opponent reply search (sampled, gated on whether the
     opponent's hand tile is visible).
  4. Always fall back to the best move found so far if the deadline is
     hit mid-computation.

## Design notes

- **Time budget** is `MAX_THINK_TIME - 250 ms` with a floor of 400 ms.
  Every loop checks `Date.now()` against the deadline.
- **Branching factor** is huge in Carcassonne (placement × rotation ×
  meeple segment). Deep alpha-beta is impractical, so we rely on a
  strong static evaluator and limited 2nd-ply refinement.
- **Completion probability** is deliberately coarse — a simple function
  of segment count and deck strength. It captures the qualitative
  intuition "big structures close less often, closing is a race against
  an empty deck" without paying the cost of a precise open-edge count.
- **Tie handling** follows the Carcassonne rule: majority meeple owners
  all score the full value. Encoded in `delta()` inside `evaluate.ts`.
- **Meeple reserve** is worth something only while there is still deck
  to deploy into; the weight decays with `deckStrength`.
