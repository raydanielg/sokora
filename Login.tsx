import { useState } from 'react'
import { supabase, COMPANIES, getActiveCompany, switchCompany } from '../lib/supabase'
import type { Company } from '../lib/supabase'

interface Props {
  onLogin: () => void
}

export default function Login({ onLogin }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedCompany, setSelectedCompany] = useState<Company>(getActiveCompany())

  const handleCompanySelect = (company: Company) => {
    setSelectedCompany(company)
    switchCompany(company.id)
    setError('')
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    // Ensure we're using the right client
    switchCompany(selectedCompany.id)

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    // Check if user exists in our users table
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, is_active')
      .eq('email', email.toLowerCase())
      .single()

    if (userError || !userData) {
      setError('Account not found in this company. Check you selected the right one.')
      await supabase.auth.signOut()
      setLoading(false)
      return
    }

    if (!userData.is_active) {
      setError('Your account has been deactivated. Contact your administrator.')
      await supabase.auth.signOut()
      setLoading(false)
      return
    }

    setLoading(false)
    onLogin()
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logo}>
          <svg width="48" height="48" viewBox="0 0 100 100" fill="none">
            <circle cx="50" cy="50" r="45" fill={selectedCompany.color}/>
            <path d="M30 65 L50 35 L70 65" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            <circle cx="50" cy="28" r="6" fill="#f7a6ad"/>
          </svg>
        </div>
        
        <h1 style={styles.title}>SOKORA</h1>
        <p style={styles.subtitle}>Sign in to your account</p>

        {/* Company Selector */}
        <div style={styles.companySection}>
          <label style={styles.companyLabel}>SELECT COMPANY</label>
          <div style={styles.companyGrid}>
            {COMPANIES.map(company => {
              const isSelected = selectedCompany.id === company.id
              return (
                <div
                  key={company.id}
                  onClick={() => handleCompanySelect(company)}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: `2px solid ${isSelected ? company.color : '#333'}`,
                    background: isSelected ? `${company.color}15` : '#0d0d0d',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    textAlign: 'left' as const,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 10, height: 10, borderRadius: '50%',
                      background: isSelected ? company.color : '#444',
                      flexShrink: 0,
                    }} />
                    <div>
                      <div style={{
                        fontSize: 13, fontWeight: 600,
                        color: isSelected ? company.color : '#ccc',
                      }}>{company.shortName}</div>
                      <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>
                        {company.hideCRM ? 'Wholesale' : 'Retail + CRM'}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <form onSubmit={handleLogin} style={styles.form}>
          {error && (
            <div style={styles.error}>
              {error}
            </div>
          )}

          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@sokora.app"
              style={styles.input}
              required
              autoFocus
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter your password"
              style={styles.input}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              ...styles.button,
              background: selectedCompany.color,
              opacity: loading ? 0.7 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Signing in...' : `Sign In to ${selectedCompany.shortName}`}
          </button>
        </form>

        <p style={styles.footer}>
          {selectedCompany.name}
        </p>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    background: '#1e1e1e',
    borderRadius: 16,
    padding: 40,
    border: '1px solid #2a2a2a',
    textAlign: 'center' as const,
  },
  logo: {
    marginBottom: 24,
  },
  title: {
    fontFamily: 'Syne, sans-serif',
    fontSize: 28,
    fontWeight: 700,
    color: '#ffffff',
    margin: 0,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    margin: 0,
    marginBottom: 24,
  },
  companySection: {
    marginBottom: 24,
  },
  companyLabel: {
    display: 'block',
    fontSize: 10,
    fontWeight: 600,
    color: '#666',
    marginBottom: 10,
    letterSpacing: '1px',
  },
  companyGrid: {
    display: 'flex',
    gap: 8,
  },
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 20,
  },
  field: {
    textAlign: 'left' as const,
  },
  label: {
    display: 'block',
    fontSize: 12,
    fontWeight: 500,
    color: '#aaa',
    marginBottom: 8,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  input: {
    width: '100%',
    padding: '14px 16px',
    fontSize: 15,
    borderRadius: 10,
    border: '1px solid #333',
    background: '#0d0d0d',
    color: '#fff',
    outline: 'none',
    transition: 'border-color 0.2s',
    boxSizing: 'border-box' as const,
  },
  button: {
    width: '100%',
    padding: '14px 24px',
    fontSize: 15,
    fontWeight: 600,
    borderRadius: 10,
    border: 'none',
    background: '#85c2be',
    color: '#000',
    marginTop: 8,
    transition: 'all 0.2s',
  },
  error: {
    padding: '12px 16px',
    borderRadius: 10,
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    color: '#ef4444',
    fontSize: 13,
    textAlign: 'left' as const,
  },
  footer: {
    marginTop: 32,
    fontSize: 12,
    color: '#555',
  },
}
