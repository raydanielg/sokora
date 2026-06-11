import { useState, useEffect } from 'react'
import { supabase } from './supabase'

export interface ProductCategory {
  id?: string
  name: string
  group: string
  color: string
  sort_order: number
}

interface UseCategoriesResult {
  categories: ProductCategory[]
  catNames: string[]
  groups: string[]
  catsByGroup: Record<string, ProductCategory[]>
  loading: boolean
  reload: () => void
  addCategory: (name: string, group?: string, color?: string) => Promise<ProductCategory | null>
}

// Default categories - used as fallback if DB is empty
export const DEFAULT_CATEGORIES: ProductCategory[] = [
  { name: 'Breast Pumps',       group: 'Feeding',     color: '#85c2be', sort_order: 1 },
  { name: 'Nursing Accessories',group: 'Feeding',     color: '#85c2be', sort_order: 2 },
  { name: 'Nipple Care',        group: 'Feeding',     color: '#85c2be', sort_order: 3 },
  { name: 'Belly Binders',      group: 'Postpartum',  color: '#f7a6ad', sort_order: 4 },
  { name: 'Scar Care',          group: 'Postpartum',  color: '#f7a6ad', sort_order: 5 },
  { name: 'Perineal Care',      group: 'Postpartum',  color: '#f7a6ad', sort_order: 6 },
  { name: 'Pregnancy Pillows',  group: 'Maternity',   color: '#b8a9e8', sort_order: 7 },
  { name: 'Belly Support',      group: 'Maternity',   color: '#b8a9e8', sort_order: 8 },
  { name: 'Newborn Essentials', group: 'Newborn',     color: '#85c2be', sort_order: 9 },
  { name: 'Baby Skincare',      group: 'Newborn',     color: '#85c2be', sort_order: 10 },
  { name: 'Supplements',        group: 'Health',      color: '#f7a6ad', sort_order: 11 },
  { name: 'Skincare',           group: 'Health',      color: '#f7a6ad', sort_order: 12 },
  { name: 'General',            group: 'Other',       color: '#aaaaaa', sort_order: 13 },
]

export const DEFAULT_GROUPS = ['Feeding', 'Postpartum', 'Maternity', 'Newborn', 'Health', 'Other']

// Module-level cache
let _cache: ProductCategory[] | null = null
let _listeners: (() => void)[] = []
let _loading = false

function guessGroup(name: string): string {
  const n = name.toLowerCase()
  if (n.includes('pump') || n.includes('nurs') || n.includes('nipple') || n.includes('feed')) return 'Feeding'
  if (n.includes('binder') || n.includes('scar') || n.includes('post') || n.includes('perineal')) return 'Postpartum'
  if (n.includes('pillow') || n.includes('belly') || n.includes('matern') || n.includes('pregnancy')) return 'Maternity'
  if (n.includes('newborn') || n.includes('baby') || n.includes('infant')) return 'Newborn'
  if (n.includes('supple') || n.includes('vitamin') || n.includes('skin')) return 'Health'
  return 'Other'
}

function groupColor(group: string): string {
  const colors: Record<string, string> = {
    Feeding: '#85c2be', Postpartum: '#f7a6ad', Maternity: '#b8a9e8',
    Newborn: '#85c2be', Health: '#f7a6ad', Other: '#aaaaaa',
  }
  return colors[group] || '#aaaaaa'
}

async function fetchCategories(): Promise<ProductCategory[]> {
  // Try to fetch from categories table
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, color, sort_order')
    .eq('is_active', true)
    .order('sort_order')

  if (!error && data && data.length > 0) {
    // Add group based on name
    return data.map(c => ({
      ...c,
      group: guessGroup(c.name),
      color: c.color || groupColor(guessGroup(c.name)),
    }))
  }

  // Return empty array if nothing in database
  return []
}

export function useCategories(): UseCategoriesResult {
  const [categories, setCategories] = useState<ProductCategory[]>(_cache || [])
  const [loading, setLoading] = useState(!_cache)

  const reload = async () => {
    _loading = true
    const cats = await fetchCategories()
    _cache = cats
    _loading = false
    setCategories(cats)
    setLoading(false)
    _listeners.forEach(fn => fn())
  }

  useEffect(() => {
    if (_cache) { setCategories(_cache); setLoading(false); return }
    if (!_loading) reload()

    const listener = () => { if (_cache) setCategories(_cache) }
    _listeners.push(listener)
    return () => { _listeners = _listeners.filter(l => l !== listener) }
  }, [])

  const addCategory = async (name: string, group?: string, color?: string): Promise<ProductCategory | null> => {
    // Check if already exists
    const existing = categories.find(c => c.name.toLowerCase() === name.toLowerCase())
    if (existing) return existing

    const categoryGroup = group || guessGroup(name)
    const categoryColor = color || groupColor(categoryGroup)

    const newCat = {
      name: name.trim(),
      color: categoryColor,
      sort_order: categories.length + 1,
    }

    const { data, error } = await supabase
      .from('categories')
      .insert(newCat)
      .select('id, name, color, sort_order')
      .single()

    if (error) {
      console.error('Error adding category:', error)
      return null
    }

    const fullCat: ProductCategory = {
      ...data,
      group: categoryGroup,
    }

    // Update cache
    _cache = [...categories, fullCat]
    setCategories(_cache)
    _listeners.forEach(fn => fn())

    return fullCat
  }

  const catNames = categories.map(c => c.name)
  const groups = [...new Set(categories.map(c => c.group))]
  const catsByGroup = groups.reduce((acc, g) => {
    acc[g] = categories.filter(c => c.group === g).sort((a, b) => a.sort_order - b.sort_order)
    return acc
  }, {} as Record<string, ProductCategory[]>)

  return { categories, catNames, groups, catsByGroup, loading, reload, addCategory }
}

// Helper: invalidate cache
export function invalidateCategoryCache() {
  _cache = null
  _listeners.forEach(fn => fn())
}

// Helper: get color for a category name
export function getCategoryColor(categories: ProductCategory[], name: string): string {
  return categories.find(c => c.name === name)?.color || '#85c2be'
}

// Helper: get group for a category name
export function getCategoryGroup(categories: ProductCategory[], name: string): string {
  return categories.find(c => c.name === name)?.group || 'Other'
}
