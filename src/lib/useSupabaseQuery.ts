/**
 * SOKORA Performance Hooks
 * 
 * Usage:
 * 
 * // Single query with cache
 * const { data, loading, error, refetch } = useQuery('products', 
 *   () => supabase.from('products').select('id, name, price').limit(100)
 * )
 * 
 * // Parallel queries
 * const { data, loading } = useParallelQueries({
 *   products: () => supabase.from('products').select('*').limit(100),
 *   accounts: () => supabase.from('accounts').select('*'),
 *   banks: () => supabase.from('banks').select('*')
 * })
 * // data.products, data.accounts, data.banks
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from './supabase'

// ============================================================================
// TYPES
// ============================================================================
interface QueryState<T> {
  data: T | null
  loading: boolean
  error: Error | null
}

interface QueryOptions {
  /** Cache time in ms (default: 60000 = 1 min) */
  cacheTime?: number
  /** Skip initial fetch */
  skip?: boolean
  /** Refetch on window focus */
  refetchOnFocus?: boolean
  /** Dependencies that trigger refetch */
  deps?: any[]
}

type QueryFn<T> = () => Promise<{ data: T | null; error: any }>

// ============================================================================
// GLOBAL CACHE (persists across component unmounts)
// ============================================================================
const globalCache: Map<string, { data: any; timestamp: number }> = new Map()

function getCached<T>(key: string, maxAge: number): T | null {
  const cached = globalCache.get(key)
  if (!cached) return null
  if (Date.now() - cached.timestamp > maxAge) {
    globalCache.delete(key)
    return null
  }
  return cached.data as T
}

function setCache(key: string, data: any) {
  globalCache.set(key, { data, timestamp: Date.now() })
}

export function invalidateCache(key?: string) {
  if (key) {
    globalCache.delete(key)
  } else {
    globalCache.clear()
  }
}

// ============================================================================
// useQuery - Single query with caching
// ============================================================================
export function useQuery<T>(
  key: string,
  queryFn: QueryFn<T>,
  options: QueryOptions = {}
) {
  const { cacheTime = 60000, skip = false, refetchOnFocus = false, deps = [] } = options
  
  const [state, setState] = useState<QueryState<T>>({
    data: getCached<T>(key, cacheTime),
    loading: !getCached<T>(key, cacheTime) && !skip,
    error: null
  })

  const isMounted = useRef(true)

  const fetchData = useCallback(async (force = false) => {
    // Check cache first (unless forced)
    if (!force) {
      const cached = getCached<T>(key, cacheTime)
      if (cached) {
        setState({ data: cached, loading: false, error: null })
        return
      }
    }

    setState(prev => ({ ...prev, loading: true, error: null }))

    try {
      const { data, error } = await queryFn()
      
      if (!isMounted.current) return
      
      if (error) {
        setState({ data: null, loading: false, error })
      } else {
        setCache(key, data)
        setState({ data, loading: false, error: null })
      }
    } catch (err) {
      if (!isMounted.current) return
      setState({ data: null, loading: false, error: err as Error })
    }
  }, [key, queryFn, cacheTime])

  // Initial fetch
  useEffect(() => {
    isMounted.current = true
    if (!skip) fetchData()
    return () => { isMounted.current = false }
  }, [skip, ...deps])

  // Refetch on focus
  useEffect(() => {
    if (!refetchOnFocus) return
    
    const handleFocus = () => {
      const cached = getCached<T>(key, cacheTime)
      if (!cached) fetchData()
    }
    
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [refetchOnFocus, key, cacheTime, fetchData])

  return {
    ...state,
    refetch: () => fetchData(true),
    invalidate: () => invalidateCache(key)
  }
}

// ============================================================================
// useParallelQueries - Multiple queries in parallel
// ============================================================================
type QueriesConfig = Record<string, QueryFn<any>>
type QueriesResult<T extends QueriesConfig> = {
  [K in keyof T]: Awaited<ReturnType<T[K]>>['data']
}

export function useParallelQueries<T extends QueriesConfig>(
  queries: T,
  options: QueryOptions = {}
) {
  const { cacheTime = 60000, skip = false, deps = [] } = options
  
  const keys = Object.keys(queries)
  const [data, setData] = useState<Partial<QueriesResult<T>>>({})
  const [loading, setLoading] = useState(!skip)
  const [errors, setErrors] = useState<Record<string, Error>>({})

  const isMounted = useRef(true)

  const fetchAll = useCallback(async (force = false) => {
    // Check cache for all keys
    if (!force) {
      const allCached = keys.every(k => getCached(k, cacheTime) !== null)
      if (allCached) {
        const cachedData: any = {}
        keys.forEach(k => { cachedData[k] = getCached(k, cacheTime) })
        setData(cachedData)
        setLoading(false)
        return
      }
    }

    setLoading(true)
    setErrors({})

    try {
      // PERFORMANCE: Parallel fetch with Promise.all
      const results = await Promise.all(
        keys.map(async (key) => {
          // Check individual cache
          if (!force) {
            const cached = getCached(key, cacheTime)
            if (cached) return { key, data: cached, error: null }
          }
          
          const { data, error } = await queries[key]()
          if (!error) setCache(key, data)
          return { key, data, error }
        })
      )

      if (!isMounted.current) return

      const newData: any = {}
      const newErrors: Record<string, Error> = {}
      
      results.forEach(({ key, data, error }) => {
        if (error) {
          newErrors[key] = error
        } else {
          newData[key] = data
        }
      })

      setData(newData)
      setErrors(newErrors)
      setLoading(false)
    } catch (err) {
      if (!isMounted.current) return
      setLoading(false)
    }
  }, [queries, keys, cacheTime])

  useEffect(() => {
    isMounted.current = true
    if (!skip) fetchAll()
    return () => { isMounted.current = false }
  }, [skip, ...deps])

  return {
    data: data as QueriesResult<T>,
    loading,
    errors,
    refetch: () => fetchAll(true),
    invalidateAll: () => keys.forEach(k => invalidateCache(k))
  }
}

// ============================================================================
// useMutation - For insert/update/delete with cache invalidation
// ============================================================================
interface MutationOptions {
  /** Keys to invalidate on success */
  invalidateKeys?: string[]
  /** Callback on success */
  onSuccess?: (data: any) => void
  /** Callback on error */
  onError?: (error: Error) => void
}

export function useMutation<TInput, TOutput>(
  mutationFn: (input: TInput) => Promise<{ data: TOutput | null; error: any }>,
  options: MutationOptions = {}
) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [data, setData] = useState<TOutput | null>(null)

  const mutate = async (input: TInput) => {
    setLoading(true)
    setError(null)

    try {
      const { data, error } = await mutationFn(input)
      
      if (error) {
        setError(error)
        options.onError?.(error)
      } else {
        setData(data)
        // Invalidate related caches
        options.invalidateKeys?.forEach(key => invalidateCache(key))
        options.onSuccess?.(data)
      }
    } catch (err) {
      setError(err as Error)
      options.onError?.(err as Error)
    } finally {
      setLoading(false)
    }

    return { data, error }
  }

  return { mutate, loading, error, data }
}

