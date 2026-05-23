import { app, BrowserWindow, ipcMain } from 'electron'
import initSqlJs from 'sql.js'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const here = dirname(fileURLToPath(import.meta.url))
const rendererUrl = process.env.VITE_DEV_SERVER_URL ?? 'http://127.0.0.1:5173'
const defaultSettings = {
  apiKey: '',
  endpoint: 'https://api.minimaxi.com/v1/chat/completions',
  roleEndpoint: 'https://api.minimaxi.com/v1/text/chatcompletion_v2',
  directorModel: 'MiniMax-M2.7',
  roleModel: 'M2-her',
  aiEnabled: false,
}

let database
let databasePath
const blockedRoleModels = new Set()

function stripThinking(text = '') {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```json\s*([\s\S]*?)```/gi, '$1')
    .trim()
}

function extractJson(text) {
  const cleaned = stripThinking(text)
  const firstBrace = cleaned.indexOf('{')

  if (firstBrace === -1) {
    throw new Error('The court director did not return JSON.')
  }

  let depth = 0
  let inString = false
  let escaped = false

  for (let index = firstBrace; index < cleaned.length; index += 1) {
    const character = cleaned[index]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (character === '"') {
        inString = false
      }
      continue
    }

    if (character === '"') {
      inString = true
      continue
    }

    if (character === '{') {
      depth += 1
    } else if (character === '}') {
      depth -= 1

      if (depth === 0) {
        return JSON.parse(cleaned.slice(firstBrace, index + 1))
      }
    }
  }

  throw new Error('The court director returned unfinished JSON.')
}

async function openDatabase() {
  if (database) {
    return database
  }

  const userData = app.getPath('userData')
  mkdirSync(userData, { recursive: true })
  databasePath = join(userData, 'shangchao.sqlite')

  const wasmDir = dirname(require.resolve('sql.js/dist/sql-wasm.wasm'))
  const SQL = await initSqlJs({
    locateFile: (file) => join(wasmDir, file),
  })

  database = existsSync(databasePath)
    ? new SQL.Database(readFileSync(databasePath))
    : new SQL.Database()

  database.run(`
    CREATE TABLE IF NOT EXISTS saves (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      snapshot TEXT NOT NULL,
      version INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `)
  flushDatabase()
  return database
}

function flushDatabase() {
  if (!database || !databasePath) {
    return
  }

  writeFileSync(databasePath, Buffer.from(database.export()))
}

function selectOne(sql, params = []) {
  const statement = database.prepare(sql)
  statement.bind(params)
  const row = statement.step() ? statement.getAsObject() : null
  statement.free()
  return row
}

function appendLog(kind, payload) {
  database.run(
    'INSERT INTO logs (kind, payload, created_at) VALUES (?, ?, ?)',
    [kind, JSON.stringify(payload), new Date().toISOString()],
  )
  flushDatabase()
}

function loadSettings() {
  const row = selectOne('SELECT value FROM settings WHERE key = ?', ['minimax'])

  if (!row) {
    return defaultSettings
  }

  return { ...defaultSettings, ...JSON.parse(String(row.value)) }
}

async function completeMiniMax({ endpoint, apiKey, model, messages, maxTokens }) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.82,
      max_tokens: maxTokens,
      reasoning_split: true,
    }),
  })

  const body = await response.json()

  if (!response.ok || body.base_resp?.status_code > 0) {
    const detail = body.base_resp?.status_msg ?? body.error?.message ?? body.message ?? response.statusText
    throw new Error(`MiniMax rejected the court request: ${detail}`)
  }

  return stripThinking(body.choices?.[0]?.message?.content ?? '')
}

