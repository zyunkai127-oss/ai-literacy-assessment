'use client';
import { use, useEffect, useState } from 'react';
import pack from '@/lib/wind-pack.json';
import { Factors } from './Factors';
import { Brand } from '../../ui';
import { essayPrompt, essayQuestion, windEvidence, windQuestion, type Assessment } from '@/lib/secondary';
import { Chat, Transcript } from './Chat';
import './activity.css';

export default function AssessmentPage({ params }: { params: Promise<{id:string}> }) {
  const { id } = use(params);
  const url = '/api/assessment/' + id;
  const [data, setData] = useState<(Assessment & { chatModel: string }) | null>(null);
  const [work, setWork] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const key = (stage: string) => 'edux:' + id + ':' + stage;
  useEffect(() => {
    let live = true;
    fetch(url, {cache:'no-store'}).then(async res => {
      const body = await res.json();
      if (!res.ok) throw Error(body.error);
      if (live) {
        setData(body);
        setWork(sessionStorage.getItem('edux:' + id + ':' + body.stage) ?? (body.stage === 'revision' ? body.draft : ''));
      }
    }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [id, url]);
  async function send(action: 'chat' | 'submit') {
    if (!data || busy) return;
    setBusy(action); setError('');
    try {
      const res = await fetch(url, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:data.version,action,text:action === 'chat' ? message : work,work})});
      const next = await res.json();
      if (!res.ok) throw Error(next.error || 'Please try again.');
      if (action === 'submit') {
        sessionStorage.removeItem(key(data.stage));
        setWork(next.stage === 'revision' ? next.draft : '');
        window.scrollTo(0,0);
      }
      setData(next); setMessage('');
    } catch(e) { setError(e instanceof Error ? e.message : 'Please try again.'); }
    finally { setBusy(''); }
  }
  if (!data) return <main className="wrap"><p role="status">{error || 'Loading your activity…'}</p></main>;
  const science = data.stage === 'science';
  const revision = data.stage === 'revision';
  const done = data.stage === 'feedback';
  const chat = science ? data.comparison : data.discussion;
  return <main className={done ? "wrap session-report" : "secondary"}>
    <header className={done ? "intro-header" : undefined}><Brand/><span>{done ? 'Assessment complete' : science ? 'Task 2 of 2 · Science' : 'Task 1 of 2 · Humanities'}</span></header>
    {done ? <p className="report-kicker">Session feedback</p> : null}
    <h1>{done ? 'Your feedback' : science ? 'Choosing a Wind Farm Site' : 'Dramatic Moments'}</h1>
    {done ? <>
      <Factors url={url} saved={data.ratings}/>
      <details className="card"><summary>Your work and discussions</summary>
      {[{title:'Dramatic Moments',answer:data.revision,history:data.discussion},{title:'Choosing a Wind Farm Site',answer:data.science,history:data.comparison}].map((task,i)=><section className="panel" key={task.title}>
        <h2>{task.title}</h2><p>{i === 0 ? 'Compare your first and final arguments. Which idea did you keep or change after discussion?' : 'Compare your recommendation with the source materials. Which feature of the other site most influenced your choice?'}</p>
        <details open><summary>Your submission</summary><p>{task.answer}</p></details>
        {i===0 && <details><summary>Your independent draft</summary><p>{data.draft}</p></details>}
        {i===1 && <details><summary>Science evidence</summary>{data.windPack ? <EvidencePack/> : <Graphs/>}</details>}
        <details><summary>Your discussion ({task.history.length} messages)</summary>{task.history.length ? <Transcript messages={task.history}/> : <p>You submitted this task without a chat exchange.</p>}</details>
      </section>)}</details></> : <>
      <section className="panel">{science ? <><p>{data.windPack ? pack.question : windQuestion}</p>{data.windPack ? <EvidencePack/> : <Graphs/>}</> : <><p>{essayPrompt}</p><strong>{essayQuestion}</strong></>}</section>
      <div className="workspace"><section className="panel">
        <h2>{science ? 'Your recommendation' : revision ? 'Revise your essay' : 'Your independent first draft'}</h2>
        {revision && <details><summary>Read your first draft</summary><p>{data.draft}</p></details>}
        <label htmlFor="work">{science ? 'Write your choice and supporting evidence.' : revision ? 'Keep or change your argument after discussing it.' : 'Write your response. AI discussion opens after you submit this draft.'}</label>
        <textarea id="work" maxLength={12000} value={work} disabled={!!busy} onChange={e=>{setWork(e.target.value);sessionStorage.setItem(key(data.stage),e.target.value);}}/>
        <button className="primary" disabled={!!busy || !work.trim()} onClick={()=>send('submit')}>{busy==='submit' ? 'Saving…' : science ? 'Submit and view feedback' : revision ? 'Submit essay and start science' : 'Submit draft and open discussion'}</button>
      </section>{(revision || science) && <Chat model={data.chatModel} messages={chat} value={message} change={setMessage} busy={busy} send={()=>send('chat')}/>}</div>
    </>}
    {error && <p role="alert" className="error">{error}</p>}
  </main>;
}
function Graphs() {
  return <figure><a href="/wind-sites.png" target="_blank" rel="noreferrer"><img src="/wind-sites.png" alt="Four wind-speed graphs, A to D, from January to December. Text descriptions follow." /></a>
    <figcaption>Average wind speed (km/h) · January–December · <a href="https://www.oecd.org/content/dam/oecd/en/publications/reports/2009/02/take-the-test_g1gha797/9789264050815-en.pdf#page=254">OECD, Wind Farms, Q34.1</a></figcaption>
    <details><summary>Read graph descriptions</summary>{windEvidence.map(line=><p key={line}>{line}</p>)}</details></figure>;
}

function EvidencePack() {
  return <section><h2>Field notebook</h2>
    <p><a href="/wind/field-notebook.pdf" target="_blank" rel="noreferrer">Open the evidence pack (PDF, 4 pages)</a></p>
    <p><a href="/wind/station-log.csv" download>Full station log (CSV)</a> · <a href="/wind/windmill-readings.csv" download>Windmill readings (CSV)</a></p>
    {[[pack.field,'Seven daily snapshots in knots'],[pack.lab,'Windmill measurements']] .map(([rows,title])=>{
      const table=rows as string[][];
      return <details key={String(title)}><summary>{String(title)}</summary><div style={{overflowX:'auto'}}><table><thead><tr>{table[0].map(cell=><th key={cell}>{cell}</th>)}</tr></thead><tbody>{table.slice(1).map(row=><tr key={row[0]}>{row.map((cell,i)=><td key={i}>{cell}</td>)}</tr>)}</tbody></table></div></details>;
    })}
  </section>;
}
