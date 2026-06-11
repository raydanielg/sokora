import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import LineItemsTable from '../../components/LineItemsTable'
import Toast from '../../components/Toast'
import { today, tzs } from '../../lib/utils'
import type { Page, LineItem } from '../../lib/types'

interface Props { onNav: (p: Page) => void }
interface DBSupplier { id: string; name: string; currency: string }

export default function PurchaseOrder({ onNav }: Props) {
  const [suppliers, setSuppliers] = useState<DBSupplier[]>([])
  const [toast, setToast] = useState('')
  const [lines, setLines] = useState<LineItem[]>([{ productId: '', desc: '', qty: 1, price: 0, amount: 0 }])
  const [form, setForm] = useState({ date: today(), deliveryDate: '', ref: '', supplier: '', currency: 'USD', fxRate: '2540', notes: '' })
  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    const [{ data: sups }, { count }] = await Promise.all([
      supabase.from('suppliers').select('id, name, currency').eq('is_active', true).order('name'),
      supabase.from('vouchers').select('*', { count: 'exact', head: true }).eq('type', 'purchase_order'),
    ])
    if (sups) setSuppliers(sups as DBSupplier[])
    setForm(f => ({ ...f, ref: 'PO-' + String((count || 0) + 1).padStart(4, '0') }))
  }

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const subtotalUSD = lines.reduce((s, l) => s + l.amount, 0)
  const subtotalTZS = subtotalUSD * (parseInt(form.fxRate) || 2540)
  const [toast2Type, setToast2Type] = useState<'success'|'error'>('success')
  const post = async () => {
    if (!form.supplier) { setToast('Select a supplier'); setToast2Type('error'); return }
    if (lines.every(l => !l.desc || !l.amount)) { setToast('Add at least one order line'); setToast2Type('error'); return }
    try {
      const supplier = suppliers.find(s => s.id === form.supplier)
      await supabase.from('vouchers').insert({
        ref: form.ref, type: 'purchase_order', posting_date: form.date,
        description: `Purchase Order — ${supplier?.name}`,
        total_amount: subtotalTZS, status: 'posted',
        supplier_id: form.supplier,
        notes: `${form.currency} @ ${form.fxRate}${form.deliveryDate ? ' · Expected: ' + form.deliveryDate : ''} ${form.notes}`.trim(),
        posted_by: 'Joe Gembe',
      })
      setToast(`${form.ref} created · PO saved · No journal posted`)
      setToast2Type('success')
      setTimeout(() => onNav('vouchers'), 1500)
    } catch (err: any) {
      console.error(err); setToast(err.message || 'Something went wrong'); setToast2Type('error')
    }
  }

  return (
    <VoucherPage title="Purchase Order" icon="" subtitle="Order goods from supplier — no journal until GRN" color="rgba(100,116,139,.12)"
      onPost={post} postLabel="Confirm & Send PO"
      journalNote="No journal posted — accounting happens on GRN receipt">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-row">
          <div>
            <div className="card-title" style={{ marginBottom: 14 }}>Order Details</div>
            <div className="form-row">
              <FG label="PO Number" req><input className="form-input" value={form.ref} readOnly  /></FG>
              <FG label="Order Date" req><input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} /></FG>
            </div>
            <FG label="Expected Delivery Date"><input type="date" className="form-input" value={form.deliveryDate} onChange={e => set('deliveryDate', e.target.value)} /></FG>
            <div className="form-row">
              <FG label="Currency"><select className="form-input" value={form.currency} onChange={e => set('currency', e.target.value)}><option>USD</option><option>TZS</option><option>INR</option><option>CNY</option></select></FG>
              <FG label="Exchange Rate"><input className="form-input" value={form.fxRate} onChange={e => set('fxRate', e.target.value)} /></FG>
            </div>
          </div>
          <div>
            <div className="card-title" style={{ marginBottom: 14 }}>Supplier</div>
            <FG label="Supplier" req>
              <select className="form-input" value={form.supplier} onChange={e => set('supplier', e.target.value)}>
                <option value="">— Select supplier —</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name} ({s.currency})</option>)}
              </select>
            </FG>
            <FG label="Payment Terms"><select className="form-input"><option>NET30</option><option>NET60</option><option>50% Advance</option><option>100% Advance</option></select></FG>
          </div>
        </div>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title" style={{ marginBottom: 14 }}>Order Lines (in {form.currency})</div>
        <LineItemsTable lines={lines} setLines={setLines} priceLabel={`Unit Price (${form.currency})`} />
        {form.currency === 'USD' && subtotalUSD > 0 && (
          <div style={{ background: 'var(--blue-dim)', border: '1px solid rgba(61,139,255,.2)', borderRadius: 'var(--r)', padding: 12, marginTop: 12, fontSize: 12, fontFamily: 'var(--mono)' }}>
            USD Total: <span style={{ color: 'var(--blue)', fontWeight: 700 }}>${subtotalUSD.toLocaleString()}</span> · TZS Equivalent: <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{tzs(subtotalTZS)}</span> @ rate {form.fxRate}
          </div>
        )}
      </div>
      <div className="card">
        <FG label="Notes / Special Instructions"><textarea className="form-input" rows={2} placeholder="Packaging requirements, shipping instructions…" value={form.notes} onChange={e => set('notes', e.target.value)} style={{ resize: 'none' }} /></FG>
      </div>
      {toast && <Toast message={toast} type={toast2Type} onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
