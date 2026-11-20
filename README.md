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

1. **Evidence identification** (`src/app/api/assessment/[id]/feedback/route.ts`). By default, three separate model runs return structured items in a JSON schema. Each item gives a task, an exact quotation, its source, an outcome (`met`, `partial`, `missed` or `insufficient`), a reason and a next step. It never returns points.
2. **Server verification and consensus** (`src/lib/assessment-evidence.ts`). An item is kept only if its quotation appears verbatim in the cited source. Effective must cite the final submission. A Critical essay revision item must pair exact revised and first-draft passages; a chat item reports discussion evidence only. Semantic correspondence between passages remains model-assessed. A Responsible item must link to a complete earlier AI statement and name the material checked. The server validates cited assistant claims and reminders, but whether a passage describes a real check and who initiated it still depends partly on model interpretation and student self-report. Overlapping passages are not reused across process dimensions within a task; this cannot reliably identify every repeated decision.
3. **Levels and score** (`src/lib/assessment-scoring.ts`). Each task gets its own level: Great, Fair, Need Work or Not enough evidence. A dimension's points are the average of its task points, without rounding, so Great with Fair gives 80 and is shown as Fair–Great. Missing evidence in one task never lowers the other. A Responsible check counts as Great only when the student started it.

Each run is verified separately. A task level needs agreement from at least two valid runs, with no competing level also supported by two runs. Conflicting pairs receive no level. After cross-dimension deduplication, evidence must still support the agreed level; otherwise that task becomes insufficient rather than silently changing level. A single valid run is labelled as such. Repeated model reviews of the same record are not independent observations of a student.

The server checks up to four candidates per task and dimension and keeps up to two scored items (one decision for Humanities Critical). Rejected candidates and insufficient-evidence notes do not use scored slots. Verified items retain server-derived source IDs and exact character spans. An arbitrary model-generated observation ID is never proof of independence.

| Dimension | Evidence it looks for |
| --- | --- |
| Effective | Quality of the final work: a reasoned argument with an example; a site comparison that interprets the measurements accurately |
| Critical | Accepting, qualifying or rejecting a specific AI suggestion with a reason |
| Responsible | Checking a specific AI claim against the supplied materials. Essays rarely contain checkable claims, so this dimension usually rests on the science task |
| Bonus · Managing AI | Giving the AI a specific requirement, context or correction |

The provisional score maps Great, Fair and Need Work to 100, 60 and 20. It averages the core dimensions that have evidence and needs at least two. A Bonus at Great adds 5 points, up to 100. **This scale is provisional and pending academic calibration.**

Coverage is labelled **Verified Evidence Items**, with the number of tasks represented. It does not count distinct behaviours or independent assessment opportunities. A single item is flagged. Different non-overlapping quotations can describe one decision; automatic passage deduplication cannot resolve this reliably. The deterministic task rubric uses the set of outcomes, not the number of times an outcome appears, so repeated praise does not increase its weight. Contradictory evidence can change a task level. Great + Fair = 80, Fair + Need Work = 40, Great + Need Work = 60; no evidence = null. The mappings, bonus, cap and minimum coverage live in `provisionalScheme` for later calibration.

