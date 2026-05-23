import type { GameState, MiniMaxSettings, SaveSlot } from './types'
import { normalizeGameState } from './engine'

const gameKey = 'shangchao.save.latest'
const settingsKey = 'shangchao.minimax.settings'

export const defaultMiniMaxSettings: MiniMaxSettings = {
  apiKey: '',
  endpoint: 'https://api.minimaxi.com/v1/chat/completions',
  roleEndpoint: 'https://api.minimaxi.com/v1/text/chatcompletion_v2',
  directorModel: 'MiniMax-M2.7',
  roleModel: 'M2-her',
  aiEnabled: false,
}

function desktopApi() {
  return window.courtDesktop
}

function makeSlot(game: GameState): SaveSlot {
  return {
    id: game.id,
    title: `${game.dynasty.name} ${game.dynasty.reignTitle}`,
    version: game.version,
    snapshot: game,
    updatedAt: game.updatedAt,
  }
}

export async function loadLatestGame() {
  const api = desktopApi()

  if (api) {
    const saved = await api.loadLatestSave()
    return saved ? normalizeGameState(saved) : null
  }

  const snapshot = localStorage.getItem(gameKey)
  return snapshot ? normalizeGameState(JSON.parse(snapshot) as GameState) : null
}

export async function saveGame(game: GameState) {
  const api = desktopApi()

  if (api) {
    await api.saveGame(makeSlot(game))
    return
  }

  localStorage.setItem(gameKey, JSON.stringify(game))
}

export async function loadMiniMaxSettings() {
  const api = desktopApi()

  if (api) {
    return api.loadSettings()
  }

  const snapshot = localStorage.getItem(settingsKey)
  return snapshot
    ? ({ ...defaultMiniMaxSettings, ...JSON.parse(snapshot) } as MiniMaxSettings)
    : defaultMiniMaxSettings
}

export async function saveMiniMaxSettings(settings: MiniMaxSettings) {
  const api = desktopApi()

  if (api) {
    await api.saveSettings(settings)
    return settings
  }

  localStorage.setItem(settingsKey, JSON.stringify(settings))
  return settings
}

export async function appendLocalLog(kind: string, payload: unknown) {
  const api = desktopApi()

  if (api) {
    await api.appendLog({ kind, payload })
  }
}