function summarizeGameForDirector(gameState) {
  return {
    dynasty: gameState.dynasty,
    calendar: gameState.calendar,
    phase: gameState.phase,
    turn: gameState.turn,
    metrics: gameState.metrics,
    agenda: gameState.currentCourt.agenda,
    recentTranscript: gameState.currentCourt.transcript.slice(-8),
    ministers: gameState.ministers.map((minister) => ({
      id: minister.id,
      publicDossier: minister.publicDossier,
      persona: minister.persona,
      standing: minister.standing,
      hiddenTraits: minister.hiddenTraits,
      revealedFacts: minister.revealedFacts,
      memory: minister.memory.slice(-4),
      privateMemory: minister.privateMemory?.slice(-4) ?? [],
    })),
  }
}

function summarizeCourtForAgenda(gameState) {
  return {
    dynasty: gameState.dynasty,
    calendar: gameState.calendar,
    metrics: gameState.metrics,
    pendingNotes: gameState.pendingNotes.slice(-4),
    summaries: gameState.summaries.slice(0, 3),
    ministers: gameState.ministers.map((minister) => ({
      id: minister.id,
      publicDossier: minister.publicDossier,
      revealedFacts: minister.revealedFacts.slice(-2),
    })),
  }
}

function findMinister(gameState, id) {
  return gameState.ministers.find((minister) => minister.id === id)
}

function focusedBeat(gameState, action, text, directorBeats = []) {
  const minister = findMinister(gameState, action.targetMinisterId)

  if (!minister || !text) {
    return null
  }

  return {
    speakerId: minister.id,
    speakerName: minister.publicDossier.name,
    text,
    atmosphere:
      directorBeats[0]?.atmosphere ??
      `${minister.publicDossier.office}被点到名，班列里先静了一息。`,
    clues: [],
  }
}

function ministerRelationshipNote(minister, allMinisters) {
  const rivals = allMinisters.filter(
    (m) => m.id !== minister.id && m.persona.faction !== minister.persona.faction && m.persona.faction !== '不肯站队',
  ).slice(0, 2).map((m) => `${m.publicDossier.name}（${m.persona.faction}）`)

  const allies = allMinisters.filter(
    (m) => m.id !== minister.id && m.persona.faction === minister.persona.faction && m.persona.faction !== '不肯站队',
  ).slice(0, 2).map((m) => `${m.publicDossier.name}`)

  return {
    allies: allies.length ? allies.join('、') : '暂无可靠同僚',
    rivals: rivals.length ? rivals.join('、') : '暂无明显对头',
  }
}

