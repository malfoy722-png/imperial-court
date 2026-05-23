import { choose, createRng, range, shuffle } from './random'
import { constrainPatchForAction } from './schema'
import type {
  AgendaItem,
  CourtBeat,
  CourtClue,
  ImperialEffect,
  CourtLine,
  CourtState,
  CourtSummary,
  EdictRecord,
  GameState,
  InvestigationTask,
  MinisterProfile,
  PlayerAction,
  RevealedFact,
  SceneMode,
  StatePatch,
  TurnActionSlot,
  TurnResolutionDraft,
} from './types'

const currentGameVersion = 3

const offices = [
  ['吏部尚书', '官员升黜'],
  ['户部尚书', '钱粮税赋'],
  ['礼部尚书', '礼制科举'],
  ['兵部尚书', '军政边防'],
  ['刑部尚书', '刑名法度'],
  ['工部尚书', '河工营造'],
  ['首辅', '内阁票拟'],
  ['都察院左都御史', '言路风纪'],
  ['锦衣卫指挥使', '缉访密查'],
] as const

const fullNames = [
  '沈知砚',
  '陆伯庸',
  '裴观澜',
  '祝履冰',
  '顾怀瑾',
  '闻时雍',
  '韩成蹊',
  '宋慎微',
  '姚砺川',
  '段行简',
  '纪望舒',
  '魏从周',
  '虞钧衡',
  '梁白榆',
  '许闻策',
  '谢既明',
  '崔执玉',
  '苏鹤年',
  '孟庭筠',
  '范清峤',
  '罗守拙',
  '尹介夫',
]
const ageBands = ['三十出头', '四旬老练', '五旬持重', '鬓边见霜', '少年成名']
const reputations = [
  '奏疏短，算盘长',
  '办事利落，嘴上不饶人',
  '素有清名，也素爱抬杠',
  '擅把难题说得像小事',
  '在衙门里很会让别人加班',
  '履历漂亮，眼神更漂亮',
]
const visibleMoods = ['袖手静候', '像有一肚子话', '面色过分端正', '悄悄观察同列', '看着昨夜没睡够', '比奏乐还精神']
const factions = ['清议台', '实务党', '边镇旧部', '勋贵门生', '不肯站队']
const desires = ['把本部预算守到最后一文', '借皇恩压过旧对头', '先立功再谈忠心', '护住自己提拔的一串门生', '把朝廷从虚礼里拽回账本']
const preferences = ['怕拖延', '吃软不吃硬', '最爱当众接旨', '不愿背黑锅', '见到明账就舒坦', '对奇闻轶事格外上心']
const temperaments = ['稳得像压舱石', '话少但记仇', '喜欢把人逼到明处', '会笑着推翻别人的台阶', '急于立功', '凡事先算账']
const fears = ['被同僚联手架空', '被皇帝看成无用之人', '旧账忽然被翻出', '门生牵连自己', '边事失控', '清名被弄脏']
const bottomLines = ['不愿背欺君之名', '不能丢掉本部人手', '不会公开卖掉旧盟友', '不肯把军权交给外行', '不愿让地方坐大', '不能被内廷牵着鼻子走']
const selfDrives = ['主动寻找能显出本事的差事', '暗中修补自己的派系缺口', '把皇帝每句话都当成风向', '遇到责任会先找边界', '对能压倒旧敌的机会很敏感']
const dynastyNames = ['晏', '承', '曜', '澄', '璟', '临', '泰', '雍']
const reignTitles = ['嘉衡', '开曜', '熙宁', '定元', '承晖', '景和']
const courtStyles = [
  '百官嘴上讲体面，转身抢差事',
  '衙门规矩很密，朝上笑话也不少',
  '新君刚坐稳，大家都在试探龙椅脾气',
  '国事尚可，鸡毛蒜皮却每日排队上殿',
]
const openings = [
  '春耕将起，户部嚷钱，礼部嚷礼，京营嚷靴子。',
  '前朝积案刚翻开一角，朝臣先为谁来收尾吵了半宿。',
  '边报平静得可疑，京城倒先被一批奇怪贡品搅热闹了。',
  '新科放榜在即，朝廷人人都说公道，人人都想先看名单。',
]
const accentColors = ['#d86e45', '#2d8f8d', '#d7a542', '#718bd4', '#9a5cb4', '#6e9e56', '#b65757', '#4f9b72', '#9368b8']

const agendaTemplates = [
  {
    title: '贡瓜该入祥瑞册，还是照常下御膳房',
    summary: '山东进了一枚硕大贡瓜，内廷想讨个吉兆，礼部怕祥瑞滥报坏规矩。',
    briefing: '贡瓜已在午门外候验，若录为祥瑞，要行文地方褒奖；若只作贡品，内廷脸上略挂不住。',
    decision: '要裁断：让礼部按祥瑞上报，还是当作寻常贡品收下。',
    severity: 'daily',
  },
  {
    title: '京官扎堆告病，衙门点卯缺了人',
    summary: '吏部报近日告病请假骤增，都察院怀疑有人借病躲差事。',
    briefing: '缺人的衙门已经开始互相借书吏，若全准假，公文会慢；若一概严查，又怕真病官员寒心。',
    decision: '要裁断：先严查告病名册，还是给吏部一套临时补位办法。',
    severity: 'daily',
  },
  {
    title: '河堤汛前要修，工部请银但旧账未销',
    summary: '工部请先拨银修一段险堤，户部却追问上一轮河工旧款为何还挂在账上。',
    briefing: '汛期将近，工部说再拖就要带水抢修；户部说旧单据里有几笔签押不齐，先拨新银会把旧窟窿盖住。',
    decision: '要裁断：先修堤、先清账，还是让几部会同把两件事并着办。',
    severity: 'state',
  },
  {
    title: '北镇军鞋一营磨破，补采买还是先查价',
    summary: '兵部请补军鞋和冬袜，户部怀疑旧采买单价里藏了虚报。',
    briefing: '边镇报来的鞋样已送入京，确实破得厉害；但上一批承办商号与镇中军需官关系过近。',
    decision: '要裁断：急拨军需、换承办人，还是先把旧采买账翻明白。',
    severity: 'state',
  },
  {
    title: '新科策论批了祖制，礼部要不要黜卷',
    summary: '会试一篇策论把旧制度批得很直，礼部怕坏风气，言官又说不该堵嘴。',
    briefing: '卷子还未放榜，若黜得太快会被说成避讳；若放过去，礼部担心来年士子都拿尖话邀名。',
    decision: '要裁断：按文采取士、按言辞黜卷，还是另命重臣复看。',
    severity: 'daily',
  },
  {
    title: '同一县三份灾报互相打架，先赈还是先查',
    summary: '地方先报旱、又报蝗、再报河决，三份奏疏口径互相冲突。',
    briefing: '若真有灾，仓粮与民心都等不起；若地方借灾伸手，赈银一出京就难追回。',
    decision: '要裁断：先发急赈、先派人勘灾，还是赈查并行。',
    severity: 'state',
  },
  {
    title: '京营夜操扰民，练兵不能停也不能闹城',
    summary: '京营提督称夜操见效，顺天府却收了成摞扰民申诉。',
    briefing: '京营近月军纪好转，夜操确有用；可鼓号、火把和马队穿街，已经吵得城坊怨声上来。',
    decision: '要裁断：照旧练、改时辰，还是把夜操移出城坊。',
    severity: 'daily',
  },
  {
    title: '边市忽然冷清，兵部疑有边患前兆',
    summary: '互市商旅骤减，边关探报也变少，兵部担心不是生意淡这么简单。',
    briefing: '边将没有报战事，商人却说塞外几路货队都改道；若只是虚惊，调兵会劳民伤财。',
    decision: '要裁断：先加探报、先备边军，还是让边市官先查商路。',
    severity: 'crisis',
  },
] as const

