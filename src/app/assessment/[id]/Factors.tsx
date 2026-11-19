import { useEffect, useState } from 'react';
import { criteria, coreDimensions, evidenceVersion, provisionalScheme, provisionalScore, rubricDimensions, type Dimension, type EvidenceFeedback, type EvidenceItem } from '@/lib/assessment-scoring';
import { dimensions, type Ratings } from '@/lib/secondary';

const levelStyle = { Great: 'supported', Fair: 'insufficient', 'Need Work': 'practise', 'Not enough evidence': 'neutral' };
const taskLabel = { essay: 'Dramatic Moments', science: 'Choosing a Wind Farm Site' };
const observations = { met: 'Positive', partial: 'Positive · Partly demonstrated', missed: 'Negative', insufficient: 'Insufficient' };
const verificationLabels = {
  student_initiated: 'You initiated the source check',
  after_ai_reminder: 'You checked after an AI reminder',
  ai_reliance: 'AI result',
  unclear_initiator: 'Source check · Initiator unclear',
};

function Evidence({ item, dimension }: { item: EvidenceItem; dimension: Dimension }) {
  return <li className="assessment-evidence">
    <h4>{taskLabel[item.task]} <span>· {observations[item.outcome]}</span></h4>
    {item.firstDraftQuote && <figure><blockquote>{item.firstDraftQuote}</blockquote><figcaption>Essay · First draft</figcaption></figure>}
    {item.quote !== null && <figure><blockquote>{item.quote}</blockquote><figcaption>{item.sourceLabel}</figcaption></figure>}
    <dl>
      {item.verification && <div>
        <dt>Verification</dt>
        <dd>{verificationLabels[item.verification.kind]}
          {item.verification.material && item.verification.material !== item.quote && <> · {item.verification.material}</>}
          {item.verification.reminder && <figure>
            <blockquote>{item.verification.reminder.quote}</blockquote>
            <figcaption>AI reminder · Message {item.verification.reminder.message}</figcaption>
          </figure>}
        </dd>
      </div>}
      <div><dt>Criterion</dt><dd>{criteria[dimension][item.task]}</dd></div>
      <div><dt>Reason</dt><dd>{item.reason}</dd></div>
      <div><dt>Score impact</dt><dd>{item.outcome === 'insufficient'
        ? 'No points assigned for this item.'
        : dimension === 'bonus'
          ? 'Supports the bonus rating. The bonus is applied once, subject to the overall cap.'
          : item.outcome === 'met'
            ? 'Supports Great when all assessed items meet the criteria.'
            : item.outcome === 'missed'
              ? 'Leads to Need Work when no assessed item fully meets the criterion.'
              : 'Counts as partial evidence. The dimension rating considers all verified items.'}</dd></div>
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

  const score = feedback && provisionalScore(feedback);
  const savedLegacy = !feedback && !!legacy;
  const canRegenerate = savedLegacy || feedback?.schema === 1;
  return <>
    <section className="assessment-score" aria-labelledby="score-title">
      <div>
        <h2 id="score-title">{savedLegacy ? 'Saved report' : 'Provisional final score'}</h2>
        {savedLegacy ? <p>Original feedback</p> : <p className="assessment-score-value" role="status">
          {score ? (score.total === null ? 'Insufficient evidence' : new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(score.total) + '%') : error ? 'Unavailable' : 'Reviewing your work…'}
        </p>}
        {feedback && <p>Scoring rules · Version {feedback.schema}</p>}
        {score && <p>Evidence coverage · {score.assessed} of {coreDimensions.length} core dimensions assessed</p>}
        {score && score.levels.bonus === 'Great' && <p>{score.total === null
          ? 'Bonus earned. An overall score requires more core evidence.'
          : `Bonus applied · +${new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(score.bonusApplied)} points after the cap`}</p>}
        {canRegenerate && <button type="button" disabled={loading} onClick={() => requestFeedback(true)}>
          {loading ? 'Generating updated feedback…' : 'Re-score with current rules'}
        </button>}
        {error && <p role="alert">Feedback is temporarily unavailable.
          {!canRegenerate && <button type="button" onClick={() => requestFeedback(false)}>Try again</button>}
        </p>}
      </div>
      {!savedLegacy && <details className="assessment-formula">
        <summary>How the provisional score works</summary>
        <p>Great {provisionalScheme.points.Great} · Fair {provisionalScheme.points.Fair} · Need Work {provisionalScheme.points['Need Work']}</p>
        <p>We average core dimensions with evidence. At least {provisionalScheme.minimumCoreDimensions} are required. Great in Bonus adds {provisionalScheme.bonus} points, up to {provisionalScheme.cap}% overall.</p>
        <p>Dimensions with insufficient evidence are excluded from the average. This scale is pending academic calibration.</p>
      </details>}
    </section>
    {(score || legacy) && <section className="report-factors"><h2>{score ? 'Dimension breakdown' : 'Previously saved feedback'}</h2>
      {rubricDimensions.map(key => {
        const row = legacy?.[key];
        const level = score?.levels[key] ?? row?.level;
        const points = score && key !== 'bonus' ? provisionalScheme.points[score.levels[key]] : null;
        return <details key={key} className="report-factor">
          <summary><span>{dimensions[key]}</span><span className={'factor-status ' + (level ? levelStyle[level] : 'neutral')}>
            {level ?? 'Unavailable'}{points !== null ? ` · ${points} points` : ''}
          </span></summary>
          <div className="factor-detail">
            {feedback ? <ul className="assessment-evidence-list">{feedback.evidence[key].map((item, index) =>
              <Evidence key={index} dimension={key} item={item} />)}</ul>
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
