import type { ReactNode } from 'react';

/**
 * A heading with one phrase in Sky Highlight.
 *
 * Sky Highlight (#97cde5) on white is about 1.9:1, so it is never the carrier
 * of meaning: the highlighted span is decorative and hidden from assistive
 * tech, while the surrounding element keeps the full accessible name.
 */
export function Word({ children, accent }: { children: ReactNode; accent: string }) {
  const text = String(children);
  const at = text.indexOf(accent);
  if (at < 0) return <>{children}</>;
  return (
    <>
      {text.slice(0, at)}
      <span className="hl" aria-hidden="true">
        {accent}
      </span>
      {text.slice(at + accent.length)}
    </>
  );
}
