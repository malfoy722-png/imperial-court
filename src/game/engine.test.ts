import { describe, expect, it } from 'vitest'
import {
  advanceCourtScene,
  advanceTurn,
  generateNewCourt,
  investigateMinister,
  normalizeGameState,
  organizeBriefing,
  recordCourtBeat,
  recordCourtBeats,
} from './engine'
import type { PlayerAction, StatePatch } from './types'

describe('court generation', () => {
  it('replays the same random court from one seed', () => {
    const first = generateNewCourt('jade-morning')
    const second = generateNewCourt('jade-morning')

    expect(first.dynasty).toEqual(second.dynasty)
    expect(first.ministers.map((minister) => minister.publicDossier.name)).toEqual(
      second.ministers.map((minister) => minister.publicDossier.name),
    )
    expect(first.currentCourt.agenda.map((agenda) => agenda.title)).toEqual(
      second.currentCourt.agenda.map((agenda) => agenda.title),
    )
  })

  it('keeps hidden traits outside the public dossier', () => {
    const minister = generateNewCourt('quiet-cabinet').ministers[0]
    const publicText = JSON.stringify(minister.publicDossier)

    expect(publicText).not.toContain(minister.hiddenTraits.faction)
    expect(publicText).not.toContain('loyalty')
  })

  it('creates a fixed nine-minister roster with unique names', () => {
    const game = generateNewCourt('nine-cabinet')
    const offices = game.ministers.map((minister) => minister.publicDossier.office)
    const names = game.ministers.map((minister) => minister.publicDossier.name)

    expect(game.ministers).toHaveLength(9)
    expect(new Set(names).size).toBe(names.length)
    expect(offices).toEqual([
      '吏部尚书',
      '户部尚书',
      '礼部尚书',
      '兵部尚书',
      '刑部尚书',
      '工部尚书',
      '首辅',
      '都察院左都御史',
      '锦衣卫指挥使',
    ])
  })
})