const crisisTemplates: Record<string, { title: string; summary: string; briefing: string; decision: string }> = {
  treasury: {
    title: '国库告急，户部请旨紧急筹款',
    summary: '存银见底，各衙门俸禄与军饷均面临拖欠，户部尚书红着眼睛入殿。',
    briefing: '若不即刻筹银，最迟下月京营就要欠饷，地方官员也会开始游手好闲等上头的钱。',
    decision: '要裁断：加征商税、挪用内库，还是先催各省欠粮折银上缴。',
  },
  people: {
    title: '多省民变苗头，地方急报民心不稳',
    summary: '三省相继报来民间聚聚散散的小骚动，都察院担心是大事前兆。',
    briefing: '表面是粮价、徭役、地方官苛待；底下是已经有人在煽动。若不及时抚，苗头会成燎原。',
    decision: '要裁断：派钦差去查抚、减赋税，还是先震慑为主。',
  },
  army: {
    title: '京营士气低落，操练形同虚设',
    summary: '兵部密报京营近月缺额严重，点卯人在但心思早就不在，将领也懒于整治。',
    briefing: '原因众说纷纭：有说欠饷，有说将领苛扣，有说上一批老兵油子把风气带坏了。',
    decision: '要裁断：换将领、清欠饷，还是先彻查克扣来源。',
  },
  authority: {
    title: '朝臣开始拖延奉旨，皇威见损',
    summary: '近几道旨意出去，下面执行都打了折扣，甚至有衙门把圣旨压了三天才动。',
    briefing: '朝上表面恭顺，底下各自揣摩皇帝是否真的要追责；若这次再不立威，松懈会成常态。',
    decision: '要裁断：严查怠旨之人，还是挑一个典型当殿问责。',
  },
  bureaucracy: {
    title: '吏治败坏，各部互相推诿无人担事',
    summary: '三件本该一月办结的差事已拖了两个月，各部互称对方不配合，没有一个人认责。',
    briefing: '都察院称无力弹劾所有人；吏部称考绩制度已形同虚设；地方官员已经开始效仿。',
    decision: '要裁断：重建考绩问责制、还是先揪出一两个推诿最凶的人严办。',
  },
  border: {
    title: '边境告急，探报称有大股骑兵异动',
    summary: '北境三处烽燧相继点火，兵部称这不是寻常劫掠，可能是一次有组织的试探。',
    briefing: '边将请求增兵，但京中老臣担心是边将借机要钱要粮；若置之不理，探报的烽燧数字只会更多。',
    decision: '要裁断：即刻调兵增援，还是先派人核实边将报告再动。',
  },
  faction: {
    title: '朋党之争公开化，两派在朝上当众拆台',
    summary: '今日大朝，两派重臣当着百官互相揭短，已经不再掩饰。',
    briefing: '一派称另一派结党蒙蔽圣听，另一派称对方中饱私囊；若皇帝不表态，百官只会跟着站队。',
    decision: '要裁断：敲打双方各打五十大板，还是明确支持一派压制另一派。',
  },
}

function buildCrisisAgenda(
  metrics: GameState['metrics'],
  seed: string,
  ministers: MinisterProfile[],
  existingAgenda: AgendaItem[],
): AgendaItem | null {
  const threshold = 22
  const triggered = (Object.entries(metrics) as Array<[string, number]>)
    .filter(([key, val]) => val <= threshold && !existingAgenda.some((a) => a.title.includes(crisisTemplates[key]?.title?.slice(0, 6) ?? '')))
    .sort(([, a], [, b]) => a - b)

  if (triggered.length === 0) return null

  const [metricKey] = triggered[0]
  const template = crisisTemplates[metricKey]
  if (!template) return null

  const presenter = ministers.find((m) => {
    const officeMap: Record<string, string> = {
      treasury: '户部尚书', people: '都察院左都御史', army: '兵部尚书',
      authority: '首辅', bureaucracy: '吏部尚书', border: '兵部尚书', faction: '首辅',
    }
    return m.publicDossier.office === officeMap[metricKey]
  }) ?? ministers[0]

  return {
    id: createId(`${seed}-crisis-${metricKey}`, 'agenda', 0),
    title: template.title,
    summary: template.summary,
    briefing: template.briefing,
    decision: template.decision,
    severity: 'crisis',
    presenterId: presenter.id,
    status: 'open',
  }
}

function now() {
  return new Date().toISOString()
}

function createId(seed: string, label: string, index: number) {
  return `${label}-${seed.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)}-${index}`
}

function dateLabel(game: Pick<GameState, 'calendar' | 'dynasty'>) {
  return `${game.dynasty.reignTitle}${game.calendar.year}年${game.calendar.month}月${game.calendar.day}日`
}

function line(
  id: string,
  speakerId: string | null,
  speakerName: string,
  text: string,
  tone: string,
): CourtLine {
  return {
    id,
    speakerId,
    speakerName,
    text,
    tone,
    createdAt: now(),
  }
}

function metricDeltaForAgenda(severity: AgendaItem['severity']) {
  if (severity === 'daily') {
    return 2
  }

  return severity === 'state' ? 4 : 7
}

function makeMinister(
  seed: string,
  rng: () => number,
  office: (typeof offices)[number],
  index: number,
  usedNames: Set<string>,
): MinisterProfile {
  let name = choose(fullNames, rng)

  while (usedNames.has(name)) {
    name = choose(fullNames, rng)
  }

  usedNames.add(name)
  const relationship = offices[(index + 3) % offices.length][0]

  return {
    id: createId(seed, 'minister', index),
    portraitKey: `minister-${index}`,
    publicDossier: {
      name,
      office: office[0],
      portfolio: office[1],
      ageBand: choose(ageBands, rng),
      reputation: choose(reputations, rng),
      visibleMood: choose(visibleMoods, rng),
    },
    persona: {
      temperament: choose(temperaments, rng),
      desire: choose(desires, rng),
      fear: choose(fears, rng),
      bottomLine: choose(bottomLines, rng),
      faction: choose(factions, rng),
      selfDrive: choose(selfDrives, rng),
      relationshipNotes: [`对${relationship}的路数并不全信`],
    },
    standing: defaultStanding(),
    hiddenTraits: {
      ability: range(rng, 32, 94),
      courage: range(rng, 22, 96),
      loyalty: range(rng, 18, 96),
      appetite: range(rng, 8, 92),
      risk: range(rng, 8, 88),
      faction: choose(factions, rng),
      desire: choose(desires, rng),
      preference: choose(preferences, rng),
      relationships: [`对${relationship}的路数并不全信`],
    },
    revealedFacts: [],
    memory: [],
    privateMemory: [],
    accent: accentColors[index % accentColors.length],
  }
}

function makeAgenda(seed: string, rng: () => number, ministers: MinisterProfile[]) {
  return shuffle(agendaTemplates, rng)
    .slice(0, 3)
    .map((template, index) => {
      const presenter = choose(ministers, rng)

      return {
        id: createId(seed, 'agenda', index),
        title: template.title,
        summary: template.summary,
        severity: template.severity,
        presenterId: presenter.id,
        status: 'open' as const,
      }
    })
}

