export function Arrow({ direction = 'right' }: { direction?: 'right' | 'down' | 'up' }) {
  return <svg className={`arrow arrow-${direction}`} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h15M12 5l7 7-7 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function Spark() {
  return <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M20 2v36M2 20h36M7.3 7.3l25.4 25.4M7.3 32.7 32.7 7.3" stroke="currentColor" strokeWidth="4" /></svg>;
}

export function Brand() {
  return <a className="brand" href="/" aria-label="AI Literacy Check home"><Spark /><span>ai literacy<br />check<span className="brand-period">.</span></span></a>;
}
