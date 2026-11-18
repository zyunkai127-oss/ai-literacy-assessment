export function Arrow({ direction = 'right' }: { direction?: 'right' | 'down' | 'up' }) {
  return (
    <span className={`arrow arrow-${direction}`} aria-hidden="true">→</span>
  );
}

export function Brand() {
  return (
    <a className="brand" href="/" aria-label="AI Literacy Check home">
      <span className="brand-name">AI Literacy <strong>Check</strong></span>
    </a>
  );
}