function proactiveLines(seed: string, ministers: MinisterProfile[], lineBase: number): CourtLine[] {
  const lines: CourtLine[] = []

  for (const m of ministers) {
    if (lines.length >= 2) break

    // 领了差的大臣主动汇报进度
    if (m.standing.assignment) {
      const reports = [
        `臣领的《${m.standing.assignment}》差事，眼下已走了大半，有几处细节还需请旨。`,
        `臣奉旨承办《${m.standing.assignment}》，进展尚顺，但各衙门配合的速度，臣不敢替他们打保票。`,
        `《${m.standing.assignment}》一事臣正在督办，今日上朝前臣已把账理了一遍，随时可以回陛下。`,
      ]
      lines.push(line(
        `${seed}-proactive-${m.id}`,
        m.id,
        m.publicDossier.name,
        reports[lines.length % reports.length],
        '主动奏报',
      ))
      continue
    }

    // 高圣眷大臣主动背书表忠
    if (m.standing.favor >= 68 && lines.length === 0) {
      const endorsements = [
        `臣昨日与几位同僚谈起陛下上回的旨意，众人皆言圣断高明，臣不过是借了陛下的光把事办了。`,
        `陛下上回点拨的几句话，臣回去想了一夜，越想越觉得是臣自己看浅了。`,
      ]
      lines.push(line(
        `${seed}-proactive-favor-${m.id}`,
        m.id,
        m.publicDossier.name,
        endorsements[m.standing.favor % endorsements.length],
        '表忠',
      ))
    }
  }

  return lines.map((l, i) => ({ ...l, id: `${seed}-proactive-${lineBase + i}` }))
}

function makeOpeningCourt(seed: string, ministers: MinisterProfile[], agenda: AgendaItem[], turnNumber = 1): CourtState {
  const presenter = ministers.find((minister) => minister.id === agenda[0].presenterId)
  const baseLine0 = createId(seed, 'line', 0)
  const baseLine1 = createId(seed, 'line', 1)

  // 第一回合不加主动汇报，避免开局冷场
  const proactive = turnNumber > 1 ? proactiveLines(seed, ministers, 2) : []

  return {
    agenda,
    activeAgendaId: agenda[0].id,
    round: 1,
    focusMinisterId: presenter?.id ?? null,
    atmosphere: '殿中刚静下来，人人看着龙椅会先把哪件事拎出来。',
    imperialEffects: [
      {
        id: `${seed}-effect-opening`,
        label: '百官入班，御案开卷',
        tone: 'ritual',
      },
    ],
    transcript: [
      line(
        baseLine0,
        null,
        '鸿胪寺',
        `钟鼓已毕，百官分班。依今朝奏事次第，请${presenter?.publicDossier.office ?? '值殿官'}${presenter?.publicDossier.name ?? ''}出班，先奏《${agenda[0].title}》。`,
        '引奏',
      ),
      ...proactive,
      line(
        baseLine1,
        presenter?.id ?? null,
        presenter?.publicDossier.name ?? '值殿官',
        agendaPresentationText(agenda[0]),
        '奏报',
      ),
    ],
  }
}

function agendaPresentationText(agenda: AgendaItem) {
  return [
    `臣奏《${agenda.title}》。${agenda.summary}`,
    agenda.briefing,
    agenda.decision,
  ]
    .filter(Boolean)
    .join(' ')
}

function presentationLines(
  idBase: string,
  ministers: MinisterProfile[],
  agenda: AgendaItem,
  lineBase: number,
) {
  const presenter = ministers.find((minister) => minister.id === agenda.presenterId)

  return [
    line(
      `${idBase}-line-${lineBase}`,
      null,
      '鸿胪寺',
      `前奏已毕。请${presenter?.publicDossier.office ?? '值殿官'}${presenter?.publicDossier.name ?? ''}出班，奏下一事《${agenda.title}》。`,
      '引奏',
    ),
    line(
      `${idBase}-line-${lineBase + 1}`,
      presenter?.id ?? null,
      presenter?.publicDossier.name ?? '值殿官',
      agendaPresentationText(agenda),
      '奏报',
    ),
  ]
}

function emptyPatch(): StatePatch {
  return {
    metricChanges: [],
    edicts: [],
    investigations: [],
    memories: [],
    standingChanges: [],
  }
}

function clueFromMinister(minister: MinisterProfile, action: PlayerAction): CourtClue | null {
  if (action.type !== 'summon' && action.type !== 'speak') {
    return null
  }

  if (minister.revealedFacts.some((fact) => fact.confidence === 'hint')) {
    return null
  }

  if (minister.hiddenTraits.appetite > 70) {
    return {
      ministerId: minister.id,
      label: '一谈到差事归属，眼神比一谈道义亮。',
      source: '朝堂言行',
      confidence: 'hint',
    }
  }

  if (minister.hiddenTraits.loyalty > 70) {
    return {
      ministerId: minister.id,
      label: '被追问时先护住圣断，再护住自己的脸面。',
      source: '朝堂言行',
      confidence: 'hint',
    }
  }

  return {
    ministerId: minister.id,
    label: `提到${minister.hiddenTraits.preference}时，答得明显更快。`,
    source: '朝堂言行',
    confidence: 'hint',
  }
}

function speakerForAction(game: GameState, action: PlayerAction) {
  const activeAgenda = game.currentCourt.agenda.find(
    (agenda) => agenda.id === (action.agendaId ?? game.currentCourt.activeAgendaId),
  )
  const targetId = action.targetMinisterId ?? activeAgenda?.presenterId
  return game.ministers.find((minister) => minister.id === targetId) ?? game.ministers[0]
}

function speakersForOpenCourt(game: GameState, action: PlayerAction) {
  const agenda = game.currentCourt.agenda.find(
    (item) => item.id === (action.agendaId ?? game.currentCourt.activeAgendaId),
  )
  const presenter = agenda
    ? game.ministers.find((minister) => minister.id === agenda.presenterId)
    : null
  const candidateOffices = ['首辅', '都察院左都御史', '户部尚书', '刑部尚书', '礼部尚书', '兵部尚书']
  const ordered = [
    presenter,
    ...candidateOffices.map((office) =>
      game.ministers.find((minister) => minister.publicDossier.office === office),
    ),
    ...game.ministers,
  ].filter(Boolean) as MinisterProfile[]
  const unique = new Map(ordered.map((minister) => [minister.id, minister]))

  return [...unique.values()].slice(0, 3)
}

function standingSignalForAction(action: PlayerAction, subject: string) {
  const assignment = `《${subject}》`

  switch (action.type) {
    case 'summon':
      return {
        pressureDelta: 3,
        lastImperialSignal: '被点名出班',
      }
    case 'approve':
      return {
        favorDelta: 8,
        pressureDelta: -2,
        assignment,
        lastImperialSignal: '当殿领旨',
      }
    case 'reject':
      return {
        favorDelta: -4,
        pressureDelta: 8,
        assignment: null,
        lastImperialSignal: '被驳回重拟',
      }
    case 'hold':
      return {
        pressureDelta: 4,
        lastImperialSignal: '奏疏留中',
      }
    case 'assign':
      return {
        favorDelta: 4,
        pressureDelta: 3,
        assignment,
        lastImperialSignal: '受命牵头',
      }
    case 'reconsider':
      return {
        pressureDelta: 5,
        assignment,
        lastImperialSignal: '奉命复议',
      }
    case 'investigate':
      return {
        pressureDelta: 7,
        lastImperialSignal: '被御前记名',
      }
    case 'appoint':
      return {
        favorDelta: 10,
        pressureDelta: 4,
        assignment: `试差：${assignment}`,
        lastImperialSignal: '被任命试差',
      }
    case 'retire':
      return null
    case 'threaten':
      return {
        pressureDelta: 18,
        favorDelta: -5,
        lastImperialSignal: '御前受威，如芒刺背',
      }
    case 'appease':
      return {
        favorDelta: 14,
        pressureDelta: -6,
        lastImperialSignal: '御前安抚，受宠若惊',
      }
    case 'probe':
      return {
        pressureDelta: 6,
        lastImperialSignal: '被皇帝当面试探底线',
      }
    case 'speak':
    default:
      return {
        pressureDelta: action.text ? 2 : 1,
        lastImperialSignal: action.targetMinisterId ? '奉问奏对' : '听旨候问',
      }
  }
}

