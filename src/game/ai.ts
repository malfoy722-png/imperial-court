import { aiAgendaSchema, aiBeatSchema, aiResolutionSchema } from './schema'
import type { GameState, PlayerAction } from './types'

export async function requestAiCourtBeat(gameState: GameState, action: PlayerAction) {
  if (!window.courtDesktop) {
    return null
  }

  const response = await window.courtDesktop.advanceCourtScene({ gameState, action })
  return aiBeatSchema.parse(response)
}

export async function requestAiAudienceAgenda(gameState: GameState) {
  if (!window.courtDesktop) {
    return null
  }

  const response = await window.courtDesktop.generateAudienceAgenda({ gameState })
  return aiAgendaSchema.parse(response)
}

export async function requestAiTurnResolution(gameState: GameState) {
  if (!window.courtDesktop) {
    return null
  }

  const response = await window.courtDesktop.resolveTurn({ gameState })
  return aiResolutionSchema.parse(response)
}