describe('court state safety', () => {
  it('does not let free speech apply edicts or metric changes', () => {
    const game = generateNewCourt('idle-question')
    const action: PlayerAction = {
      type: 'speak',
      text: '先把账说清楚。',
      targetMinisterId: game.ministers[0].id,
      agendaId: game.currentCourt.activeAgendaId,
    }
    const patch: StatePatch = {
      metricChanges: [{ metric: 'treasury', delta: 12, reason: 'unsafe' }],
      edicts: [{ title: '偷落旨意', summary: '不该发生' }],
      investigations: [],
      memories: [],
      standingChanges: [{ ministerId: game.ministers[0].id, pressureDelta: 5, lastImperialSignal: '奉问奏对' }],
    }
    const beat = {
      speakerId: game.ministers[0].id,
      speakerName: game.ministers[0].publicDossier.name,
      text: '臣先答账。',
      atmosphere: '朝臣听着。',
      clues: [],
    }
    const next = recordCourtBeat(game, action, beat, patch)

    expect(next.metrics.treasury).toBe(game.metrics.treasury)
    expect(next.edicts).toHaveLength(0)
    expect(next.ministers[0].standing.pressure).toBeGreaterThan(game.ministers[0].standing.pressure)
  })

  it('lets an explicit approval produce a durable edict', () => {
    const game = generateNewCourt('edict-day')
    const action: PlayerAction = {
      type: 'approve',
      text: '准办。',
      targetMinisterId: game.ministers[0].id,
      agendaId: game.currentCourt.activeAgendaId,
    }
    const next = advanceCourtScene(game, action).game

    expect(next.edicts).toHaveLength(1)
    expect(next.ministers[0].standing.assignment).toContain('《')
    expect(next.ministers[0].standing.favor).toBeGreaterThan(game.ministers[0].standing.favor)
    expect(next.currentCourt.agenda.find((agenda) => agenda.id === action.agendaId)?.status).toBe(
      'resolved',
    )
    expect(next.currentCourt.activeAgendaId).not.toBe(action.agendaId)
    expect(next.currentCourt.transcript.at(-2)?.speakerName).toBe('鸿胪寺')
  })

  it('records one whole-court exchange with several minister speeches', () => {
    const game = generateNewCourt('open-court')
    const action: PlayerAction = {
      type: 'speak',
      text: '此事都说说。',
      agendaId: game.currentCourt.activeAgendaId,
    }
    const next = recordCourtBeats(
      game,
      action,
      game.ministers.slice(0, 3).map((minister, index) => ({
        speakerId: minister.id,
        speakerName: minister.publicDossier.name,
        text: `第${index + 1}位臣子奏对。`,
        atmosphere: '朝班轮流开口。',
        clues: [],
      })),
      { metricChanges: [], edicts: [], investigations: [], memories: [], standingChanges: [] },
    )

    expect(next.currentCourt.transcript.slice(-4).map((line) => line.speakerName)).toEqual([
      '朕',
      ...game.ministers.slice(0, 3).map((minister) => minister.publicDossier.name),
    ])
  })

  it('lets offline whole-court speech draw several ministers into the exchange', () => {
    const game = generateNewCourt('open-court-offline')
    const next = advanceCourtScene(game, {
      type: 'speak',
      text: '此事都说说。',
      agendaId: game.currentCourt.activeAgendaId,
    }).game
    const latestSpeakers = next.currentCourt.transcript.slice(-4).map((line) => line.speakerName)

    expect(latestSpeakers[0]).toBe('朕')
    expect(new Set(latestSpeakers.slice(1)).size).toBeGreaterThanOrEqual(2)
    expect(next.currentCourt.agenda.find((agenda) => agenda.id === game.currentCourt.activeAgendaId)?.status).toBe(
      'open',
    )
  })

  it('keeps a questioned agenda open so the emperor can still decide it', () => {
    const game = generateNewCourt('question-then-rule')
    const agendaId = game.currentCourt.activeAgendaId
    const asked = advanceCourtScene(game, {
      type: 'speak',
      text: '先把账问清。',
      targetMinisterId: game.currentCourt.focusMinisterId ?? game.ministers[0].id,
      agendaId,
    }).game
    const decided = advanceCourtScene(asked, {
      type: 'approve',
      text: '',
      targetMinisterId: asked.currentCourt.focusMinisterId ?? asked.ministers[0].id,
      agendaId,
    }).game

    expect(asked.currentCourt.agenda.find((agenda) => agenda.id === agendaId)?.status).toBe('open')
    expect(decided.currentCourt.agenda.find((agenda) => agenda.id === agendaId)?.status).toBe('resolved')
    expect(decided.currentCourt.activeAgendaId).not.toBe(agendaId)
  })

  it('turns study investigations into verified evidence', () => {
    const game = generateNewCourt('sealed-report')
    const target = game.ministers[0]
    const next = investigateMinister(game, target.id)

    expect(next.ministers[0].revealedFacts[0].confidence).toBe('verified')
    expect(next.investigations[0].ministerId).toBe(target.id)
  })

  it('tracks one action per turn slot and resets on the next turn', () => {
    const game = generateNewCourt('turn-slots')
    const asked = advanceCourtScene(game, {
      type: 'speak',
      text: '诸臣先说。',
      agendaId: game.currentCourt.activeAgendaId,
    }).game
    const checked = investigateMinister(asked, asked.ministers[0].id)
    const briefed = organizeBriefing(checked)
    const next = advanceTurn(briefed)

    expect(briefed.turn.usedActions.court).toBe(true)
    expect(briefed.turn.usedActions.intel).toBe(true)
    expect(briefed.turn.usedActions.briefing).toBe(true)
    expect(next.turn.number).toBe(game.turn.number + 1)
    expect(next.turn.usedActions).toEqual({
      court: false,
      intel: false,
      private: false,
      briefing: false,
    })
  })

  it('normalizes old saves with public imperial standing', () => {
    const game = generateNewCourt('old-scroll')
    const oldSave = JSON.parse(JSON.stringify(game)) as ReturnType<typeof generateNewCourt>
    oldSave.version = 1
    oldSave.ministers.forEach((minister) => {
      delete (minister as Partial<typeof minister>).standing
    })
    delete (oldSave.currentCourt as Partial<typeof oldSave.currentCourt>).imperialEffects

    const next = normalizeGameState(oldSave)

    expect(next.version).toBe(3)
    expect(next.ministers[0].standing.lastImperialSignal).toBe('初入朝班')
    expect(next.ministers[0].persona.fear).toBeTruthy()
    expect(next.turn.usedActions.court).toBe(false)
    expect(next.currentCourt.imperialEffects).toEqual([])
  })
})