Each core dimension shows an **Exploratory Evidence Indicator**, separate from the final score. Each assessed task contributes at most one summary (Great = 1, Fair = 0.5, Need Work = 0); extra quotations do not increase n. With credit sum s and n task summaries, a descriptive Beta(s + 0.5, n − s + 0.5) model gives a mean and a 90% equal-tailed interval. Its numeric details appear only in an expandable methodology section. The [Beta mean and numerical quantile definitions](https://www.itl.nist.gov/div898/handbook/eda/section3/eda366h.htm) do not establish the validity of this assessment model. Half credit is a heuristic fractional likelihood, not a binary trial. With at most two potentially correlated task summaries, independence and a common rate are unverified. **This is not a validated probability of a student's AI literacy ability**, and it never changes the provisional score.

### Versions and saved reports

Evidence data, scoring rules and displayed results are separate: `schema` identifies the evidence format (currently 4), `scoringVersion` identifies the deterministic algorithm (currently 1), and the UI derives points only for a supported combination. Changes to mappings or aggregation rules must bump `scoringVersion`; evidence format changes must bump `evidenceVersion` independently.

Reports are cached in SQLite. Old schema 1/2/3 feedback, unversioned feedback and unsupported scoring versions remain readable, without silently computing a new score. Earlier numeric totals were not stored separately, and unversioned schema 2 was used with different aggregation rules; the original score cannot safely be reconstructed. Legacy ratings are displayed as saved. **Re-assess with current rules** explicitly requests fresh model evidence from the saved work and applies current scoring. This may change evidence and results; only a successful response replaces the saved evidence report. It requires provider credentials. Failed requests leave the saved report intact. No automatic migration or re-assessment occurs on load.

## Run locally

Use **Node.js 22.13 or later** for built-in SQLite. From the repository root:

```sh
npm install
cp -n .env.example .env.local
```

Set `ANTHROPIC_API_KEY` in `.env.local` for live chat and feedback. `CHAT_MODEL` selects the model, `claude-haiku-5-5` by default. `ASSESSOR_RUNS` sets 1–5 model runs per report (default 3); more runs cost more and do not establish assessment validity. Then start the app and open http://localhost:3000:

```sh
npm run dev
```

Run `npm run typecheck`, `npm test` and `npm run build` to check a change (use `npm.cmd` on Windows).

## Repository map

| Path | Contents |
| --- | --- |
| `src/app/page.tsx`, `src/app/assessment/[id]/` | Landing page, two-task workspace, chat and report (`Factors.tsx`) |
| `src/app/api/assessment/` | Create an activity, chat and submit (`[id]/route.ts`), generate feedback (`[id]/feedback/route.ts`) |
| `src/lib/assessment-*.ts`, `src/lib/beta.ts` | Personas, evidence schema and verification, scoring rules, Beta intervals |
| `src/lib/science-materials.ts`, `src/lib/wind-log.ts`, `src/lib/wind-pack.json`, `public/wind/` | Science materials and the reference facts computed from them |
| `src/lib/store.ts` | SQLite storage with version checks, so two tabs cannot overwrite each other |
| `docs/`, `supporting paper/` | Design notes and literature |

## Data and privacy

The app uses Next.js, TypeScript, SQLite and the Anthropic API. The two-task route saves drafts, submissions, chat transcripts and feedback in SQLite (`DB_PATH`, default `data/app.db`). In-progress work also uses browser session storage. These stored texts are not automatically redacted. Finish returns to the home page; Test Again starts another activity. Neither action deletes the previous record, and there is no automatic retention/deletion policy.

Before model calls, `toApiMessages` applies regex-based redaction for email addresses, phone-like numbers and the earlier scenario's configured names. This is not comprehensive anonymisation: other names, identifiers and sensitive context may remain. Redaction can also alter benign numbers or quoted text; altered quotations fail exact verification against the stored source. Drafts and transcripts are sent to Anthropic for feedback; live chat includes task context, saved chat and current work. Drafts are supplied as content with instructions to treat them as untrusted, but this is not a guarantee against prompt injection.

New two-task activities require the original browser cookie as well as the activity link. The server stores only a hash of the cookie token. The per-activity cookie is HttpOnly, SameSite=Strict and expires after 30 days. Use HTTPS for shared deployments. Clearing cookies or switching browsers removes access; there is no account recovery. Cookie expiry does not delete data. The separate earlier briefing routes and operations dashboard have their own access models.

Reports created before browser ownership carry no owner token and remain in the database. To inspect or re-assess them, run a private development server on loopback with a copy of the database and `ALLOW_LOCAL_LEGACY_ASSESSMENTS=1` (for example, `npm run dev -- --hostname 127.0.0.1`). Legacy access is off by default and unavailable in production. Use synthetic data for public demos. Before identifiable student use, decide who can access records, how recovery and retention work, and how the provider handles student data. Keep provider credentials server-side in ignored `.env.local`.

## Academic calibration

The current interpretation is formative feedback for these two tasks. To calibrate it, first freeze the rubric, score mapping, task materials and model configuration. Collect a pilot dataset under an approved data-handling protocol. Have two trained educators independently annotate the exact evidence and score each task and dimension without seeing the model results, then adjudicate disagreements. Record insufficient evidence separately from the ordinal performance levels.

Compare human–human and model–human agreement by task and dimension. Report evidence coverage, confusion matrices, exact agreement and weighted kappa with uncertainty intervals, and inspect the causes of disagreements and abstentions. Check that rubric judgments transfer to a second set of tasks and examine whether writing fluency or differences in task opportunity drive apparent performance. Use one set of cases for rubric or weight adjustments and a separate set to evaluate the locked changes. The Beta indicator remains exploratory throughout. See the [AERA, APA and NCME testing standards](https://www.testingstandards.net/).

## Earlier activity

The repository still contains the earlier one-paragraph briefing activity: `src/app/s/`, `src/app/api/sessions/`, the teacher dashboard at `/ops`, `src/lib/scoring.ts`, `collaboration.ts`, `model-assessment.ts` and `data/scenario.json`. The landing page no longer links to it. Documents `docs/01`–`05` describe that activity. [`docs/06_unified_assessment_model.md`](docs/06_unified_assessment_model.md) is a draft for a future model and is not yet implemented.