function addDefaultStandingChange(game: GameState, action: PlayerAction, patch: StatePatch) {
  if (patch.standingChanges.length > 0) {
    return patch
  }

  const speaker = speakerForAction(game, action)
  const agenda = game.currentCourt.agenda.find(
    (item) => item.id === (action.agendaId ?? game.currentCourt.activeAgendaId),
  )
  const subject = agenda?.title ?? '眼前这桩差事'
  const signal = standingSignalForAction(action, subject)

  if (!signal) {
    return patch
  }

  const standingChanges: StatePatch['standingChanges'] = [{ ministerId: speaker.id, ...signal }]

  // 准奏或任命时，同派系获好感，对立派系感到压力
  if (action.type === 'approve' || action.type === 'appoint') {
    const speakerFaction = speaker.persona?.faction
    if (speakerFaction && speakerFaction !== '不肯站队') {
      for (const m of game.ministers) {
        if (m.id === speaker.id) continue
        if (m.persona?.faction === speakerFaction) {
          standingChanges.push({ ministerId: m.id, favorDelta: 2, lastImperialSignal: '同僚受旨，派系得势' })
        } else if (m.persona?.faction && m.persona.faction !== '不肯站队') {
          standingChanges.push({ ministerId: m.id, pressureDelta: 3, lastImperialSignal: '对立派系受宠，暗中忧虑' })
        }
      }
    }
  }

  // 驳回时，对立派系压力下降（舒了口气），同派系压力上升
  if (action.type === 'reject') {
    const speakerFaction = speaker.persona?.faction
    if (speakerFaction && speakerFaction !== '不肯站队') {
      for (const m of game.ministers) {
        if (m.id === speaker.id) continue
        if (m.persona?.faction === speakerFaction) {
          standingChanges.push({ ministerId: m.id, pressureDelta: 2, lastImperialSignal: '同僚被驳，提心吊胆' })
        } else if (m.persona?.faction && m.persona.faction !== '不肯站队') {
          standingChanges.push({ ministerId: m.id, pressureDelta: -2, lastImperialSignal: '对头被驳，暗中松了口气' })
        }
      }
    }
  }

  return { ...patch, standingChanges }
}

function offlineBeat(game: GameState, action: PlayerAction): { beat: CourtBeat; patch: StatePatch } {
  const speaker = speakerForAction(game, action)
  const agenda = game.currentCourt.agenda.find(
    (item) => item.id === (action.agendaId ?? game.currentCourt.activeAgendaId),
  )
  const clue = clueFromMinister(speaker, action)
  const subject = agenda?.title ?? '眼前这桩差事'
  const patch = emptyPatch()
  let text: string
  let atmosphere = '班列里有人憋笑，有人认真记下皇帝刚才的口风。'

  switch (action.type) {
    case 'summon':
      text = `臣在。若陛下问《${subject}》，臣不敢把话说满，但谁来担责总得先写清。`
      atmosphere = `${speaker.publicDossier.office}出班，旁边几位同僚立刻把袖子拢紧了。`
      break
    case 'approve':
      text = `臣领旨。既得圣断，臣今日就把《${subject}》往下压，不叫它只在殿上热闹。`
      patch.edicts.push({
        title: `准办：${subject}`,
        summary: action.text || `按朝议推进《${subject}》，由${speaker.publicDossier.office}先承办。`,
      })
      patch.metricChanges.push({
        metric: agenda?.severity === 'crisis' ? 'border' : 'bureaucracy',
        delta: metricDeltaForAgenda(agenda?.severity ?? 'daily'),
        reason: `《${subject}》得了明确去处。`,
      })
      patch.memories.push({ ministerId: speaker.id, note: `在《${subject}》上接了准办旨意。` })
      patch.standingChanges.push({
        ministerId: speaker.id,
        favorDelta: 8,
        pressureDelta: -2,
        assignment: `《${subject}》`,
        lastImperialSignal: '当殿领旨',
      })
      break
    case 'reject':
      text = `臣遵旨退回重拟。只是这话传回衙门，今晚怕要多亮几盏灯。`
      patch.edicts.push({
        title: `驳回：${subject}`,
        summary: action.text || `原议不准，责成相关衙门另拟《${subject}》。`,
      })
      patch.metricChanges.push({
        metric: 'authority',
        delta: 2,
        reason: '圣断干脆，朝臣知晓糊弄不过去。',
      })
      patch.memories.push({ ministerId: speaker.id, note: `在《${subject}》上被当殿驳回。` })
      patch.standingChanges.push({
        ministerId: speaker.id,
        favorDelta: -4,
        pressureDelta: 8,
        assignment: null,
        lastImperialSignal: '被驳回重拟',
      })
      break
    case 'hold':
      text = `臣先把这本奏疏压住，免得今日一句热闹，明日三衙门互相写回文。`
      atmosphere = '争着接话的人少了一半，争着看别人脸色的人多了一半。'
      patch.standingChanges.push({
        ministerId: speaker.id,
        pressureDelta: 4,
        lastImperialSignal: '奏疏留中',
      })
      break
    case 'assign':
      text = `臣领差。若要把事办成，臣还想请陛下给臣一封能压住扯皮的手诏。`
      patch.edicts.push({
        title: `转办：${subject}`,
        summary: action.text || `将《${subject}》交${speaker.publicDossier.office}牵头。`,
      })
      patch.metricChanges.push({
        metric: 'bureaucracy',
        delta: 3,
        reason: '差事有了牵头人。',
      })
      patch.standingChanges.push({
        ministerId: speaker.id,
        favorDelta: 4,
        pressureDelta: 3,
        assignment: `《${subject}》`,
        lastImperialSignal: '受命牵头',
      })
      break
    case 'reconsider':
      text = `臣回去复议。今日被陛下这么一问，旧稿若还敢原样拿回来，臣自己都嫌脸厚。`
      patch.edicts.push({
        title: `复议：${subject}`,
        summary: action.text || `相关官员重议《${subject}》，择日再奏。`,
      })
      patch.standingChanges.push({
        ministerId: speaker.id,
        pressureDelta: 5,
        assignment: `《${subject}》`,
        lastImperialSignal: '奉命复议',
      })
      break
    case 'investigate':
      text = `臣听旨。朝上先不惊动人，朝后自有人把旧账和人情一并翻出来。`
      patch.investigations.push({
        ministerId: speaker.id,
        method: '朝后密查',
        result: `已记下查验${speaker.publicDossier.name}与《${subject}》牵连的线。`,
      })
      patch.memories.push({ ministerId: speaker.id, note: '隐约察觉自己被皇帝多看了一眼。' })
      patch.standingChanges.push({
        ministerId: speaker.id,
        pressureDelta: 7,
        lastImperialSignal: '被御前记名',
      })
      break
    case 'appoint':
      text = `臣惶恐领命。新差事若办不好，今日这一班同僚怕都记得比史官还清楚。`
      patch.edicts.push({
        title: `任命试差：${speaker.publicDossier.name}`,
        summary: action.text || `令${speaker.publicDossier.name}暂领《${subject}》相关差事。`,
      })
      patch.metricChanges.push({
        metric: 'authority',
        delta: 3,
        reason: '用人权当殿落下。',
      })
      patch.standingChanges.push({
        ministerId: speaker.id,
        favorDelta: 10,
        pressureDelta: 4,
        assignment: `试差：《${subject}》`,
        lastImperialSignal: '被任命试差',
      })
      break
    case 'retire':
      text = '臣等恭送陛下。'
      atmosphere = '丹陛前的声浪散去，真正会在朝后发酵的话才刚要开始。'
      break
    case 'speak':
    default:
      text = action.text
        ? `臣听明白陛下问的是：“${action.text}”。若只看殿上话，人人都能说得忠直；若看谁肯把麻烦接回衙门，答案就没那么齐了。`
        : `臣请陛下示下《${subject}》先问人，还是先问账。`
      patch.standingChanges.push({
        ministerId: speaker.id,
        pressureDelta: action.text ? 2 : 1,
        lastImperialSignal: action.targetMinisterId ? '奉问奏对' : '听旨候问',
      })
      break
  }

  return {
    beat: {
      speakerId: speaker.id,
      speakerName: speaker.publicDossier.name,
      text,
      atmosphere,
      clues: clue ? [clue] : [],
    },
    patch,
  }
}