async function askFocusedMinister(gameState, action, settings) {
  const minister = findMinister(gameState, action.targetMinisterId)

  if (!minister) {
    return ''
  }

  const currentAgenda = gameState.currentCourt.agenda.find(
    (a) => a.id === (action.agendaId ?? gameState.currentCourt.activeAgendaId),
  )
  const relationships = ministerRelationshipNote(minister, gameState.ministers)
  const isPrivateAudience = action.scene === 'privateAudience'
  const favorLevel = minister.standing.favor >= 65 ? '深受器重' : minister.standing.favor >= 45 ? '尚在眼中' : '圣眷平淡'
  const pressureLevel = minister.standing.pressure >= 55 ? '如履薄冰' : minister.standing.pressure >= 35 ? '略感压力' : '从容自若'

  const prompt = [
    `你在一款架空朝堂游戏中扮演官员【${minister.publicDossier.name}】，此刻正在${isPrivateAudience ? '御书房与皇帝私下面对面' : '朝堂上当众奏对'}。`,
    '只替这名官员说话，不替皇帝做决定，不主动揭露未被查明的隐藏信息。',
    '',
    '【公开身份】',
    `官职：${minister.publicDossier.office}，分管：${minister.publicDossier.portfolio}`,
    `年辈：${minister.publicDossier.ageBand}，外界评价：${minister.publicDossier.reputation}`,
    `当下神情：${minister.publicDossier.visibleMood}`,
    '',
    '【性格底色】（这决定了他说话的方式，必须渗透进每一句台词）',
    `性情：${minister.persona.temperament}`,
    `内心真正想要的：${minister.persona.desire}`,
    `最害怕的事：${minister.persona.fear}`,
    `绝不逾越的底线：${minister.persona.bottomLine}`,
    `派系归属：${minister.persona.faction}`,
    `行事风格：${minister.persona.selfDrive}`,
    '',
    '【朝堂处境】',
    `当前圣眷：${favorLevel}（${minister.standing.favor}分），御前压力：${pressureLevel}（${minister.standing.pressure}分）`,
    minister.standing.assignment ? `当前领差：${minister.standing.assignment}` : '目前无专差在身',
    `上次皇帝信号：${minister.standing.lastImperialSignal}`,
    `同僚盟友：${relationships.allies}`,
    `潜在对头：${relationships.rivals}`,
    '',
    '【记忆积累】（他记得这些事，会影响此刻的态度）',
    minister.memory.slice(-4).join(' / ') || '入朝不久，尚无积累。',
    isPrivateAudience && minister.privateMemory?.length
      ? `御书房私话记忆：${minister.privateMemory.slice(-3).join(' / ')}`
      : '',
    '',
    '【当前情境】',
    currentAgenda ? `本次奏目：《${currentAgenda.title}》——${currentAgenda.summary}` : '皇帝未指定具体奏目。',
    `皇帝的动作：${JSON.stringify(action)}`,
    '',
    isPrivateAudience
      ? [
          '【御书房规则】',
          '这里没有外人，他可以说朝上不敢说的话。',
          '可以流露真实的野心、犹豫、委屈或试探；可以向皇帝提条件，可以暗示自己知道别人的把柄。',
          '但他仍会保护自己的底线，不会主动出卖最核心的秘密，除非皇帝触碰到他真正在意的东西。',
        ].join('\n')
      : [
          '【朝堂规则】',
          '朝上有眼睛，他要顾忌颜面和政敌；说话要有分寸，但可以在分寸之内推诿、拱火、抢功或试探。',
          '如果皇帝的话让他觉得受威胁，语气会变紧；如果感到被重视，会适度表忠心但不至于谄媚。',
        ].join('\n'),
    '',
    '请直接给出这名官员此刻的奏对，60到120字，不要旁白，不要括号说明。',
  ].filter(Boolean).join('\n')

  const roleMessages = [
    {
      role: 'user',
      name: 'Emperor',
      content: `朝堂角色扮演指令：只演指定官员，直接回应皇帝。\n${prompt}`,
    },
  ]

  if (
    !settings.roleModel ||
    settings.roleModel === settings.directorModel ||
    blockedRoleModels.has(settings.roleModel)
  ) {
    return ''
  }

  try {
    return await completeMiniMax({
      endpoint: settings.roleEndpoint,
      apiKey: settings.apiKey,
      model: settings.roleModel,
      messages: roleMessages,
      maxTokens: 520,
    })
  } catch (error) {
    appendLog('role-model-fallback', {
      from: settings.roleModel,
      to: settings.directorModel,
      message: error.message,
    })

    if (String(error.message).includes('not support model')) {
      blockedRoleModels.add(settings.roleModel)
      return ''
    }

    return completeMiniMax({
      endpoint: settings.endpoint,
      apiKey: settings.apiKey,
      model: settings.directorModel,
      messages: roleMessages,
      maxTokens: 620,
    })
  }
}

