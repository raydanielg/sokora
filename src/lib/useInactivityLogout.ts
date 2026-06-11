import { useEffect, useRef, useCallback } from 'react'
import { supabase } from './supabase'

const INACTIVITY_MS = 30 * 60 * 1000 // 30 minutes
const STORAGE_KEY = 'sokora_last_activity'

/**
 * Auto-logout after 30 minutes of inactivity.
 * Tracks mouse, keyboard, touch, and scroll events.
 * Persists last activity timestamp to localStorage so it
 * survives across tabs and page reloads.
 *
 * Usage: call useInactivityLogout() once inside AuthProvider-wrapped content.
 * Only runs when user is authenticated (has a session).
 */
export function useInactivityLogout() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isActiveRef = useRef(true)

  const doLogout = useCallback(async () => {
    isActiveRef.current = false
    localStorage.removeItem(STORAGE_KEY)
    await supabase.auth.signOut()
    // Force reload to login screen
    window.location.reload()
  }, [])

  const resetTimer = useCallback(() => {
    if (!isActiveRef.current) return

    // Update last activity timestamp
    localStorage.setItem(STORAGE_KEY, String(Date.now()))

    // Clear and restart timer
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(doLogout, INACTIVITY_MS)
  }, [doLogout])

  useEffect(() => {
    // Check if there's already a session before starting
    let mounted = true

    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session || !mounted) return

      // Check if we were already inactive before this page load
      const lastActivity = localStorage.getItem(STORAGE_KEY)
      if (lastActivity) {
        const elapsed = Date.now() - parseInt(lastActivity, 10)
        if (elapsed >= INACTIVITY_MS) {
          // Already timed out while page was closed/inactive
          doLogout()
          return
        }
      }

      // Start tracking
      isActiveRef.current = true
      resetTimer()

      // Listen for user activity
      const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click']
      // Throttle: only reset at most once every 30 seconds to avoid performance hit
      let lastReset = 0
      const throttledReset = () => {
        const now = Date.now()
        if (now - lastReset > 30000) {
          lastReset = now
          resetTimer()
        }
      }

      events.forEach(ev => window.addEventListener(ev, throttledReset, { passive: true }))

      // Also listen for visibility change (tab focus)
      const onVisibility = () => {
        if (document.visibilityState === 'visible') {
          // Tab became visible: check if we timed out while hidden
          const last = localStorage.getItem(STORAGE_KEY)
          if (last && Date.now() - parseInt(last, 10) >= INACTIVITY_MS) {
            doLogout()
          } else {
            resetTimer()
          }
        }
      }
      document.addEventListener('visibilitychange', onVisibility)

      // Cleanup
      return () => {
        mounted = false
        events.forEach(ev => window.removeEventListener(ev, throttledReset))
        document.removeEventListener('visibilitychange', onVisibility)
        if (timerRef.current) clearTimeout(timerRef.current)
      }
    }

    const cleanup = init()
    return () => { mounted = false; cleanup.then(fn => fn?.()) }
  }, [resetTimer, doLogout])
}
