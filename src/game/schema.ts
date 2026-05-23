import { z } from 'zod'
import { courtActionTypes, metricKeys, sceneModes, type PlayerAction, type StatePatch } from './types'

const clueSchema = z.object({
  ministerId: z.string(),
  label: z.string().min(1).max(120),
  source: z.string().min(1).max(120),
  confidence: z.enum(['hint', 'verified']),
})

const beatSchema = z.object({
  speakerId: z.string().nullable(),
  speakerName: z.string().min(1).max(60),
  text: z.string().min(1).max(2400),
  atmosphere: z.string().min(1).max(240),
  clues: z.array(clueSchema).default([]),
})

export const agendaDraftSchema = z.object({
  title: z.string().min(1).max(72),
  summary: z.string().min(1).max(180),
  briefing: z.string().min(1).max(260),
  decision: z.string().min(1).max(160),
  severity: z.preprocess((value) => {
    if (typeof value !== 'string') {
      return value
    }

    const severity = value.toLowerCase()

    if (['daily', 'low', 'routine', '常', '日常'].includes(severity)) {
      return 'daily'
    }

    if (['crisis', 'high', 'urgent', '急', '危机'].includes(severity)) {
      return 'crisis'
    }

    return 'state'
  }, z.enum(['daily', 'state', 'crisis'])),
  presenterId: z.string(),
})

export const aiAgendaSchema = z.object({
  agenda: z.array(agendaDraftSchema).length(3),
})

const tentativeDecisionSchema = z.object({
  agendaId: z.string(),
  actionType: z.enum(courtActionTypes),
  ministerId: z.string().optional(),
  confirmText: z.string().min(1).max(120),
}).nullable()

const agendaDecisionSchema = z.object({
  agendaId: z.string(),
  actionType: z.enum(courtActionTypes),
  ministerId: z.string().optional(),
}).nullable()

export const statePatchSchema = z.object({
  metricChanges: z
    .array(
      z.object({
        metric: z.enum(metricKeys),
        delta: z.number().int().min(-12).max(12),
        reason: z.string().min(1).max(180),
      }),
    )
    .default([]),
  edicts: z
    .array(
      z.object({
        title: z.string().min(1).max(80),
        summary: z.string().min(1).max(220),
      }),
    )
    .default([]),
  investigations: z
    .array(
      z.object({
        ministerId: z.string(),
        method: z.string().min(1).max(40),
        result: z.string().min(1).max(260),
      }),
    )
    .default([]),
  memories: z
    .array(
      z.object({
        ministerId: z.string(),
        note: z.string().min(1).max(180),
      }),
    )
    .default([]),
  standingChanges: z
    .array(
      z.object({
        ministerId: z.string(),
        favorDelta: z.number().int().min(-20).max(20).optional(),
        pressureDelta: z.number().int().min(-20).max(20).optional(),
        assignment: z.string().max(120).nullable().optional(),
        lastImperialSignal: z.string().min(1).max(80).optional(),
      }),
    )
    .default([]),
  tentativeDecision: tentativeDecisionSchema.optional(),
  agendaDecision: agendaDecisionSchema.optional(),
})

export const aiBeatSchema = z.object({
  beats: z.array(beatSchema).min(1).max(4),
  patch: statePatchSchema.default({
    metricChanges: [],
    edicts: [],
    investigations: [],
    memories: [],
    standingChanges: [],
  }),
})

export const playerActionSchema = z.object({
  type: z.enum(courtActionTypes),
  text: z.string().max(800),
  targetMinisterId: z.string().optional(),
  targetMinisterIds: z.array(z.string()).optional(),
  agendaId: z.string().optional(),
  scene: z.enum(sceneModes).optional(),
})

export const aiResolutionSchema = z.object({
  summary: z.string().min(1).max(600),
  newPendingEvents: z.array(z.string().min(1).max(180)).default([]),
  metricChanges: statePatchSchema.shape.metricChanges.default([]),
  standingChanges: statePatchSchema.shape.standingChanges.default([]),
  memories: statePatchSchema.shape.memories.default([]),
})

const decisionActions = new Set<PlayerAction['type']>([
  'approve',
  'reject',
  'assign',
  'reconsider',
  'appoint',
  'retire',
])

export function constrainPatchForAction(action: PlayerAction, patch: StatePatch) {
  if (decisionActions.has(action.type)) {
    return patch
  }

  return {
    ...patch,
    metricChanges: [],
    edicts: [],
  }
}