function offlineBeats(game: GameState, action: PlayerAction): { beats: CourtBeat[]; patch: StatePatch } {
  if ((action.type !== 'speak' && action.type !== 'summon') || action.targetMinisterId) {
    const result = offlineBeat(game, action)
    return { beats: [result.beat], patch: result.patch }
  }

  const speakers = speakersForOpenCourt(game, action)
  const agenda = game.currentCourt.agenda.find(
    (item) => item.id === (action.agendaId ?? game.currentCourt.activeAgendaId),
  )
  const subject = agenda?.title ?? '眼前这桩差事'
  const patch = emptyPatch()
  const beats = speakers.map((speaker, index) => {
    const clue = index === 0 ? clueFromMinister(speaker, action) : null
    const text = index === 0
      ? action.text
        ? `臣先回陛下这句：“${action.text}”。若只听漂亮话，此事不难；难的是谁肯把后头的账接住。`
        : `臣先奏《${subject}》的关节：不是没人会说理，是各衙门都怕担最后一笔账。`
      : index === 1
        ? `臣倒觉得不妨把话说穿。${speakers[0]?.publicDossier.office ?? '前头那位'}说的是责任，臣更担心有人借《${subject}》把旧账洗成新功。`
        : `臣请陛下留意，若今日只催快，底下就会糊；若只追责，差事又没人敢接。`

    patch.standingChanges.push({
      ministerId: speaker.id,
      pressureDelta: index === 0 ? 2 : 1,
      lastImperialSignal: index === 0 ? '领头奏对' : '随班插话',
    })

    return {
      speakerId: speaker.id,
      speakerName: speaker.publicDossier.name,
      text,
      atmosphere: '几位臣子依次出班，话头终于从一人奏对变成了朝议。',
      clues: clue ? [clue] : [],
    }
  })

  return { beats, patch }
}

function appendClues(ministers: MinisterProfile[], clues: CourtClue[]) {
  return ministers.map((minister) => {
    const relevant = clues.filter((clue) => clue.ministerId === minister.id)

    if (relevant.length === 0) {
      return minister
    }

    const facts: RevealedFact[] = relevant.map((clue, index) => ({
      id: `${clue.ministerId}-fact-${minister.revealedFacts.length + index}`,
      label: clue.label,
      source: clue.source,
      confidence: clue.confidence,
      createdAt: now(),
    }))

    return { ...minister, revealedFacts: [...minister.revealedFacts, ...facts] }
  })
}

function setAgendaStatus(agenda: AgendaItem[], action: PlayerAction): AgendaItem[] {
  if (!action.agendaId && !agenda.some((item) => item.status === 'open')) {
    return agenda
  }

  return agenda.map((item) => {
    if (item.id !== (action.agendaId ?? agenda.find((entry) => entry.status === 'open')?.id)) {
      return item
    }

    if (action.type === 'hold' || action.type === 'reconsider') {
      return { ...item, status: 'held' }
    }

    if (['approve', 'reject', 'assign', 'appoint'].includes(action.type)) {
      return { ...item, status: 'resolved' }
    }

    return item
  })
}

function isAgendaDecision(action: PlayerAction) {
  return ['approve', 'reject', 'hold', 'assign', 'reconsider', 'appoint'].includes(action.type)
}

function nextOpenAgenda(agenda: AgendaItem[], activeAgendaId: string) {
  const activeIndex = agenda.findIndex((item) => item.id === activeAgendaId)
  const ordered = activeIndex === -1
    ? agenda
    : [...agenda.slice(activeIndex + 1), ...agenda.slice(0, activeIndex)]

  return ordered.find((item) => item.status === 'open')
}

function clampMetric(value: number) {
  return Math.min(100, Math.max(0, value))
}

function clampStanding(value: number) {
  return Math.min(100, Math.max(0, value))
}

function defaultStanding() {
  return {
    favor: 40,
    pressure: 18,
    assignment: null,
    lastImperialSignal: '初入朝班',
  }
}

function defaultTurn(number = 1) {
  return {
    number,
    scene: 'court' as const,
    usedActions: {
      court: false,
      intel: false,
      private: false,
      briefing: false,
    },
    pendingEvents: ['新朝初开，九卿彼此都在试探龙椅脾气。'],
    lastResolution: '尚无回合结算。',
  }
}

function normalizeMinister(minister: MinisterProfile): MinisterProfile {
  return {
    ...minister,
    portraitKey: minister.portraitKey ?? `minister-0`,
    persona: {
      temperament: minister.persona?.temperament ?? '谨慎持重',
      desire: minister.persona?.desire ?? minister.hiddenTraits?.desire ?? '守住本部权柄',
      fear: minister.persona?.fear ?? '失去皇帝信任',
      bottomLine: minister.persona?.bottomLine ?? '不愿背欺君之名',
      faction: minister.persona?.faction ?? minister.hiddenTraits?.faction ?? '不肯站队',
      selfDrive: minister.persona?.selfDrive ?? '观察皇帝风向再动',
      relationshipNotes: minister.persona?.relationshipNotes ?? minister.hiddenTraits?.relationships ?? [],
    },
    standing: {
      ...defaultStanding(),
      ...minister.standing,
    },
    privateMemory: minister.privateMemory ?? [],
  }
}