async function askAudienceAgenda(gameState, settings) {
  const prompt = [
    '你是架空朝堂沙盒游戏的 Court Director，替下一场常朝备好三件待奏之事。',
    '事件要随机、有日常、有实务，危机最多一件。不要复述刚处理完的事。',
    '每件事必须一眼看懂：title 是直白问题，summary 说谁报什么冲突，briefing 交代背景，decision 说皇帝要裁断什么。',
    'presenterId 只能从给出的九名核心官员 id 中选，按其官职挑最可能出班的人。',
    '只返回 JSON，不要 Markdown，不要思考过程。',
    'JSON 形状：{"agenda":[{"title":string,"summary":string,"briefing":string,"decision":string,"severity":"daily"|"state"|"crisis","presenterId":string}]}',
    `朝廷状态：${JSON.stringify(summarizeCourtForAgenda(gameState))}`,
  ].join('\n')

  const content = await completeMiniMax({
    endpoint: settings.endpoint,
    apiKey: settings.apiKey,
    model: settings.directorModel,
    messages: [{ role: 'user', name: 'Court Clerk', content: prompt }],
    maxTokens: 1800,
  })

  try {
    return extractJson(content)
  } catch (error) {
    appendLog('agenda-json-repair', { message: error.message, sample: content.slice(0, 1200) })

    const repaired = await completeMiniMax({
      endpoint: settings.endpoint,
      apiKey: settings.apiKey,
      model: settings.directorModel,
      messages: [
        {
          role: 'user',
          name: 'Court Editor',
          content: [
            '根据下面的架空中国朝廷状态，生成下一场常朝奏目并修成严格可 JSON.parse 的 JSON。',
            '不要写公司、财务部、项目经理、安全团队。只能写朝廷、地方、军政、礼制、钱粮、刑名等官场事务。',
            '只返回 JSON，不要解释，不要 Markdown。',
            '顶层必须只有 agenda 数组，数组必须有三项。',
            '每项都必须有 title、summary、briefing、decision、severity、presenterId。',
            prompt,
            content ? `待修内容：${content.slice(0, 10000)}` : '待修内容为空，请按朝廷状态重新生成。',
          ].join('\n'),
        },
      ],
      maxTokens: 1200,
    })

    return extractJson(repaired)
  }
}

function buildFactionSituation(gameState) {
  const factionMap = {}
  for (const m of gameState.ministers) {
    const f = m.persona.faction
    if (!factionMap[f]) factionMap[f] = []
    factionMap[f].push(`${m.publicDossier.name}（${m.publicDossier.office}，圣眷${m.standing.favor}，压力${m.standing.pressure}）`)
  }
  return Object.entries(factionMap)
    .map(([faction, members]) => `${faction}：${members.join('、')}`)
    .join('\n')
}

