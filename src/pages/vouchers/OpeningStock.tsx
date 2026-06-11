import { insertJournalWithRetry } from '../../lib/refs'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import Toast from '../../components/Toast'
import { today, tzs } from '../../lib/utils'
import { postLedgerEntry } from '../../lib/itemLedger'
import { useUserLocation } from '../../lib/useUserLocation'
import type { Page } from '../../lib/types'

interface Props { onNav: (p: Page) => void }
interface OSLine { productId: string; name: string; qty: number; cost: number; amount: number }
interface StockLocation { id: string; code: string; name: string; branch_code: string }

export default function OpeningStock({ onNav }: Props) {
  const userLoc = useUserLocation()
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success'|'error'>('success')
  const [posting, setPosting] = useState(false)
  const [, setProducts] = useState<{id:string;sku:string;name:string;cost_price:number;qty_on_hand:number}[]>([])
  const [alreadyPosted, setAlreadyPosted] = useState(false)
  const [lines, setLines] = useState<OSLine[]>([{ productId: '', name: '', qty: 0, cost: 0, amount: 0 }])
  const [form, setForm] = useState({ date: today(), ref: 'OST-10-????', notes: '', locationCode: '' })
  const [locations, setLocations] = useState<StockLocation[]>([])
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    const [{ data: prods }, { count }, { data: locs }] = await Promise.all([
      supabase.from('products').select('id, sku, name, cost_price, qty_on_hand').eq('is_active', true).order('name'),
      supabase.from('vouchers').select('*', { count: 'exact', head: true }).eq('type', 'opening_stock'),
      supabase.from('stock_locations').select('id, code, name, branch_code').order('code'),
    ])
    if (prods) {
      setProducts(prods)
      setLines(prods.map(p => ({ productId: p.id, name: p.name, qty: p.qty_on_hand || 0, cost: p.cost_price, amount: (p.qty_on_hand || 0) * p.cost_price })))
    }
    if (locs && locs.length > 0) {
      setLocations(locs)
      // Locked users get their assigned location. Otherwise default to
      // warehouse (1002) if present, otherwise first location.
      const defaultLoc =
        (userLoc.defaultLocationCode && locs.find(l => l.code === userLoc.defaultLocationCode)) ||
        locs.find(l => l.code === '1002' || /warehouse|godown/i.test(l.name)) ||
        locs[0]
      setForm(f => ({ ...f, locationCode: defaultLoc.code }))
    }
    if ((count || 0) > 0) setAlreadyPosted(true)
  }

  const updateLine = (i: number, field: 'qty' | 'cost', val: number) => {
    const nl = [...lines]; nl[i] = { ...nl[i], [field]: val, amount: field === 'qty' ? val * nl[i].cost : nl[i].qty * val }; setLines(nl)
  }

  const total = lines.reduce((s, l) => s + l.amount, 0)
  const showToast = (msg: string, type: 'success'|'error' = 'success') => { setToast(msg); setToastType(type) }

  const post = async () => {
    if (alreadyPosted) { showToast('Opening stock already posted. Cannot post twice.', 'error'); return }
    if (lines.every(l => !l.qty)) { showToast('Enter at least one product quantity', 'error'); return }
    // Defence in depth: locked users cannot post opening stock to another location.
    if (!userLoc.canPostFrom(form.locationCode)) {
      showToast(`You are locked to location ${userLoc.defaultLocationCode}. You cannot post opening stock to ${form.locationCode}.`, 'error')
      return
    }
    setPosting(true)
    try {
      const { data: acctData } = await supabase.from('accounts').select('id, code').in('code', ['1110', '3040'])
      const inventoryId = acctData?.find(a => a.code === '1110')?.id
      const equityId = acctData?.find(a => a.code === '3040')?.id
      if (!inventoryId || !equityId) throw new Error('Inventory (1110) or Opening Stock Equity (3040) account not found')

      const { data: jRaw, error: jErr } = await insertJournalWithRetry({
        ref: 'JV-' + form.ref, posting_date: form.date,
        description: `Opening Stock — ${form.ref} — Total: ${tzs(total)}`,
        journal_type: 'opening_stock', source_type: 'opening_stock', source_ref: form.ref,
        posted_by: 'Joe Gembe', status: 'posted',
      })  
      if (jErr || !jRaw) throw new Error(jErr?.message || "Journal insert failed")
      const j = jRaw

      const jLines = [
        { journal_id: j.id, line_number: 1, account_id: inventoryId, description: `Opening inventory — ${form.ref}`, debit: total, credit: 0 },
        { journal_id: j.id, line_number: 2, account_id: equityId, description: `Opening stock equity — ${form.ref}`, debit: 0, credit: total },
      ]
      const { error: jlErr } = await supabase.from('journal_lines').insert(jLines)
      if (jlErr) throw new Error(jlErr.message)

      await Promise.all([
        supabase.rpc('update_account_balance', { p_account_id: inventoryId, p_debit: total, p_credit: 0 }),
        supabase.rpc('update_account_balance', { p_account_id: equityId, p_debit: 0, p_credit: total }),
      ])

      await supabase.from('vouchers').insert({
        ref: form.ref, type: 'opening_stock', posting_date: form.date,
        description: `Opening Stock — ${lines.filter(l => l.qty > 0).length} products — ${tzs(total)}`,
        total_amount: total, status: 'posted', journal_id: j.id,
        notes: form.notes, posted_by: 'Joe Gembe',
      })

      // Update product quantities + item ledger + per-location stock
      const selectedLoc = locations.find(l => l.code === form.locationCode)
      for (const line of lines) {
        if (!line.productId || !line.qty) continue
        await supabase.from('products').update({ qty_on_hand: line.qty, cost_price: line.cost }).eq('id', line.productId)
        await postLedgerEntry({
          product_id: line.productId, entry_type: 'opening_stock',
          document_type: 'opening_stock', document_ref: form.ref,
          posting_date: form.date, qty: line.qty, cost_amount: line.amount,
          location: selectedLoc || null,
        })
        // Mirror the opening stock into product_locations so location filters work
        if (selectedLoc) {
          await supabase.from('product_locations').upsert(
            { product_id: line.productId, location_id: selectedLoc.id, location_code: selectedLoc.code, qty_on_hand: line.qty, last_updated: new Date().toISOString() },
            { onConflict: 'product_id,location_id' }
          )
        }
      }

      showToast(`${form.ref} posted · ${lines.filter(l=>l.qty>0).length} products · Total value: ${tzs(total)}`)
      setAlreadyPosted(true)
      setTimeout(() => onNav('vouchers'), 1800)
    } catch (err: any) {
      console.error(err); showToast(err.message || 'Something went wrong', 'error')
    } finally { setPosting(false) }
  }

  return (
    <VoucherPage title="Opening Stock" icon="" subtitle="Enter initial stock quantities at go-live — one time only" color="rgba(212,135,74,.12)"
      onPost={post} postLabel={posting ? 'Posting…' : 'Post Opening Stock'}
      journalNote="Dr Inventory (1110) · Cr Opening Stock Equity (3040) · Run once at system go-live">
      {alreadyPosted && (
        <div style={{ background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: 'var(--r)', padding: 14, marginBottom: 16, fontSize: 12, color: 'var(--red)', fontWeight: 600 }}>
          Opening stock has already been posted. This voucher is locked to prevent double-counting.
        </div>
      )}
      <div style={{ background: 'var(--yellow-dim)', border: '1px solid rgba(255,211,42,.3)', borderRadius: 'var(--r)', padding: 14, marginBottom: 16, fontSize: 12, color: 'var(--yellow)' }}>
        One-time entry only. Posting twice will double your inventory values and distort all financial reports.
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-row">
          <FG label="Ref"><input className="form-input" value={form.ref} readOnly  /></FG>
          <FG label="Date" req><input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} /></FG>
          <FG label="Location" req>
            <select
              className="form-input"
              value={form.locationCode}
              onChange={e => set('locationCode', e.target.value)}
              disabled={alreadyPosted || userLoc.isLocked}
              title={userLoc.isLocked ? `Locked to ${userLoc.defaultLocationCode}` : ''}
            >
              {locations.length === 0 && <option value="">— Loading —</option>}
              {locations.map(l => {
                const isMine = !userLoc.isLocked || userLoc.defaultLocationCode === l.code
                return (
                  <option key={l.id} value={l.code} disabled={!isMine}>
                    {l.code} — {l.name}{!isMine ? ' (not assigned)' : ''}
                  </option>
                )
              })}
            </select>
          </FG>
        </div>
        <FG label="Notes"><input className="form-input" placeholder="e.g. Opening stock as at 1 July 2025" value={form.notes} onChange={e => set('notes', e.target.value)} /></FG>
      </div>
      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>Products — Enter Quantities and Costs</div>
        <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 12 }}>PRODUCT · QTY ON HAND · COST PRICE · VALUE</div>
        {lines.map((line, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 130px 130px', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 600, padding: '8px 4px' }}>{line.name}</div>
            <input type="number" className="form-input" style={{ textAlign: 'center', fontWeight: 700 }} min={0} value={line.qty} onChange={e => updateLine(i, 'qty', parseInt(e.target.value) || 0)} disabled={alreadyPosted} />
            <input type="number" className="form-input" style={{ fontFamily: 'var(--mono)', textAlign: 'right' }} value={line.cost} onChange={e => updateLine(i, 'cost', parseFloat(e.target.value) || 0)} disabled={alreadyPosted} />
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12, textAlign: 'right', padding: '8px 12px', background: 'var(--surface2)', borderRadius: 'var(--r)', color: 'var(--green)' }}>{tzs(line.amount)}</div>
          </div>
        ))}
        <div style={{ borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 12, display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 800 }}>
          <span>Total Opening Stock Value</span>
          <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{tzs(total)}</span>
        </div>
      </div>
      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
