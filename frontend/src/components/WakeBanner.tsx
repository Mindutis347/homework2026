import { useEffect, useState } from 'react'

/**
 * The API runs on Render's free plan, which sleeps after ~15 minutes idle, so the
 * first request of a session can wait 30–50 s. Two things happen here:
 *
 *  1. A health ping on mount starts the wake-up while React renders, instead of
 *     waiting for the page's own data request to trigger it.
 *  2. If nothing has answered after a few seconds, the visitor is told why the
 *     page is blank-ish and that it clears itself. Silence is what makes a cold
 *     start feel broken; a sentence makes it a wait.
 *
 * It never blocks rendering and never retries forever: after two minutes it
 * gives up quietly and the page's own error handling takes over.
 */
const FIRST_NOTICE_MS = 3500
const GIVE_UP_MS = 120_000
const RETRY_MS = 3000
// A sleeping server does not refuse the connection, it holds it open — so the
// ping needs its own deadline or the notice would never fire in the one case it
// exists for.
const ATTEMPT_TIMEOUT_MS = 3000

export function WakeBanner() {
  const [awake, setAwake] = useState(false)
  const [showNotice, setShowNotice] = useState(false)
  const [closed, setClosed] = useState(false)

  useEffect(() => {
    let cancelled = false
    let retry: ReturnType<typeof setTimeout>
    const started = Date.now()

    // The notice is independent of the retry loop: "not awake after 3.5 s" is a
    // fact about the clock, not about how many attempts have come back.
    const notice = setTimeout(() => {
      if (!cancelled) setShowNotice(true)
    }, FIRST_NOTICE_MS)

    const ping = async () => {
      try {
        const response = await fetch('/api/health', {
          cache: 'no-store',
          signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
        })
        if (cancelled) return
        if (response.ok) {
          setAwake(true)
          return
        }
      } catch {
        // Still asleep: timed out, or the request failed rather than answered.
      }
      if (cancelled) return
      if (Date.now() - started < GIVE_UP_MS) retry = setTimeout(() => void ping(), RETRY_MS)
    }

    void ping()
    return () => {
      cancelled = true
      clearTimeout(retry)
      clearTimeout(notice)
    }
  }, [])

  if (awake || !showNotice || closed) return null

  return (
    <div role="status" className="bg-brand-900 text-white">
      <div className="container-page flex items-center gap-3 py-2.5 text-xs font-semibold sm:text-sm">
        <span className="relative flex size-2.5 shrink-0">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent-500 opacity-75" />
          <span className="relative inline-flex size-2.5 rounded-full bg-accent-500" />
        </span>
        <p className="flex-1">
          Waking the demo server — this deployment sleeps when idle, so the first load of a session
          can take up to a minute. This message clears itself as soon as the API answers.
        </p>
        <button
          type="button"
          onClick={() => setClosed(true)}
          aria-label="Dismiss"
          className="shrink-0 text-brand-300 hover:text-white"
        >
          ×
        </button>
      </div>
    </div>
  )
}
