export const metricKeys = [
  'treasury',
  'people',
  'army',
  'authority',
  'bureaucracy',
  'border',
  'faction',
] as const

export const courtActionTypes = [
  'speak',
  'summon',
  'approve',
  'reject',
  'hold',
  'assign',
  'reconsider',
  'investigate',
  'appoint',
  'retire',
  'threaten',
  'appease',
  'probe',
] as const

export const sceneModes = ['court', 'privateAudience', 'intel', 'briefing', 'resolution'] as const
export const turnActionSlots = ['court', 'intel', 'private', 'briefing'] as const

export type MetricKey = (typeof metricKeys)[number]
export type CourtActionType = (typeof courtActionTypes)[number]
export type RevelationConfidence = 'hint' | 'verified'
export type SceneMode = (typeof sceneModes)[number]
export type TurnActionSlot = (typeof turnActionSlots)[number]
export type GamePhase = SceneMode

export interface DynastyProfile {
  name: string
  reignTitle: string
  courtStyle: string
  openingSituation: string
}

export interface CalendarState {
  year: number
  month: number
  day: number
  audienceNumber: number
}

export interface Metrics {
  treasury: number
  people: number
  army: number
  authority: number
  bureaucracy: number
  border: number
  faction: number
}

export interface PublicDossier {
  name: string
  office: string
  portfolio: string
  ageBand: string
  reputation: string
  visibleMood: string
}

export interface HiddenTraits {
  ability: number
  courage: number
  loyalty: number
  appetite: number
  risk: number
  faction: string
  desire: string
  preference: string
  relationships: string[]
}

export interface RevealedFact {
  id: string
  label: string
  source: string
  confidence: RevelationConfidence
  createdAt: string
}

export interface ImperialStanding {
  favor: number
  pressure: number
  assignment: string | null
  lastImperialSignal: string
}

export interface MinisterPersona {
  temperament: string
  desire: string
  fear: string
  bottomLine: string
  faction: string
  selfDrive: string
  relationshipNotes: string[]
}

export interface MinisterProfile {
  id: string
  portraitKey: string
  publicDossier: PublicDossier
  persona: MinisterPersona
  standing: ImperialStanding
  previousStanding?: Pick<ImperialStanding, 'favor' | 'pressure'>
  hiddenTraits: HiddenTraits
  revealedFacts: RevealedFact[]
  memory: string[]
  privateMemory: string[]
  accent: string
}

export interface AgendaItem {
  id: string
  title: string
  summary: string
  briefing?: string
  decision?: string
  severity: 'daily' | 'state' | 'crisis'
  presenterId: string
  status: 'open' | 'held' | 'resolved'
}

export interface CourtLine {
  id: string
  speakerId: string | null
  speakerName: string
  text: string
  tone: string
  createdAt: string
  effects?: ImperialEffect[]
}

export interface TentativeDecision {
  agendaId: string
  actionType: CourtActionType
  ministerId?: string
  confirmText: string
}

export interface CourtState {
  agenda: AgendaItem[]
  activeAgendaId: string
  transcript: CourtLine[]
  round: number
  focusMinisterId: string | null
  atmosphere: string
  imperialEffects: ImperialEffect[]
  tentativeDecision?: TentativeDecision | null
}

export interface PlayerAction {
  type: CourtActionType
  text: string
  targetMinisterId?: string
  targetMinisterIds?: string[]
  agendaId?: string
  scene?: SceneMode
}

export interface CourtClue {
  ministerId: string
  label: string
  source: string
  confidence: RevelationConfidence
}

export interface CourtBeat {
  speakerId: string | null
  speakerName: string
  text: string
  atmosphere: string
  clues: CourtClue[]
}

export interface MetricChange {
  metric: MetricKey
  delta: number
  reason: string
}

export interface EdictDraft {
  title: string
  summary: string
}

export interface InvestigationResult {
  ministerId: string
  method: string
  result: string
}

export interface MinisterMemory {
  ministerId: string
  note: string
}

export interface MinisterStandingChange {
  ministerId: string
  favorDelta?: number
  pressureDelta?: number
  assignment?: string | null
  lastImperialSignal?: string
}

export interface ImperialEffect {
  id: string
  label: string
  tone: 'favor' | 'pressure' | 'assignment' | 'edict' | 'inquiry' | 'ritual'
  ministerId?: string
}

export interface AgendaDecision {
  agendaId: string
  actionType: CourtActionType
  ministerId?: string
}

export interface StatePatch {
  metricChanges: MetricChange[]
  edicts: EdictDraft[]
  investigations: InvestigationResult[]
  memories: MinisterMemory[]
  standingChanges: MinisterStandingChange[]
  tentativeDecision?: TentativeDecision | null
  agendaDecision?: AgendaDecision | null
}

export interface EdictRecord extends EdictDraft {
  id: string
  issuedAt: string
}

export interface InvestigationTask extends InvestigationResult {
  id: string
  createdAt: string
}

export interface CourtSummary {
  id: string
  title: string
  summary: string
  day: string
}

export interface TurnState {
  number: number
  scene: SceneMode
  usedActions: Record<TurnActionSlot, boolean>
  pendingEvents: string[]
  lastResolution: string
}

export interface TurnResolutionDraft {
  summary: string
  newPendingEvents?: string[]
  metricChanges?: MetricChange[]
  standingChanges?: MinisterStandingChange[]
  memories?: MinisterMemory[]
}

export interface GameState {
  id: string
  seed: string
  version: number
  dynasty: DynastyProfile
  calendar: CalendarState
  phase: GamePhase
  turn: TurnState
  metrics: Metrics
  ministers: MinisterProfile[]
  currentCourt: CourtState
  edicts: EdictRecord[]
  investigations: InvestigationTask[]
  summaries: CourtSummary[]
  pendingNotes: string[]
  updatedAt: string
}

export interface SaveSlot {
  id: string
  title: string
  version: number
  snapshot: GameState
  updatedAt: string
}

export interface MiniMaxSettings {
  apiKey: string
  endpoint: string
  roleEndpoint: string
  directorModel: string
  roleModel: string
  aiEnabled: boolean
}
