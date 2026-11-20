import { useEffect, useRef } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import type { Msg } from '@/lib/types';

function mathDelimiters(text: string) {
  // Preserve code examples while accepting common model math delimiters.
  return text.split(/(```[\s\S]*?```|`[^`\n]*`)/g).map((part,i) => i % 2 ? part : part
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => '\n\n$$\n' + math + '\n$$\n\n')
    .replace(/\\\(([^\n]*?)\\\)/g, (_, math) => '$' + math + '$')).join('');
}
export function Transcript({messages}: {messages: Msg[]}) {
  return <>{messages.map((m,i)=><div key={i} className={'chat-turn '+m.role}>
    <small>{m.role==='user' ? 'You' : m.model ? 'AI assistant · '+m.model : 'AI assistant'}</small><div className="bubble">
    {m.role==='assistant' ? <Markdown remarkPlugins={[remarkGfm,remarkMath]} rehypePlugins={[rehypeKatex]} disallowedElements={['img']}>{mathDelimiters(m.text)}</Markdown> : m.text}
    </div></div>)}</>;
}
export function Chat({model,messages,value,change,send,busy,error}: {model:string;messages:Msg[];value:string;change:(s:string)=>void;send:()=>void;busy:string;error:string}) {
  const log=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(log.current) log.current.scrollTop=log.current.scrollHeight;},[messages.length,busy]);
  return <section className="panel ai-chat" id="ai-discussion" tabIndex={-1}><h2><span aria-hidden="true">✳</span> AI discussion</h2>
    <small className="chat-model">Model · {model}</small>
    <div className="chat-log" role="log" aria-label="Discussion messages" tabIndex={0} ref={log}>
      {!messages.length && !busy && <p className="chat-empty">Ask a question about your work.</p>}
      <Transcript messages={messages}/>
      {busy==='chat' && <><div className="chat-turn user"><small>You</small><div className="bubble">{value}</div></div><small>AI is replying…</small></>}
    </div>
    <form className="composer" onSubmit={e=>{e.preventDefault();if(value.trim() && !busy)send();}}>
      <textarea id="question" aria-label="Message the assistant" placeholder="Message the assistant…" rows={2} maxLength={12000} value={value} disabled={!!busy} onChange={e=>change(e.target.value)} onKeyDown={e=>{if(e.key==='Enter' && !e.shiftKey && !e.nativeEvent.isComposing){e.preventDefault();e.currentTarget.form?.requestSubmit();}}}/>
      <button aria-label="Send message" title="Send message" disabled={!value.trim() || !!busy}>↑</button>
    </form>
    {error && <p role="alert" className="error chat-error">{error}</p>}
  </section>;
}
