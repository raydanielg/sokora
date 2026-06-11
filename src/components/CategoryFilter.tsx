import { useCategories } from '../lib/useCategories'

interface Props {
  value: string         // current filter value -- 'all' | 'group:Feeding' | 'Breast Pumps'
  onChange: (v: string) => void
  style?: React.CSSProperties
  showGroups?: boolean  // whether to show group-level options (default true)
  placeholder?: string
}

// A unified category filter dropdown used across Inventory, Sales Register,
// Stock Valuation, Day Book, Purchase Register, Stock Transfer Register
export default function CategoryFilter({ value, onChange, style, showGroups = true, placeholder = 'All Categories' }: Props) {
  const { categories, groups, catsByGroup, loading } = useCategories()

  if (loading) return (
    <select className="form-input" style={{ fontSize: 12, padding: '6px 10px', ...style }} disabled>
      <option>Loading…</option>
    </select>
  )

  return (
    <select
      className="form-input"
      style={{ fontSize: 12, padding: '6px 10px', ...style }}
      value={value}
      onChange={e => onChange(e.target.value)}
    >
      <option value="all">{placeholder}</option>

      {showGroups && groups.map(group => (
        <optgroup key={group} label={`── ${group} ──`}>
          <option value={`group:${group}`}>All {group}</option>
          {catsByGroup[group].map(cat => (
            <option key={cat.name} value={cat.name}>{cat.name}</option>
          ))}
        </optgroup>
      ))}

      {!showGroups && categories.map(cat => (
        <option key={cat.name} value={cat.name}>{cat.name}</option>
      ))}
    </select>
  )
}

// Helper: given a filter value ('all' | 'group:X' | 'Category Name'),
// return a predicate function for filtering products/lines
export function makeCategoryPredicate(
  filterValue: string,
  categories: { name: string; group: string }[]
): (category: string) => boolean {
  if (filterValue === 'all') return () => true
  if (filterValue.startsWith('group:')) {
    const group = filterValue.slice(6)
    const groupCats = new Set(categories.filter(c => c.group === group).map(c => c.name))
    return (cat: string) => groupCats.has(cat)
  }
  return (cat: string) => cat === filterValue
}