function normalizeTurn(game: GameState) {
  return {
    ...defaultTurn(game.calendar?.audienceNumber ?? 1),
    ...game.turn,
    usedActions: {
      ...defaultTurn().usedActions,
      ...game.turn?.usedActions,
    },
    pendingEvents: game.turn?.pendingEvents ?? game.pendingNotes ?? [],
  }
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

function markTurnSlot(game: GameState, slot: TurnActionSlot, event?: string): GameState {
  return {
    ...game,
    turn: {
      ...game.turn,
      usedActions: {
        ...game.turn.usedActions,
        [slot]: true,
      },
      pendingEvents: event
        ? [...game.turn.pendingEvents, event].slice(-12)
        : game.turn.pendingEvents,
    },
  }
}

function preparePatchForAction(game: GameState, action: PlayerAction, rawPatch: StatePatch) {
  return constrainPatchForAction(action, addDefaultStandingChange(game, action, rawPatch))
}

function imperialEffectsFromPatch(game: GameState, patch: StatePatch, action: PlayerAction, lineBase: number) {
  const effects: ImperialEffect[] = []

  patch.edicts.forEach((edict, index) => {
    effects.push({
      id: `${game.id}-effect-${lineBase}-edict-${index}`,
      label: `${edict.title}，旨意入簿`,
      tone: 'edict',
    })
  })

  patch.investigations.forEach((task, index) => {
    const minister = game.ministers.find((entry) => entry.id === task.ministerId)
    effects.push({
      id: `${game.id}-effect-${lineBase}-inquiry-${index}`,
      label: `${minister?.publicDossier.name ?? '所点之臣'}入密查`,
      tone: 'inquiry',
      ministerId: task.ministerId,
    })
  })

  patch.standingChanges.forEach((change, index) => {
    const minister = game.ministers.find((entry) => entry.id === change.ministerId)
    const name = minister?.publicDossier.office ?? minister?.publicDossier.name ?? '朝臣'

    if (change.assignment !== undefined && change.assignment !== null) {
      effects.push({
        id: `${game.id}-effect-${lineBase}-assignment-${index}`,
        label: `${name}领差`,
        tone: 'assignment',
        ministerId: change.ministerId,
      })
    }

    if ((change.favorDelta ?? 0) > 0) {
      effects.push({
        id: `${game.id}-effect-${lineBase}-favor-${index}`,
        label: `${name}圣眷上升`,
        tone: 'favor',
        ministerId: change.ministerId,
      })
    }

    if ((change.pressureDelta ?? 0) > 0) {
      effects.push({
        id: `${game.id}-effect-${lineBase}-pressure-${index}`,
        label: `${name}畏压上升`,
        tone: 'pressure',
        ministerId: change.ministerId,
      })
    }
  })

  if (effects.length === 0 && action.type === 'retire') {
    effects.push({
      id: `${game.id}-effect-${lineBase}-retire`,
      label: '臣班退下，御书房灯起',
      tone: 'ritual',
    })
  }

  return effects.slice(0, 4)
}

export function applyStatePatch(game: GameState, action: PlayerAction, rawPatch: StatePatch, clues: CourtClue[]): GameState {
  const patch = preparePatchForAction(game, action, rawPatch)
  const issuedAt = dateLabel(game)
  const edicts: EdictRecord[] = patch.edicts.map((edict, index) => ({
    ...edict,
    id: `${game.id}-edict-${game.edicts.length + index}`,
    issuedAt,
  }))
  const investigations: InvestigationTask[] = patch.investigations.map((task, index) => ({
    ...task,
    id: `${game.id}-investigation-${game.investigations.length + index}`,
    createdAt: issuedAt,
  }))
  const metrics = { ...game.metrics }

  patch.metricChanges.forEach((change) => {
    metrics[change.metric] = clampMetric(metrics[change.metric] + change.delta)
  })

  const standingTargets = new Set(game.ministers.map((minister) => minister.id))
  const standingChanges = patch.standingChanges.filter((change) => standingTargets.has(change.ministerId))
  const ministers = appendClues(game.ministers.map(normalizeMinister), clues).map((minister) => {
    const memories = patch.memories
      .filter((memory) => memory.ministerId === minister.id)
      .map((memory) => memory.note)
    const standing = standingChanges
      .filter((change) => change.ministerId === minister.id)
      .reduce(
        (current, change) => ({
          favor: clampStanding(current.favor + (change.favorDelta ?? 0)),
          pressure: clampStanding(current.pressure + (change.pressureDelta ?? 0)),
          assignment: change.assignment === undefined ? current.assignment : change.assignment,
          lastImperialSignal: change.lastImperialSignal ?? current.lastImperialSignal,
        }),
        minister.standing,
      )

    return {
      ...minister,
      standing,
      memory: memories.length > 0 ? [...minister.memory, ...memories].slice(-8) : minister.memory,
    }
  })

  // 处理 tentativeDecision（存储意图待确认）
  const tentativeDecision = patch.tentativeDecision !== undefined
    ? patch.tentativeDecision
    : game.currentCourt.tentativeDecision

  // 处理 agendaDecision（皇帝确认后真正结算议题）
  let agendaResult = game.currentCourt.agenda
  let activeAgendaId = game.currentCourt.activeAgendaId
  if (patch.agendaDecision) {
    const { agendaId, actionType } = patch.agendaDecision
    const fakeAction: PlayerAction = {
      type: actionType,
      text: '',
      agendaId,
      targetMinisterId: patch.agendaDecision.ministerId,
    }
    agendaResult = setAgendaStatus(agendaResult, fakeAction)
    const next = nextOpenAgenda(agendaResult, agendaId)
    if (next) activeAgendaId = next.id
  }

  return {
    ...game,
    metrics,
    ministers,
    edicts: [...game.edicts, ...edicts],
    investigations: [...game.investigations, ...investigations],
    currentCourt: {
      ...game.currentCourt,
      agenda: agendaResult,
      activeAgendaId,
      tentativeDecision: patch.agendaDecision ? null : tentativeDecision,
    },
    updatedAt: now(),
  }
}

export function recordCourtBeats(
  game: GameState,
  action: PlayerAction,
  beats: CourtBeat[],
  patch: StatePatch,
): GameState {
  const settledBeats = beats.slice(0, 4)
  // agendaDecision 路径：用实际决断类型替代 speak 计算 standing 信号
  const agendaAction: PlayerAction = patch.agendaDecision
    ? {
        type: patch.agendaDecision.actionType,
        text: action.text,
        agendaId: patch.agendaDecision.agendaId,
        targetMinisterId: patch.agendaDecision.ministerId,
      }
    : action
  const effectivePatch = preparePatchForAction(game, agendaAction, patch)
  const next = applyStatePatch(
    game,
    action,
    effectivePatch,
    settledBeats.flatMap((beat) => beat.clues),
  )
  // agendaDecision 路径：applyStatePatch 已结算议题，直接用其结果；否则走原 setAgendaStatus
  const agenda = effectivePatch.agendaDecision
    ? next.currentCourt.agenda
    : setAgendaStatus(next.currentCourt.agenda, action)
  const actionLabels: Record<string, string> = {
    summon: '点名奏对',
    approve: '准奏',
    reject: '驳回',
    hold: '暂押',
    assign: '转交承办',
    reconsider: '命其复议',
    investigate: '暗查此人',
    appoint: '试任差事',
    retire: '退朝',
    threaten: '御前威压',
    appease: '御前笼络',
    probe: '试探底线',
    speak: '示意继续',
  }
  const playerText = action.text || actionLabels[action.type] || '御前示意'
  const lineBase = next.currentCourt.transcript.length
  const imperialEffects = imperialEffectsFromPatch(game, effectivePatch, action, lineBase)
  const latestBeat = settledBeats.at(-1)
  const newLines = settledBeats.map((beat, index) =>
    line(
      `${next.id}-line-${lineBase + index + 1}`,
      beat.speakerId,
      beat.speakerName,
      beat.text,
      beat.atmosphere,
    ),
  )

  const agendaTransition = isAgendaDecision(agendaAction)
    ? nextOpenAgenda(agenda, agendaAction.agendaId ?? next.currentCourt.activeAgendaId)
    : null
  const playerLine = {
    ...line(`${next.id}-line-${lineBase}`, null, '朕', playerText, action.type),
    effects: imperialEffects,
  }
  const ceremonyBase = lineBase + newLines.length + 1
  const ceremonyLines = agendaTransition
    ? presentationLines(next.id, next.ministers, agendaTransition, ceremonyBase)
    : []

  return {
    ...next,
    phase: next.phase === 'resolution' ? 'court' : next.phase,
    turn: {
      ...next.turn,
      usedActions: {
        ...next.turn.usedActions,
        [slotForScene(next.phase)]: true,
      },
      pendingEvents: [
        ...next.turn.pendingEvents,
        `${playerText}：${latestBeat?.speakerName ?? '朝班'}已回话。`,
      ].slice(-12),
    },
    currentCourt: {
      ...next.currentCourt,
      agenda,
      activeAgendaId: agendaTransition?.id ?? (effectivePatch.agendaDecision ? '' : next.currentCourt.activeAgendaId),
      round: next.currentCourt.round + 1,
      focusMinisterId: agendaTransition?.presenterId ?? latestBeat?.speakerId ?? next.currentCourt.focusMinisterId,
      imperialEffects,
      atmosphere: agendaTransition
        ? `《${agendaTransition.title}》已引到御前。`
        : latestBeat?.atmosphere ?? next.currentCourt.atmosphere,
      transcript: [
        ...next.currentCourt.transcript,
        playerLine,
        ...newLines,
        ...ceremonyLines,
      ].slice(-36),
    },
  }
}

export function recordCourtBeat(game: GameState, action: PlayerAction, beat: CourtBeat, patch: StatePatch) {
  return recordCourtBeats(game, action, [beat], patch)
}

export function advanceCourtScene(game: GameState, action: PlayerAction) {
  const result = offlineBeats(game, action)
  return {
    beat: result.beats[0],
    patch: result.patch,
    game: recordCourtBeats(game, action, result.beats, result.patch),
  }
}

export function resolveCourtSession(game: GameState): GameState {
  const handled = game.currentCourt.agenda.filter((agenda) => agenda.status === 'resolved')
  const held = game.currentCourt.agenda.filter((agenda) => agenda.status === 'held')
  const open = game.currentCourt.agenda.filter((agenda) => agenda.status === 'open')
  const assigned = game.ministers
    .filter((minister) => minister.standing.assignment)
    .slice(0, 3)
  const summary: CourtSummary = {
    id: `${game.id}-summary-${game.summaries.length}`,
    title: `第${game.calendar.audienceNumber}次朝会`,
    day: dateLabel(game),
    summary: [
      handled.length ? `拍板：${handled.map((agenda) => agenda.title).join('、')}。` : '今日多问了人，尚未急着拍板。',
      held.length ? `留中：${held.map((agenda) => agenda.title).join('、')}。` : '',
      open.length ? `仍待再议：${open.map((agenda) => agenda.title).join('、')}。` : '',
      assigned.length
        ? `权柄落处：${assigned.map((minister) => `${minister.publicDossier.name}领${minister.standing.assignment}`).join('；')}。`
        : '',
    ]
      .filter(Boolean)
      .join(' '),
  }

  return {
    ...game,
    phase: 'briefing' as const,
    turn: {
      ...game.turn,
      scene: 'briefing',
      usedActions: {
        ...game.turn.usedActions,
        court: true,
      },
      pendingEvents: [
        ...game.turn.pendingEvents,
        summary.summary,
      ].slice(-12),
    },
    currentCourt: {
      ...game.currentCourt,
      imperialEffects: [
        {
          id: `${game.id}-effect-study-${game.summaries.length}`,
          label: '退朝入书房',
          tone: 'ritual',
        },
      ],
    },
    summaries: [summary, ...game.summaries].slice(0, 12),
    pendingNotes: [
      ...held.map((agenda) => `《${agenda.title}》留中待看。`),
      ...open.map((agenda) => `《${agenda.title}》还在朝上悬着。`),
    ].slice(-10),
    updatedAt: now(),
  }
}

function revealVerifiedFact(minister: MinisterProfile) {
  const hidden = minister.hiddenTraits
  const facts = [
    `密报指向其常与“${hidden.faction}”往来。`,
    `查得此人真正想要的是：${hidden.desire}。`,
    `交叉问询后，忠心底色约在${hidden.loyalty > 68 ? '偏稳' : hidden.loyalty < 38 ? '偏飘' : '未定'}一边。`,
    `账房与门房口径都提到：此人${hidden.preference}。`,
  ]

  return facts[minister.revealedFacts.length % facts.length]
}

export function investigateMinister(game: GameState, ministerId: string): GameState {
  const target = game.ministers.find((minister) => minister.id === ministerId)

  if (!target) {
    return game
  }

  const result = revealVerifiedFact(target)
  const fact: RevealedFact = {
    id: `${ministerId}-verified-${target.revealedFacts.length}`,
    label: result,
    source: '御书房查验',
    confidence: 'verified',
    createdAt: now(),
  }

  return {
    ...game,
    phase: 'intel' as const,
    turn: {
      ...game.turn,
      scene: 'intel',
      usedActions: {
        ...game.turn.usedActions,
        intel: true,
      },
      pendingEvents: [
        ...game.turn.pendingEvents,
        `密查${target.publicDossier.name}：${result}`,
      ].slice(-12),
    },
    ministers: game.ministers.map((minister) =>
      minister.id === ministerId
        ? {
            ...minister,
            standing: {
              ...normalizeMinister(minister).standing,
              pressure: clampStanding(normalizeMinister(minister).standing.pressure + 8),
              lastImperialSignal: '御书房密查',
            },
            revealedFacts: [...minister.revealedFacts, fact],
            memory: [...minister.memory, '皇帝朝后动手查过我。'].slice(-8),
          }
        : minister,
    ),
    currentCourt: {
      ...game.currentCourt,
      imperialEffects: [
        {
          id: `${game.id}-effect-study-inquiry-${game.investigations.length}`,
          label: `${target.publicDossier.name}入密查`,
          tone: 'inquiry',
          ministerId,
        },
      ],
    },
    investigations: [
      {
        id: `${game.id}-study-investigation-${game.investigations.length}`,
        ministerId,
        method: '御书房查验',
        result,
        createdAt: dateLabel(game),
      },
      ...game.investigations,
    ].slice(0, 18),
    updatedAt: now(),
  }
}

export function setSceneMode(game: GameState, scene: SceneMode): GameState {
  return {
    ...game,
    phase: scene,
    turn: {
      ...game.turn,
      scene,
    },
    updatedAt: now(),
  }
}

export function organizeBriefing(game: GameState): GameState {
  const open = game.currentCourt.agenda.filter((agenda) => agenda.status === 'open')
  const assigned = game.ministers.filter((minister) => minister.standing.assignment).slice(0, 3)
  const note = [
    open.length ? `未决奏目：${open.map((agenda) => agenda.title).join('、')}。` : '今日奏目大体已有归处。',
    assigned.length
      ? `领差之臣：${assigned.map((minister) => `${minister.publicDossier.name}领${minister.standing.assignment}`).join('；')}。`
      : '尚无重臣领专差。',
  ].join(' ')

  return markTurnSlot(
    {
      ...game,
      phase: 'briefing',
      turn: {
        ...game.turn,
        scene: 'briefing',
      },
      pendingNotes: [note, ...game.pendingNotes].slice(0, 10),
      currentCourt: {
        ...game.currentCourt,
        imperialEffects: [
          {
            id: `${game.id}-effect-briefing-${game.turn.number}`,
            label: '御前整理情报',
            tone: 'ritual',
          },
        ],
      },
      updatedAt: now(),
    },
    'briefing',
    `整理：${note}`,
  )
}

function applyResolutionDraft(game: GameState, draft?: TurnResolutionDraft): GameState {
  if (!draft) {
    return game
  }

  const metrics = { ...game.metrics }
  ;(draft.metricChanges ?? []).forEach((change) => {
    metrics[change.metric] = clampMetric(metrics[change.metric] + change.delta)
  })

  const ministers = game.ministers.map((minister) => {
    const standingChanges = draft.standingChanges?.filter((change) => change.ministerId === minister.id) ?? []
    const memories = draft.memories
      ?.filter((memory) => memory.ministerId === minister.id)
      .map((memory) => memory.note) ?? []
    const standing = standingChanges.reduce(
      (current, change) => ({
        favor: clampStanding(current.favor + (change.favorDelta ?? 0)),
        pressure: clampStanding(current.pressure + (change.pressureDelta ?? 0)),
        assignment: change.assignment === undefined ? current.assignment : change.assignment,
        lastImperialSignal: change.lastImperialSignal ?? current.lastImperialSignal,
      }),
      minister.standing,
    )

    return {
      ...minister,
      standing,
      memory: memories.length > 0 ? [...minister.memory, ...memories].slice(-8) : minister.memory,
    }
  })

  return {
    ...game,
    metrics,
    ministers,
    turn: {
      ...game.turn,
      pendingEvents: [
        ...game.turn.pendingEvents,
        ...(draft.newPendingEvents ?? []),
      ].slice(-12),
      lastResolution: draft.summary,
    },
  }
}

function escalateSeverity(severity: AgendaItem['severity']): AgendaItem['severity'] {
  if (severity === 'daily') return 'state'
  return 'crisis'
}

function heldAgendaToNextTurn(
  heldItems: AgendaItem[],
  seed: string,
): AgendaItem[] {
  return heldItems.map((item, index) => {
    const escalated = escalateSeverity(item.severity)
    return {
      ...item,
      id: createId(`${seed}-held`, 'agenda', index),
      severity: escalated,
      status: 'open' as const,
      title: item.title,
      summary: `【留中未决，重提】${item.summary}`,
      briefing: item.briefing,
      decision: item.decision,
    }
  })
}

export function advanceTurn(game: GameState, draft?: TurnResolutionDraft): GameState {
  const settled = applyResolutionDraft(game, draft)
  const seed = `${settled.seed}-turn-${settled.turn.number + 1}`
  const rng = createRng(seed)
  const freshAgenda = makeAgenda(seed, rng, settled.ministers)

  // 上回合留中的奏目以更高 severity 重新出现，挤掉新奏目
  const heldItems = settled.currentCourt.agenda.filter((a) => a.status === 'held')
  const returnedItems = heldAgendaToNextTurn(heldItems, seed)

  // 数值危机触发强制 crisis 奏目
  const crisisItem = buildCrisisAgenda(settled.metrics, seed, settled.ministers, returnedItems)

  const agenda = (() => {
    const forced = [...returnedItems, ...(crisisItem ? [crisisItem] : [])]
    return [...forced, ...freshAgenda].slice(0, 3)
  })()

  // 留中的大臣在记忆里记下这件事，同时快照本回合 standing 供趋势展示
  const ministersWithHeldMemory = settled.ministers.map((m) => {
    const wasPresenter = heldItems.some((a) => a.presenterId === m.id)
    return {
      ...m,
      previousStanding: { favor: m.standing.favor, pressure: m.standing.pressure },
      memory: wasPresenter
        ? [...m.memory, `奏疏《${heldItems.find((a) => a.presenterId === m.id)?.title}》被皇帝留中，悬而未决。`].slice(-8)
        : m.memory,
    }
  })

  const day = settled.calendar.day === 28 ? 1 : settled.calendar.day + 1
  const month = settled.calendar.day === 28 ? (settled.calendar.month % 12) + 1 : settled.calendar.month
  const summaryText = draft?.summary ?? [
    settled.turn.usedActions.court ? '朝会上诸臣已各自记下圣意' : '今日未开大朝，外廷只能猜测御前风向',
    settled.turn.usedActions.intel ? '密查线索正在发酵' : '锦衣卫未得新差',
    settled.turn.usedActions.private ? '御书房召见改变了私下亲疏' : '无人得单独入见',
    settled.turn.usedActions.briefing ? '御前账册已重新归拢' : '案头仍有几件事未整理',
    heldItems.length ? `${heldItems.map((a) => `《${a.title}》`).join('、')}留而未决，下回合将重提。` : '',
  ].filter(Boolean).join('；') + '。'
  const summary: CourtSummary = {
    id: `${settled.id}-summary-${settled.summaries.length}`,
    title: `第${settled.turn.number}回合结算`,
    day: dateLabel(settled),
    summary: summaryText,
  }

  return {
    ...settled,
    phase: 'court',
    ministers: ministersWithHeldMemory,
    calendar: {
      ...settled.calendar,
      day,
      month,
      audienceNumber: settled.calendar.audienceNumber + 1,
    },
    turn: {
      ...defaultTurn(settled.turn.number + 1),
      pendingEvents: draft?.newPendingEvents ?? [`上一回合：${summaryText}`],
      lastResolution: summaryText,
    },
    currentCourt: makeOpeningCourt(seed, ministersWithHeldMemory, agenda, settled.turn.number + 1),
    summaries: [summary, ...settled.summaries].slice(0, 12),
    updatedAt: now(),
  }
}

export function beginNextAudience(game: GameState): GameState {
  return advanceTurn(game)
}

export function replaceAudienceAgenda(game: GameState, drafts: Array<Omit<AgendaItem, 'id' | 'status'>>): GameState {
  const agenda = drafts.slice(0, 3).map((draft, index) => ({
    ...draft,
    id: createId(`${game.seed}-ai-${game.calendar.audienceNumber}`, 'agenda', index),
    presenterId: game.ministers.some((minister) => minister.id === draft.presenterId)
      ? draft.presenterId
      : game.ministers[index % game.ministers.length].id,
    status: 'open' as const,
  }))

  if (agenda.length !== 3) {
    return game
  }

  return {
    ...game,
    currentCourt: makeOpeningCourt(
      `${game.seed}-ai-${game.calendar.audienceNumber}`,
      game.ministers,
      agenda,
    ),
    updatedAt: now(),
  }
}

export function generateNewCourt(seed = `court-${Date.now().toString(36)}`): GameState {
  const rng = createRng(seed)
  const usedNames = new Set<string>()
  const ministers = offices.map((office, index) => makeMinister(seed, rng, office, index, usedNames))
  const agenda = makeAgenda(seed, rng, ministers)

  return {
    id: createId(seed, 'save', 0),
    seed,
    version: currentGameVersion,
    dynasty: {
      name: `${choose(dynastyNames, rng)}朝`,
      reignTitle: choose(reignTitles, rng),
      courtStyle: choose(courtStyles, rng),
      openingSituation: choose(openings, rng),
    },
    calendar: {
      year: 1,
      month: range(rng, 1, 4),
      day: range(rng, 2, 18),
      audienceNumber: 1,
    },
    phase: 'court',
    turn: defaultTurn(1),
    metrics: {
      treasury: range(rng, 42, 72),
      people: range(rng, 48, 76),
      army: range(rng, 44, 78),
      authority: range(rng, 38, 70),
      bureaucracy: range(rng, 42, 74),
      border: range(rng, 52, 82),
      faction: range(rng, 24, 58),
    },
    ministers,
    currentCourt: makeOpeningCourt(seed, ministers, agenda),
    edicts: [],
    investigations: [],
    summaries: [],
    pendingNotes: ['这批重臣初见都很体面，体面底下的算盘还得慢慢看。'],
    updatedAt: now(),
  }
}

export function normalizeGameState(game: GameState): GameState {
  return {
    ...game,
    version: currentGameVersion,
    turn: normalizeTurn(game),
    phase: (game.phase ?? game.turn?.scene ?? 'court') as SceneMode,
    ministers: game.ministers.map((minister, index) =>
      normalizeMinister({
        ...minister,
        portraitKey: minister.portraitKey ?? `minister-${index % 9}`,
      }),
    ),
    currentCourt: {
      ...game.currentCourt,
      imperialEffects: game.currentCourt.imperialEffects ?? [],
      transcript: game.currentCourt.transcript.map((entry) => ({
        ...entry,
        effects: entry.effects ?? [],
      })),
    },
  }
}
