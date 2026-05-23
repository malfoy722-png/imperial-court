import {
  BookOpenText,
  ChevronLeft,
  ChevronRight,
  Crown,
  Eye,
  Landmark,
  MessageSquareText,
  ScrollText,
  SendHorizontal,
  Settings2,
  ShieldCheck,
  Sparkles,
  Swords,
  UsersRound,
  Zap,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import './App.css'
import { requestAiAudienceAgenda, requestAiCourtBeat, requestAiTurnResolution } from './game/ai'
import {
  advanceCourtScene,
  advanceTurn,
  generateNewCourt,
  investigateMinister,
  organizeBriefing,
  recordCourtBeats,
  replaceAudienceAgenda,
  setSceneMode,
} from './game/engine'
import {
  appendLocalLog,
  defaultMiniMaxSettings,
  loadLatestGame,
  loadMiniMaxSettings,
  saveGame,
  saveMiniMaxSettings,
} from './game/storage'
import type {
  AgendaItem,
  CourtActionType,
  GameState,
  MetricKey,
  MiniMaxSettings,
  MinisterProfile,
  PlayerAction,
  SceneMode,
  TurnActionSlot,
  TurnResolutionDraft,
} from './game/types'

const metricLabels: Record<MetricKey, string> = {
  treasury: '国库',
  people: '民心',
  army: '军心',
  authority: '皇威',
  bureaucracy: '吏治',
  border: '边势',
  faction: '朋党',
}

const sceneLabels: Record<SceneMode, string> = {
  court: '朝会',
  privateAudience: '御书房召见',
  intel: '密查',
  briefing: '整理情报',
  resolution: '回合结算',
}

const slotLabels: Record<TurnActionSlot, string> = {
  court: '朝会',
  intel: '密查',
  private: '召见',
  briefing: '整理',
}


const privateAudienceActions: Array<{
  type: CourtActionType
  label: string
  icon: typeof SendHorizontal
  description: string
}> = [
  { type: 'threaten', label: '威压', icon: Swords, description: '以权势施压，令其惶恐就范' },
  { type: 'appease', label: '笼络', icon: Crown, description: '示以恩宠，换取忠心与配合' },
  { type: 'probe', label: '试探', icon: Zap, description: '旁敲侧击，探其底线与秘密' },
]

type MinisterStageSlot = {
  x: number
  y: number
  scale: number
  rank: 'front' | 'back'
  side: 'left' | 'right'
  z: number
}

const ministerPositions = [
  { x: 39, y: 17, scale: 1.04, rank: 'front', side: 'left', z: 7 },
  { x: 61, y: 17, scale: 1.04, rank: 'front', side: 'right', z: 7 },
  { x: 31, y: 21, scale: 0.98, rank: 'front', side: 'left', z: 6 },
  { x: 69, y: 21, scale: 0.98, rank: 'front', side: 'right', z: 6 },
  { x: 46, y: 23, scale: 0.96, rank: 'front', side: 'left', z: 6 },
  { x: 54, y: 23, scale: 0.96, rank: 'front', side: 'right', z: 6 },
  { x: 36, y: 39, scale: 0.82, rank: 'back', side: 'left', z: 3 },
  { x: 64, y: 39, scale: 0.82, rank: 'back', side: 'right', z: 3 },
  { x: 27, y: 43, scale: 0.78, rank: 'back', side: 'left', z: 2 },
  { x: 73, y: 43, scale: 0.78, rank: 'back', side: 'right', z: 2 },
  { x: 44, y: 45, scale: 0.76, rank: 'back', side: 'left', z: 2 },
  { x: 56, y: 45, scale: 0.76, rank: 'back', side: 'right', z: 2 },
] satisfies MinisterStageSlot[]

type Drawer = 'left' | 'right' | 'bottom' | 'settings' | null

function isAgendaDecision(type: CourtActionType) {
  return ['approve', 'reject', 'hold', 'assign', 'reconsider', 'appoint'].includes(type)
}

function slotForScene(scene: SceneMode): TurnActionSlot {
  if (scene === 'intel') {
    return 'intel'
  }

  if (scene === 'privateAudience') {
    return 'private'
  }

  if (scene === 'briefing') {
    return 'briefing'
  }

  return 'court'
}

function activeAgenda(game: GameState) {
  return game.currentCourt.agenda.find((agenda) => agenda.id === game.currentCourt.activeAgendaId)
}

function selectedMinisters(game: GameState, ids: string[]) {
  return ids
    .map((id) => game.ministers.find((minister) => minister.id === id))
    .filter(Boolean) as MinisterProfile[]
}

function ministerIsUnderInquiry(game: GameState, ministerId: string) {
  return game.investigations.some((item) => item.ministerId === ministerId)
}


function openAgenda(game: GameState) {
  return game.currentCourt.agenda.find((agenda) => agenda.status === 'open')
}

const withAiTimeout = async <T,>(task: Promise<T>, milliseconds: number, label: string) =>
  Promise.race<T>([
    task,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(`${label}等得太久，先由离线朝班接住。`)), milliseconds)
    }),
  ])


