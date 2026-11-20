# AI Literacy Check

A two-task assessment of how secondary-school students (aged 14–16) work with AI. Students complete a humanities essay and a science recommendation with an AI collaborator. The report shows what the record demonstrates about using AI **effectively**, **critically** and **responsibly**, with a quotation behind every judgement.

Built for Cambridge EduX 2026 (Challenge 01) and Reply Student Tech Clash, **AI on Campus · Track A**.

## The activity

| Step | Task | AI available |
| --- | --- | --- |
| 1 | **Dramatic Moments** · write an independent first draft responding to a short prompt about why people prefer dramatic discovery stories | No |
| 2 | Discuss the draft with the AI, then submit a revised essay | Yes |
| 3 | **Choosing a Wind Farm Site** · recommend one of four UK regions for a year-long wind survey, using a field notebook (7 daily station readings), a windmill voltage test and the full station log | Yes |
| 4 | Read the feedback report | — |

The science pack contains two built-in judgement points. The region with the highest single reading is not the most dependable on ordinary days, and the windmill test reports voltage, which cannot establish power or annual energy.

## How assessment works

Two AI roles are kept separate.

- **Collaborator** (`src/lib/assessment-personas.ts`) helps during the tasks. It offers suggestions and alternative views, leaves decisions to the student, does not reveal the rubric and does not remind students to fact-check unprompted.
- **Assessor** runs once after both tasks. It receives the student's drafts, both numbered transcripts, the rubric and **reference facts** computed by the server from the wind data. The collaborator never sees these facts.

Scoring then runs in three layers. The model identifies evidence, the server verifies it, and fixed rules produce the levels.

1. **Evidence identification** (`src/app/api/assessment/[id]/feedback/route.ts`). The assessor returns structured items in a JSON schema. Each item gives a task, an exact quotation, its source, an outcome (`met`, `partial`, `missed` or `insufficient`), a reason and a next step. It never returns points.
2. **Server verification** (`src/lib/assessment-evidence.ts`). An item is kept only if its quotation appears verbatim in the cited source. Effective must cite the final submission. A Critical essay item must pair a revised passage with the matching first-draft passage. A Responsible item must link to a complete earlier AI statement and name the material checked. The server also confirms who started the check. One student action supports only one process dimension.
3. **Levels and score** (`src/lib/assessment-scoring.ts`). Each task gets its own level: Great, Fair, Need Work or Not enough evidence. Two task levels are averaged and rounded down. Missing evidence in one task never lowers the other. A Responsible check counts as Great only when the student started it.

| Dimension | Evidence it looks for |
| --- | --- |
| Effective | Quality of the final work: a reasoned argument with an example; a site comparison that interprets the measurements accurately |
| Critical | Accepting, qualifying or rejecting a specific AI suggestion with a reason |
| Responsible | Checking a specific AI claim against the supplied materials. Essays rarely contain checkable claims, so this dimension usually rests on the science task |
| Bonus · Managing AI | Giving the AI a specific requirement, context or correction |

The provisional score maps Great, Fair and Need Work to 100, 60 and 20. It averages the core dimensions that have evidence and needs at least two. A Bonus at Great adds 5 points, up to 100. **This scale is provisional and pending academic calibration.** A dimension whose level rests on one verified item is marked **Single observation**. It still counts towards the score, but one observation cannot show a consistent pattern.

Saved reports are cached, so the same work always shows the same feedback. Reports saved under earlier rules can be re-scored from the report page.

## Run locally

Use **Node.js 22.13 or later** for built-in SQLite. From the repository root:

```sh
npm install
cp -n .env.example .env.local
```

Set `ANTHROPIC_API_KEY` in `.env.local` for live chat and feedback. `CHAT_MODEL` selects the model, `claude-haiku-5-5` by default. Then start the app and open http://localhost:3000:

```sh
npm run dev
```

Run `npm test` and `npm run typecheck` to check a change.

## Repository map

| Path | Contents |
| --- | --- |
| `src/app/page.tsx`, `src/app/assessment/[id]/` | Landing page, two-task workspace, chat and report (`Factors.tsx`) |
| `src/app/api/assessment/` | Create an activity, chat and submit (`[id]/route.ts`), generate feedback (`[id]/feedback/route.ts`) |
| `src/lib/assessment-*.ts` | Personas, evidence schema and verification, scoring rules |
| `src/lib/science-materials.ts`, `src/lib/wind-log.ts`, `src/lib/wind-pack.json`, `public/wind/` | Science materials and the reference facts computed from them |
| `src/lib/store.ts` | SQLite storage with version checks, so two tabs cannot overwrite each other |
| `docs/`, `supporting paper/` | Design notes and literature |

## Data and privacy

The app uses Next.js, TypeScript, SQLite and the Anthropic API. Student text is redacted for personal information before it reaches the model, and drafts are passed as content to discuss, not as instructions.

## Earlier activity

The repository still contains the earlier one-paragraph briefing activity: `src/app/s/`, `src/app/api/sessions/`, the teacher dashboard at `/ops`, `src/lib/scoring.ts`, `collaboration.ts`, `model-assessment.ts` and `data/scenario.json`. The landing page no longer links to it. Documents `docs/01`–`05` describe that activity. [`docs/06_unified_assessment_model.md`](docs/06_unified_assessment_model.md) is a draft for a future model and is not yet implemented.
