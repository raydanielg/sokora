import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getPostedBy } from '../lib/utils';

type Tab = 'fiscal' | 'golive' | 'rules' | 'log';

interface FiscalYear {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: 'open' | 'closed';
  is_current: boolean;
  created_at: string;
}

interface AccountingPeriod {
  id: string;
  fiscal_year_id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: 'open' | 'locked' | 'closed';
  locked_by: string | null;
  locked_at: string | null;
  created_at: string;
}

interface PostingRule {
  id: string;
  allow_posting_to_closed: boolean;
  allow_backdating_days: number;
  require_narration: boolean;
  enable_eod_lock: boolean;
  created_at: string;
  updated_at: string;
}

interface GoLiveDate {
  id: string;
  go_live_date: string;
  opening_balance_status: 'draft' | 'confirmed' | 'locked';
  created_at: string;
  updated_at: string;
}

interface PeriodLockLog {
  id: string;
  period_id: string;
  period_name: string;
  action: 'locked' | 'unlocked' | 'closed';
  locked_by: string;
  locked_at: string;
}

export default function AccountingSettings() {
  const [activeTab, setActiveTab] = useState<Tab>('fiscal');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Fiscal Years & Periods
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([]);
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [newFYName, setNewFYName] = useState('');
  const [newFYStart, setNewFYStart] = useState('');
  const [newFYEnd, setNewFYEnd] = useState('');
  const [autoLockHistorical, setAutoLockHistorical] = useState(true);
  const [expandedFY, setExpandedFY] = useState<string | null>(null);

  // Go-Live Date
  const [goLiveDate, setGoLiveDate] = useState<GoLiveDate | null>(null);
  const [newGoLiveDate, setNewGoLiveDate] = useState('');
  const [openingBalanceStatus, setOpeningBalanceStatus] = useState<'draft' | 'confirmed' | 'locked'>('draft');

  // Posting Rules
  const [postingRules, setPostingRules] = useState<PostingRule | null>(null);
  const [allowPostingClosed, setAllowPostingClosed] = useState(false);
  const [backdatingDays, setBackdatingDays] = useState(30);
  const [requireNarration, setRequireNarration] = useState(false);
  const [enableEODLock, setEnableEODLock] = useState(false);

  // Period Lock Log
  const [lockLog, setLockLog] = useState<PeriodLockLog[]>([]);

  // Load all data
  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    try {
      setLoading(true);
      
      const fyData = await supabase.from('fiscal_years').select('*').order('start_date', { ascending: false });
      const periodsData = await supabase.from('accounting_periods').select('*').order('start_date', { ascending: true });
      
      const goLiveRes = await supabase.from('go_live_dates').select('*').single();
      const goLiveData = { data: goLiveRes.data, error: null };
      
      const rulesRes = await supabase.from('posting_rules').select('*').single();
      const rulesData = { data: rulesRes.data, error: null };
      
      const logData = await supabase.from('period_lock_log').select('*').order('locked_at', { ascending: false });

      if (fyData.data) setFiscalYears(fyData.data);
      if (periodsData.data) setPeriods(periodsData.data);
      if (goLiveData.data) setGoLiveDate(goLiveData.data);
      if (rulesData.data) {
        setPostingRules(rulesData.data);
        setAllowPostingClosed(rulesData.data.allow_posting_to_closed);
        setBackdatingDays(rulesData.data.allow_backdating_days);
        setRequireNarration(rulesData.data.require_narration);
        setEnableEODLock(rulesData.data.enable_eod_lock);
      }
      if (logData.data) setLockLog(logData.data);

      // Clear messages after 4 seconds
      setTimeout(() => {
        setError(null);
        setSuccessMsg(null);
      }, 4000);
    } catch (err) {
      setError('Failed to load accounting settings');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // TAB 1: Fiscal Years & Periods
  const createFiscalYear = async () => {
    if (!newFYName || !newFYStart || !newFYEnd) {
      setError('All fiscal year fields required');
      return;
    }

    try {
      setLoading(true);
      const startDate = new Date(newFYStart);

      // Create fiscal year
      const { data: fy, error: fyError } = await supabase
        .from('fiscal_years')
        .insert({
          name: newFYName,
          start_date: newFYStart,
          end_date: newFYEnd,
          status: 'open',
          is_current: false,
        })
        .select()
        .single();

      if (fyError) throw fyError;

      // Auto-generate 12 monthly periods
      const periods_to_insert = [];
      let currentDate = new Date(startDate);

      for (let i = 0; i < 12; i++) {
        const monthStart = new Date(currentDate);
        const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
        const monthName = monthStart.toLocaleString('default', { month: 'long', year: 'numeric' });

        periods_to_insert.push({
          fiscal_year_id: fy.id,
          name: monthName,
          start_date: monthStart.toISOString().split('T')[0],
          end_date: monthEnd.toISOString().split('T')[0],
          status: autoLockHistorical && monthEnd < new Date() ? 'locked' : 'open',
          locked_by: autoLockHistorical && monthEnd < new Date() ? getPostedBy() : null,
          locked_at: autoLockHistorical && monthEnd < new Date() ? new Date().toISOString() : null,
        });

        currentDate.setMonth(currentDate.getMonth() + 1);
      }

      const { error: periodsError } = await supabase.from('accounting_periods').insert(periods_to_insert);
      if (periodsError) throw periodsError;

      setNewFYName('');
      setNewFYStart('');
      setNewFYEnd('');
      setSuccessMsg(`Fiscal year "${newFYName}" created with 12 periods`);
      await loadAllData();
    } catch (err) {
      setError(`Failed to create fiscal year: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const lockPeriod = async (periodId: string, periodName: string) => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from('accounting_periods')
        .update({
          status: 'locked',
          locked_by: getPostedBy(),
          locked_at: new Date().toISOString(),
        })
        .eq('id', periodId);

      if (error) throw error;

      // Log the action
      await supabase.from('period_lock_log').insert({
        period_id: periodId,
        period_name: periodName,
        action: 'locked',
        locked_by: getPostedBy(),
        locked_at: new Date().toISOString(),
      });

      setSuccessMsg(`${periodName} locked`);
      await loadAllData();
    } catch (err) {
      setError(`Failed to lock period: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const unlockPeriod = async (periodId: string, periodName: string) => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from('accounting_periods')
        .update({
          status: 'open',
          locked_by: null,
          locked_at: null,
        })
        .eq('id', periodId);

      if (error) throw error;

      // Log the action
      await supabase.from('period_lock_log').insert({
        period_id: periodId,
        period_name: periodName,
        action: 'unlocked',
        locked_by: getPostedBy(),
        locked_at: new Date().toISOString(),
      });

      setSuccessMsg(`${periodName} unlocked`);
      await loadAllData();
    } catch (err) {
      setError(`Failed to unlock period: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  // TAB 2: Go-Live Date
  const saveGoLiveDate = async () => {
    if (!newGoLiveDate) {
      setError('Go-live date required');
      return;
    }

    try {
      setLoading(true);

      if (goLiveDate) {
        // Update
        const { error } = await supabase
          .from('go_live_dates')
          .update({
            go_live_date: newGoLiveDate,
            opening_balance_status: openingBalanceStatus,
          })
          .eq('id', goLiveDate.id);
        if (error) throw error;
      } else {
        // Insert
        const { error } = await supabase.from('go_live_dates').insert({
          go_live_date: newGoLiveDate,
          opening_balance_status: openingBalanceStatus,
        });
        if (error) throw error;
      }

      setSuccessMsg('Go-live date saved');
      await loadAllData();
    } catch (err) {
      setError(`Failed to save go-live date: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  // TAB 3: Posting Rules
  const savePostingRules = async () => {
    try {
      setLoading(true);

      if (postingRules) {
        // Update
        const { error } = await supabase
          .from('posting_rules')
          .update({
            allow_posting_to_closed: allowPostingClosed,
            allow_backdating_days: backdatingDays,
            require_narration: requireNarration,
            enable_eod_lock: enableEODLock,
          })
          .eq('id', postingRules.id);
        if (error) throw error;
      } else {
        // Insert
        const { error } = await supabase.from('posting_rules').insert({
          allow_posting_to_closed: allowPostingClosed,
          allow_backdating_days: backdatingDays,
          require_narration: requireNarration,
          enable_eod_lock: enableEODLock,
        });
        if (error) throw error;
      }

      setSuccessMsg('Posting rules saved');
      await loadAllData();
    } catch (err) {
      setError(`Failed to save posting rules: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const clearMessages = () => {
    setError(null);
    setSuccessMsg(null);
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Accounting Settings</h1>
        <p className="page-sub">Configure fiscal years, periods, and posting rules</p>
      </div>

      {error && (
        <div style={{
          backgroundColor: '#ffe0e0',
          borderLeft: '4px solid #ff4444',
          padding: '12px 16px',
          borderRadius: '4px',
          marginBottom: '20px',
          color: '#cc0000',
          fontSize: '14px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          {error}
          <button onClick={clearMessages} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px' }}>×</button>
        </div>
      )}

      {successMsg && (
        <div style={{
          backgroundColor: '#e0ffe0',
          borderLeft: '4px solid #44aa44',
          padding: '12px 16px',
          borderRadius: '4px',
          marginBottom: '20px',
          color: '#006600',
          fontSize: '14px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          {successMsg}
          <button onClick={clearMessages} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px' }}>×</button>
        </div>
      )}

      {/* Tab Navigation */}
      <div style={{
        display: 'flex',
        gap: '12px',
        borderBottom: '1px solid var(--border)',
        marginBottom: '24px',
        paddingBottom: '0'
      }}>
        <button
          onClick={() => setActiveTab('fiscal')}
          className={activeTab === 'fiscal' ? 'btn btn-primary' : 'btn btn-ghost'}
          style={{
            borderBottom: activeTab === 'fiscal' ? '3px solid var(--accent)' : 'none',
            borderRadius: '0',
            paddingBottom: '12px'
          }}
        >
          Fiscal Years & Periods
        </button>
        <button
          onClick={() => setActiveTab('golive')}
          className={activeTab === 'golive' ? 'btn btn-primary' : 'btn btn-ghost'}
          style={{
            borderBottom: activeTab === 'golive' ? '3px solid var(--accent)' : 'none',
            borderRadius: '0',
            paddingBottom: '12px'
          }}
        >
          Go-Live & Migration
        </button>
        <button
          onClick={() => setActiveTab('rules')}
          className={activeTab === 'rules' ? 'btn btn-primary' : 'btn btn-ghost'}
          style={{
            borderBottom: activeTab === 'rules' ? '3px solid var(--accent)' : 'none',
            borderRadius: '0',
            paddingBottom: '12px'
          }}
        >
          Posting Rules
        </button>
        <button
          onClick={() => setActiveTab('log')}
          className={activeTab === 'log' ? 'btn btn-primary' : 'btn btn-ghost'}
          style={{
            borderBottom: activeTab === 'log' ? '3px solid var(--accent)' : 'none',
            borderRadius: '0',
            paddingBottom: '12px'
          }}
        >
          Period Lock Log
        </button>
      </div>

      {/* TAB 1: Fiscal Years & Periods */}
      {activeTab === 'fiscal' && (
        <div>
          <div className="card" style={{ marginBottom: '24px' }}>
            <h2 className="card-title">Create Fiscal Year</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500' }}>
                  Fiscal Year Name
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. FY 2026"
                  value={newFYName}
                  onChange={(e) => setNewFYName(e.target.value)}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500' }}>
                  Start Date
                </label>
                <input
                  type="date"
                  className="form-input"
                  value={newFYStart}
                  onChange={(e) => setNewFYStart(e.target.value)}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500' }}>
                  End Date
                </label>
                <input
                  type="date"
                  className="form-input"
                  value={newFYEnd}
                  onChange={(e) => setNewFYEnd(e.target.value)}
                />
              </div>
            </div>
            <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                id="autoLock"
                checked={autoLockHistorical}
                onChange={(e) => setAutoLockHistorical(e.target.checked)}
              />
              <label htmlFor="autoLock" style={{ fontSize: '14px' }}>
                Auto-lock historical periods (lock periods before today)
              </label>
            </div>
            <button
              onClick={createFiscalYear}
              disabled={loading}
              className="btn btn-primary"
            >
              {loading ? 'Creating...' : 'Create Fiscal Year'}
            </button>
          </div>

          <div style={{ marginTop: '24px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px' }}>Fiscal Years</h2>
            {fiscalYears.length === 0 ? (
              <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '40px' }}>No fiscal years created yet</p>
            ) : (
              fiscalYears.map((fy) => (
                <div key={fy.id} className="card" style={{ marginBottom: '16px' }}>
                  <div
                    onClick={() => setExpandedFY(expandedFY === fy.id ? null : fy.id)}
                    style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <div>
                      <h3 className="card-title" style={{ marginBottom: '4px' }}>{fy.name}</h3>
                      <p style={{ fontSize: '13px', color: 'var(--muted)' }}>
                        {new Date(fy.start_date).toLocaleDateString()} to {new Date(fy.end_date).toLocaleDateString()}
                      </p>
                    </div>
                    <span style={{ fontSize: '18px', color: 'var(--muted)' }}>
                      {expandedFY === fy.id ? '−' : '+'}
                    </span>
                  </div>

                  {expandedFY === fy.id && (
                    <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
                      <div style={{ display: 'grid', gap: '8px' }}>
                        {periods
                          .filter((p) => p.fiscal_year_id === fy.id)
                          .map((period) => (
                            <div
                              key={period.id}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '10px',
                                backgroundColor: 'var(--surface2)',
                                borderRadius: '4px',
                                fontSize: '14px'
                              }}
                            >
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: '500', marginBottom: '2px' }}>{period.name}</div>
                                <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                                  {new Date(period.start_date).toLocaleDateString()} to{' '}
                                  {new Date(period.end_date).toLocaleDateString()}
                                </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span
                                  className="pill"
                                  style={{
                                    padding: '4px 10px',
                                    backgroundColor:
                                      period.status === 'open'
                                        ? 'rgba(132, 194, 190, 0.2)'
                                        : period.status === 'locked'
                                        ? 'rgba(255, 102, 102, 0.2)'
                                        : 'rgba(100, 100, 100, 0.2)',
                                    color:
                                      period.status === 'open'
                                        ? '#006633'
                                        : period.status === 'locked'
                                        ? '#990000'
                                        : '#666666',
                                    fontSize: '12px',
                                    fontWeight: '500',
                                    borderRadius: '3px'
                                  }}
                                >
                                  {period.status}
                                </span>
                                {period.status === 'open' && (
                                  <button
                                    onClick={() => lockPeriod(period.id, period.name)}
                                    disabled={loading}
                                    className="btn btn-sm"
                                    style={{ fontSize: '12px', padding: '6px 12px' }}
                                  >
                                    Lock
                                  </button>
                                )}
                                {period.status === 'locked' && (
                                  <button
                                    onClick={() => unlockPeriod(period.id, period.name)}
                                    disabled={loading}
                                    className="btn btn-sm"
                                    style={{ fontSize: '12px', padding: '6px 12px' }}
                                  >
                                    Unlock
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 2: Go-Live & Migration */}
      {activeTab === 'golive' && (
        <div>
          <div className="card">
            <h2 className="card-title">Go-Live & Migration Date</h2>
            <p style={{ color: 'var(--muted)', fontSize: '14px', marginBottom: '16px' }}>
              Set the date when SOKORA becomes the system of record. This is informational and does not automatically lock periods.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500' }}>
                  Go-Live Date
                </label>
                <input
                  type="date"
                  className="form-input"
                  value={newGoLiveDate || (goLiveDate?.go_live_date || '')}
                  onChange={(e) => setNewGoLiveDate(e.target.value)}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500' }}>
                  Opening Balance Status
                </label>
                <select
                  className="form-input"
                  value={openingBalanceStatus}
                  onChange={(e) => setOpeningBalanceStatus(e.target.value as 'draft' | 'confirmed' | 'locked')}
                >
                  <option value="draft">Draft</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="locked">Locked</option>
                </select>
              </div>
            </div>
            <button
              onClick={saveGoLiveDate}
              disabled={loading}
              className="btn btn-primary"
            >
              {loading ? 'Saving...' : 'Save Go-Live Date'}
            </button>

            {goLiveDate && (
              <div style={{ marginTop: '24px', padding: '16px', backgroundColor: 'var(--surface2)', borderRadius: '4px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Current Setting</h3>
                <p style={{ fontSize: '14px', marginBottom: '4px' }}>
                  <strong>Go-Live Date:</strong> {new Date(goLiveDate.go_live_date).toLocaleDateString()}
                </p>
                <p style={{ fontSize: '14px' }}>
                  <strong>Opening Balance Status:</strong> {goLiveDate.opening_balance_status}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: Posting Rules */}
      {activeTab === 'rules' && (
        <div>
          <div className="card">
            <h2 className="card-title">Posting Rules</h2>
            <p style={{ color: 'var(--muted)', fontSize: '14px', marginBottom: '16px' }}>
              Configure rules for posting vouchers. Only Super Admins can bypass these rules.
            </p>

            <div style={{ display: 'grid', gap: '16px' }}>
              <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: '500' }}>
                  <input
                    type="checkbox"
                    checked={allowPostingClosed}
                    onChange={(e) => setAllowPostingClosed(e.target.checked)}
                  />
                  Allow posting to closed periods (Super Admin only)
                </label>
                <p style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '6px' }}>
                  If disabled, no one can post to closed periods, not even Super Admin
                </p>
              </div>

              <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500' }}>
                  Block posting older than (days)
                </label>
                <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '8px' }}>
                  Regular users cannot post beyond this limit. Super Admin can override.
                </p>
                <input
                  type="number"
                  className="form-input"
                  value={backdatingDays}
                  onChange={(e) => setBackdatingDays(parseInt(e.target.value) || 30)}
                  min="0"
                  max="365"
                />
              </div>

              <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: '500' }}>
                  <input
                    type="checkbox"
                    checked={requireNarration}
                    onChange={(e) => setRequireNarration(e.target.checked)}
                  />
                  Require narration on all journal entries
                </label>
              </div>

              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: '500' }}>
                  <input
                    type="checkbox"
                    checked={enableEODLock}
                    onChange={(e) => setEnableEODLock(e.target.checked)}
                  />
                  Enable end-of-day lock (Super Admin only)
                </label>
                <p style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '6px' }}>
                  Prevents posting after 5 PM unless Super Admin overrides
                </p>
              </div>
            </div>

            <button
              onClick={savePostingRules}
              disabled={loading}
              className="btn btn-primary"
              style={{ marginTop: '24px' }}
            >
              {loading ? 'Saving...' : 'Save Posting Rules'}
            </button>
          </div>
        </div>
      )}

      {/* TAB 4: Period Lock Log */}
      {activeTab === 'log' && (
        <div>
          <div className="card">
            <h2 className="card-title">Period Lock Audit Trail</h2>
            {lockLog.length === 0 ? (
              <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '40px' }}>No lock actions recorded yet</p>
            ) : (
              <div className="table-wrap" style={{ marginTop: '16px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)' }}>
                      <th style={{ textAlign: 'left', padding: '12px', fontWeight: '600' }}>Period</th>
                      <th style={{ textAlign: 'left', padding: '12px', fontWeight: '600' }}>Action</th>
                      <th style={{ textAlign: 'left', padding: '12px', fontWeight: '600' }}>Locked By</th>
                      <th style={{ textAlign: 'left', padding: '12px', fontWeight: '600' }}>Date & Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lockLog.map((log) => (
                      <tr key={log.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '12px' }}>{log.period_name}</td>
                        <td style={{ padding: '12px' }}>
                          <span
                            className="pill"
                            style={{
                              padding: '4px 10px',
                              backgroundColor:
                                log.action === 'locked'
                                  ? 'rgba(255, 102, 102, 0.2)'
                                  : log.action === 'unlocked'
                                  ? 'rgba(132, 194, 190, 0.2)'
                                  : 'rgba(100, 100, 100, 0.2)',
                              color:
                                log.action === 'locked'
                                  ? '#990000'
                                  : log.action === 'unlocked'
                                  ? '#006633'
                                  : '#666666',
                              fontSize: '12px',
                              fontWeight: '500',
                              borderRadius: '3px'
                            }}
                          >
                            {log.action}
                          </span>
                        </td>
                        <td style={{ padding: '12px' }}>{log.locked_by}</td>
                        <td style={{ padding: '12px', fontSize: '13px', color: 'var(--muted)' }}>
                          {new Date(log.locked_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
