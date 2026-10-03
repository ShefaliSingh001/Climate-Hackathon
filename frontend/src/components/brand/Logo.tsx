import { Link } from 'react-router-dom';

export const APP_NAME = 'ResourceX';

interface Props {
  /** Text colour for "ReSource": light on the dark brand green, ink on light surfaces. */
  tone?: 'light' | 'dark';
  size?: number;
  to?: string;
  tagline?: boolean;
}

/** The ResourceX mark plus the wordmark as live text, so it stays sharp at any size. */
export function Logo({ tone = 'light', size = 24, to, tagline }: Props) {
  const body = (
    <>
      <img src="/brand/logo-mark.png" alt="" style={{ height: size, width: 'auto' }} />
      <span className="logo-text">
        <span className={`wordmark ${tone}`} style={{ fontSize: size * 0.8 }}>ReSource<em>X</em></span>
        {tagline && <span className="tagline">Materials in motion</span>}
      </span>
    </>
  );
  return to
    ? <Link to={to} className="logo" aria-label={`${APP_NAME} home`}>{body}</Link>
    : <span className="logo" aria-label={APP_NAME}>{body}</span>;
}