function MetricPill({ metric, value }: { metric: MetricKey; value: number }) {
  const danger = value <= 22
  const warning = !danger && value <= 30
  return (
    <article className={`metric-pill ${danger ? 'danger' : warning ? 'warning' : ''}`}>
      <span>{metricLabels[metric]}</span>
      <b>{value}</b>
    </article>
  )
}

function AgendaCard({
  agenda,
  active,
  presenter,
  onSelect,
}: {
  agenda: AgendaItem
  active: boolean
  presenter?: MinisterProfile
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      className={`agenda-card ${active ? 'active' : ''} ${agenda.status}`}
      onClick={onSelect}
    >
      <span>{agenda.severity === 'crisis' ? '急' : agenda.severity === 'state' ? '政' : '常'}</span>
      <b>{agenda.title}</b>
      <small>{presenter?.publicDossier.office ?? '值殿官'}</small>
      {agenda.status !== 'open' ? <em>{agenda.status === 'held' ? '留中' : '已决'}</em> : null}
    </button>
  )
}

function speakerTargetFromLine(game: GameState, speakerId: string | null) {
  return speakerId ? game.ministers.find((minister) => minister.id === speakerId) ?? null : null
}

function MinisterFigure({
  minister,
  index,
  selected,
  muted,
  presenter,
  underInquiry,
  onSelect,
}: {
  minister: MinisterProfile
  index: number
  selected: boolean
  muted: boolean
  presenter: boolean
  underInquiry: boolean
  onSelect: (event: React.MouseEvent<HTMLButtonElement>) => void
}) {
  const slot = ministerPositions[index % ministerPositions.length]
  const portraitX = `${(index % 3) * 50}%`
  const portraitY = `${Math.floor(index / 3) * 50}%`

  return (
    <button
      type="button"
      className={`minister-figure ${slot.side} ${slot.rank} ${selected ? 'selected' : ''} ${muted ? 'muted' : ''} ${presenter ? 'presenter' : ''}`}
      onClick={onSelect}
      style={{
        '--x': `${slot.x}%`,
        '--y': `${slot.y}%`,
        '--scale': slot.scale,
        '--z': slot.z,
        '--step-x': slot.side === 'left' ? '34px' : '-34px',
        '--accent': minister.accent,
        '--portrait-x': portraitX,
        '--portrait-y': portraitY,
      } as React.CSSProperties}
      title={`${minister.publicDossier.name} · ${minister.publicDossier.office}`}
    >
      <span className="stage-footing" aria-hidden="true" />
      <span className="portrait-sprite" aria-hidden="true" />
      <span className="nameplate">
        <b>{minister.publicDossier.name}</b>
        <small>{minister.publicDossier.office}</small>
      </span>
      <span className="minister-seals" aria-hidden="true">
        {minister.standing.favor >= 55 ? <i>恩</i> : null}
        {minister.standing.pressure >= 45 ? <i>惧</i> : null}
        {minister.standing.assignment ? <i>差</i> : null}
        {underInquiry ? <i>查</i> : null}
      </span>
    </button>
  )
}

