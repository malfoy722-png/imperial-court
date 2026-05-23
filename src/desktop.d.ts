import type { GameState, MiniMaxSettings, PlayerAction, SaveSlot } from './game/types'

declare global {
  interface Window {
    courtDesktop?: {
      appendLog: (entry: { kind: string; payload: unknown }) => Promise<{ ok: boolean }>
      loadLatestSave: () => Promise<GameState | null>
      loadSettings: () => Promise<MiniMaxSettings>
      saveGame: (slot: SaveSlot) => Promise<{ ok: boolean }>
      saveSettings: (settings: MiniMaxSettings) => Promise<{ ok: boolean; settings: MiniMaxSettings }>
      advanceCourtScene: (payload: {
        gameState: GameState
        action: PlayerAction
      }) => Promise<unknown>
      generateAudienceAgenda: (payload: {
        gameState: GameState
      }) => Promise<unknown>
      resolveTurn: (payload: {
        gameState: GameState
      }) => Promise<unknown>
    }
  }
}

export {}
