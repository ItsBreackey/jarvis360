import React, { useEffect, useState } from 'react'
import './UploadStatusPoller.css'

export default function UploadStatusPoller({ uploadId, pollIntervalMs = 2000 }) {
  const [upload, setUpload] = useState(null)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [cooldownTotal, setCooldownTotal] = useState(0)
  const [cooldownExpiry, setCooldownExpiry] = useState(null)
  const [cooldownRemainingMs, setCooldownRemainingMs] = useState(0)

  useEffect(() => {
    let mounted = true
    let timer = null

    async function fetchStatus() {
      try {
        const res = await fetch(`/api/uploads/${uploadId}/`, { credentials: 'include' })
        if (!res.ok) {
          throw new Error(`status ${res.status}`)
        }
        const data = await res.json()
        if (!mounted) return
        setUpload(data)
        setError(null)
        if (data.status === 'pending' || data.status === 'importing') {
          timer = window.setTimeout(fetchStatus, pollIntervalMs)
        }
      } catch (e) {
        if (!mounted) return
        setError(e.message || String(e))
        // Retry with backoff
        timer = window.setTimeout(fetchStatus, Math.min(15000, (timer || pollIntervalMs) * 2))
      }
    }

    fetchStatus()

    return () => {
      mounted = false
      if (timer) clearTimeout(timer)
    }
  }, [uploadId, pollIntervalMs])

  // Load persisted cooldown for this upload (survive reloads)
  useEffect(() => {
    const key = `reimport_cooldown:${uploadId}`
    try {
      let raw = null
      try {
        raw = sessionStorage.getItem(key)
        console.debug('UploadStatusPoller: read sessionStorage', key, raw)
      } catch (e) {
        console.debug('UploadStatusPoller: sessionStorage unavailable, will try localStorage', e)
      }
      // fallback to localStorage (cross-tab / persisted) if sessionStorage didn't have it
      if (!raw) {
        try {
          raw = localStorage.getItem(key)
          if (raw) console.debug('UploadStatusPoller: read localStorage', key, raw)
        } catch (e) {
          console.debug('UploadStatusPoller: localStorage unavailable', e)
        }
      }

      if (raw) {
        let parsed = null
        try {
          parsed = JSON.parse(raw)
        } catch (e) {
          // support legacy formats: raw might be a plain number (seconds) or an ISO string
          console.debug('UploadStatusPoller: stored cooldown not JSON, trying legacy parse', e)
          const v = Number(raw)
          if (!Number.isNaN(v) && v > 0) {
            parsed = { expiry: Date.now() + v * 1000, total: v }
          }
        }

        if (parsed && parsed.expiry && parsed.total) {
          if (parsed.expiry > Date.now()) {
            setCooldownTotal(Number(parsed.total))
            setCooldownExpiry(Number(parsed.expiry))
            setCooldown(Math.ceil((Number(parsed.expiry) - Date.now()) / 1000))
            setCooldownRemainingMs(Number(parsed.expiry) - Date.now())
          } else {
            try { sessionStorage.removeItem(key); localStorage.removeItem(key) } catch (e) {}
          }
        }
      }
    } catch (e) {
      // ignore storage errors but log for debugging
      console.debug('UploadStatusPoller: error reading cooldown from storage', e)
    }
  }, [uploadId])

  // Smooth, millisecond-updated cooldown tick
  useEffect(() => {
    if (!cooldownExpiry) return
    const key = `reimport_cooldown:${uploadId}`
    const id = setInterval(() => {
      const remainingMs = Math.max(0, cooldownExpiry - Date.now())
      setCooldownRemainingMs(remainingMs)
      setCooldown(Math.ceil(remainingMs / 1000))
      if (remainingMs <= 0) {
        // clear
        setCooldownTotal(0)
        setCooldownExpiry(null)
        try { sessionStorage.removeItem(key) } catch (e) {}
        clearInterval(id)
      }
    }, 100)
    return () => clearInterval(id)
  }, [cooldownExpiry, uploadId])

  if (error) {
    return <div className="upload-status upload-status--error" role="status" aria-live="polite">Error fetching status: {error}</div>
  }


  if (!upload) {
    return <div className="upload-status">Loading upload status…</div>
  }

  async function handleRetry() {
    if (!upload) return
    setRetrying(true)
    try {
    const r = await fetch(`/api/uploads/${upload.id}/reimport/`, { method: 'POST', credentials: 'include' })
    if (r.status === 429) {
      // read Retry-After header if present
      const ra = r.headers.get('Retry-After')
      const seconds = ra ? parseInt(ra, 10) : 60
        const expiry = Date.now() + seconds * 1000
        setCooldown(seconds)
        setCooldownTotal(seconds)
        setCooldownExpiry(expiry)
        console.debug('UploadStatusPoller: received 429, setting cooldown', { uploadId, seconds, expiry })
        try {
          const key = `reimport_cooldown:${uploadId}`
          const payload = JSON.stringify({ expiry, total: seconds })
          try { sessionStorage.setItem(key, payload) } catch (e) { console.debug('UploadStatusPoller: failed to write sessionStorage', e) }
          try { localStorage.setItem(key, payload) } catch (e) { /* non-fatal */ }
          console.debug('UploadStatusPoller: storage set', key, payload)
        } catch (e) { console.debug('UploadStatusPoller: failed to write sessionStorage', e) }
      setRetrying(false)
      return
    }
    if (!r.ok) throw new Error('retry failed: ' + r.status)
  await r.json()
    // If server provided a Retry-After header on success, use it to start cooldown
    const ra2 = r.headers.get('Retry-After')
    if (ra2) {
      const seconds = parseInt(ra2, 10)
      const expiry = Date.now() + seconds * 1000
      setCooldown(seconds)
      setCooldownTotal(seconds)
      setCooldownExpiry(expiry)
      console.debug('UploadStatusPoller: received Retry-After on success, setting cooldown', { uploadId, seconds, expiry })
      try {
        const key = `reimport_cooldown:${uploadId}`
        const payload = JSON.stringify({ expiry, total: seconds })
        try { sessionStorage.setItem(key, payload) } catch (e) { console.debug('UploadStatusPoller: failed to write sessionStorage', e) }
        try { localStorage.setItem(key, payload) } catch (e) { /* non-fatal */ }
        console.debug('UploadStatusPoller: storage set', key, payload)
      } catch (e) { console.debug('UploadStatusPoller: failed to write sessionStorage', e) }
    }
    // small delay to allow background job to claim the upload
    window.setTimeout(() => {
      // refresh by resetting upload state and letting effect re-run
      setExpanded(false)
      setRetrying(false)
      // quick fetch status
      fetch(`/api/uploads/${uploadId}/`, { credentials: 'include' }).then(res => res.json()).then(setUpload).catch(() => {})
    }, 400)
    } catch (e) {
      console.error(e)
      setRetrying(false)
      alert('Retry failed: ' + (e.message || e))
    }
  }


  return (
    <div className={`upload-status upload-status--${upload.status}`} role="status" aria-live="polite">
      <div>Upload #{upload.id} — <strong>{upload.status}</strong></div>
      {cooldown > 0 && (
        <div className="upload-cooldown">
          <div className="upload-cooldown-row">
            <div className="upload-cooldown-label">Retry cooldown:</div>
            <div className="upload-cooldown-bar">
              <div
                className="upload-cooldown-bar-fill"
                style={{
                  width: (cooldownTotal && cooldownRemainingMs) ? `${Math.max(0, Math.round((cooldownRemainingMs / (cooldownTotal * 1000)) * 100))}%` : `${(cooldown > 0 ? 100 : 0)}%`
                }}
              />
            </div>
            <div className="upload-cooldown-time">{cooldown}s</div>
            {cooldownExpiry && <div className="upload-cooldown-until">Expires: {new Date(cooldownExpiry).toLocaleTimeString()}</div>}
          </div>
        </div>
      )}
      {upload.status === 'importing' && upload.status_started_at && (
        <div>Started at: {new Date(upload.status_started_at).toLocaleString()}</div>
      )}
      {upload.status === 'complete' && (
        <div>Imported subscriptions: {upload.subscriptions_created ?? 0}</div>
      )}
      {upload.status === 'error' && (
        <div className="upload-error">
          <div className="upload-error-row">
            <div className="upload-error-message">Error: {upload.error_message ? (upload.error_message.split('\n')[0]) : 'unknown'}</div>
            <div className="upload-error-actions">
              <button onClick={() => setExpanded(!expanded)} aria-expanded={expanded} className="upload-error-btn">{expanded ? 'Hide' : 'Show full'}</button>
              <button onClick={handleRetry} disabled={retrying || cooldown > 0} className="upload-error-btn">{retrying ? 'Retrying…' : 'Retry'}</button>
            </div>
            <div className="upload-error-cooldown">
              {cooldown > 0 && <span>Retry in {cooldown}s</span>}
            </div>
          </div>
          {expanded && (
            <pre className="upload-error-pre">{upload.error_message}</pre>
          )}
        </div>
      )}
    </div>
  )
}