async function askDirector(gameState, action, roleReply, settings) {
  const currentAgenda = gameState.currentCourt.agenda.find(
    (a) => a.id === (action.agendaId ?? gameState.currentCourt.activeAgendaId),
  )
  const agendaPresenter = currentAgenda
    ? gameState.ministers.find((m) => m.id === currentAgenda.presenterId)
    : null
  const targetMinister = action.targetMinisterId
    ? findMinister(gameState, action.targetMinisterId)
    : null
  const isPrivate = action.scene === 'privateAudience'

  const prompt = [
    '你是架空朝堂沙盒游戏的 Court Director。',
    '游戏的核心体验是让玩家感受到”大权在握”：皇帝每一个动作都应让朝臣感受到权力压力，并根据各自利益做出真实反应。',
    '',
    '【派系格局】（牢记这张图，让官员的发言符合派系立场）',
    buildFactionSituation(gameState),
    '',
    '【导演规则】',
    '1. 每个 beats 项是一位官员的实际台词，不能用”群臣议论”或气氛描述替代具体人物发言。',
    '2. 当某派系的议题被皇帝准奏或赞赏，对立派系的官员应在 standingChanges 里压力上升 2-5，且可能在朝上说一句轻描淡写、暗含酸意的话。',
    '3. 当皇帝训斥或驳回某臣，同派系的人会沉默或示弱；对立派系的人压力下降，可能趁机补一刀。',
    '4. 有”急于立功”或高 appetite 性格的臣子，面对新差事会主动往自己身上揽。',
    '5. 有”话少但记仇”或高 pressure 性格的臣子，在一句话里可能藏着旧账。',
    '6. 私下召见（privateAudience）：臣子可以说朝上不敢说的话，可以流露真实的野心、试探、委屈；语气比朝会私密很多。',
    '',
    '【本轮情境】',
    currentAgenda ? `当前奏目：《${currentAgenda.title}》，主奏人：${agendaPresenter?.publicDossier.name ?? '未定'}（${agendaPresenter?.persona.faction ?? ''}）` : '当前无特定奏目。',
    targetMinister ? `皇帝点名的臣子：${targetMinister.publicDossier.name}，${targetMinister.persona.temperament}，派系：${targetMinister.persona.faction}，当前压力：${targetMinister.standing.pressure}` : '',
    isPrivate ? '场景：御书房私下召见，无外人，臣子应更坦率。' : '场景：大朝公开奏对，众目睽睽。',
    '',
    roleReply
      ? `点名官员首句奏对已生成（只作插话参考，不要改写它）：${roleReply}`
      : '本轮皇帝未单独点名，若动作是 speak/summon 则挑 2-3 位最相关的官员依次发言，允许互相争辩、拆台、推诿。',
    '',
    '【议题决策识别——核心规则】',
    '皇帝不再点按钮，改用说话表达决断。你必须识别皇帝话里的意图并走以下流程：',
    '',
    '第一步：皇帝说了某件话，你判断他是否在对当前议题表达决断意图。',
    '  - 例如”就按某某的意思办””准了””驳回””先搁着””让某某去查”等，都是决断信号。',
    '  - 如果没有决断意图（只是聊天、追问、感叹），正常回复，patch 里不设 tentativeDecision 和 agendaDecision。',
    '',
    '第二步：如果检测到决断意图，但尚未有 tentativeDecision（尚未发出确认问句），则：',
    '  - 在 beats 里安排一名太监或随侍说一句确认话，如”皇上的意思，是要准了《某事》，令某某承办？”',
    '  - 在 patch 里设置 tentativeDecision: { agendaId, actionType, ministerId（若适用）, confirmText（确认话原文） }',
    '  - 不要在此步骤设置 agendaDecision。',
    '',
    '第三步：如果当前已有 tentativeDecision（上一步发出过确认问句），且皇帝此刻说的是确认（对、准了、就这样、嗯、好等），则：',
    '  - 在 beats 里安排大臣正式接旨，鸿胪寺宣布该议题已结，并引出下一件事。',
    '  - 在 patch 里设置 agendaDecision: { agendaId, actionType, ministerId（若适用） }',
    '  - 同时在 patch 里设置 tentativeDecision: null（清除待确认状态）。',
    '  - 根据决断类型补充相应的 edicts、standingChanges、metricChanges。',
    '',
    '第四步：如果已有 tentativeDecision 但皇帝否定（不对、换一个、算了），',
    '  - 在 patch 里设置 tentativeDecision: null，不设 agendaDecision。',
    '  - beats 里可以有人重新问皇帝的意思。',
    '',
    currentAgenda && gameState.currentCourt.tentativeDecision
      ? `【当前待确认决策】太监已问：${gameState.currentCourt.tentativeDecision.confirmText}，等待皇帝确认或否定。`
      : '',
    '',
    '【回复规范】',
    '对白干脆：普通回合每人 50-140 字；私下召见允许稍长，可带犹豫和试探。',
    '如果皇帝只是追问、闲聊、点名，patch.metricChanges 和 patch.edicts 必须为空。',
    '只返回 JSON，不要 Markdown，不要思考过程。',
    'JSON 形状：{“beats”:[{“speakerId”:string|null,”speakerName”:string,”text”:string,”atmosphere”:string,”clues”:[{“ministerId”:string,”label”:string,”source”:string,”confidence”:”hint”|”verified”}]}],”patch”:{“metricChanges”:[{“metric”:”treasury”|”people”|”army”|”authority”|”bureaucracy”|”border”|”faction”,”delta”:number,”reason”:string}],”edicts”:[{“title”:string,”summary”:string}],”investigations”:[{“ministerId”:string,”method”:string,”result”:string}],”memories”:[{“ministerId”:string,”note”:string}],”standingChanges”:[{“ministerId”:string,”favorDelta”:number,”pressureDelta”:number,”assignment”:string|null,”lastImperialSignal”:string}],”tentativeDecision”:{“agendaId”:string,”actionType”:string,”ministerId”:string,”confirmText”:string}|null,”agendaDecision”:{“agendaId”:string,”actionType”:string,”ministerId”:string}|null}}',
    '',
    `当前完整游戏状态：${JSON.stringify(summarizeGameForDirector(gameState))}`,
    `玩家动作：${JSON.stringify(action)}`,
  ].filter(Boolean).join('\n')

  const content = await completeMiniMax({
    endpoint: settings.endpoint,
    apiKey: settings.apiKey,
    model: settings.directorModel,
    messages: [{ role: 'user', name: 'Emperor', content: prompt }],
    maxTokens: 1500,
  })

  try {
    return extractJson(content)
  } catch (error) {
    appendLog('director-json-repair', { message: error.message })

    const repaired = await completeMiniMax({
      endpoint: settings.endpoint,
      apiKey: settings.apiKey,
      model: settings.directorModel,
      messages: [
        {
          role: 'user',
          name: 'Court Editor',
          content: [
            '把下面内容修成严格可 JSON.parse 的 JSON。',
            '只返回 JSON，不要解释，不要 Markdown。',
            '必须保留顶层 beats 数组与 patch 对象；beats 内对白含引号时要转义。',
            content.slice(0, 12000),
          ].join('\n'),
        },
      ],
      maxTokens: 2400,
    })

    return extractJson(repaired)
  }
}

