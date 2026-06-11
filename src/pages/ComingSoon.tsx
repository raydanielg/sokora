interface Props { module?: string }

export default function ComingSoon({ module = 'Module' }: Props) {
  return (
    <div className="page">
      <div className="coming-soon">
        <div className="cs-icon">🚧</div>
        <div className="cs-title">{module}</div>
        <div className="cs-sub">This module is planned for a future phase of the build.</div>
        <div className="cs-tag">Coming Soon</div>
      </div>
    </div>
  )
}
