interface ToastProps {
  message: string
  type?: 'success' | 'error'
  onClose: () => void
}

export default function Toast({ message, type = 'success', onClose }: ToastProps) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', bottom: 20, right: 20, background: 'var(--surface)',
      border: `1px solid ${type === 'success' ? 'var(--green)' : 'var(--red)'}`,
      borderRadius: 'var(--r)', padding: '14px 18px', display: 'flex',
      alignItems: 'center', gap: 12, fontSize: 13,
      boxShadow: '0 10px 40px rgba(0,0,0,.5)', zIndex: 1000, maxWidth: 460, cursor: 'pointer'
    }}>
      <span style={{ display: 'flex', alignItems: 'center' }}>
      {type === 'success'
        ? <svg width="18" height="18" fill="none" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
        : <svg width="18" height="18" fill="none" stroke="var(--red)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      }
    </span>
      <span>{message}</span>
    </div>
  )
}