function TranscriptBubble({
  entry,
  ministerIndex,
  isEmperor,
  onClick,
}: {
  entry: import('./game/types').CourtLine
  ministerIndex: number
  isEmperor: boolean
  onClick: () => void
}) {
  const portraitX = `${(ministerIndex % 3) * 50}%`
  const portraitY = `${Math.floor(ministerIndex / 3) * 50}%`

  return (
    <div
      className={`transcript-bubble ${isEmperor ? 'emperor' : 'minister'}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      {!isEmperor && (
        <span
          className="bubble-portrait"
          style={{
            '--portrait-x': portraitX,
            '--portrait-y': portraitY,
          } as React.CSSProperties}
          aria-hidden="true"
        />
      )}
      <div className="bubble-body">
        <b className="bubble-name">{entry.speakerName}</b>
        <p className="bubble-text">{entry.text}</p>
      </div>
      {isEmperor && <span className="bubble-emperor-mark" aria-hidden="true" />}
    </div>
  )
}

function SettingsDesk({
  draft,
  onChange,
  onSave,
}: {
  draft: MiniMaxSettings
  onChange: (settings: MiniMaxSettings) => void
  onSave: () => void
}) {
  return (
    <section className="settings-desk">
      <label>
        <span>MiniMax Key</span>
        <input
          type="password"
          value={draft.apiKey}
          onChange={(event) => onChange({ ...draft, apiKey: event.target.value })}
          placeholder="填入本机密钥"
        />
      </label>
      <label>
        <span>导演模型</span>
        <input
          value={draft.directorModel}
          onChange={(event) => onChange({ ...draft, directorModel: event.target.value })}
        />
      </label>
      <label>
        <span>角色模型</span>
        <input
          value={draft.roleModel}
          onChange={(event) => onChange({ ...draft, roleModel: event.target.value })}
        />
      </label>
      <label className="switch-row">
        <input
          type="checkbox"
          checked={draft.aiEnabled}
          onChange={(event) => onChange({ ...draft, aiEnabled: event.target.checked })}
        />
        <span>启用 AI 朝堂</span>
      </label>
      <button type="button" className="seal-button" onClick={onSave}>
        <ShieldCheck />
        <span>落钥</span>
      </button>
    </section>
  )
}

function ResolutionModal({
  game,
  resolution,
  onConfirm,
}: {
  game: GameState
  resolution: TurnResolutionDraft | null
  onConfirm: () => void
}) {
  const metricLabelsLocal: Record<MetricKey, string> = {
    treasury: '国库', people: '民心', army: '军心',
    authority: '皇威', bureaucracy: '吏治', border: '边势', faction: '朋党',
  }

  const metricChanges = resolution?.metricChanges ?? []
  const standingChanges = (resolution?.standingChanges ?? []).filter(
    (c) => (c.favorDelta ?? 0) !== 0 || (c.pressureDelta ?? 0) !== 0,
  )

  return (
    <div className="resolution-overlay">
      <div className="resolution-modal">
        <header>
          <ScrollText />
          <h2>第 {game.turn.number} 回合结算</h2>
        </header>
        <p className="resolution-summary">{resolution?.summary ?? '本回合已毕，百官各自散去，只等明日风向。'}</p>
        {metricChanges.length > 0 && (
          <section className="resolution-metrics">
            <h3>国势变化</h3>
            <div className="resolution-metric-list">
              {metricChanges.map((change, i) => (
                <div key={i} className={`resolution-metric-item ${change.delta > 0 ? 'up' : 'down'}`}>
                  <span>{metricLabelsLocal[change.metric]}</span>
                  <b>{change.delta > 0 ? `+${change.delta}` : change.delta}</b>
                  <small>{change.reason}</small>
                </div>
              ))}
            </div>
          </section>
        )}
        {standingChanges.length > 0 && (
          <section className="resolution-standing">
            <h3>人心向背</h3>
            <div className="resolution-standing-list">
              {standingChanges.map((change, i) => {
                const minister = game.ministers.find((m) => m.id === change.ministerId)
                return (
                  <div key={i} className="resolution-standing-item">
                    <b>{minister?.publicDossier.name ?? '某臣'}</b>
                    {(change.favorDelta ?? 0) !== 0 && (
                      <span className={(change.favorDelta ?? 0) > 0 ? 'up' : 'down'}>
                        圣眷 {(change.favorDelta ?? 0) > 0 ? `+${change.favorDelta}` : change.favorDelta}
                      </span>
                    )}
                    {(change.pressureDelta ?? 0) !== 0 && (
                      <span className={(change.pressureDelta ?? 0) > 0 ? 'pressure-up' : 'pressure-down'}>
                        畏压 {(change.pressureDelta ?? 0) > 0 ? `+${change.pressureDelta}` : change.pressureDelta}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}
        <button type="button" className="resolution-confirm" onClick={onConfirm}>
          <Landmark />
          <span>传下一回合</span>
        </button>
      </div>
    </div>
  )
}

function App() {
  const [game, setGame] = useState<GameState>(() => generateNewCourt('first-audience'))
  const [selectedMinisterIds, setSelectedMinisterIds] = useState<string[]>([])
  const [drawer, setDrawer] = useState<Drawer>(null)
  const [composer, setComposer] = useState('')
  const [settings, setSettings] = useState<MiniMaxSettings>(defaultMiniMaxSettings)
  const [settingsDraft, setSettingsDraft] = useState<MiniMaxSettings>(defaultMiniMaxSettings)
  const [notice, setNotice] = useState('圣驾已至，百官入班。')
  const [source, setSource] = useState<'offline' | 'ai'>('offline')
  const [busy, setBusy] = useState(false)
  const [pendingResolution, setPendingResolution] = useState<{ draft: TurnResolutionDraft | null } | null>(null)
  const hydrated = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const currentAgenda = activeAgenda(game)
  const selected = selectedMinisters(game, selectedMinisterIds)
  const primaryMinister = selected[0] ?? null
  const aiReady = Boolean(settings.aiEnabled && settings.apiKey && window.courtDesktop)
  const effects = game.currentCourt.imperialEffects.slice(0, 4)
  const sceneSlot = slotForScene(game.phase)
  const currentAgendaOpen = currentAgenda?.status === 'open'
  const sceneActionLocked = game.phase !== 'court' && game.turn.usedActions[sceneSlot]
  const composerDisabled = busy || sceneActionLocked || (game.phase === 'court' && !currentAgendaOpen)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [game.currentCourt.transcript.length, busy])

  useEffect(() => {
    Promise.all([loadLatestGame(), loadMiniMaxSettings()]).then(([savedGame, savedSettings]) => {
      if (savedGame) {
        setGame(savedGame)
      }

      setSettings(savedSettings)
      setSettingsDraft(savedSettings)
      hydrated.current = true
    })
  }, [])

  useEffect(() => {
    if (!hydrated.current) {
      return
    }

    const timer = window.setTimeout(() => {
      saveGame(game).catch(() => setNotice('存档落笔慢了一拍。'))
    }, 180)

    return () => window.clearTimeout(timer)
  }, [game])

  const commitGame = (next: GameState, nextNotice: string) => {
    setGame(next)
    setNotice(nextNotice)
  }

  const setActiveAgenda = (agendaId: string) => {
    const agenda = game.currentCourt.agenda.find((item) => item.id === agendaId)
    setGame((current) => ({
      ...current,
      currentCourt: { ...current.currentCourt, activeAgendaId: agendaId },
    }))
    setSelectedMinisterIds(agenda?.presenterId ? [agenda.presenterId] : [])
  }

  const changeScene = (scene: SceneMode) => {
    setGame((current) => setSceneMode(current, scene))
    setNotice(`${sceneLabels[scene]}已摆开。`)
  }

  const selectMinister = (ministerId: string, additive: boolean) => {
    setSelectedMinisterIds((current) => {
      if (additive) {
        return current.includes(ministerId)
          ? current.filter((id) => id !== ministerId)
          : [...current, ministerId].slice(0, 3)
      }

      return current[0] === ministerId && current.length === 1 ? [] : [ministerId]
    })
    setDrawer('right')
  }

  const saveSettingsDraft = async () => {
    const next = await saveMiniMaxSettings(settingsDraft)
    setSettings(next)
    setNotice(next.aiEnabled && next.apiKey ? '模型候旨。' : '朝堂先用离线导演。')
  }

  const openAudience = async (next: GameState, openingNotice: string) => {
    setGame(next)
    setSelectedMinisterIds([])
    setDrawer(null)
    setSource('offline')
    setNotice(aiReady ? '鸿胪寺正核今日奏目。' : openingNotice)

    if (!aiReady) {
      return
    }

    setBusy(true)
    try {
      const result = await withAiTimeout(requestAiAudienceAgenda(next), 30000, 'AI 今日奏目')

      if (result) {
        setSource('ai')
        commitGame(replaceAudienceAgenda(next, result.agenda), openingNotice)
      }
    } catch (error) {
      const message = error instanceof Error && error.message.length < 120
        ? error.message
        : 'AI 今日奏目没递稳。'
      appendLocalLog('ai-agenda-fallback', { message }).catch(() => undefined)
      setNotice(`${message} 今日先按值房奏目上朝。`)
    } finally {
      setBusy(false)
    }
  }

  const startFreshCourt = () => {
    const next = generateNewCourt(`court-${crypto.randomUUID()}`)
    openAudience(next, `${next.dynasty.name}${next.dynasty.reignTitle}的新朝局开了。`)
  }

  const runAction = async (type: CourtActionType) => {
    if (busy) {
      return
    }

    if (type === 'investigate') {
      if (game.turn.usedActions.intel) {
        setNotice('本回合锦衣卫已经领过差了。')
        return
      }

      if (!primaryMinister) {
        setNotice('先点一名臣子，再让锦衣卫去查。')
        return
      }

      commitGame(investigateMinister(game, primaryMinister.id), `${primaryMinister.publicDossier.name}的底子又亮了一角。`)
      return
    }

    const slot = slotForScene(game.phase)

    if (game.phase !== 'court' && game.turn.usedActions[slot]) {
      setNotice(`${slotLabels[slot]}本回合已经做过了。`)
      return
    }

    if (game.phase === 'court' && !currentAgendaOpen) {
      setNotice('今日奏目已经都有归处，可以整理或传下一回合。')
      return
    }

    const action: PlayerAction = {
      type,
      text: composer.trim(),
      targetMinisterId: primaryMinister?.id,
      targetMinisterIds: selected.map((minister) => minister.id),
      agendaId: currentAgenda?.id,
      scene: game.phase,
    }

    setBusy(true)
    try {
      let next = advanceCourtScene(game, action).game
      let nextSource: 'offline' | 'ai' = 'offline'

      if (aiReady && !isAgendaDecision(type)) {
        try {
          const aiBeat = await withAiTimeout(requestAiCourtBeat(game, action), 35000, 'AI 回奏')

          if (aiBeat) {
            next = recordCourtBeats(game, action, aiBeat.beats, aiBeat.patch)
            nextSource = 'ai'
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'AI 朝堂暂时走神。'
          appendLocalLog('ai-fallback', { message }).catch(() => undefined)
          setNotice(`${message} 已由离线朝班接住。`)
        }
      }

      setSource(nextSource)
      commitGame(next, next.currentCourt.atmosphere)
      if (isAgendaDecision(type)) {
        const nextAgenda = activeAgenda(next)
        setSelectedMinisterIds(nextAgenda?.status === 'open' ? [nextAgenda.presenterId] : [])
      }
      setComposer('')
      setDrawer('bottom')
    } finally {
      setBusy(false)
    }
  }

  const runBriefing = () => {
    if (game.turn.usedActions.briefing) {
      setNotice('本回合已经整理过情报。')
      return
    }

    commitGame(organizeBriefing(game), '御前账册、密报和奏目已重新归拢。')
    setDrawer('left')
  }

  const runNextTurn = async () => {
    if (busy) return

    setBusy(true)
    try {
      let resolution: TurnResolutionDraft | null = null

      if (aiReady) {
        try {
          resolution = await withAiTimeout(requestAiTurnResolution(game), 30000, 'AI 回合结算')
          setSource('ai')
        } catch (error) {
          const message = error instanceof Error ? error.message : 'AI 回合结算暂时走神。'
          appendLocalLog('ai-resolution-fallback', { message }).catch(() => undefined)
          setNotice(`${message} 先由离线结算接住。`)
        }
      }

      setPendingResolution({ draft: resolution })
    } finally {
      setBusy(false)
    }
  }

  const confirmNextTurn = () => {
    if (!pendingResolution) return
    const resolution = pendingResolution.draft
    setPendingResolution(null)
    const next = advanceTurn(game, resolution ?? undefined)
    commitGame(next, `第${next.turn.number}回合开始。${next.turn.lastResolution}`)
    const firstAgenda = openAgenda(next)
    setSelectedMinisterIds(firstAgenda?.presenterId ? [firstAgenda.presenterId] : [])
    setDrawer(null)
  }

  const drawerTitle = drawer === 'left'
    ? '奏目与回合'
    : drawer === 'right'
      ? '人事档案'
      : drawer === 'bottom'
        ? '对话与旨意'
        : '模型设置'

  const leftDrawer = (
    <>
      <section className="turn-ledger">
        <h3>第{game.turn.number}回合</h3>
        <div className="action-slots">
          {(Object.entries(slotLabels) as Array<[TurnActionSlot, string]>).map(([slot, label]) => (
            <span key={slot} className={game.turn.usedActions[slot] ? 'used' : ''}>
              {label}
            </span>
          ))}
        </div>
        <p>{game.turn.lastResolution}</p>
      </section>
      <section className="metric-grid">
        {(Object.entries(game.metrics) as Array<[MetricKey, number]>).map(([metric, value]) => (
          <MetricPill key={metric} metric={metric} value={value} />
        ))}
      </section>
      <section className="agenda-list">
        {game.currentCourt.agenda.map((agenda) => (
          <AgendaCard
            key={agenda.id}
            agenda={agenda}
            active={agenda.id === currentAgenda?.id}
            presenter={game.ministers.find((minister) => minister.id === agenda.presenterId)}
            onSelect={() => setActiveAgenda(agenda.id)}
          />
        ))}
      </section>
      <section className="event-list">
        {game.turn.pendingEvents.slice(-6).reverse().map((event) => (
          <article key={event}>{event}</article>
        ))}
      </section>
    </>
  )

  const rightDrawer = primaryMinister ? (
    <section className="minister-dossier">
      <header>
        <span className="portrait-mini" style={{
          '--portrait-x': `${(game.ministers.indexOf(primaryMinister) % 3) * 50}%`,
          '--portrait-y': `${Math.floor(game.ministers.indexOf(primaryMinister) / 3) * 50}%`,
        } as React.CSSProperties} />
        <div>
          <h3>{primaryMinister.publicDossier.name}</h3>
          <p>{primaryMinister.publicDossier.office} · {primaryMinister.publicDossier.ageBand}</p>
        </div>
      </header>
      <div className="standing-chips">
        <span>
          圣眷 {primaryMinister.standing.favor}
          {primaryMinister.previousStanding != null && (() => {
            const delta = primaryMinister.standing.favor - primaryMinister.previousStanding.favor
            if (delta > 0) return <em className="trend up"> ↑{delta}</em>
            if (delta < 0) return <em className="trend down"> ↓{Math.abs(delta)}</em>
            return <em className="trend flat"> →</em>
          })()}
        </span>
        <span>
          畏压 {primaryMinister.standing.pressure}
          {primaryMinister.previousStanding != null && (() => {
            const delta = primaryMinister.standing.pressure - primaryMinister.previousStanding.pressure
            if (delta > 0) return <em className="trend up"> ↑{delta}</em>
            if (delta < 0) return <em className="trend down"> ↓{Math.abs(delta)}</em>
            return <em className="trend flat"> →</em>
          })()}
        </span>
        {primaryMinister.standing.assignment ? <span>领差</span> : null}
        {ministerIsUnderInquiry(game, primaryMinister.id) ? <span>密查</span> : null}
      </div>
      <dl>
        <div><dt>性情</dt><dd>{primaryMinister.persona.temperament}</dd></div>
        <div><dt>所求</dt><dd>{primaryMinister.persona.desire}</dd></div>
        <div><dt>所惧</dt><dd>{primaryMinister.persona.fear}</dd></div>
        <div><dt>底线</dt><dd>{primaryMinister.persona.bottomLine}</dd></div>
        <div><dt>派系</dt><dd>{primaryMinister.persona.faction}</dd></div>
        <div><dt>近况</dt><dd>{primaryMinister.standing.lastImperialSignal}</dd></div>
      </dl>
      <div className="ledger-list">
        {primaryMinister.revealedFacts.length === 0 ? <p>底牌未明。</p> : null}
        {primaryMinister.revealedFacts.slice(-4).map((fact) => (
          <article key={fact.id}>
            <b>{fact.confidence === 'verified' ? '已证' : '有迹'}</b>
            <span>{fact.label}</span>
          </article>
        ))}
      </div>
    </section>
  ) : (
    <section className="minister-dossier empty">
      <UsersRound />
      <h3>未点臣子</h3>
      <p>空选时，皇帝的话落给满朝。按住 Shift 可点选多名大臣议事。</p>
    </section>
  )

  const bottomDrawer = null

  return (
    <main className={`court-app-v2 scene-${game.phase} drawer-${drawer ?? 'closed'}`}>
      <header className="top-command">
        <div>
          <Crown />
          <h1>上朝了</h1>
          <p>{game.dynasty.name} · {game.dynasty.reignTitle}{game.calendar.year}年 · 第{game.turn.number}回合</p>
        </div>
        <nav>
          <span className={`mode-pill ${source}`}>{aiReady ? 'AI 朝班' : '离线朝班'}</span>
          <button type="button" onClick={() => setDrawer(drawer === 'settings' ? null : 'settings')}>
            <Settings2 />
            <span>模型</span>
          </button>
          <button type="button" onClick={startFreshCourt}>
            <Sparkles />
            <span>新局</span>
          </button>
          <button type="button" className="next-turn" onClick={runNextTurn} disabled={busy}>
            <Landmark />
            <span>下一回合</span>
          </button>
        </nav>
      </header>

      <section className="throne-stage" aria-label="御座视角朝堂">
        <div className="hall-wash" />
        <div className="minister-field minister-field--bg">
          {game.ministers.map((minister, index) => (
            <MinisterFigure
              key={minister.id}
              minister={minister}
              index={index}
              selected={selectedMinisterIds.includes(minister.id)}
              muted={selectedMinisterIds.length > 0 && !selectedMinisterIds.includes(minister.id)}
              presenter={currentAgenda?.presenterId === minister.id}
              underInquiry={ministerIsUnderInquiry(game, minister.id)}
              onSelect={(event) => selectMinister(minister.id, event.shiftKey)}
            />
          ))}
        </div>

        <div className="court-scroll-wrap">
          <div className="court-scroll-header">
            <b>{sceneLabels[game.phase]}</b>
            <span>{notice}</span>
            {game.currentCourt.tentativeDecision && (
              <span className="tentative-hint">⬤ 等待确认：{game.currentCourt.tentativeDecision.confirmText}</span>
            )}
          </div>

          <div className="court-scroll" ref={scrollRef}>
            {game.currentCourt.transcript.map((entry) => {
              const isEmperor = entry.speakerName === '朕'
              const mIdx = game.ministers.findIndex((m) => m.id === entry.speakerId)
              return (
                <TranscriptBubble
                  key={entry.id}
                  entry={entry}
                  ministerIndex={mIdx >= 0 ? mIdx : 0}
                  isEmperor={isEmperor}
                  onClick={() => {
                    const target = speakerTargetFromLine(game, entry.speakerId)
                    if (target) {
                      selectMinister(target.id, false)
                      setDrawer('right')
                    }
                  }}
                />
              )
            })}
            {busy && <div className="scroll-typing"><span /><span /><span /></div>}
          </div>

          <div className="court-input-bar">
            {game.phase === 'privateAudience' && (
              <nav className="private-quick-actions">
                {privateAudienceActions.map((act) => {
                  const Icon = act.icon
                  return (
                    <button
                      key={act.type}
                      type="button"
                      onClick={() => runAction(act.type)}
                      disabled={busy || !primaryMinister || game.turn.usedActions.private}
                      title={act.description}
                    >
                      <Icon /><span>{act.label}</span>
                    </button>
                  )
                })}
              </nav>
            )}
            <form
              className="composer"
              onSubmit={(e) => { e.preventDefault(); runAction('speak') }}
            >
              <textarea
                value={composer}
                onChange={(e) => setComposer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    runAction('speak')
                  }
                }}
                placeholder={primaryMinister
                  ? `对${primaryMinister.publicDossier.name}开口（Enter 发送）`
                  : game.phase === 'privateAudience'
                    ? '御书房里先点一名臣子'
                    : '对满朝说话，或点臣子单独问（Enter 发送）'}
                disabled={composerDisabled}
                rows={2}
              />
              <button type="submit" disabled={composerDisabled}>
                <SendHorizontal />
              </button>
            </form>
          </div>
        </div>

        <div className="throne-desk" aria-hidden="true">
          <div className="desk-props" />
          <div className="desk-effects">
            {effects.length === 0 ? <em>朱笔未落，群臣候旨</em> : effects.map((effect) => (
              <em key={effect.id} className={effect.tone}>{effect.label}</em>
            ))}
          </div>
        </div>
      </section>

      <nav className="scene-dock" aria-label="回合行动">
        <button type="button" className={game.turn.usedActions.court ? 'used' : ''} onClick={() => changeScene('court')}>
          <UsersRound />
          <span>朝会</span>
        </button>
        <button type="button" className={game.turn.usedActions.intel ? 'used' : ''} onClick={() => runAction('investigate')} disabled={!primaryMinister || game.turn.usedActions.intel}>
          <Eye />
          <span>密查</span>
        </button>
        <button type="button" className={game.turn.usedActions.private ? 'used' : ''} onClick={() => changeScene('privateAudience')} disabled={game.turn.usedActions.private}>
          <MessageSquareText />
          <span>召见</span>
        </button>
        <button type="button" className={game.turn.usedActions.briefing ? 'used' : ''} onClick={runBriefing} disabled={game.turn.usedActions.briefing}>
          <BookOpenText />
          <span>整理</span>
        </button>
      </nav>

      <button type="button" className="drawer-tab left" onClick={() => setDrawer(drawer === 'left' ? null : 'left')}>
        <ChevronRight />
        <span>奏目</span>
      </button>
      <button type="button" className="drawer-tab right" onClick={() => setDrawer(drawer === 'right' ? null : 'right')}>
        <ChevronLeft />
        <span>人事</span>
      </button>

      {drawer ? (
        <aside className={`info-drawer ${drawer}`}>
          <header>
            <h2>{drawerTitle}</h2>
            <button type="button" onClick={() => setDrawer(null)}>收起</button>
          </header>
          <div className="drawer-body">
            {drawer === 'left' ? leftDrawer : null}
            {drawer === 'right' ? rightDrawer : null}
            {drawer === 'bottom' ? bottomDrawer : null}
            {drawer === 'settings' ? (
              <SettingsDesk draft={settingsDraft} onChange={setSettingsDraft} onSave={saveSettingsDraft} />
            ) : null}
          </div>
        </aside>
      ) : null}

      {pendingResolution ? (
        <ResolutionModal
          game={game}
          resolution={pendingResolution.draft}
          onConfirm={confirmNextTurn}
        />
      ) : null}
    </main>
  )
}

export default App
