import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import VoucherPage from '../../components/VoucherPage'
import { FG } from '../../components/FormHelpers'
import Toast from '../../components/Toast'
import DraftBanner from '../../components/DraftBanner'
import { nextRef, insertJournalWithRetry } from '../../lib/refs'
import { today, tzs } from '../../lib/utils'
import { useVoucherDraft } from '../../lib/useVoucherDraft'
import type { Page } from '../../lib/types'

interface Props { onNav: (p: Page) => void }
interface DBSupplier { id: string; name: string; balance_tzs: number; currency: string }
interface DBProduct { id: string; name: string; sku: string; cost_price: number }
interface InvLine { productId: string; desc: string; qty: number; unitCost: number; amount: number }

export default function PurchaseInvoice({ onNav }: Props) {
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [posting, setPosting] = useState(false)
  const [suppliers, setSuppliers] = useState<DBSupplier[]>([])
  const [products, setProducts] = useState<DBProduct[]>([])
  const [lines, setLines] = useState<InvLine[]>([{ productId: '', desc: '', qty: 1, unitCost: 0, amount: 0 }])
  const [form, setForm] = useState({
    date: today(), dueDate: '', ref: '', supplier: '',
    supplierRef: '', poRef: '', grnRef: '', fxRate: '2540', notes: ''
  })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  // ─── Draft persistence ─────────────────────────────────────────────────
  type PIDraft = { form: typeof form; lines: InvLine[] }
  const {
    availableDraft, draftAgeMs,
    saveDraft, clearDraft, acknowledgeResume, discardDraft,
  } = useVoucherDraft<PIDraft>('purchase-invoice', false)

  const resumeDraft = () => {
    if (!availableDraft) return
    setForm(availableDraft.form)
    setLines(availableDraft.lines)
    acknowledgeResume()
  }

  useEffect(() => { loadSuppliers(); loadProducts(); loadNextRef() }, [])

  // Auto-save once the user types anything meaningful
  useEffect(() => {
    if (!form.ref) return
    const hasAnything =
      form.supplier.trim().length > 0 ||
      form.supplierRef.trim().length > 0 ||
      form.notes.trim().length > 0 ||
      lines.some(l => l.productId || l.desc || l.qty !== 1 || l.unitCost > 0)
    if (!hasAnything) return
    saveDraft({ form, lines })
  }, [form, lines, saveDraft])

  const loadSuppliers = async () => {
    const { data } = await supabase.from('suppliers').select('id, name, balance_tzs, currency').eq('is_active', true).order('name')
    if (data) setSuppliers(data)
  }

  const loadProducts = async () => {
    const { data } = await supabase.from('products').select('id, name, sku, cost_price').eq('is_active', true).order('name')
    if (data) setProducts(data)
  }

  const loadNextRef = async () => {
    const ref = await nextRef('purchase_invoice')
    setForm(f => ({ ...f, ref }))
  }

  const updateLine = (i: number, field: keyof InvLine, val: string | number) => {
    const nl = [...lines]
    nl[i] = { ...nl[i], [field]: val as never }
    if (field === 'productId') {
      const p = products.find(p => p.id === val)
      if (p) { nl[i].desc = p.name; nl[i].unitCost = p.cost_price; nl[i].amount = nl[i].qty * p.cost_price }
    }
    if (field === 'qty' || field === 'unitCost') nl[i].amount = nl[i].qty * nl[i].unitCost
    setLines(nl)
  }

  const total = lines.reduce((s, l) => s + l.amount, 0)
  // No VAT on purchases — VAT is only on sales

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => { setToast(msg); setToastType(type) }

  const post = async () => {
    if (!form.supplier) { showToast('Please select a supplier', 'error'); return }
    if (lines.every(l => !l.productId && !l.desc)) { showToast('Please add at least one line', 'error'); return }
    if (total <= 0) { showToast('Total amount must be greater than zero', 'error'); return }
    setPosting(true)

    try {
      // Get account IDs — Dr GRN Interim / Cr AP
      const { data: acctData } = await supabase.from('accounts').select('id, code').in('code', ['1121', '2010'])
      const grnInterimId = acctData?.find(a => a.code === '1121')?.id
      const apId = acctData?.find(a => a.code === '2010')?.id
      if (!grnInterimId || !apId) throw new Error('Accounts 1121 or 2010 not found. Check Chart of Accounts.')

      const supplier = suppliers.find(s => s.id === form.supplier)

      // Create journal: Dr GRN Interim / Cr AP
      const { data: journalRaw, error: jErr } = await insertJournalWithRetry({
        ref: 'JV-' + form.ref,
        posting_date: form.date,
        description: `Purchase Invoice — ${supplier?.name} — ${form.ref}`,
        journal_type: 'purchase_invoice',
        source_type: 'purchase_invoice',
        source_ref: form.ref,
        posted_by: 'Joe Gembe',
        status: 'posted',
      })  
      if (jErr || !journalRaw) throw new Error(jErr?.message || "Journal insert failed")
      const journal = journalRaw

      // Journal lines
      const { error: jlErr } = await supabase.from('journal_lines').insert([
        { journal_id: journal.id, line_number: 1, account_id: grnInterimId, description: `GRN Interim cleared — ${form.grnRef || form.ref}`, debit: total, credit: 0, supplier_id: form.supplier },
        { journal_id: journal.id, line_number: 2, account_id: apId, description: `AP — ${supplier?.name} — ${form.ref}`, debit: 0, credit: total, supplier_id: form.supplier },
      ])
      if (jlErr) throw new Error('Journal lines: ' + jlErr.message)

      // Update account balances
      await Promise.all([
        supabase.rpc('update_account_balance', { p_account_id: grnInterimId, p_debit: total, p_credit: 0 }),
        supabase.rpc('update_account_balance', { p_account_id: apId, p_debit: 0, p_credit: total }),
      ])

      // Create voucher
      const { data: voucher, error: vErr } = await supabase.from('vouchers').insert({
        ref: form.ref,
        type: 'purchase_invoice',
        posting_date: form.date,
        due_date: form.dueDate || null,
        description: `Purchase Invoice — ${supplier?.name}`,
        total_amount: total,
        status: 'posted',
        supplier_id: form.supplier,
        journal_id: journal.id,
        notes: form.notes,
        posted_by: 'Joe Gembe',
      }).select('id').single()
      if (vErr || !voucher) throw new Error(vErr?.message || 'Voucher insert failed')

      // Save voucher lines
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (!line.amount) continue
        await supabase.from('voucher_lines').insert({
          voucher_id: voucher.id,
          line_number: i + 1,
          product_id: line.productId || null,
          description: line.desc,
          qty: line.qty,
          unit_cost: line.unitCost,
          subtotal: line.amount,
          total: line.amount,
        })
      }

      // Update supplier balance
      if (supplier) {
        await supabase.from('suppliers').update({ balance_tzs: (supplier.balance_tzs || 0) + total }).eq('id', form.supplier)
      }

      // Create vendor ledger entry
      await supabase.from('vendor_ledger_entries').insert({
        supplier_id: form.supplier,
        posting_date: form.date,
        document_type: 'invoice',
        document_ref: form.ref,
        description: `Purchase Invoice — ${supplier?.name}`,
        amount_tzs: total,
        remaining_amount: total,
        is_open: true,
        due_date: form.dueDate || null,
        journal_id: journal.id,
      })

      showToast(`${form.ref} posted · Dr GRN Interim (1121) / Cr AP (2010) · 1121 cleared · Supplier balance updated`)
      clearDraft()  // posted successfully
      onNav('vouchers')

    } catch (err: any) {
      showToast('' + (err.message || 'Something went wrong'), 'error')
    } finally {
      setPosting(false)
    }
  }

  return (
    <VoucherPage title="Purchase Invoice" icon="" subtitle="Match supplier invoice to GRN — clears 1121, creates AP entry" color="rgba(168,85,247,.12)"
      onPost={post} postLabel={posting ? 'Posting…' : 'Post Invoice'}
      journalNote="Dr GRN Interim (1121) · Cr Accounts Payable (2010) · Clears the GRN interim balance · Creates open AP entry">

      {availableDraft && draftAgeMs !== null && (
        <DraftBanner draftAgeMs={draftAgeMs} onResume={resumeDraft} onDiscard={discardDraft} />
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-row">
          <div>
            <div className="card-title" style={{ marginBottom: 14 }}>Invoice Details</div>
            <div className="form-row">
              <FG label="Invoice No" req><input className="form-input" value={form.ref} readOnly  /></FG>
              <FG label="Invoice Date" req><input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} /></FG>
            </div>
            <div className="form-row">
              <FG label="Due Date"><input type="date" className="form-input" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} /></FG>
              <FG label="FX Rate (TZS/USD)"><input className="form-input" value={form.fxRate} onChange={e => set('fxRate', e.target.value)} /></FG>
            </div>
            <div className="form-row">
              <FG label="Related PO Ref"><input className="form-input" placeholder="PO-0001" value={form.poRef} onChange={e => set('poRef', e.target.value)} /></FG>
              <FG label="Related GRN Ref"><input className="form-input" placeholder="GRN-0001" value={form.grnRef} onChange={e => set('grnRef', e.target.value)} /></FG>
            </div>
          </div>
          <div>
            <div className="card-title" style={{ marginBottom: 14 }}>Supplier</div>
            <FG label="Supplier" req>
              <select className="form-input" value={form.supplier} onChange={e => set('supplier', e.target.value)}>
                <option value="">— Select supplier —</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name} — Balance: TZS {(s.balance_tzs || 0).toLocaleString()}</option>)}
              </select>
            </FG>
            <FG label="Supplier Invoice Reference">
              <input className="form-input" placeholder="Supplier's own invoice number" value={form.supplierRef} onChange={e => set('supplierRef', e.target.value)} />
            </FG>
            <FG label="Notes">
              <textarea className="form-input" rows={2} style={{ resize: 'none' }} value={form.notes} onChange={e => set('notes', e.target.value)} />
            </FG>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title" style={{ marginBottom: 14 }}>Invoice Lines</div>
        <div className="table-wrap" style={{ marginBottom: 8 }}>
          <table>
            <thead><tr><th>Product</th><th>Description</th><th style={{ width: 80, textAlign: 'center' }}>Qty</th><th style={{ textAlign: 'right', width: 150 }}>Unit Cost (TZS)</th><th style={{ textAlign: 'right', width: 150 }}>Amount (TZS)</th><th style={{ width: 40 }}></th></tr></thead>
            <tbody>
              {lines.map((line, i) => (
                <tr key={i}>
                  <td>
                    <select className="form-input" style={{ fontSize: 12, padding: '6px 8px' }} value={line.productId} onChange={e => updateLine(i, 'productId', e.target.value)}>
                      <option value="">— Select product —</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
                    </select>
                  </td>
                  <td><input className="form-input" style={{ fontSize: 12, padding: '6px 8px' }} value={line.desc} onChange={e => updateLine(i, 'desc', e.target.value)} placeholder="Description" /></td>
                  <td><input type="number" className="form-input" style={{ fontSize: 12, padding: '6px 8px', textAlign: 'center' }} value={line.qty} min={1} onChange={e => updateLine(i, 'qty', parseInt(e.target.value) || 1)} /></td>
                  <td><input type="number" className="form-input" style={{ fontSize: 12, padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--mono)' }} value={line.unitCost} onChange={e => updateLine(i, 'unitCost', parseFloat(e.target.value) || 0)} /></td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }}>{line.amount.toLocaleString()}</td>
                  <td><button onClick={() => setLines(lines.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 14 }}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setLines([...lines, { productId: '', desc: '', qty: 1, unitCost: 0, amount: 0 }])}>+ Add Line</button>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <div style={{ width: 280, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700 }}>
              <span>Invoice Total</span>
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{tzs(total)}</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 14, fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>
        After posting: GRN Interim (1121) clears · AP Suppliers (2010) increases · Vendor ledger entry created · Supplier balance updated
      </div>

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </VoucherPage>
  )
}