async function askTurnResolution(gameState, settings) {
  const prompt = [
    '你是架空朝堂沙盒游戏的回合结算导演。',
    '根据本回合已发生的朝会、密查、御书房召见、整理情报，结算朝局后果。',
    '只推进臣子态度、派系小动作、待办事项和少量国势变化；不要替皇帝发布新旨意。',
    '每个结算要短，像史官和内廷值房合写的回合报告。',
    '只返回 JSON，不要 Markdown，不要思考过程。',
    'JSON 形状：{"summary":string,"newPendingEvents":[string],"metricChanges":[{"metric":"treasury"|"people"|"army"|"authority"|"bureaucracy"|"border"|"faction","delta":number,"reason":string}],"standingChanges":[{"ministerId":string,"favorDelta":number,"pressureDelta":number,"assignment":string|null,"lastImperialSignal":string}],"memories":[{"ministerId":string,"note":string}]}',
    `当前游戏状态：${JSON.stringify(summarizeGameForDirector(gameState))}`,
  ].join('\n')

  const content = await completeMiniMax({
    endpoint: settings.endpoint,
    apiKey: settings.apiKey,
    model: settings.directorModel,
    messages: [{ role: 'user', name: 'Court Clerk', content: prompt }],
    maxTokens: 1200,
  })

  try {
    return extractJson(content)
  } catch (error) {
    appendLog('resolution-json-repair', { message: error.message })

    const repaired = await completeMiniMax({
      endpoint: settings.endpoint,
      apiKey: settings.apiKey,
      model: settings.directorModel,
      messages: [
        {
          role: 'user',
          name: 'Court Editor',
          content: [
            '把下面内容修成严格可 JSON.parse 的回合结算 JSON。',
            '只返回 JSON，不要解释。',
            '必须包含 summary、newPendingEvents、metricChanges、standingChanges、memories。',
            content.slice(0, 10000),
          ].join('\n'),
        },
      ],
      maxTokens: 1200,
    })

    return extractJson(repaired)
  }
}

