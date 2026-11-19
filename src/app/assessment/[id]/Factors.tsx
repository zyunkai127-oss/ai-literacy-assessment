import { useEffect, useState } from 'react';
import { dimensions, hasTaskFeedback, type Ratings } from '@/lib/secondary';

export function Factors({url, saved}: {url:string; saved?:Ratings}) {
  const [ratings,setRatings] = useState(hasTaskFeedback(saved) ? saved : undefined);
  const [error,setError] = useState(false);
  const [attempt,retry] = useState(0);
  useEffect(()=>{
    if (hasTaskFeedback(saved)) return;
    let active = true;
    fetch(url+'/feedback',{method:'POST'}).then(async res=>{
      if (!res.ok) throw Error();
      const next = await res.json();
      if (active) setRatings(next);
    }).catch(()=>{if(active) setError(true);});
    return ()=>{active=false;};
  },[url,saved,attempt]);
  return <section className="report-factors"><h2>How you worked with AI</h2>
    {error && <p role="alert">Feedback is temporarily unavailable. <button onClick={()=>{setError(false);retry(attempt+1);}}>Try again</button></p>}
    {(Object.keys(dimensions) as (keyof Ratings)[]).map(key=>{
      const row=ratings?.[key];
      const style=row && {'Great':'supported','Fair':'insufficient','Need Work':'practise','Not enough evidence':'neutral'}[row.level];
      return <details key={key} className="report-factor"><summary><span>{dimensions[key]}<small className="factor-subtitle">{row?.tasks && row.comment}</small></span>
        <span className={'factor-status '+(style || 'neutral')}>{row?.level ?? (error?'Unavailable':'Reviewing…')}</span></summary>
        <div className="factor-detail">{row?.tasks && (['essay','science'] as const).map(task=>{
          const item = row.tasks![task];
          return <section key={task}><h3>{task === 'essay' ? 'Dramatic Moments · Essay' : 'Wind Farm Site · Science'}</h3>
            <p>{item.detail}</p>{item.quote && <blockquote>{item.quote}</blockquote>}</section>;
        })}</div>
      </details>;
    })}
  </section>;
}
