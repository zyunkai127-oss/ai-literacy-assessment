import { useEffect, useState } from 'react';
import { criteria, coreDimensions, hasCurrentScoring, scoringVersion, provisionalScheme, provisionalScore, rubricDimensions, strengthScheme, type Dimension, type EvidenceFeedback, type EvidenceItem } from '@/lib/assessment-scoring';
import { dimensions, type Ratings } from '@/lib/secondary';

const formatNumber = (value: number) => new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(value);
const percent = (value: number) => Math.round(value * 100) + '%';
const plain = (text: string) => text.replace(/\*\*|__|`/g, '');
const levelStyle = { Great: 'supported', Fair: 'insufficient', 'Need Work': 'practise', 'Not enough evidence': 'neutral' };
const taskLabel = { essay: 'Humanities · Dramatic Moments', science: 'Science · Choosing a Wind Farm Site' };
const observations = { met: 'Positive', partial: 'Positive · Partly demonstrated', missed: 'Negative', insufficient: 'Insufficient' };
const verificationLabels = {
  student_initiated: 'You initiated the source check',
  after_ai_reminder: 'You checked after an AI reminder',
  ai_reliance: 'AI result',
  unclear_initiator: 'Source check · Initiator unclear',
};

function Evidence({ item, dimension, showScoreImpact }: { item: EvidenceItem; dimension: Dimension; showScoreImpact: boolean }) {
  return <li className="assessment-evidence">
    <h4>{taskLabel[item.task]} <span>· {observations[item.outcome]}</span></h4>
    {item.firstDraftQuote && <figure><blockquote>{item.firstDraftQuote}</blockquote><figcaption>Essay · First draft</figcaption></figure>}
    {item.quote !== null && <figure><blockquote>{item.quote}</blockquote><figcaption>{item.sourceLabel}</figcaption></figure>}
    <dl>
      {item.verification && <div>
        <dt>Verification</dt>
        <dd>{verificationLabels[item.verification.kind]}
          {item.verification.material && item.verification.material !== item.quote && <> · {item.verification.material}</>}
          {item.verification.claim && <figure>
            <blockquote>{plain(item.verification.claim.quote)}</blockquote>
            <figcaption>AI claim · Message {item.verification.claim.message}</figcaption>
          </figure>}
          {item.verification.reminder && <figure>
            <blockquote>{plain(item.verification.reminder.quote)}</blockquote>
            <figcaption>AI reminder · Message {item.verification.reminder.message}</figcaption>
          </figure>}
        </dd>
      </div>}
      <div><dt>Criterion</dt><dd>{criteria[dimension][item.task]}</dd></div>
      <div><dt>Reason</dt><dd>{item.reason}</dd></div>
      {showScoreImpact && <div><dt>Score impact</dt><dd>{item.outcome === 'insufficient'
        ? 'No points assigned for this item.'
        : dimension === 'bonus'
          ? 'Supports the bonus rating. The bonus is applied once, subject to the overall cap.'
          : item.outcome === 'met' && dimension === 'responsible' && item.verification?.kind !== 'student_initiated'
            ? 'Counts as Fair for this task, because the record does not show that you started this check yourself.'
          : item.outcome === 'met'
            ? 'Supports Great for this task when all its assessed items meet the criteria.'
            : item.outcome === 'missed'
              ? 'Leads to Need Work when no assessed item fully meets the criterion.'
              : 'Counts as partial evidence. The dimension rating considers all verified items.'}</dd></div>}
      <div><dt>Try next</dt><dd>{item.improvement}</dd></div>
    </dl>
  </li>;
}

export function Factors({ url, saved, legacy }: { url: string; saved?: EvidenceFeedback; legacy?: Ratings }) {
  const [feedback, setFeedback] = useState(saved);
  const [error, setError] = useState(false);
  const [attempt, retry] = useState(0);
  const [regenerate, setRegenerate] = useState(false);
  const [loading, setLoading] = useState(!saved && !legacy);
  useEffect(() => {
    if (!regenerate && (saved || legacy)) return;
    let active = true;
    const options: RequestInit = regenerate
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ regenerate: true }) }
      : { method: 'POST' };
    fetch(url + '/feedback', options).then(async res => {
      if (!res.ok) throw Error();
      const next: EvidenceFeedback = await res.json();
      if (active) setFeedback(next);
    }).catch(() => {
      if (active) setError(true);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [url, saved, legacy, regenerate, attempt]);

  function requestFeedback(useCurrentRules: boolean) {
    setError(false);
    setLoading(true);
    setRegenerate(useCurrentRules);
    retry(attempt => attempt + 1);
  }

  const score = feedback && hasCurrentScoring(feedback) ? provisionalScore(feedback) : null;
  const singleItems = score ? coreDimensions.filter(key => score.results[key].singleEvidenceItem) : [];
  const savedLegacy = !feedback && !!legacy;
  const savedUnversioned = !!feedback && !hasCurrentScoring(feedback);
  const savedReport = savedLegacy || savedUnversioned;
  const canRegenerate = savedReport;
  return <>
    <section className="assessment-score" aria-labelledby="score-title">
      <div>
        <h2 id="score-title">{savedReport ? 'Saved report' : 'Provisional final score'}</h2>
        {savedReport ? <p>Original feedback retained. A score under current rules requires explicit re-assessment.</p> : <p className="assessment-score-value" role="status">
          {score ? (score.total === null ? 'Insufficient evidence' : new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(score.total) + '%') : error ? 'Unavailable' : 'Reviewing your work…'}
        </p>}
        {feedback && <p>Evidence schema · {feedback.schema} · Scoring rules · {feedback.scoringVersion === undefined ? 'Unversioned' : `Version ${feedback.scoringVersion}`}</p>}
        {savedUnversioned && <p>The original numeric score was not stored separately. It cannot be safely reconstructed under current rules.</p>}
        {savedReport && <p>Re-assessment uses your saved work to generate new verified feedback with scoring version {scoringVersion}. It replaces the saved evidence report only after success and may change the feedback and score.</p>}
        {feedback?.runs && <p>{feedback.runs.valid > 1
          ? `Based on ${feedback.runs.valid} model reviews of the same record; agreement is not independent student evidence.`
          : `Based on 1 model review of ${feedback.runs.requested} requested.`}</p>}
        {score && <p>Evidence coverage · {score.assessed} of {coreDimensions.length} core dimensions assessed</p>}
        {score && singleItems.length > 0 && <p>Single verified evidence item · {singleItems.map(key => dimensions[key]).join(', ')}</p>}
        {score && score.levels.bonus === 'Great' && <p>{score.total === null
          ? 'Bonus earned. An overall score requires more core evidence.'
          : score.bonusApplied > 0
            ? `Bonus applied · +${formatNumber(score.bonusApplied)} points, up to the ${provisionalScheme.cap}% cap`
            : `Bonus earned · The score is already at the ${provisionalScheme.cap}% cap`}</p>}
        {canRegenerate && <button type="button" disabled={loading} onClick={() => requestFeedback(true)}>
          {loading ? 'Generating updated feedback…' : 'Re-assess with current rules'}
        </button>}
        {error && <p role="alert">Feedback is temporarily unavailable.
          {!canRegenerate && <button type="button" onClick={() => requestFeedback(false)}>Try again</button>}
        </p>}
      </div>
      {!savedReport && <details className="assessment-formula">
        <summary>How the provisional score works</summary>
        <p>Great {provisionalScheme.points.Great} · Fair {provisionalScheme.points.Fair} · Need Work {provisionalScheme.points['Need Work']}</p>
        <p>Each task gets its own level first. A dimension's points are the average of its task points, without rounding. When the two task levels differ, both are shown, such as Fair–Great at 80 points. One task without evidence does not lower the other.</p>
        <p>We average core dimensions with evidence. At least {provisionalScheme.minimumCoreDimensions} are required. Great in Bonus adds {provisionalScheme.bonus} points, up to {provisionalScheme.cap}% overall.</p>
        <p>Dimensions with insufficient evidence are excluded from the average. This scale is pending academic calibration.</p>
        <p>Coverage counts Verified Evidence Items, not distinct behaviours or independent assessment opportunities. One item cannot establish a consistent pattern. Different quotations can describe the same decision.</p>
      </details>}
    </section>
    {(feedback || legacy) && <section className="report-factors"><h2>{score ? 'Dimension breakdown' : 'Previously saved feedback'}</h2>
      {rubricDimensions.map(key => {
        const row = !feedback ? legacy?.[key] : undefined;
        const level = score?.levels[key] ?? row?.level;
        const range = score?.results[key].range;
        const points = score && key !== 'bonus' ? score.results[key].points : null;
        const strength = score?.results[key].strength;
        const single = !!score && key !== 'bonus' && score.results[key].singleEvidenceItem;
        return <details key={key} className="report-factor">
          <summary><span>{dimensions[key]}</span><span className="factor-badges"><span className={'factor-status ' + (level ? levelStyle[level] : 'neutral')}>
            {range ? range.join('–') : level ?? 'Unavailable'}{points !== null ? ` · ${formatNumber(points)} points` : ''}
          </span>{single && <span className="factor-status neutral">Single evidence item</span>}</span></summary>
          <div className="factor-detail">
            {score && <>
              <dl className="factor-task-scores">
                {(['essay', 'science'] as const).map(task => {
                  const level = score.results[key].tasks[task];
                  const value = key === 'bonus' ? null : provisionalScheme.points[level];
                  return <div key={task}><dt>{taskLabel[task]}</dt><dd>{level}{value !== null ? ` — ${value}/100` : ''}</dd></div>;
                })}
                {key !== 'bonus' && <div><dt>Combined</dt><dd>{points === null ? 'Not enough evidence' : `${formatNumber(points)}/100`}</dd></div>}
              </dl>
              <p>{key === 'bonus' ? 'Great in either task earns one bonus, subject to the overall cap.'
                : score.results[key].observedTasks.length === 2 ? 'Average of the two observed task scores.'
                : score.results[key].observedTasks.length === 1 ? 'Uses the one assessed task only. The other task has insufficient evidence and is excluded.'
                : 'Neither task has enough evidence to assign points.'}</p>
              <p>Verified Evidence Items · {score.results[key].verifiedEvidenceItems} · Tasks with evidence · {score.results[key].observedTasks.length}/2</p>
            </>}
            {range && <p className="factor-note">Performance differs across tasks. The combined score retains both task scores; the displayed band is the highest threshold reached by that average.</p>}
            {strength && <div className="factor-note">
              <p>Exploratory Evidence Indicator · Based on {strength.n} task {strength.n === 1 ? 'summary' : 'summaries'}. Limited evidence; tasks may be correlated. This is not a validated probability of AI literacy ability and does not affect your score.</p>
              <details className="assessment-methodology"><summary>Indicator methodology and limitations</summary>
                <p>Each task contributes at most one summary: Great = 1, Fair = {strengthScheme.partialCredit}, Need Work = 0. Additional quotations within a task never increase the sample size. Task summaries are not proven independent opportunities.</p>
                <p>For n task summaries and credit sum s, the descriptive model is Beta(s + {strengthScheme.prior}, n − s + {strengthScheme.prior}). Fair uses heuristic fractional credit, rather than a binary trial. The {percent(strengthScheme.credibility)} equal-tailed model interval assumes a common rate and independence, which these tasks do not establish.</p>
                <p>Model mean {formatNumber(strength.mean)} · Model interval {formatNumber(strength.interval[0])}–{formatNumber(strength.interval[1])} on a 0–1 scale{strength.wide ? ' · Wide interval' : ''}. At most two task summaries are available. These values describe the selected evidence under unvalidated assumptions; they cannot establish ability or generalise to future performance.</p>
              </details>
            </div>}
            {single && <p className="factor-note">This level rests on one verified evidence item from {taskLabel[score.results[key].observedTasks[0]]}. Treat it as an indication, not a consistent pattern.</p>}
            {feedback ? <ul className="assessment-evidence-list">{feedback.evidence[key].map((item, index) =>
              <Evidence key={index} dimension={key} item={item} showScoreImpact={!!score} />)}</ul>
              : row && <><p>{row.comment}</p>{Object.entries(row.tasks ?? {}).map(([task, item]) =>
                <section key={task}><h3>{taskLabel[task as keyof typeof taskLabel]}</h3><p>{item.detail}</p>
                  {item.draftQuote && item.revisionQuote ? <>
                    <h4>First draft</h4><blockquote>{item.draftQuote}</blockquote>
                    <h4>Revised draft</h4><blockquote>{item.revisionQuote}</blockquote>
                  </> : item.quote && <blockquote>{item.quote}</blockquote>}
                </section>)}{row.next && <><h3>Next time</h3><p>{row.next}</p></>}</>}
          </div>
        </details>;
      })}
    </section>}
  </>;
}
