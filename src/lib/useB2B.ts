// ============================================================================
// useB2B.ts
// Read hook for the B2B CRM. Loads every account with its contacts and recent
// activities in one nested select, exposes loading/error, and a reload() the
// page calls after any mutation in b2bPost.ts. All writes live in b2bPost.ts.
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import type { B2BAccount } from './b2bTypes'

export function useB2B() {
  const [accounts, setAccounts] = useState<B2BAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from('b2b_accounts')
        .select(`
          *,
          contacts:b2b_contacts ( * ),
          activities:b2b_activities ( * )
        `)
        .order('updated_at', { ascending: false })
      if (error) throw error

      const rows = (data || []).map((a: any) => ({
        ...a,
        contacts: (a.contacts || []).sort(
          (x: any, y: any) => Number(y.is_primary) - Number(x.is_primary),
        ),
        activities: (a.activities || []).sort(
          (x: any, y: any) =>
            new Date(y.occurred_at).getTime() - new Date(x.occurred_at).getTime(),
        ),
      })) as B2BAccount[]

      setAccounts(rows)
    } catch (err: any) {
      console.error('Failed to load B2B accounts:', err)
      setError(err.message || 'Failed to load')
      setAccounts([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { reload() }, [reload])

  return { accounts, loading, error, reload }
}
