import { useEffect, useState } from 'react';
import { criteria, coreDimensions, provisionalScheme, provisionalScore, rubricDimensions, type Dimension, type EvidenceFeedback, type EvidenceItem } from '@/lib/assessment-scoring';
import { dimensions, type Ratings } from '@/lib/secondary';

const levelStyle = { Great: 'supported', Fair: 'insufficient', 'Need Work': 'practise', 'Not enough evidence': 'neutral' };
const taskLabel = { essay: 'Dramatic Moments', science: 'Choosing a Wind Farm Site' };
const observations = { met: 'Positive', partial: 'Positive · Partly demonstrated', missed: 'Negative', insufficient: 'Insufficient' };

function Evidence({ item, dimension }: { item: EvidenceItem; dimension: Dimension }) {
  return <li className="assessment-evidence">
    <h4>{taskLabel[item.task]} <span>· {observations[item.outcome]}</span></h4>
    {item.firstDraftQuote && <figure><blockquote>{item.firstDraftQuote}</blockquote><figcaption>Essay · First draft</figcaption></figure>}
    {item.quote !== null && <figure><blockquote>{item.quote}</blockquote><figcaption>{item.sourceLabel}</figcaption></figure>}
    <dl>
      <div><dt>Criterion</dt><dd>{criteria[dimension][item.task]}</dd></div>
      <div><dt>Reason</dt><dd>{item.reason}</dd></div>
      <div><dt>Score impact</dt><dd>{item.outcome === 'insufficient'
        ? 'No points assigned for this item.'
        : dimension === 'bonus'
          ? 'Supports the bonus rating. The bonus is applied once, subject to the overall cap.'
          : item.outcome === 'met'
            ? 'Supports Great when all assessed items meet the criteria.'
            : item.outcome === 'missed'
              ? 'Supports Need Work when all assessed items miss the criteria. Mixed outcomes lead to Fair.'
              : 'Makes the dimension rating Fair because the criterion is partly demonstrated.'}</dd></div>
      <div><dt>Try next</dt><dd>{item.improvement}</dd></div>
    </dl>
  </li>;
}

export function Factors({ url, saved, legacy }: { url: string; saved?: EvidenceFeedback; legacy?: Ratings }) {
  const [feedback, setFeedback] = useState(saved);
  const [error, setError] = useState(false);
  const [attempt, retry] = useState(0);
  useEffect(() => {
    if (saved) return;
    let active = true;
    fetch(url + '/feedback', { method: 'POST' }).then(async res => {
      if (!res.ok) throw Error();
      const next: EvidenceFeedback = await res.json();
      if (active) setFeedback(next);
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [url, saved, attempt]);

  const score = feedback && provisionalScore(feedback);
  return <>
    <section className="assessment-score" aria-labelledby="score-title">
      <div>
        <h2 id="score-title">Provisional final score</h2>
        <p className="assessment-score-value" role="status">
          {score ? (score.total === null ? 'Insufficient evidence' : new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(score.total) + '%') : error ? 'Unavailable' : 'Reviewing your work…'}
        </p>
        {score && <p>Evidence coverage · {score.assessed} of {coreDimensions.length} core dimensions assessed</p>}
        {score && score.levels.bonus === 'Great' && <p>{score.total === null
          ? 'Bonus earned. An overall score requires more core evidence.'
          : `Bonus applied · +${new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(score.bonusApplied)} points after the cap`}</p>}
        {error && <p role="alert">Feedback is temporarily unavailable. <button onClick={() => { setError(false); retry(attempt + 1); }}>Try again</button></p>}
      </div>
      <details className="assessment-formula">
        <summary>How the provisional score works</summary>
        <p>Great {provisionalScheme.points.Great} · Fair {provisionalScheme.points.Fair} · Need Work {provisionalScheme.points['Need Work']}</p>
        <p>We average core dimensions with evidence. At least {provisionalScheme.minimumCoreDimensions} are required. Great in Bonus adds {provisionalScheme.bonus} points, up to {provisionalScheme.cap}% overall.</p>
        <p>Dimensions with insufficient evidence are excluded from the average. This scale is pending academic calibration.</p>
      </details>
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
