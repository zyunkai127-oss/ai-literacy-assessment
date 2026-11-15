'use client';
import { use, useCallback, useEffect, useState } from 'react';
import { Debrief } from './Debrief';
import { Intro } from './Intro';
import { RevealPage } from './Reveal';
import type { View } from './shared';
import { Work } from './Work';

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const api = `/api/sessions/${id}`;
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch(api);
      if (!res.ok) { setError('This session could not be found.'); return; }
      setView(await res.json());
    } catch {
      setError('The session could not be loaded. Refresh to try again.');
    }
  }, [api]);
  useEffect(() => { load(); }, [load]);

  if (error) return <main className="wrap"><p className="error">{error}</p><a href="/">Start again</a></main>;
  if (!view) return <main className="wrap"><p className="muted">Loading</p></main>;
  // Leaving mid-session abandons it; the reveal page has its own link.
  const restart = (
    <a className="restart" href="/" onClick={(e) => { if (!window.confirm('Leave this session and start again? Your progress here will be lost.')) e.preventDefault(); }}>
      Start again
    </a>
  );
  if (view.state === 'intro') return <>{restart}<Intro view={view} api={api} onStart={load} /></>;
  if (view.state === 'work') return <>{restart}<Work view={view} api={api} onDone={load} /></>;
  if (view.state === 'debrief' || view.state === 'viva') return <>{restart}<Debrief key={view.state} view={view} api={api} onDone={load} /></>;
  return <RevealPage api={api} />;
}
