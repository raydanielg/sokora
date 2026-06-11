import { ACCOUNTS } from '../lib/data'

// ── Form Group wrapper ──────────────────────────
interface FGProps {
  label: string
  req?: boolean
  children: React.ReactNode
}

export function FG({ label, req, children }: FGProps) {
  return (
    <div className="form-group">
      <label className="form-label">
        {label}{req && <span className="req"> *</span>}
      </label>
      {children}
    </div>
  )
}

// ── Account dropdown ───────────────────────────
interface AccountSelectProps {
  value: string
  onChange: (v: string) => void
  label: string
  req?: boolean
}

export function AccountSelect({ value, onChange, label, req }: AccountSelectProps) {
  return (
    <FG label={label} req={req}>
      <select className="form-input" value={value} onChange={e => onChange(e.target.value)}>
        <option value="">— Select account —</option>
        {ACCOUNTS.map(a => (
          <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
        ))}
      </select>
    </FG>
  )
}