// ============================================================================
// Prebuilt query functions for common tables
// ============================================================================
export const queries = {
  products: (limit = 100) => 
    supabase.from('products').select('id, sku, name, category, cost, price, qty, reorder').limit(limit),
  
  accounts: () => 
    supabase.from('accounts').select('id, code, name, type, category, balance').order('code'),
  
  banks: () => 
    supabase.from('banks').select('*'),
  
  customers: (limit = 100) => 
    supabase.from('customers').select('*').limit(limit),
  
  suppliers: () => 
    supabase.from('suppliers').select('*'),
  
  vouchers: (type?: string, limit = 50) => {
    let query = supabase.from('vouchers').select('*').order('date', { ascending: false }).limit(limit)
    if (type) query = query.eq('voucher_type', type)
    return query
  },
  
  ledger: (limit = 200) => 
    supabase.from('ledger').select('id, date, account_id, dr, cr, narration, voucher_id').order('date', { ascending: false }).limit(limit),
  
  stockMovements: (productId?: string, limit = 100) => {
    let query = supabase.from('stock_movements').select('*').order('created_at', { ascending: false }).limit(limit)
    if (productId) query = query.eq('product_id', productId)
    return query
  },

  // Dashboard aggregates
  dashboardStats: async () => {
    const [
      { count: productCount },
      { count: customerCount },
      { data: recentSales },
      { data: bankBalances }
    ] = await Promise.all([
      supabase.from('products').select('*', { count: 'exact', head: true }),
      supabase.from('customers').select('*', { count: 'exact', head: true }),
      supabase.from('vouchers').select('total').eq('voucher_type', 'cash-sale').order('date', { ascending: false }).limit(30),
      supabase.from('banks').select('name, balance')
    ])
    
    return {
      data: {
        productCount: productCount || 0,
        customerCount: customerCount || 0,
        recentSalesTotal: recentSales?.reduce((sum, v) => sum + (v.total || 0), 0) || 0,
        bankBalances: bankBalances || []
      },
      error: null
    }
  }
}

// ============================================================================
// Example usage in a component:
// ============================================================================
/*
import { useQuery, useParallelQueries, queries } from '../lib/useSupabaseQuery'

function Inventory() {
  // Single query
  const { data: products, loading, refetch } = useQuery('products', 
    () => queries.products(100)
  )

  // Or parallel queries
  const { data, loading } = useParallelQueries({
    products: () => queries.products(100),
    accounts: queries.accounts,
    banks: queries.banks
  })

  if (loading) return <Spinner />
  
  return <div>{data.products?.map(p => ...)}</div>
}
*/
