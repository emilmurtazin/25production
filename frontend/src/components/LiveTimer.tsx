import { useEffect, useState } from 'react';
import { fmtElapsed } from '../utils/calendar';

export function LiveTimer({ startTs }: { startTs: number }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  return <div className="timer-live">{fmtElapsed(now - startTs)}</div>;
}
