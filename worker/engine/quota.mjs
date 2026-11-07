// Quota handling for free-tier AI APIs. Pure functions, no I/O, so they can be unit-tested.
// A "quota" problem is not the same as a "busy server" problem: a per-minute limit clears in seconds, but a per-day
// limit can take hours, and sleeping that long inside a GitHub Actions run just burns minutes. Daily limits are
// therefore PARKED: progress is saved, the job leaves the worker and Netlify restarts it when the quota resets.

export class QuotaError extends Error {
  constructor(message, { retryAfterSec = 0, daily = false } = {}) {
    super(message);
    this.name = "QuotaError";
    this.retryAfterSec = retryAfterSec;
    this.daily = daily;
  }
}

export const isQuotaMessage = (m) => /quota|rate.?limit|resource.?exhausted|too many requests|\b429\b/i.test(String(m));

// "Please retry in 13h12m0.35s." or {"retryDelay":"47s"}  ->  seconds (0 when nothing can be read)
export function parseRetryAfterSec(text) {
  const s = String(text ?? "");
  let m = s.match(/retry in\s+(?:(\d+)\s*h)?\s*(?:(\d+)\s*m(?!s))?\s*(?:([\d.]+)\s*s)?/i);
  if (m && (m[1] || m[2] || m[3])) return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + Math.ceil(+m[3] || 0);
  m = s.match(/retryDelay"?\s*[:=]\s*"?(\d+(?:\.\d+)?)\s*s/i);
  return m ? Math.ceil(+m[1]) : 0;
}

export const isDailyQuota = (message, retryAfterSec = 0) => /per.?day|daily/i.test(String(message)) || retryAfterSec > 20 * 60;

// When a parked job should restart: the API's own retry time plus a minute of margin; never sooner than 5 minutes, never later than 26 hours.
export const resumeDelaySec = (retryAfterSec) => Math.min(26 * 3600, Math.max(300, (retryAfterSec || 0) + 60));