function arrangeCourtTurn(gameState, action, roleReply, directorTurn) {
  const directorBeats = Array.isArray(directorTurn.beats)
    ? directorTurn.beats
    : directorTurn.beat
      ? [directorTurn.beat]
      : []
  const firstBeat = focusedBeat(gameState, action, roleReply, directorBeats)

  if (!firstBeat) {
    return { ...directorTurn, beats: directorBeats.slice(0, 3) }
  }

  return {
    ...directorTurn,
    beats: [
      firstBeat,
      ...directorBeats.filter((beat) => beat.speakerId !== firstBeat.speakerId),
    ].slice(0, 3),
  }
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1680,
    height: 1040,
    minWidth: 1180,
    minHeight: 780,
    title: '上朝了',
    backgroundColor: '#120c0a',
    webPreferences: {
      preload: join(here, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (app.isPackaged) {
    await win.loadFile(join(here, '../dist/index.html'))
  } else {
    await win.loadURL(rendererUrl)
  }
}

app.whenReady().then(async () => {
  app.setPath('userData', join(app.getPath('appData'), '上朝了'))
  await openDatabase()

  ipcMain.handle('court:load-latest-save', () => {
    const row = selectOne(
      'SELECT snapshot FROM saves ORDER BY updated_at DESC LIMIT 1',
    )
    return row ? JSON.parse(String(row.snapshot)) : null
  })

  ipcMain.handle('court:save-game', (_event, slot) => {
    database.run(
      `INSERT INTO saves (id, title, snapshot, version, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         snapshot = excluded.snapshot,
         version = excluded.version,
         updated_at = excluded.updated_at`,
      [slot.id, slot.title, JSON.stringify(slot.snapshot), slot.version, slot.updatedAt],
    )
    flushDatabase()
    return { ok: true }
  })

  ipcMain.handle('court:load-settings', () => loadSettings())

  ipcMain.handle('court:save-settings', (_event, settings) => {
    const nextSettings = { ...defaultSettings, ...settings }
    database.run(
      `INSERT INTO settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`,
      ['minimax', JSON.stringify(nextSettings), new Date().toISOString()],
    )
    flushDatabase()
    return { ok: true, settings: nextSettings }
  })

  ipcMain.handle('court:append-log', (_event, entry) => {
    appendLog(entry.kind ?? 'renderer', entry)
    return { ok: true }
  })

  ipcMain.handle('court:generate-agenda', async (_event, payload) => {
    const settings = loadSettings()

    if (!settings.aiEnabled || !settings.apiKey) {
      throw new Error('MiniMax is not ready yet.')
    }

    try {
      const agenda = await askAudienceAgenda(payload.gameState, settings)
      appendLog('ai-agenda', agenda)
      return agenda
    } catch (error) {
      appendLog('ai-agenda-error', { message: error.message })
      throw error
    }
  })

  ipcMain.handle('court:advance-scene', async (_event, payload) => {
    const settings = loadSettings()

    if (!settings.aiEnabled || !settings.apiKey) {
      throw new Error('MiniMax is not ready yet.')
    }

    try {
      let roleReply = ''

      if (payload.action.targetMinisterId) {
        try {
          roleReply = await askFocusedMinister(payload.gameState, payload.action, settings)
        } catch (error) {
          appendLog('role-fallback', { message: error.message })
        }
      }

      const directorTurn = await askDirector(
        payload.gameState,
        payload.action,
        roleReply,
        settings,
      )
      const result = arrangeCourtTurn(payload.gameState, payload.action, roleReply, directorTurn)
      appendLog('ai-beat', {
        action: payload.action,
        beats: result.beats,
      })
      return result
    } catch (error) {
      appendLog('ai-error', { message: error.message })
      throw error
    }
  })

  ipcMain.handle('court:resolve-turn', async (_event, payload) => {
    const settings = loadSettings()

    if (!settings.aiEnabled || !settings.apiKey) {
      throw new Error('MiniMax is not ready yet.')
    }

    try {
      const result = await askTurnResolution(payload.gameState, settings)
      appendLog('ai-resolution', result)
      return result
    } catch (error) {
      appendLog('ai-resolution-error', { message: error.message })
      throw error
    }
  })

  await createWindow()

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
