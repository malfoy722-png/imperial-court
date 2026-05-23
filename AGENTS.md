# AGENTS.md

## Project Goal

`上朝了` is a desktop-first AI court-audience sandbox game. The player is the emperor in a fictional dynasty, facing twelve core ministers and a background court. The first playable goal is not a hard survival simulator; it should feel like a relaxed but immersive emperor-at-work game: ministers argue, evade, gossip, expose clues, and the player listens before making final decisions.

The game should never collapse into a plain chat window. The first screen must feel like court is in session: hall stage, minister placards, agenda list, transcript, simple decision buttons, and a side dossier.

## Tech Stack

- Electron + React + TypeScript + Vite
- SQLite through `sql.js` in the Electron main process
- Zod schemas for AI response validation and state safety
- Lucide icons for UI controls
- 2D layered stage; do not introduce 3D unless the product direction changes

Useful scripts:

```bash
npm run dev:desktop
npm test
npm run lint
npm run build
```

After frontend or Electron changes, run the relevant checks. For substantial UI changes, start `npm run dev:desktop` and verify the actual desktop window.

## Important Files

- `src/App.tsx`: main React UI and interaction flow.
- `src/App.css`: court stage, transcript, side rail, and responsive layout.
- `src/game/types.ts`: durable game contracts. Keep these stable and explicit.
- `src/game/engine.ts`: deterministic game state engine, agenda progression, offline fallback, state patch application, investigations, summaries.
- `src/game/schema.ts`: Zod validation and AI patch constraints.
- `src/game/ai.ts`: renderer-side bridge to desktop AI calls.
- `src/game/storage.ts`: save/settings/log abstraction for desktop and browser fallback.
- `electron/main.mjs`: SQLite persistence, MiniMax calls, AI director prompts, IPC handlers.
- `electron/preload.cjs`: safe `window.courtDesktop` bridge.
- `public/assets/court-hall.png`: current court hall background.

## Product Rules

### Court Interaction

- Clicking a minister selects that minister. The next player utterance is addressed to that minister.
- If no minister is selected, the player is speaking to the whole court.
- When a minister is selected, that minister must answer first. Other ministers may then interject.
- When the whole court is addressed, 2 to 4 relevant ministers should speak in sequence. Do not replace this with a single atmosphere paragraph.
- The emperor/player should not need many controls. Preserve the low-click flow: free text plus a few decision buttons.
- The player makes final decisions. AI may suggest consequences, reactions, clues, and follow-up pressure, but must not secretly approve policies on behalf of the emperor.

### Agenda Flow

- Each audience has three agenda items.
- Each agenda item should be clear at a glance:
  - `title`: direct issue
  - `summary`: who reports what conflict
  - `briefing`: background
  - `decision`: what the emperor needs to decide
- When the player resolves or holds the current item (`approve`, `reject`, `hold`, `assign`, `reconsider`, `appoint`), automatically move to the next open agenda item.
- Present each agenda with ritual. Current first-pass convention: `鸿胪寺` announces the next official and agenda. This is intentionally closer to historical court-audience ceremony than making `司礼监` handle every announcement.

### Transcript and Dossiers

- Transcript entries are selectable.
- Selecting a minister line should select that minister and open their dossier on the right.
- Selecting non-minister lines such as `朕` or `鸿胪寺` should show the current court/agenda dossier.
- Keep recent transcript visible without covering minister placards.

### Side Tabs

- `群臣`: selected minister dossier, or current court/agenda if no minister is selected.
- `密报`: investigations, verified clues, and held/pending matters.
- `旨意`: durable edicts created by explicit player decisions.
- `朝录`: post-audience summaries after retiring to the study phase.
- `模型`: MiniMax settings only; keep it understandable but do not make normal play depend on this tab.

## AI Architecture

The deterministic engine owns truth. AI returns narration, minister speeches, clues, and proposed state patches. State changes must pass validation before becoming durable game state.

Main AI entry points:

- `generateAudienceAgenda(gameState)` via `court:generate-agenda`
- `advanceCourtScene(gameState, action)` via `court:advance-scene`

Current MiniMax defaults:

- Director model: `MiniMax-M2.7`
- Role model: `M2-her`
- If `M2-her` is unavailable for the current token plan, cache that failure in-process and skip repeated doomed role calls. Let the director model carry the scene instead.

MiniMax compatibility notes:

- Use user-role prompts rather than OpenAI-style `system` messages.
- Strip or split model thinking. `reasoning_split: true` is currently sent in the main request body.
- Never show `<think>` or reasoning text in the player transcript.
- Parse and validate JSON. If a structured response is malformed, try one repair call; if still bad, fall back cleanly.
- If MiniMax returns rate-limit or plan-limit errors, surface a short readable notice and preserve the save.

## State Safety

- `GameState` is the source of truth. Do not let chat history become state.
- `constrainPatchForAction` must continue preventing normal speech from creating edicts or metric changes.
- Explicit decision actions may create edicts and metric changes.
- Hidden minister traits must not be shown directly in public dossiers. Reveal them through `revealedFacts` as `hint` or `verified`.
- API failure must not corrupt saves.

## UI Taste

- This is a game/tool, not a landing page.
- Keep the main screen playable immediately.
- Use subdued court colors, readable Chinese text, and stable dimensions.
- Do not add decorative clutter that competes with the court stage.
- Do not use portraits unless a coherent art direction is available; current minister placards are intentionally text-first.
- Avoid adding more player controls unless they clearly reduce friction.

## Current Known Issues

- MiniMax `M2-her` may be unavailable on the user's token plan. The game must remain playable through `MiniMax-M2.7` or offline fallback.
- `MiniMax-M2.7` can be slow for multi-minister turns. Keep prompts concise and token budgets reasonable.
- AI agenda generation can occasionally return invalid structured data. The current flow repairs or falls back; preserve that behavior.
- Electron may print cache directory warnings in development. They have not blocked gameplay.

## Development Guidance

- Prefer local patterns over new abstractions.
- Use `rg` for search.
- Use `apply_patch` for manual edits.
- Do not remove user data or reset saves unless explicitly asked.
- Keep edits scoped to the requested behavior.
- Add focused tests for state engine changes, especially agenda status, state patch safety, and hidden-trait leakage.
- For UI changes, verify that common desktop window sizes still keep the twelve minister placards, transcript, input, and side rail usable.

