import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import Toast from '../../components/Toast'
import { FG } from '../../components/FormHelpers'
import { tzs, today } from '../../lib/utils'
import { validatePostingDate } from '../../lib/dateValidation'
import { useAuth } from '../../lib/useAuth'
import { useUserLocation } from '../../lib/useUserLocation'
import { postLedgerEntry } from '../../lib/itemLedger'
import type { Page } from '../../lib/types'

interface Props { onNav: (p: Page) => void }
interface DBSupplier { id: string; code: string; name: string; balance_tzs: number }
interface DBProduct { id: string; name: string; sku: string; cost_price: number; qty_on_hand: number }
interface StockLocation { id: string; code: string; name: string }
interface DBAccount { id: string; code: string; name: string; category: string; type: string }
interface ImportOrder { id: string; ref: string; supplier_id: string; status: string; order_date: string; expected_ready_date: string; currency: string; fx_rate: number; total_usd: number; total_tzs: number; total_freight_tzs: number; total_landed_tzs: number; notes: string; created_by: string; created_at: string; suppliers?: { name: string; code: string } | null }
interface OrderLine { id?: string; order_id?: string; line_number: number; product_id: string; description: string; qty: number; unit_cost_usd: number; unit_cost_tzs: number; subtotal_usd: number; subtotal_tzs: number; qty_received: number; landed_unit_cost_tzs: number }
interface Payment { id?: string; order_id?: string; payment_type: string; payment_date: string; amount_tzs: number; bank_account_id: string; agent_name: string; reference: string; notes: string; journal_id?: string }
interface Shipment { id?: string; order_id?: string; shipment_number: number; method: string; agent_name: string; tracking_ref: string; ship_date: string; expected_arrival: string; actual_arrival: string; freight_cost_tzs: number; freight_paid: boolean; status: string; notes: string; import_shipment_lines?: ShipmentLine[] }
interface ShipmentLine { id?: string; shipment_id?: string; order_line_id: string; qty_shipped: number; qty_received: number }
interface ReceiveLine { shipmentLineId: string; orderLineId: string; productId: string; qtyShipped: number; qtyAlreadyReceived: number; qtyReceive: number; desc: string; unitCostTzs: number }

const Ic = ({ n, s = 14, c = 'currentColor' }: { n: string; s?: number; c?: string }) => {
  const p = { width: s, height: s, fill: 'none', stroke: c, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' }
  if (n === 'plus') return <svg {...p}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
  if (n === 'back') return <svg {...p}><polyline points="15 18 9 12 15 6"/></svg>
  if (n === 'refresh') return <svg {...p}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
  if (n === 'ship') return <svg {...p}><path d="M5 18H3c-.6 0-1-.4-1-1V7c0-.6.4-1 1-1h10c.6 0 1 .4 1 1v11"/><path d="M14 9h4l4 4v4c0 .6-.4 1-1 1h-2"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/></svg>
  if (n === 'check') return <svg {...p}><polyline points="20 6 9 17 4 12"/></svg>
  if (n === 'dollar') return <svg {...p}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
  return <svg {...p}><circle cx="12" cy="12" r="10"/></svg>
}
const STA_C: Record<string, string> = {
  draft: 'pill-gray',
  deposit_paid: 'pill-amber',
  in_production: 'pill-amber',
  balance_paid: 'pill-blue',
  shipped: 'pill-blue',
  at_port: 'pill-amber',
  with_carrier: 'pill-amber',
  partially_received: 'pill-amber',
  received: 'pill-green',
  closed: 'pill-green',
  voided: 'pill-red',
}
const STA_L: Record<string, string> = {
  draft: 'Order Created',
  deposit_paid: 'Deposit Sent',
  in_production: 'Supplier Producing',
  balance_paid: 'Fully Paid Supplier',
  shipped: 'In Transit',
  at_port: 'Arrived at Port',
  with_carrier: 'With Local Carrier',
  partially_received: 'Partial Received',
  received: 'In Godown',
  closed: 'Closed',
  voided: 'Voided',
}
// What action the user should take next, given current status
const NEXT_HINT: Record<string, string> = {
  draft: 'Send deposit to supplier to lock in production',
  deposit_paid: 'Mark as "In Production" once supplier confirms manufacturing started',
  in_production: 'Pay balance when supplier confirms goods are ready',
  balance_paid: 'Add shipment details once supplier hands over to forwarder',
  shipped: 'Mark as "Arrived at Port" when notified by your shipping agent',
  at_port: 'Pay agent (shipping + customs + clearing) before goods are released',
  with_carrier: 'Pay local carrier and receive goods at godown',
  partially_received: 'Receive remaining goods, or close order if final',
  received: 'Verify all paid, then close this order',
  closed: 'This order is closed and archived',
}
const EMPTY_LINE: OrderLine = { line_number:1, product_id:'', description:'', qty:1, unit_cost_usd:0, unit_cost_tzs:0, subtotal_usd:0, subtotal_tzs:0, qty_received:0, landed_unit_cost_tzs:0 }

export default function ImportOrder({ onNav }: Props) {
  const { user, isSuperAdmin } = useAuth()
  const userLoc = useUserLocation()
  const [toast, setToast] = useState(''); const [toastType, setToastType] = useState<'success'|'error'>('success')
  const showToast = (m: string, t: 'success'|'error' = 'success') => { setToast(m); setToastType(t) }
  const [suppliers, setSuppliers] = useState<DBSupplier[]>([]); const [products, setProducts] = useState<DBProduct[]>([]); const [accounts, setAccounts] = useState<DBAccount[]>([]); const [orders, setOrders] = useState<ImportOrder[]>([]); const [loading, setLoading] = useState(true)
  const [locations, setLocations] = useState<StockLocation[]>([])
  const [receiveLocationId, setReceiveLocationId] = useState<string>('')
  // List filters
  const [filterStatus, setFilterStatus] = useState<'all'|'active'|'at_port'|'in_godown'|'closed'>('active')
  const [filterSearch, setFilterSearch] = useState('')
  const [sortBy, setSortBy] = useState<'date'|'ref'|'supplier'|'value'>('date')
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc')
  const [view, setView] = useState<'list'|'detail'|'create'>('list')
  const [activeOrder, setActiveOrder] = useState<ImportOrder|null>(null); const [orderLines, setOrderLines] = useState<OrderLine[]>([]); const [payments, setPayments] = useState<Payment[]>([]); const [shipments, setShipments] = useState<Shipment[]>([])
  const [form, setForm] = useState({ supplier:'', orderDate:today(), expectedReady:'', currency:'USD', fxRate:'2500', notes:'' })
  const [lines, setLines] = useState<OrderLine[]>([{...EMPTY_LINE}]); const [saving, setSaving] = useState(false)
  const [showPayModal, setShowPayModal] = useState(false); const [payType, setPayType] = useState<'supplier_deposit'|'supplier_balance'|'forwarding_agent'|'customs_duties'|'clearing_fees'|'local_carrier'>('supplier_deposit')
  const [payForm, setPayForm] = useState({ date:today(), amount:'', bankAccount:'', agentSupplierId:'', reference:'', notes:'', currency:'TZS', fxRate:'1' }); const [payPosting, setPayPosting] = useState(false)
  const [showShipModal, setShowShipModal] = useState(false); const [shipForm, setShipForm] = useState({ method:'sea', agentName:'', trackingRef:'', shipDate:today(), expectedArrival:'', freightCost:'', notes:'' })
  const [shipLines, setShipLines] = useState<{orderLineId:string;qty:number;desc:string}[]>([])
  const [showReceiveModal, setShowReceiveModal] = useState(false); const [receiveShipmentId, setReceiveShipmentId] = useState('')
  const [rcvShipment, setRcvShipment] = useState<Shipment|null>(null); const [receiveLines, setReceiveLines] = useState<ReceiveLine[]>([]); const [receiving, setReceiving] = useState(false)
  const setF = (k:string,v:string) => setForm(f=>({...f,[k]:v})); const setPayF = (k:string,v:string) => setPayForm(f=>({...f,[k]:v}))
  const bankAccounts = accounts.filter(a => a.category==='Cash & Bank' || a.category?.toLowerCase().includes('cash') || a.category?.toLowerCase().includes('bank') || (a.type==='asset' && /^10[1-4]/.test(a.code)))

  useEffect(() => { loadAll() }, [])
  const loadAll = async () => {
    setLoading(true)
    const [s,p,a,o,sl] = await Promise.all([
      supabase.from('suppliers').select('id, code, name, balance_tzs').eq('is_active', true).order('name'),
      supabase.from('products').select('*').eq('is_active', true).order('name'),
      supabase.from('accounts').select('id, code, name, category, type').eq('is_active', true).order('code'),
      supabase.from('import_orders').select('*, suppliers(name, code)').order('created_at', { ascending: false }),
      supabase.from('stock_locations').select('id, code, name').eq('is_active', true).order('code'),
    ])
    if(s.data) setSuppliers(s.data as DBSupplier[]); if(p.data) setProducts(p.data as DBProduct[]); if(a.data) setAccounts(a.data as DBAccount[]); if(o.data) setOrders(o.data as ImportOrder[])
    if(sl.data) {
      setLocations(sl.data as StockLocation[])
      // Locked users always default to their assigned location.
      // Unrestricted users get the first active location.
      if (!receiveLocationId && sl.data.length > 0) {
        const lockedMatch = userLoc.defaultLocationId
          && (sl.data as StockLocation[]).find(l => l.id === userLoc.defaultLocationId)
        setReceiveLocationId(lockedMatch ? userLoc.defaultLocationId! : (sl.data[0] as StockLocation).id)
      }
    }
    setLoading(false)
  }
  const loadOrderDetail = async (order:ImportOrder) => {
    setActiveOrder(order)
    const [l,p,s] = await Promise.all([supabase.from('import_order_lines').select('*').eq('order_id',order.id).order('line_number'), supabase.from('import_payments').select('*').eq('order_id',order.id).order('payment_date'), supabase.from('import_shipments').select('*,import_shipment_lines(*)').eq('order_id',order.id).order('shipment_number')])
    if(l.data) setOrderLines(l.data as OrderLine[]); if(p.data) setPayments(p.data as Payment[]); if(s.data) setShipments(s.data as Shipment[])
    setView('detail')
  }
  const generateRef = async ():Promise<string> => {
    const pat='IMP-10-'; const {data}=await supabase.from('import_orders').select('ref').like('ref',`${pat}%`).order('ref',{ascending:false}).limit(1)
    let seq=1; if(data&&data.length>0) seq=(parseInt((data[0].ref as string).replace(pat,''))||0)+1
    return `${pat}${String(seq).padStart(4,'0')}`
  }
  const updateLine = (i:number,field:keyof OrderLine,val:string|number) => {
    const nl=[...lines]; nl[i]={...nl[i],[field]:val as never}; const rate=parseFloat(form.fxRate)||1
    if(field==='product_id'){const pr=products.find(pp=>pp.id===val);if(pr)nl[i].description=pr.name}
    if(field==='qty'||field==='unit_cost_usd'){nl[i].subtotal_usd=nl[i].qty*nl[i].unit_cost_usd;nl[i].unit_cost_tzs=nl[i].unit_cost_usd*rate;nl[i].subtotal_tzs=nl[i].subtotal_usd*rate}
    setLines(nl)
  }
  const recalcLines = (rate:number) => setLines(prev=>prev.map(l=>({...l,unit_cost_tzs:l.unit_cost_usd*rate,subtotal_tzs:l.subtotal_usd*rate})))
  const totalUsd = lines.reduce((s,l)=>s+l.subtotal_usd,0); const totalTzs = lines.reduce((s,l)=>s+l.subtotal_tzs,0)
  const isLocalCurrency = form.currency === 'TZS'

  const saveOrder = async () => {
    if(!form.supplier){showToast('Select a supplier','error');return}; if(lines.every(l=>!l.description&&!l.product_id)){showToast('Add at least one product','error');return}; if(totalTzs<=0){showToast('Total must be > 0','error');return}
    setSaving(true)
    try{
      const ref=await generateRef()
      const{data:order,error:oErr}=await supabase.from('import_orders').insert({ref,supplier_id:form.supplier,status:'draft',order_date:form.orderDate,expected_ready_date:form.expectedReady||null,currency:form.currency,fx_rate:parseFloat(form.fxRate)||1,total_usd:totalUsd,total_tzs:totalTzs,total_freight_tzs:0,total_landed_tzs:totalTzs,notes:form.notes||null,created_by:user?.full_name||'System'}).select('id').single()
      if(oErr)throw new Error(oErr.message)
      const lp=lines.filter(l=>l.description||l.product_id).map((l,i)=>({order_id:order.id,line_number:i+1,product_id:l.product_id||null,description:l.description,qty:l.qty,unit_cost_usd:l.unit_cost_usd,unit_cost_tzs:l.unit_cost_tzs,subtotal_usd:l.subtotal_usd,subtotal_tzs:l.subtotal_tzs,qty_received:0,landed_unit_cost_tzs:0}))
      const{error:lErr}=await supabase.from('import_order_lines').insert(lp); if(lErr)throw new Error(lErr.message)
      showToast(`${ref} created`); await loadAll()
      const full=(await supabase.from('import_orders').select('*,suppliers(name,code)').eq('id',order.id).single()).data
      if(full) await loadOrderDetail(full as ImportOrder)
    }catch(e:unknown){showToast(e instanceof Error?e.message:'Failed','error')}finally{setSaving(false)}
  }

  const recordPayment = async () => {
    if(!activeOrder)return; const raw=parseFloat(payForm.amount); if(!raw||raw<=0){showToast('Enter amount','error');return}
    const fx=parseFloat(payForm.fxRate)||1; const amount=payForm.currency==='TZS'?raw:raw*fx
    if(!payForm.bankAccount){showToast('Select bank','error');return}
    // All non-supplier payments need a payee/agent
    const isSupplierPayment = payType==='supplier_deposit' || payType==='supplier_balance'
    if(!isSupplierPayment && !payForm.agentSupplierId){showToast('Select payee','error');return}
    const dc=await validatePostingDate(payForm.date,isSuperAdmin()); if(!dc.allowed){showToast(dc.error||'Date blocked','error');return}
    setPayPosting(true)
    try{
      // For all import payments we Dr the GRN Interim account (1121) — same pattern as before
      const drAcct=accounts.find(a=>a.code==='1121'); if(!drAcct)throw new Error('Account 1121 not found')
      const cn=payForm.currency!=='TZS'?` (${payForm.currency} ${raw.toLocaleString()} @ ${fx})`:''
      const payeeName = isSupplierPayment ? '' : (suppliers.find(s=>s.id===payForm.agentSupplierId)?.name||'')
      const typeLabel: Record<string,string> = {
        supplier_deposit:'Supplier Deposit', supplier_balance:'Supplier Balance',
        forwarding_agent:'Shipping/Freight', customs_duties:'Customs & Duties',
        clearing_fees:'Clearing Fees', local_carrier:'Local Carrier',
      }
      const desc=`Import — ${typeLabel[payType]}${payeeName?` — ${payeeName}`:''} — ${activeOrder.ref}${cn}`
      const{data:jnl,error:jErr}=await supabase.from('journals').insert({ref:`JV-${activeOrder.ref}-${payType.charAt(0).toUpperCase()}${payments.length+1}`,posting_date:payForm.date,description:desc,journal_type:'import_payment',source_type:'import_order',source_ref:activeOrder.ref,posted_by:user?.full_name||'System',status:'posted'}).select('id').single()
      if(jErr)throw new Error(jErr.message)
      await supabase.from('journal_lines').insert([{journal_id:jnl.id,line_number:1,account_id:drAcct.id,description:desc,debit:amount,credit:0},{journal_id:jnl.id,line_number:2,account_id:payForm.bankAccount,description:`Bank — ${desc}`,debit:0,credit:amount}])
      await Promise.all([supabase.rpc('update_account_balance',{p_account_id:drAcct.id,p_debit:amount,p_credit:0}),supabase.rpc('update_account_balance',{p_account_id:payForm.bankAccount,p_debit:0,p_credit:amount})])
      // Update supplier balance for supplier-side payments
      if(isSupplierPayment && activeOrder.supplier_id){
        await supabase.from('vendor_ledger_entries').insert({supplier_id:activeOrder.supplier_id,posting_date:payForm.date,document_type:'payment',document_ref:activeOrder.ref,description:desc,amount_tzs:-amount,remaining_amount:0,is_open:false,journal_id:jnl.id,import_order_ref:activeOrder.ref})
        const sup=suppliers.find(s=>s.id===activeOrder.supplier_id); if(sup)await supabase.from('suppliers').update({balance_tzs:(sup.balance_tzs||0)-amount}).eq('id',activeOrder.supplier_id)
      }
      // Update agent/payee balance for non-supplier payments
      if(!isSupplierPayment && payForm.agentSupplierId){
        await supabase.from('vendor_ledger_entries').insert({supplier_id:payForm.agentSupplierId,posting_date:payForm.date,document_type:'payment',document_ref:activeOrder.ref,description:desc,amount_tzs:-amount,remaining_amount:0,is_open:false,journal_id:jnl.id,import_order_ref:activeOrder.ref})
        const as2=suppliers.find(s=>s.id===payForm.agentSupplierId); if(as2)await supabase.from('suppliers').update({balance_tzs:(as2.balance_tzs||0)-amount}).eq('id',payForm.agentSupplierId)
      }
      await supabase.from('import_payments').insert({order_id:activeOrder.id,payment_type:payType,payment_date:payForm.date,amount_tzs:amount,bank_account_id:payForm.bankAccount,agent_name:payeeName||null,reference:payForm.reference||null,notes:payForm.notes||null,journal_id:jnl.id})

      // ════════════════════════════════════════════════════════════
      // Distribute logistics cost to inventory (raises avg cost of received units)
      // Only runs for non-supplier payments AND only if there are received units to absorb the cost.
      // For each product: weighted-average the new cost into cost_price + write a cost adjustment ledger entry.
      // Also posts the offsetting Dr Inventory / Cr GRN Interim journal so 1121 doesn't accumulate.
      // ════════════════════════════════════════════════════════════
      if (!isSupplierPayment) {
        // Get all received qty across order lines
        const { data: olWithRcv } = await supabase
          .from('import_order_lines')
          .select('id, product_id, qty_received')
          .eq('order_id', activeOrder.id)
        const receivedLines = (olWithRcv || []).filter(l => (l.qty_received || 0) > 0 && l.product_id)
        const totalReceivedUnits = receivedLines.reduce((s, l) => s + (l.qty_received || 0), 0)

        if (totalReceivedUnits > 0) {
          const invAcct2 = accounts.find(a => a.code === '1110')
          const grnAcct2 = accounts.find(a => a.code === '1121')
          let totalAdjustment = 0

          for (const line of receivedLines) {
            const qtyShare = line.qty_received || 0
            const costShare = amount * (qtyShare / totalReceivedUnits)
            totalAdjustment += costShare

            // Bump product cost_price (spread cost across CURRENT stock to be safe — units already sold can't be retroactively adjusted)
            const { data: fp } = await supabase.from('products').select('qty_on_hand, cost_price').eq('id', line.product_id).single()
            if (fp) {
              const curQty = fp.qty_on_hand || 0
              const curCost = fp.cost_price || 0
              const newCost = curQty > 0 ? curCost + (costShare / curQty) : curCost
              await supabase.from('products').update({ cost_price: Math.round(newCost) }).eq('id', line.product_id)
            }

            // Write cost-adjustment ledger entry directly (postLedgerEntry rejects qty=0).
            // qty=0 so it doesn't change stock counts, only cost basis.
            await supabase.from('item_ledger_entries').insert({
              product_id: line.product_id,
              entry_type: 'positive_adjustment',
              document_type: 'stock_adjustment',
              document_ref: `${activeOrder.ref}-COST-${payType.toUpperCase()}`,
              posting_date: payForm.date,
              qty: 0,
              cost_amount: Math.round(costShare),
              location_id: null,
            })
          }

          // Post offsetting journal: Dr Inventory (1110) / Cr GRN Interim (1121) for the full amount
          // The payment already debited 1121, so this clears it back out — net effect is Dr Inventory / Cr Bank
          if (invAcct2 && grnAcct2 && totalAdjustment > 0) {
            const adjDesc = `Inventory cost adjustment — ${activeOrder.ref} — ${typeLabel[payType]}`
            const { data: adjJnl } = await supabase.from('journals').insert({
              ref: `JV-${activeOrder.ref}-ADJ${payments.length+1}`,
              posting_date: payForm.date,
              description: adjDesc,
              journal_type: 'inventory_adjustment',
              source_type: 'import_order',
              source_ref: activeOrder.ref,
              posted_by: user?.full_name || 'System',
              status: 'posted',
            }).select('id').single()
            if (adjJnl) {
              await supabase.from('journal_lines').insert([
                { journal_id: adjJnl.id, line_number: 1, account_id: invAcct2.id, description: adjDesc, debit: Math.round(totalAdjustment), credit: 0 },
                { journal_id: adjJnl.id, line_number: 2, account_id: grnAcct2.id, description: adjDesc, debit: 0, credit: Math.round(totalAdjustment) },
              ])
              await Promise.all([
                supabase.rpc('update_account_balance', { p_account_id: invAcct2.id, p_debit: Math.round(totalAdjustment), p_credit: 0 }),
                supabase.rpc('update_account_balance', { p_account_id: grnAcct2.id, p_debit: 0, p_credit: Math.round(totalAdjustment) }),
              ])
            }
          }
        }
      }
      // ════════════════════════════════════════════════════════════

      // Recompute totals + status
      const ap=[...payments,{amount_tzs:amount,payment_type:payType} as Payment]
      const supplierPaid=ap.filter(p=>p.payment_type==='supplier_deposit'||p.payment_type==='supplier_balance').reduce((s,p)=>s+p.amount_tzs,0)
      // ALL non-supplier costs add to landed cost: freight + customs + clearing + carrier
      const otherCostsPaid=ap.filter(p=>p.payment_type==='forwarding_agent'||p.payment_type==='customs_duties'||p.payment_type==='clearing_fees'||p.payment_type==='local_carrier').reduce((s,p)=>s+p.amount_tzs,0)
      // Status auto-progression on supplier payments only — other payments keep current status
      let ns=activeOrder.status
      if(isSupplierPayment){
        if(supplierPaid>=activeOrder.total_tzs && (ns==='draft'||ns==='deposit_paid'||ns==='in_production')) ns='balance_paid'
        else if(supplierPaid>0 && ns==='draft') ns='deposit_paid'
      }
      await supabase.from('import_orders').update({total_freight_tzs:otherCostsPaid,total_landed_tzs:activeOrder.total_tzs+otherCostsPaid,status:ns}).eq('id',activeOrder.id)
      showToast(`Payment recorded — ${tzs(amount)}`); setShowPayModal(false); setPayForm({date:today(),amount:'',bankAccount:'',agentSupplierId:'',reference:'',notes:'',currency:'TZS',fxRate:'1'})
      const r=(await supabase.from('import_orders').select('*,suppliers(name,code)').eq('id',activeOrder.id).single()).data; if(r)await loadOrderDetail(r as ImportOrder)
    }catch(e:unknown){showToast(e instanceof Error?e.message:'Failed','error')}finally{setPayPosting(false)}
  }

  // Manual status transitions for stages where the system can't auto-detect (e.g. supplier confirms production started, agent says goods at port)
  const advanceStatus = async (newStatus: string) => {
    if (!activeOrder) return
    try {
      await supabase.from('import_orders').update({ status: newStatus }).eq('id', activeOrder.id)
      showToast(`Status updated → ${STA_L[newStatus] || newStatus}`)
      const r = (await supabase.from('import_orders').select('*, suppliers(name, code)').eq('id', activeOrder.id).single()).data
      if (r) await loadOrderDetail(r as ImportOrder)
    } catch (e: unknown) { showToast(e instanceof Error ? e.message : 'Failed', 'error') }
  }
  const closeOrder = async () => {
    if (!activeOrder) return
    if (!confirm('Close this order? This marks it complete and removes it from the active list. You can still view it later.')) return
    await advanceStatus('closed')
  }

  // Void an import order. Three levels based on what's already been done:
  //   Level 1 (clean): no payments, no goods received. Soft delete.
  //   Level 2 (reverse): payments exist but no goods received. Reverse each payment journal.
  //   Level 3 (block): goods received. Refuse — user must clean up via stock adjustment or write-off.
  const voidOrder = async () => {
    if (!activeOrder) return
    const totalQtyRcv = orderLines.reduce((s, l) => s + l.qty_received, 0)
    const totalPaid = payments.reduce((s, p) => s + p.amount_tzs, 0)

    // Level 3 — block
    if (totalQtyRcv > 0) {
      alert(
        `Cannot void IMP order ${activeOrder.ref}.\n\n` +
        `${totalQtyRcv} unit(s) have been received into your godown. ` +
        `Voiding now would create stock and accounting errors.\n\n` +
        `Options:\n` +
        `1) Post a Stock Adjustment to remove the units (if not yet sold)\n` +
        `2) Keep the order open and process as a write-off\n` +
        `3) Contact admin for ledger surgery`
      )
      return
    }

    // Level 1 — clean
    if (payments.length === 0) {
      if (!confirm(`Void ${activeOrder.ref}? No payments have been made and no goods received. Safe to void.`)) return
      try {
        await supabase.from('import_orders').update({ status: 'voided' }).eq('id', activeOrder.id)
        showToast(`${activeOrder.ref} voided`)
        setView('list')
        await loadAll()
      } catch (e: unknown) { showToast(e instanceof Error ? e.message : 'Failed', 'error') }
      return
    }

    // Level 2 — reverse
    const ok = confirm(
      `Void ${activeOrder.ref}?\n\n` +
      `WARNING: ${payments.length} payment(s) totalling ${tzs(totalPaid)} have already been posted.\n\n` +
      `Voiding will create REVERSAL journals (Dr Bank / Cr the original Dr account) and restore supplier/agent balances. ` +
      `On paper, the money "comes back" — but only the books will reflect it. Your bank account in real life will not refund.\n\n` +
      `Use this only for correcting data entry errors. If your Chinese supplier actually kept the deposit, ` +
      `cancel and instead post a Payment Voucher to "Lost Deposits" expense account.\n\n` +
      `Continue with reversal?`
    )
    if (!ok) return

    try {
      // Reverse each payment journal
      for (const pmt of payments) {
        if (!pmt.journal_id) continue
        // Read original journal_lines
        const { data: lines } = await supabase
          .from('journal_lines')
          .select('account_id, debit, credit')
          .eq('journal_id', pmt.journal_id)
        if (!lines || lines.length === 0) continue

        // Reverse account balances
        for (const ln of lines) {
          // Original Dr → reverse with Cr (and vice versa)
          await supabase.rpc('update_account_balance', {
            p_account_id: ln.account_id,
            p_debit: ln.credit,
            p_credit: ln.debit,
          })
        }

        // Zero out the original journal lines so TB doesn't see them
        await supabase
          .from('journal_lines')
          .update({ debit: 0, credit: 0 })
          .eq('journal_id', pmt.journal_id)

        // Cancel the journal
        await supabase
          .from('journals')
          .update({
            status: 'cancelled',
            description: 'CANCELLED via Import Order void — ' + activeOrder.ref,
          })
          .eq('id', pmt.journal_id)

        // Reverse vendor ledger entry (it had amount_tzs = -pmt.amount_tzs)
        await supabase
          .from('vendor_ledger_entries')
          .delete()
          .eq('journal_id', pmt.journal_id)

        // Reverse supplier balance
        const targetSupplierId = pmt.payment_type === 'supplier_deposit' || pmt.payment_type === 'supplier_balance'
          ? activeOrder.supplier_id
          : (suppliers.find(s => s.name === pmt.agent_name)?.id || null)
        if (targetSupplierId) {
          const sup = suppliers.find(s => s.id === targetSupplierId)
          if (sup) {
            await supabase.from('suppliers')
              .update({ balance_tzs: (sup.balance_tzs || 0) + pmt.amount_tzs })
              .eq('id', targetSupplierId)
          }
        }
      }

      // Mark the import_payments rows as voided (keep audit trail)
      await supabase
        .from('import_payments')
        .update({ notes: 'VOIDED via order void' })
        .eq('order_id', activeOrder.id)

      // Void the order itself
      await supabase
        .from('import_orders')
        .update({ status: 'voided', notes: (activeOrder.notes || '') + ' [VOIDED — payments reversed]' })
        .eq('id', activeOrder.id)

      showToast(`${activeOrder.ref} voided · ${payments.length} payment(s) reversed`)
      setView('list')
      await loadAll()
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Void failed', 'error')
    }
  }

  // For a given order line, how many more units can still be shipped?
  // = ordered qty - already shipped across all existing shipments
  // (We track shipped, not received, because once shipped, it's allocated even if not yet arrived.)
  const remainingToShip = (orderLineId: string): number => {
    const ol = orderLines.find(l => l.id === orderLineId)
    if (!ol) return 0
    const alreadyShipped = shipments
      .flatMap(s => s.import_shipment_lines || [])
      .filter(sl => sl.order_line_id === orderLineId)
      .reduce((sum, sl) => sum + (sl.qty_shipped || 0), 0)
    return Math.max(0, ol.qty - alreadyShipped)
  }

  const addShipment = async () => {
    if (!activeOrder) return
    if (shipLines.every(l => l.qty <= 0)) { showToast('Add quantities', 'error'); return }
    // Validate every line's qty doesn't exceed remaining-to-ship
    const violations: string[] = []
    for (const sl of shipLines) {
      if (sl.qty <= 0) continue
      const remaining = remainingToShip(sl.orderLineId)
      if (sl.qty > remaining) {
        violations.push(`${sl.desc}: trying to ship ${sl.qty}, but only ${remaining} remain`)
      }
    }
    if (violations.length > 0) {
      showToast(`Cannot ship more than ordered. ${violations.join(' · ')}`, 'error')
      return
    }
    try {
      // Fetch fresh shipment count from DB to prevent duplicate numbers from race conditions
      const { count: existingCount } = await supabase
        .from('import_shipments')
        .select('*', { count: 'exact', head: true })
        .eq('order_id', activeOrder.id)
      const num = (existingCount || 0) + 1
      const { data: sh, error: sErr } = await supabase.from('import_shipments').insert({ order_id: activeOrder.id, shipment_number: num, method: shipForm.method, agent_name: shipForm.agentName || null, tracking_ref: shipForm.trackingRef || null, ship_date: shipForm.shipDate || null, expected_arrival: shipForm.expectedArrival || null, freight_cost_tzs: parseFloat(shipForm.freightCost) || 0, status: 'in_transit', notes: shipForm.notes || null }).select('id').single()
      if (sErr) throw new Error(sErr.message)
      await supabase.from('import_shipment_lines').insert(shipLines.filter(l => l.qty > 0).map(l => ({ shipment_id: sh.id, order_line_id: l.orderLineId, qty_shipped: l.qty, qty_received: 0 })))
      if (['draft', 'deposit_paid', 'in_production', 'balance_paid'].includes(activeOrder.status)) await supabase.from('import_orders').update({ status: 'shipped' }).eq('id', activeOrder.id)
      showToast(`Shipment #${num} (${shipForm.method}) added`); setShowShipModal(false)
      const r = (await supabase.from('import_orders').select('*,suppliers(name,code)').eq('id', activeOrder.id).single()).data
      if (r) await loadOrderDetail(r as ImportOrder)
    } catch (e: unknown) { showToast(e instanceof Error ? e.message : 'Failed', 'error') }
  }

  const openReceiveModal = async (sh: Shipment) => {
    setReceiveShipmentId(sh.id!); setRcvShipment(sh)
    const { data: freshSL } = await supabase.from('import_shipment_lines').select('*').eq('shipment_id', sh.id)
    const sLines = (freshSL || []) as ShipmentLine[]
    setReceiveLines(sLines.map(sl => {
      const ol = orderLines.find(l => l.id === sl.order_line_id)
      return { shipmentLineId: sl.id || '', orderLineId: sl.order_line_id, productId: ol?.product_id || '', qtyShipped: sl.qty_shipped, qtyAlreadyReceived: sl.qty_received || 0, qtyReceive: sl.qty_shipped - (sl.qty_received || 0), desc: ol?.description || '', unitCostTzs: ol?.unit_cost_tzs || 0 }
    }))
    setShowReceiveModal(true)
  }

  const doReceiveShipment = async () => {
    if (!activeOrder || !receiveShipmentId) return
    const totalRcv = receiveLines.reduce((s, rl) => s + rl.qtyReceive, 0)
    if (totalRcv <= 0) { showToast('Enter quantities', 'error'); return }
    if (!receiveLocationId) { showToast('Select the destination warehouse', 'error'); return }
    const selectedLoc = locations.find(l => l.id === receiveLocationId)
    if (!selectedLoc) { showToast('Selected warehouse not found', 'error'); return }
    // Defence in depth: locked users cannot receive imports into another location.
    if (!userLoc.canPostFrom(selectedLoc.code)) {
      showToast(`You are locked to location ${userLoc.defaultLocationCode}. You cannot receive imports into ${selectedLoc.code}.`, 'error')
      return
    }
    setReceiving(true)
    try {
      const freight = rcvShipment?.freight_cost_tzs || 0
      const receivedAt = today()
      for (const rl of receiveLines) {
        if (rl.qtyReceive <= 0) continue
        const ol = orderLines.find(l => l.id === rl.orderLineId)
        if (!ol) continue
        const costPerUnit = ol.unit_cost_tzs || 0
        const freightPerUnit = totalRcv > 0 ? freight / totalRcv : 0
        const landedPerUnit = costPerUnit + freightPerUnit
        const landedTotal = landedPerUnit * rl.qtyReceive

        // 1. Update shipment line + order line received counts
        await supabase.from('import_shipment_lines').update({ qty_received: (rl.qtyAlreadyReceived || 0) + rl.qtyReceive }).eq('id', rl.shipmentLineId)
        // Compute weighted-average landed cost across ALL receives so far (don't just overwrite with this shipment)
        const prevQtyRcv = ol.qty_received || 0
        const prevLanded = ol.landed_unit_cost_tzs || 0
        const newQtyRcv = prevQtyRcv + rl.qtyReceive
        const newAvgLanded = newQtyRcv > 0
          ? ((prevQtyRcv * prevLanded) + landedTotal) / newQtyRcv
          : landedPerUnit
        await supabase.from('import_order_lines').update({
          qty_received: newQtyRcv,
          landed_unit_cost_tzs: newAvgLanded,
        }).eq('id', rl.orderLineId)

        // 2. Update product master stock + average cost (USE qty_on_hand, not qty)
        if (rl.productId) {
          const { data: fp } = await supabase.from('products').select('qty_on_hand, cost_price').eq('id', rl.productId).single()
          if (fp) {
            const curQty = fp.qty_on_hand || 0
            const newQty = curQty + rl.qtyReceive
            const oldVal = curQty * (fp.cost_price || 0)
            const avgCost = newQty > 0 ? (oldVal + landedTotal) / newQty : landedPerUnit
            await supabase.from('products').update({ qty_on_hand: newQty, cost_price: Math.round(avgCost) }).eq('id', rl.productId)
          }

          // 3. Write item ledger entry — this is what the inventory views read
          await postLedgerEntry({
            product_id: rl.productId,
            entry_type: 'purchase',
            document_type: 'grn',  // import receive maps to GRN-style entry
            document_ref: `${activeOrder.ref}-RCV${rcvShipment?.shipment_number || ''}`,
            posting_date: receivedAt,
            qty: rl.qtyReceive,
            cost_amount: landedTotal,
            location: selectedLoc,
          })

          // 4. Update product_locations so per-warehouse balances reflect this receive
          const { data: pl } = await supabase.from('product_locations')
            .select('qty_on_hand').eq('product_id', rl.productId).eq('location_id', selectedLoc.id).maybeSingle()
          const newLocQty = (pl?.qty_on_hand ?? 0) + rl.qtyReceive
          await supabase.from('product_locations').upsert(
            { product_id: rl.productId, location_id: selectedLoc.id, location_code: selectedLoc.code, qty_on_hand: newLocQty, last_updated: new Date().toISOString() },
            { onConflict: 'product_id,location_id' }
          )
        }
      }

      // 5. Post journal: Dr Inventory / Cr GRN Interim
      const invAcct = accounts.find(a => a.code === '1110')
      const grnAcct = accounts.find(a => a.code === '1121')
      if (invAcct && grnAcct) {
        const tv = receiveLines.reduce((s, rl) => {
          if (rl.qtyReceive <= 0) return s
          const fp2 = totalRcv > 0 ? freight / totalRcv : 0
          return s + (rl.unitCostTzs + fp2) * rl.qtyReceive
        }, 0)
        if (tv > 0) {
          const d2 = `Import received — ${activeOrder.ref} — Shipment #${rcvShipment?.shipment_number || ''}`
          const { data: j2 } = await supabase.from('journals').insert({ ref: `JV-${activeOrder.ref}-RCV${rcvShipment?.shipment_number || ''}`, posting_date: receivedAt, description: d2, journal_type: 'import_receive', source_type: 'import_order', source_ref: activeOrder.ref, posted_by: user?.full_name || 'System', status: 'posted' }).select('id').single()
          if (j2) {
            await supabase.from('journal_lines').insert([
              { journal_id: j2.id, line_number: 1, account_id: invAcct.id, description: d2, debit: Math.round(tv), credit: 0 },
              { journal_id: j2.id, line_number: 2, account_id: grnAcct.id, description: d2, debit: 0, credit: Math.round(tv) },
            ])
            await Promise.all([
              supabase.rpc('update_account_balance', { p_account_id: invAcct.id, p_debit: Math.round(tv), p_credit: 0 }),
              supabase.rpc('update_account_balance', { p_account_id: grnAcct.id, p_debit: 0, p_credit: Math.round(tv) }),
            ])
          }
        }
      }

      // 6. Update shipment + order status
      // Check if THIS shipment's lines are all fully received before flipping to 'received'
      const { data: shLines } = await supabase
        .from('import_shipment_lines')
        .select('qty_shipped, qty_received')
        .eq('shipment_id', receiveShipmentId)
      const shipmentFullyReceived = shLines?.every(l => (l.qty_received || 0) >= (l.qty_shipped || 0)) || false
      await supabase.from('import_shipments').update({
        status: shipmentFullyReceived ? 'received' : 'in_transit',
        actual_arrival: shipmentFullyReceived ? receivedAt : null,
      }).eq('id', receiveShipmentId)

      const { data: fol } = await supabase.from('import_order_lines').select('qty, qty_received').eq('order_id', activeOrder.id)
      const allDone = fol?.every(l => l.qty_received >= l.qty) || false
      const anyReceived = fol?.some(l => l.qty_received > 0) || false

      // Compute true total landed cost from item ledger entries for this order's products.
      // This is the source of truth — it sums every receive's landed cost regardless of shipment vs payment.
      const productIds = orderLines.map(l => l.product_id).filter((x): x is string => !!x)
      let trueTotalLanded = activeOrder.total_tzs || 0
      if (productIds.length > 0) {
        const { data: ledgerSum } = await supabase
          .from('item_ledger_entries')
          .select('cost_amount')
          .in('product_id', productIds)
          .like('document_ref', `${activeOrder.ref}%`)
        if (ledgerSum) {
          trueTotalLanded = ledgerSum.reduce((s, r: { cost_amount: number }) => s + (r.cost_amount || 0), 0)
        }
      }

      await supabase.from('import_orders').update({
        status: allDone ? 'received' : (anyReceived ? 'partially_received' : activeOrder.status),
        total_landed_tzs: trueTotalLanded,
      }).eq('id', activeOrder.id)

      showToast(`Received at ${selectedLoc.code}: ${receiveLines.filter(r => r.qtyReceive > 0).map(r => `${r.desc}: ${r.qtyReceive} pcs`).join(', ')}. Stock updated.`)
      setShowReceiveModal(false); await loadAll()
      const rf = (await supabase.from('import_orders').select('*, suppliers(name, code)').eq('id', activeOrder.id).single()).data
      if (rf) await loadOrderDetail(rf as ImportOrder)
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Receive failed', 'error')
    } finally {
      setReceiving(false)
    }
  }

  // ═══ DETAIL VIEW ═══
  if (view === 'detail' && activeOrder) {
    const totalPaid = payments.reduce((s, p) => s + p.amount_tzs, 0)
    const supplierPaid = payments.filter(p => p.payment_type === 'supplier_deposit' || p.payment_type === 'supplier_balance').reduce((s, p) => s + p.amount_tzs, 0)
    const freightPaid = payments.filter(p => p.payment_type === 'forwarding_agent').reduce((s, p) => s + p.amount_tzs, 0)
    const customsPaid = payments.filter(p => p.payment_type === 'customs_duties').reduce((s, p) => s + p.amount_tzs, 0)
    const clearingPaid = payments.filter(p => p.payment_type === 'clearing_fees').reduce((s, p) => s + p.amount_tzs, 0)
    const carrierPaid = payments.filter(p => p.payment_type === 'local_carrier').reduce((s, p) => s + p.amount_tzs, 0)
    const allOtherCosts = freightPaid + customsPaid + clearingPaid + carrierPaid
    const outstanding = Math.max(0, activeOrder.total_tzs - supplierPaid)
    const totalQtyOrd = orderLines.reduce((s, l) => s + l.qty, 0)
    const totalQtyRcv = orderLines.reduce((s, l) => s + l.qty_received, 0)
    const paidPct = activeOrder.total_tzs > 0 ? Math.min(100, Math.round(supplierPaid / activeOrder.total_tzs * 100)) : 0
    // Step 1-7 progress matching new statuses
    const STAGE_TO_STEP: Record<string, number> = {
      draft: 1, deposit_paid: 2, in_production: 3, balance_paid: 4,
      shipped: 5, at_port: 6, with_carrier: 6,
      partially_received: 7, received: 7, closed: 7,
    }
    const step = STAGE_TO_STEP[activeOrder.status] || 1
    const isClosed = activeOrder.status === 'closed' || activeOrder.status === 'voided'
    const canClose = activeOrder.status === 'received' && supplierPaid >= activeOrder.total_tzs
    const nextHint = NEXT_HINT[activeOrder.status] || ''

    return (<div className="page">
      <div className="page-header"><div style={{display:'flex',alignItems:'center',gap:12}}>
        <button className="btn btn-ghost btn-sm" onClick={()=>{setView('list');loadAll()}} style={{display:'flex',alignItems:'center',gap:6}}><Ic n="back"/> Orders</button>
        <div style={{width:1,height:24,background:'var(--border)'}}/>
        <div><div style={{display:'flex',alignItems:'center',gap:10}}><span style={{fontFamily:'var(--mono)',fontSize:14,fontWeight:800,color:'var(--accent)',background:'var(--accent-dim)',padding:'3px 12px',borderRadius:6}}>{activeOrder.ref}</span><span className={`pill ${STA_C[activeOrder.status]||'pill-gray'}`} style={{fontSize:10}}>{STA_L[activeOrder.status]||activeOrder.status}</span></div>
        <div className="page-sub">{activeOrder.suppliers?.name||'Unknown'} · {activeOrder.order_date}</div></div>
      </div><div className="page-actions">
        {!isClosed && <button className="btn btn-ghost btn-sm" onClick={()=>{setPayType('supplier_deposit');setShowPayModal(true)}} style={{display:'flex',alignItems:'center',gap:6}}><Ic n="dollar" s={13}/> Pay</button>}
        {/* Status advance buttons appear when manual transition makes sense */}
        {activeOrder.status === 'deposit_paid' && <button className="btn btn-ghost btn-sm" onClick={()=>advanceStatus('in_production')}>Mark In Production</button>}
        {activeOrder.status === 'shipped' && <button className="btn btn-ghost btn-sm" onClick={()=>advanceStatus('at_port')}>Mark At Port</button>}
        {activeOrder.status === 'at_port' && <button className="btn btn-ghost btn-sm" onClick={()=>advanceStatus('with_carrier')}>With Local Carrier</button>}
        {!isClosed && <button className="btn btn-primary btn-sm" onClick={()=>{setShipForm({method:'sea',agentName:'',trackingRef:'',shipDate:today(),expectedArrival:'',freightCost:'',notes:''});setShipLines(orderLines.map(l=>({orderLineId:l.id!,qty:remainingToShip(l.id!),desc:l.description})));setShowShipModal(true)}} style={{display:'flex',alignItems:'center',gap:6}}><Ic n="ship" s={13}/> Add Shipment</button>}
        {canClose && <button className="btn btn-primary btn-sm" onClick={closeOrder} style={{background:'var(--green)',borderColor:'var(--green)'}}><Ic n="check" s={13} c="#fff"/> Close Order</button>}
        {!isClosed && activeOrder.status !== 'voided' && (
          <button className="btn btn-ghost btn-sm" onClick={voidOrder} style={{color:'var(--red)',borderColor:'rgba(255,71,87,.3)'}} title="Void this order">Void</button>
        )}
      </div></div>

      {/* Next-step hint banner */}
      {!isClosed && nextHint && (
        <div style={{background:'rgba(133,194,190,.06)',border:'1px solid rgba(133,194,190,.2)',borderRadius:'var(--r)',padding:'10px 14px',marginBottom:16,display:'flex',alignItems:'center',gap:10,fontSize:12}}>
          <span style={{color:'var(--accent)',fontFamily:'var(--mono)',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:.5}}>Next →</span>
          <span style={{color:'var(--text3)'}}>{nextHint}</span>
        </div>
      )}

      {/* Progress — 7 stages */}
      <div style={{display:'flex',alignItems:'center',gap:0,marginBottom:24,padding:'0 4px',overflowX:'auto'}}>
        {[
          {label:'Created'},{label:'Deposit'},{label:'Producing'},{label:'Balance Paid'},
          {label:'Shipped'},{label:'At Port'},{label:'In Godown'},
        ].map((stage,i)=>{const sn=i+1;const done=step>sn;const act=step===sn;return(<div key={i} style={{display:'flex',alignItems:'center',flex:'1 0 80px'}}>
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
            <div style={{width:24,height:24,borderRadius:'50%',background:done?'var(--green)':act?'var(--accent)':'var(--surface3)',border:`2px solid ${done?'var(--green)':act?'var(--accent)':'var(--border)'}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color:done||act?'#fff':'var(--text3)'}}>{done?'✓':sn}</div>
            <span style={{fontSize:8,fontFamily:'var(--mono)',color:done?'var(--green)':act?'var(--accent)':'var(--text3)',textTransform:'uppercase',letterSpacing:'.3px',textAlign:'center',lineHeight:1.2}}>{stage.label}</span>
          </div>{i<6&&<div style={{flex:1,height:2,background:done?'var(--green)':'var(--border)',margin:'0 4px',marginBottom:14}}/>}</div>)})}
      </div>

      {/* Outstanding-to-pay banner — prominent when supplier has unpaid balance */}
      {outstanding > 0 && !isClosed && (
        <div style={{background: paidPct > 0 ? 'rgba(255,176,46,.06)' : 'rgba(255,176,46,.04)', border:'1px solid rgba(255,176,46,.25)', borderRadius:'var(--r)', padding:'12px 16px', marginBottom:16, display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:12}}>
          <div>
            <div style={{fontSize:10,fontFamily:'var(--mono)',color:'var(--text3)',textTransform:'uppercase',letterSpacing:.8,marginBottom:4}}>Outstanding to supplier</div>
            <div style={{fontFamily:'var(--mono)',fontSize:18,fontWeight:800,color:'var(--yellow)'}}>{tzs(outstanding)}</div>
          </div>
          <div style={{flex:1,minWidth:200,maxWidth:400}}>
            <div style={{height:8,background:'var(--surface3)',borderRadius:4,overflow:'hidden'}}>
              <div style={{height:'100%',width:`${paidPct}%`,background: paidPct>=100?'var(--green)':'var(--yellow)',transition:'width .3s'}}></div>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',marginTop:4,fontSize:10,fontFamily:'var(--mono)',color:'var(--text3)'}}>
              <span>Paid {tzs(supplierPaid)} ({paidPct}%)</span>
              <span>Total {tzs(activeOrder.total_tzs)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:10,marginBottom:20}}>
        {[
          {label:'Order Total',val:tzs(activeOrder.total_tzs),sub:activeOrder.currency==='TZS'?'Local supplier':`${activeOrder.currency} ${activeOrder.total_usd.toLocaleString()} @ ${activeOrder.fx_rate}`,color:'var(--text)'},
          {label:'Supplier Paid',val:tzs(supplierPaid),sub:`${paidPct}%`,color:supplierPaid>=activeOrder.total_tzs?'var(--green)':'var(--yellow)'},
          {label:'Other Costs',val:tzs(allOtherCosts),sub:allOtherCosts>0?`Freight + customs + carrier`:'',color:allOtherCosts>0?'var(--blue)':'var(--text3)'},
          {label:'Total Landed',val:tzs(totalPaid),sub:totalQtyOrd>0&&totalPaid>0?`${tzs(Math.round(totalPaid/totalQtyOrd))}/unit`:'',color:'var(--accent)'},
          {label:'Received',val:`${totalQtyRcv} / ${totalQtyOrd}`,color:totalQtyRcv>=totalQtyOrd?'var(--green)':totalQtyRcv>0?'var(--yellow)':'var(--text3)'},
        ].map(it=>(
          <div key={it.label} className="card" style={{padding:'14px 16px'}}><div style={{fontSize:9,fontFamily:'var(--mono)',color:'var(--text3)',textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>{it.label}</div><div style={{fontFamily:'var(--mono)',fontSize:16,fontWeight:700,color:it.color}}>{it.val}</div>{it.sub&&<div style={{fontSize:10,color:'var(--text3)',marginTop:3}}>{it.sub}</div>}</div>))}
      </div>

      {/* Cost breakdown chips — only show when there are non-supplier costs */}
      {allOtherCosts > 0 && (
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:20}}>
          {freightPaid > 0 && <div style={{background:'var(--surface)',border:'1px solid rgba(38,100,235,.2)',borderRadius:8,padding:'8px 12px',fontSize:11}}><span style={{color:'var(--text3)',fontFamily:'var(--mono)',fontSize:9,textTransform:'uppercase',marginRight:8}}>Shipping</span><span style={{color:'var(--blue)',fontFamily:'var(--mono)',fontWeight:700}}>{tzs(freightPaid)}</span></div>}
          {customsPaid > 0 && <div style={{background:'var(--surface)',border:'1px solid rgba(255,176,46,.2)',borderRadius:8,padding:'8px 12px',fontSize:11}}><span style={{color:'var(--text3)',fontFamily:'var(--mono)',fontSize:9,textTransform:'uppercase',marginRight:8}}>Customs/Duties</span><span style={{color:'var(--yellow)',fontFamily:'var(--mono)',fontWeight:700}}>{tzs(customsPaid)}</span></div>}
          {clearingPaid > 0 && <div style={{background:'var(--surface)',border:'1px solid rgba(255,176,46,.2)',borderRadius:8,padding:'8px 12px',fontSize:11}}><span style={{color:'var(--text3)',fontFamily:'var(--mono)',fontSize:9,textTransform:'uppercase',marginRight:8}}>Clearing</span><span style={{color:'var(--yellow)',fontFamily:'var(--mono)',fontWeight:700}}>{tzs(clearingPaid)}</span></div>}
          {carrierPaid > 0 && <div style={{background:'var(--surface)',border:'1px solid rgba(133,194,190,.2)',borderRadius:8,padding:'8px 12px',fontSize:11}}><span style={{color:'var(--text3)',fontFamily:'var(--mono)',fontSize:9,textTransform:'uppercase',marginRight:8}}>Local Carrier</span><span style={{color:'var(--accent)',fontFamily:'var(--mono)',fontWeight:700}}>{tzs(carrierPaid)}</span></div>}
        </div>
      )}

      {/* Order Lines */}
      <div className="card" style={{marginBottom:16}}><div className="card-title" style={{marginBottom:12}}>Products Ordered</div><div className="table-wrap"><table><thead><tr><th>SKU</th><th>Product</th><th className="td-right">Qty</th><th className="td-right">Unit {activeOrder.currency}</th><th className="td-right">Unit TZS</th><th className="td-right">Received</th><th className="td-right">Landed/Unit</th><th>Status</th></tr></thead><tbody>
        {orderLines.map(l=>{const pct=l.qty>0?Math.round(l.qty_received/l.qty*100):0;return(<tr key={l.id}><td className="td-mono" style={{fontSize:11,color:'var(--accent)'}}>{products.find(pp=>pp.id===l.product_id)?.sku||''}</td><td style={{fontSize:12,fontWeight:600}}>{l.description}</td><td className="td-right td-mono">{l.qty}</td><td className="td-right td-mono" style={{fontSize:11}}>{activeOrder.currency==='USD'?'$':''}{l.unit_cost_usd.toFixed(2)}{activeOrder.currency!=='USD'&&activeOrder.currency!=='TZS'?` ${activeOrder.currency}`:''}</td><td className="td-right td-mono" style={{fontSize:11}}>{tzs(l.unit_cost_tzs)}</td><td className="td-right td-mono" style={{fontWeight:700,color:pct>=100?'var(--green)':pct>0?'var(--yellow)':'var(--text3)'}}>{l.qty_received}/{l.qty}</td><td className="td-right td-mono" style={{fontSize:11,color:'var(--accent)'}}>{l.landed_unit_cost_tzs>0?tzs(Math.round(l.landed_unit_cost_tzs)):''}</td><td><span className={`pill ${pct>=100?'pill-green':pct>0?'pill-amber':'pill-gray'}`} style={{fontSize:9}}>{pct>=100?'Complete':pct>0?`${pct}%`:'Pending'}</span></td></tr>)})}
      </tbody></table></div></div>

      {/* Payments */}
      <div className="card" style={{marginBottom:16}}><div className="card-title" style={{marginBottom:12}}>Payments ({payments.length})</div>
        {payments.length===0?<div style={{textAlign:'center',padding:'20px 0',color:'var(--text3)',fontSize:12}}>No payments yet.</div>:
        <div className="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>To</th><th>Ref</th><th className="td-right">Amount</th></tr></thead><tbody>
          {payments.map((p,i)=>{
            const labelMap: Record<string,string> = {supplier_deposit:'Supplier Deposit', supplier_balance:'Supplier Balance', forwarding_agent:'Shipping/Freight', customs_duties:'Customs & Duties', clearing_fees:'Clearing Fees', local_carrier:'Local Carrier'}
            const colorMap: Record<string,string> = {supplier_deposit:'pill-amber', supplier_balance:'pill-green', forwarding_agent:'pill-blue', customs_duties:'pill-amber', clearing_fees:'pill-amber', local_carrier:'pill-blue'}
            return (<tr key={i}><td className="td-mono" style={{fontSize:11,color:'var(--text3)'}}>{p.payment_date}</td><td><span className={`pill ${colorMap[p.payment_type]||'pill-gray'}`} style={{fontSize:9}}>{labelMap[p.payment_type]||p.payment_type.replace(/_/g,' ')}</span></td><td style={{fontSize:11}}>{p.agent_name||activeOrder.suppliers?.name||''}</td><td className="td-mono" style={{fontSize:11,color:'var(--text3)'}}>{p.reference||''}</td><td className="td-right td-mono" style={{fontWeight:700,fontSize:13}}>{tzs(p.amount_tzs)}</td></tr>)
          })}
        </tbody><tfoot><tr style={{background:'var(--surface2)'}}><td colSpan={4} style={{fontWeight:700}}>Total</td><td className="td-right td-mono" style={{fontSize:15,fontWeight:800}}>{tzs(totalPaid)}</td></tr></tfoot></table></div>}
      </div>

      {/* Shipments */}
      <div className="card"><div className="card-title" style={{marginBottom:12}}>Shipments ({shipments.length})</div>
        {shipments.length===0?<div style={{textAlign:'center',padding:'20px 0',color:'var(--text3)',fontSize:12}}>No shipments yet.</div>:
        <div style={{display:'flex',flexDirection:'column',gap:12}}>{shipments.map(sh=>{const sL=sh.import_shipment_lines||[];const tS=sL.reduce((s,l)=>s+l.qty_shipped,0);const tR=sL.reduce((s,l)=>s+(l.qty_received||0),0);return(
          <div key={sh.id} style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:12,padding:'16px 20px'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
              <div><div style={{display:'flex',alignItems:'center',gap:8}}><span style={{fontFamily:'var(--mono)',fontWeight:700,fontSize:14}}>#{sh.shipment_number}</span><span className={`pill ${sh.method==='air'?'pill-amber':'pill-blue'}`} style={{fontSize:9}}>{sh.method==='air'?'AIR':'SEA'}</span><span className={`pill ${sh.status==='received'?'pill-green':'pill-blue'}`} style={{fontSize:9}}>{sh.status==='in_transit'?'In Transit':sh.status}</span></div>
              <div style={{fontSize:10,color:'var(--text3)',marginTop:2,display:'flex',gap:12}}>{sh.agent_name&&<span>Agent: {sh.agent_name}</span>}{sh.ship_date&&<span>Shipped: {sh.ship_date}</span>}{sh.expected_arrival&&<span>ETA: {sh.expected_arrival}</span>}{sh.actual_arrival&&<span>Arrived: {sh.actual_arrival}</span>}</div></div>
              <div style={{display:'flex',alignItems:'center',gap:12}}><div style={{textAlign:'right'}}><div style={{fontSize:10,color:'var(--text3)',fontFamily:'var(--mono)'}}>{tR}/{tS} pcs</div>{sh.freight_cost_tzs>0&&<div style={{fontSize:10,color:'var(--blue)',fontFamily:'var(--mono)'}}>Freight: {tzs(sh.freight_cost_tzs)}</div>}</div>
              {sh.status!=='received'&&<button className="btn btn-primary btn-sm" onClick={()=>openReceiveModal(sh)} style={{display:'flex',alignItems:'center',gap:4,fontSize:11}}><Ic n="check" s={12} c="#fff"/> Receive</button>}</div>
            </div>
            <div style={{borderTop:'1px solid var(--border)',paddingTop:8}}>{sL.map((sl,idx)=>{const ol2=orderLines.find(l=>l.id===sl.order_line_id);return(<div key={idx} style={{display:'flex',justifyContent:'space-between',padding:'4px 0',fontSize:12}}><span>{ol2?.description||'?'}</span><span style={{fontFamily:'var(--mono)',color:(sl.qty_received||0)>=sl.qty_shipped?'var(--green)':'var(--text3)'}}>{sl.qty_received||0}/{sl.qty_shipped} pcs</span></div>)})}</div>
          </div>)})}</div>}
      </div>

      {/* Payment Modal */}
      {showPayModal&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.6)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={()=>setShowPayModal(false)}><div className="card" style={{width:500}} onClick={e=>e.stopPropagation()}>
        <div className="card-title" style={{marginBottom:16}}>Record Payment — {activeOrder.ref}</div>
        <FG label="Type" req><select className="form-input" value={payType} onChange={e=>setPayType(e.target.value as typeof payType)}>
          <optgroup label="Supplier">
            <option value="supplier_deposit">Supplier Deposit</option>
            <option value="supplier_balance">Supplier Balance</option>
          </optgroup>
          <optgroup label="Logistics">
            <option value="forwarding_agent">Shipping / Freight</option>
            <option value="customs_duties">Customs &amp; Duties</option>
            <option value="clearing_fees">Clearing Fees</option>
            <option value="local_carrier">Local Carrier (godown delivery)</option>
          </optgroup>
        </select></FG>
        <div className="form-row"><FG label="Currency"><select className="form-input" value={payForm.currency} onChange={e=>{setPayF('currency',e.target.value);if(e.target.value==='TZS')setPayF('fxRate','1');else if(e.target.value==='USD')setPayF('fxRate',String(activeOrder?.fx_rate||2500));else setPayF('fxRate','365')}}><option value="TZS">TZS</option><option value="USD">USD</option><option value="RMB">RMB</option></select></FG>
        {payForm.currency!=='TZS'&&<FG label={`Rate TZS/${payForm.currency}`}><input type="number" className="form-input" style={{fontFamily:'var(--mono)'}} value={payForm.fxRate} onChange={e=>setPayF('fxRate',e.target.value)}/></FG>}</div>
        <div className="form-row"><FG label={`Amount (${payForm.currency})`} req><input type="number" className="form-input" style={{fontFamily:'var(--mono)',fontSize:16,fontWeight:700}} value={payForm.amount} onChange={e=>setPayF('amount',e.target.value)} placeholder="0"/></FG><FG label="Date" req><input type="date" className="form-input" value={payForm.date} onChange={e=>setPayF('date',e.target.value)}/></FG></div>
        <FG label="Bank Account" req><select className="form-input" value={payForm.bankAccount} onChange={e=>setPayF('bankAccount',e.target.value)}><option value="">— Select —</option>{bankAccounts.map(a=><option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></FG>
        {(payType==='forwarding_agent'||payType==='customs_duties'||payType==='clearing_fees'||payType==='local_carrier')&&<FG label={payType==='local_carrier'?'Local Carrier (from Suppliers)':payType==='customs_duties'?'TRA / Authority':payType==='clearing_fees'?'Clearing Agent':'Shipping Agent'} req><select className="form-input" value={payForm.agentSupplierId} onChange={e=>setPayF('agentSupplierId',e.target.value)}><option value="">— Select —</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></FG>}
        <FG label="Reference"><input className="form-input" value={payForm.reference} onChange={e=>setPayF('reference',e.target.value)} placeholder="Bank ref"/></FG>
        {payForm.currency!=='TZS'&&payForm.amount&&<div style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'10px 12px',fontSize:12,fontFamily:'var(--mono)',color:'var(--text3)',marginTop:4}}>{payForm.currency} {parseFloat(payForm.amount).toLocaleString()} x {payForm.fxRate} = <span style={{fontWeight:700,color:'var(--accent)'}}>{tzs(parseFloat(payForm.amount)*(parseFloat(payForm.fxRate)||1))}</span></div>}
        <div style={{display:'flex',gap:8,marginTop:14,justifyContent:'flex-end'}}><button className="btn btn-ghost" onClick={()=>setShowPayModal(false)}>Cancel</button><button className="btn btn-primary" onClick={recordPayment} disabled={payPosting}>{payPosting?'Posting...':'Record Payment'}</button></div>
      </div></div>}

      {/* Shipment Modal */}
      {showShipModal&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.6)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={()=>setShowShipModal(false)}><div className="card" style={{width:540,maxHeight:'80vh',overflowY:'auto'}} onClick={e=>e.stopPropagation()}>
        <div className="card-title" style={{marginBottom:16}}>Add Shipment</div>
        <div className="form-row"><FG label="Method" req><select className="form-input" value={shipForm.method} onChange={e=>setShipForm(f=>({...f,method:e.target.value}))}><option value="sea">Sea Cargo</option><option value="air">Air Cargo</option></select></FG><FG label="Agent"><input className="form-input" value={shipForm.agentName} onChange={e=>setShipForm(f=>({...f,agentName:e.target.value}))}/></FG></div>
        <div className="form-row"><FG label="Ship Date"><input type="date" className="form-input" value={shipForm.shipDate} onChange={e=>setShipForm(f=>({...f,shipDate:e.target.value}))}/></FG><FG label="ETA"><input type="date" className="form-input" value={shipForm.expectedArrival} onChange={e=>setShipForm(f=>({...f,expectedArrival:e.target.value}))}/></FG></div>
        <FG label="Tracking Ref"><input className="form-input" value={shipForm.trackingRef} onChange={e=>setShipForm(f=>({...f,trackingRef:e.target.value}))}/></FG>
        <FG label="Freight Cost (TZS)"><input type="number" className="form-input" style={{fontFamily:'var(--mono)'}} value={shipForm.freightCost} onChange={e=>setShipForm(f=>({...f,freightCost:e.target.value}))} placeholder="0"/></FG>
        <div style={{marginTop:14,borderTop:'1px solid var(--border)',paddingTop:12}}><div style={{fontSize:11,fontWeight:600,marginBottom:10,color:'var(--text3)',textTransform:'uppercase'}}>Quantities per product</div>
        {shipLines.map((sl,i)=>{
          const ol3 = orderLines.find(l=>l.id===sl.orderLineId)
          const rem = remainingToShip(sl.orderLineId)
          const ordered = ol3?.qty || 0
          const alreadyShipped = ordered - rem
          const overLimit = sl.qty > rem
          return (
            <div key={i} style={{padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <span style={{flex:1,fontSize:12}}>{sl.desc}</span>
                <span style={{fontSize:10,color:rem===0?'var(--red)':'var(--text3)',fontFamily:'var(--mono)'}}>
                  {alreadyShipped > 0 ? `${alreadyShipped}/${ordered} shipped, ` : ''}{rem} remaining
                </span>
                <input
                  type="number"
                  className="form-input"
                  style={{width:80,fontSize:12,padding:'5px 8px',textAlign:'center',fontFamily:'var(--mono)',borderColor:overLimit?'var(--red)':undefined,color:overLimit?'var(--red)':undefined}}
                  value={sl.qty}
                  min={0}
                  max={rem}
                  disabled={rem===0}
                  onChange={e=>{const nl=[...shipLines];nl[i]={...nl[i],qty:parseInt(e.target.value)||0};setShipLines(nl)}}
                />
              </div>
              {overLimit && (
                <div style={{fontSize:10,color:'var(--red)',fontFamily:'var(--mono)',marginTop:4,paddingLeft:4}}>
                  Cannot ship more than {rem} (already shipped {alreadyShipped} of {ordered})
                </div>
              )}
            </div>
          )
        })}</div>
        <div style={{display:'flex',gap:8,marginTop:14,justifyContent:'flex-end'}}>
          <button className="btn btn-ghost" onClick={()=>setShowShipModal(false)}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={addShipment}
            disabled={shipLines.some(sl => sl.qty > remainingToShip(sl.orderLineId)) || shipLines.every(sl => sl.qty <= 0)}
          >Create Shipment</button>
        </div>
      </div></div>}

      {/* Receive Modal */}
      {showReceiveModal&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.6)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={()=>setShowReceiveModal(false)}><div className="card" style={{width:520}} onClick={e=>e.stopPropagation()}>
        <div className="card-title" style={{marginBottom:6}}>Receive Goods — Shipment #{rcvShipment?.shipment_number}</div>
        <div style={{fontSize:11,color:'var(--text3)',marginBottom:16}}>{rcvShipment?.method==='air'?'Air':'Sea'} cargo{rcvShipment?.agent_name?` via ${rcvShipment.agent_name}`:''}{rcvShipment?.freight_cost_tzs?` · Freight: ${tzs(rcvShipment.freight_cost_tzs)}`:''}</div>
        <div style={{background:'rgba(133,194,190,.06)',border:'1px solid rgba(133,194,190,.15)',borderRadius:8,padding:'10px 12px',marginBottom:16,fontSize:11,color:'var(--text3)'}}>Stock will update immediately at the warehouse you choose. Cost = purchase price + proportional freight per unit.</div>
        <FG label="Receive into warehouse" req>
          <select
            className="form-input"
            value={receiveLocationId}
            onChange={e=>setReceiveLocationId(e.target.value)}
            disabled={userLoc.isLocked}
            title={userLoc.isLocked ? `Locked to ${userLoc.defaultLocationCode}` : ''}
          >
            <option value="">— Select warehouse —</option>
            {locations.map(l => {
              const isMine = !userLoc.isLocked || userLoc.defaultLocationId === l.id
              return (
                <option key={l.id} value={l.id} disabled={!isMine}>
                  {l.code} — {l.name}{!isMine ? ' (not assigned)' : ''}
                </option>
              )
            })}
          </select>
        </FG>
        {receiveLines.map((rl,i)=>{const rem2=rl.qtyShipped-rl.qtyAlreadyReceived;return(<div key={i} style={{padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4}}><span style={{flex:1,fontSize:13,fontWeight:600}}>{rl.desc}</span><span style={{fontSize:10,fontFamily:'var(--mono)',color:'var(--text3)'}}>shipped: {rl.qtyShipped}</span></div>
          <div style={{display:'flex',alignItems:'center',gap:10}}><span style={{fontSize:11,color:'var(--text3)'}}>Receive:</span>
          <input type="number" className="form-input" style={{width:80,fontSize:13,padding:'5px 8px',textAlign:'center',fontFamily:'var(--mono)',fontWeight:700}} value={rl.qtyReceive} min={0} max={rem2} onChange={e=>{const nl=[...receiveLines];nl[i]={...nl[i],qtyReceive:parseInt(e.target.value)||0};setReceiveLines(nl)}}/>
          <span style={{fontSize:10,color:'var(--text3)'}}>of {rem2} remaining</span></div></div>)})}
        <div style={{display:'flex',gap:8,marginTop:16,justifyContent:'flex-end'}}><button className="btn btn-ghost" onClick={()=>setShowReceiveModal(false)}>Cancel</button><button className="btn btn-primary" onClick={doReceiveShipment} disabled={receiving}>{receiving?'Updating stock...':'Confirm Received'}</button></div>
      </div></div>}

      {toast&&<Toast message={toast} type={toastType} onClose={()=>setToast('')}/>}
    </div>)
  }

  // ═══ CREATE VIEW ═══
  if (view === 'create') {
    return (<div className="page">
      <div className="page-header"><div style={{display:'flex',alignItems:'center',gap:12}}>
        <button className="btn btn-ghost btn-sm" onClick={()=>setView('list')} style={{display:'flex',alignItems:'center',gap:6}}><Ic n="back"/> Orders</button>
        <div style={{width:1,height:24,background:'var(--border)'}}/><div className="page-title">New Import Order</div>
      </div><div className="page-actions"><button className="btn btn-ghost" onClick={()=>setView('list')}>Cancel</button><button className="btn btn-primary" onClick={saveOrder} disabled={saving}>{saving?'Creating...':'Create Order'}</button></div></div>
      <div className="grid g2" style={{gap:20}}>
        <div className="card"><div className="card-title" style={{marginBottom:14}}>Order Details</div>
          <FG label="Supplier" req><select className="form-input" value={form.supplier} onChange={e=>setF('supplier',e.target.value)}><option value="">— Select —</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></FG>
          <div className="form-row"><FG label="Order Date" req><input type="date" className="form-input" value={form.orderDate} onChange={e=>setF('orderDate',e.target.value)}/></FG><FG label="Expected Ready"><input type="date" className="form-input" value={form.expectedReady} onChange={e=>setF('expectedReady',e.target.value)}/></FG></div>
          <div className="form-row">
            <FG label="Currency"><select className="form-input" value={form.currency} onChange={e=>{const c=e.target.value;setF('currency',c);if(c==='TZS'){setF('fxRate','1');recalcLines(1)}else if(c==='USD'){setF('fxRate','2500');recalcLines(2500)}else{setF('fxRate','350');recalcLines(350)}}}>
              <option value="TZS">TZS (local supplier)</option>
              <option value="USD">USD</option>
              <option value="RMB">RMB (Chinese yuan)</option>
              <option value="INR">INR (Indian rupee)</option>
            </select></FG>
            <FG label={isLocalCurrency?'FX Rate (1)':`FX Rate (TZS/${form.currency})`} req><input type="number" className="form-input" style={{fontFamily:'var(--mono)'}} value={form.fxRate} onChange={e=>{setF('fxRate',e.target.value);recalcLines(parseFloat(e.target.value)||1)}} disabled={isLocalCurrency}/></FG>
          </div>
          <FG label="Notes"><textarea className="form-input" rows={2} style={{resize:'none'}} value={form.notes} onChange={e=>setF('notes',e.target.value)}/></FG>
        </div>
        <div className="card" style={{padding:'16px 18px'}}><div style={{fontSize:10,fontFamily:'var(--mono)',color:'var(--text3)',textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>Order Total</div><div style={{fontFamily:'var(--mono)',fontSize:28,fontWeight:800,color:'var(--accent)',marginBottom:4}}>{isLocalCurrency?tzs(totalTzs):`${form.currency} ${totalUsd.toFixed(2)}`}</div>{!isLocalCurrency&&<div style={{fontFamily:'var(--mono)',fontSize:16,color:'var(--text3)'}}>{tzs(totalTzs)}</div>}{!isLocalCurrency&&<div style={{fontSize:10,color:'var(--text3)',marginTop:4}}>@ {form.fxRate} TZS/{form.currency}</div>}{isLocalCurrency&&<div style={{fontSize:10,color:'var(--text3)',marginTop:4}}>Local supplier · TZS</div>}</div>
      </div>
      <div className="card" style={{marginTop:16}}><div className="card-title" style={{marginBottom:14}}>Products</div><div className="table-wrap" style={{marginBottom:8}}><table><thead><tr><th>Product</th><th>Description</th><th style={{width:70,textAlign:'center'}}>Qty</th><th style={{width:120,textAlign:'right'}}>Unit {form.currency}</th><th style={{width:140,textAlign:'right'}}>Subtotal TZS</th><th style={{width:40}}></th></tr></thead><tbody>
        {lines.map((line,i)=>(<tr key={i}><td><select className="form-input" style={{fontSize:12,padding:'6px 8px'}} value={line.product_id} onChange={e=>updateLine(i,'product_id',e.target.value)}><option value="">— Select —</option>{products.map(pp=><option key={pp.id} value={pp.id}>{pp.sku} — {pp.name}</option>)}</select></td><td><input className="form-input" style={{fontSize:12,padding:'6px 8px'}} value={line.description} onChange={e=>updateLine(i,'description',e.target.value)} placeholder="Description"/></td><td><input type="number" className="form-input" style={{fontSize:12,padding:'6px 8px',textAlign:'center'}} value={line.qty} min={1} onChange={e=>updateLine(i,'qty',parseInt(e.target.value)||1)}/></td><td><input type="number" className="form-input" style={{fontSize:12,padding:'6px 8px',textAlign:'right',fontFamily:'var(--mono)'}} value={line.unit_cost_usd} step="0.01" onChange={e=>updateLine(i,'unit_cost_usd',parseFloat(e.target.value)||0)}/></td><td style={{textAlign:'right',fontFamily:'var(--mono)',fontSize:12}}>{Math.round(line.subtotal_tzs).toLocaleString()}</td><td><button onClick={()=>setLines(lines.filter((_,idx)=>idx!==i))} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text3)',fontSize:14}}>x</button></td></tr>))}
      </tbody></table></div><button className="btn btn-ghost btn-sm" onClick={()=>setLines([...lines,{...EMPTY_LINE,line_number:lines.length+1}])}>+ Add Product</button></div>
      {toast&&<Toast message={toast} type={toastType} onClose={()=>setToast('')}/>}
    </div>)
  }

  // ═══ LIST VIEW ═══
  // Status grouping for filter pills
  const isActive = (s: string) => !['closed','received'].includes(s)
  const isAtPort = (s: string) => s === 'at_port' || s === 'with_carrier'
  const isInGodown = (s: string) => s === 'received' || s === 'partially_received'

  // Filtering
  const filteredOrders = orders.filter(o => {
    if (filterStatus === 'active' && !isActive(o.status) && o.status !== 'received') return false
    if (filterStatus === 'at_port' && !isAtPort(o.status)) return false
    if (filterStatus === 'in_godown' && !isInGodown(o.status)) return false
    if (filterStatus === 'closed' && o.status !== 'closed') return false
    if (filterSearch.trim()) {
      const q = filterSearch.toLowerCase()
      if (!o.ref.toLowerCase().includes(q) && !(o.suppliers?.name||'').toLowerCase().includes(q)) return false
    }
    return true
  }).sort((a,b)=>{
    let cmp = 0
    if (sortBy==='date') cmp = a.order_date.localeCompare(b.order_date)
    else if (sortBy==='ref') cmp = a.ref.localeCompare(b.ref)
    else if (sortBy==='supplier') cmp = (a.suppliers?.name||'').localeCompare(b.suppliers?.name||'')
    else if (sortBy==='value') cmp = a.total_landed_tzs - b.total_landed_tzs
    return sortDir==='desc' ? -cmp : cmp
  })

  // Counts for filter pills
  const counts = {
    all: orders.length,
    active: orders.filter(o => isActive(o.status) || o.status==='received').length,
    atPort: orders.filter(o => isAtPort(o.status)).length,
    inGodown: orders.filter(o => isInGodown(o.status)).length,
    closed: orders.filter(o => o.status==='closed').length,
  }

  // KPI tiles — show value tied up in non-closed orders
  const activeOrders = orders.filter(o => o.status !== 'closed')
  const totalActiveValue = activeOrders.reduce((s,o)=>s+(o.total_landed_tzs||o.total_tzs),0)
  const totalAtPortValue = orders.filter(o=>isAtPort(o.status)).reduce((s,o)=>s+(o.total_landed_tzs||o.total_tzs),0)
  const totalInGodown = orders.filter(o=>o.status==='received').reduce((s,o)=>s+(o.total_landed_tzs||o.total_tzs),0)

  const sortToggle = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir(d => d==='asc'?'desc':'asc')
    else { setSortBy(col); setSortDir('desc') }
  }
  const SortIcon = ({col}:{col:typeof sortBy}) => sortBy!==col ? null : <span style={{marginLeft:4,fontSize:9,color:'var(--accent)'}}>{sortDir==='asc'?'▲':'▼'}</span>

  return (<div className="page">
    <div className="page-header"><div><div className="page-title">Import Orders</div><div className="page-sub">Multi-stage purchases · Deposits, balance, shipping, customs, receipt</div></div>
    <div className="page-actions"><button className="btn btn-ghost btn-sm" onClick={loadAll} style={{display:'flex',alignItems:'center',gap:6}}><Ic n="refresh"/> Refresh</button>
    <button className="btn btn-primary btn-sm" onClick={()=>{setForm({supplier:'',orderDate:today(),expectedReady:'',currency:'USD',fxRate:'2500',notes:''});setLines([{...EMPTY_LINE}]);setView('create')}} style={{display:'flex',alignItems:'center',gap:6}}><Ic n="plus" s={13}/> New Import Order</button></div></div>

    <div className="shortcut-bar">
      {[
        { icon: 'M3 21h18M3 7v1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7H3l2-4h14l2 4 M5 21V10.7 M19 21V10.7', label: 'Suppliers', page: 'suppliers' as Page },
        { icon: 'M1 3h15v13H1zM16 8h7v13H8v-5', label: 'GRN', page: 'grn' as Page },
        { icon: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z', label: 'Inventory', page: 'inventory' as Page },
        { icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8', label: 'Purchase Invoice', page: 'purchase-invoice' as Page },
        { icon: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01', label: 'Purchase Register', page: 'purchase-register' as Page },
      ].map((s, i) => (
        <button key={i} className="shortcut-btn" onClick={() => onNav(s.page)}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ flexShrink: 0 }}><path d={s.icon}/></svg>
          {s.label}
          <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      ))}
    </div>

    {/* KPI tiles */}
    {orders.length > 0 && (
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:18}}>
        <div className="card" style={{padding:'14px 16px'}}>
          <div style={{fontSize:9,fontFamily:'var(--mono)',color:'var(--text3)',textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>Active Orders</div>
          <div style={{fontFamily:'var(--mono)',fontSize:22,fontWeight:800,color:'var(--accent)'}}>{counts.active}</div>
          <div style={{fontSize:11,color:'var(--text3)',marginTop:4}}>Total value: {tzs(totalActiveValue)}</div>
        </div>
        <div className="card" style={{padding:'14px 16px'}}>
          <div style={{fontSize:9,fontFamily:'var(--mono)',color:'var(--text3)',textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>At Port / With Carrier</div>
          <div style={{fontFamily:'var(--mono)',fontSize:22,fontWeight:800,color: counts.atPort>0?'var(--yellow)':'var(--text3)'}}>{counts.atPort}</div>
          <div style={{fontSize:11,color:'var(--text3)',marginTop:4}}>{counts.atPort>0?`${tzs(totalAtPortValue)} awaiting release`:'Nothing pending'}</div>
        </div>
        <div className="card" style={{padding:'14px 16px'}}>
          <div style={{fontSize:9,fontFamily:'var(--mono)',color:'var(--text3)',textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>In Godown (Open)</div>
          <div style={{fontFamily:'var(--mono)',fontSize:22,fontWeight:800,color: counts.inGodown>0?'var(--green)':'var(--text3)'}}>{counts.inGodown}</div>
          <div style={{fontSize:11,color:'var(--text3)',marginTop:4}}>{counts.inGodown>0?`${tzs(totalInGodown)} ready to close`:'Nothing waiting'}</div>
        </div>
      </div>
    )}

    {/* Filter bar */}
    {orders.length > 0 && (
      <div style={{display:'flex',gap:10,marginBottom:14,flexWrap:'wrap',alignItems:'center'}}>
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          {[
            {key:'active' as const, label:'Active', count:counts.active},
            {key:'at_port' as const, label:'At Port', count:counts.atPort},
            {key:'in_godown' as const, label:'In Godown', count:counts.inGodown},
            {key:'closed' as const, label:'Closed', count:counts.closed},
            {key:'all' as const, label:'All', count:counts.all},
          ].map(f=>(
            <button key={f.key} onClick={()=>setFilterStatus(f.key)} style={{
              padding:'6px 12px', fontSize:11, fontWeight:600,
              background: filterStatus===f.key?'var(--accent)':'var(--surface)',
              color: filterStatus===f.key?'#fff':'var(--text3)',
              border:'1px solid var(--border)', borderRadius:'var(--r)', cursor:'pointer',
              display:'inline-flex',alignItems:'center',gap:6,
            }}>
              {f.label}
              <span style={{fontFamily:'var(--mono)',fontSize:10,opacity:.8,padding:'1px 6px',background: filterStatus===f.key?'rgba(255,255,255,.2)':'var(--surface3)',borderRadius:8}}>{f.count}</span>
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search ref or supplier..."
          className="form-input"
          style={{flex:1, minWidth:200, maxWidth:320, fontSize:12, padding:'7px 12px'}}
          value={filterSearch}
          onChange={e=>setFilterSearch(e.target.value)}
        />
        <div style={{fontSize:11,color:'var(--text3)',fontFamily:'var(--mono)',marginLeft:'auto'}}>
          Showing {filteredOrders.length} of {orders.length}
        </div>
      </div>
    )}

    {loading?<div className="card" style={{textAlign:'center',padding:'40px 0',color:'var(--text3)'}}>Loading...</div>:orders.length===0?<div className="card" style={{textAlign:'center',padding:'40px 24px',color:'var(--text3)'}}>
      <div style={{fontSize:14,fontWeight:600,marginBottom:8,color:'var(--text)'}}>No import orders yet</div>
      <div style={{fontSize:12,maxWidth:520,margin:'0 auto',lineHeight:1.5}}>
        Use this for any purchase that spans weeks — local or international. Track deposits, balance payments, supplier production, shipping agents, customs, clearing fees, and local carriers all under one order. Stock enters your godown only when goods physically arrive, with the correct landed cost.
      </div>
      <div style={{fontSize:11,maxWidth:520,margin:'12px auto 0',color:'var(--text3)',lineHeight:1.5}}>
        For local same-day purchases (pick up + invoice + pay), use <strong style={{color:'var(--text3)'}}>GRN + Purchase Invoice</strong> instead.
      </div>
    </div>:filteredOrders.length===0?<div className="card" style={{textAlign:'center',padding:'30px 24px',color:'var(--text3)',fontSize:12}}>
      No orders match the current filter. <button className="btn btn-ghost btn-sm" onClick={()=>{setFilterStatus('all');setFilterSearch('')}} style={{marginLeft:8}}>Clear filters</button>
    </div>:
    <div className="card"><div className="table-wrap"><table><thead><tr>
      <th onClick={()=>sortToggle('ref')} style={{cursor:'pointer'}}>Ref<SortIcon col="ref"/></th>
      <th onClick={()=>sortToggle('supplier')} style={{cursor:'pointer'}}>Supplier<SortIcon col="supplier"/></th>
      <th onClick={()=>sortToggle('date')} style={{cursor:'pointer'}}>Date<SortIcon col="date"/></th>
      <th>Status</th>
      <th className="td-right">FX</th>
      <th className="td-right" onClick={()=>sortToggle('value')} style={{cursor:'pointer'}}>Order Value<SortIcon col="value"/></th>
      <th className="td-right">Other Costs</th>
      <th className="td-right">Landed (TZS)</th>
    </tr></thead><tbody>
      {filteredOrders.map(o=>{
        const isLocal = o.currency==='TZS' || o.fx_rate===1
        const otherCosts = (o.total_landed_tzs||0) - (o.total_tzs||0)
        return (
          <tr key={o.id} style={{cursor:'pointer'}} onClick={()=>loadOrderDetail(o)} onMouseEnter={e=>(e.currentTarget.style.background='var(--surface2)')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
            <td className="td-mono td-amber" style={{fontSize:12,fontWeight:700}}>{o.ref}</td>
            <td style={{fontSize:12,fontWeight:600}}>{o.suppliers?.name||''}</td>
            <td className="td-mono" style={{fontSize:11,color:'var(--text3)'}}>{o.order_date}</td>
            <td><span className={`pill ${STA_C[o.status]||'pill-gray'}`} style={{fontSize:9}}>{STA_L[o.status]||o.status}</span></td>
            <td className="td-right td-mono" style={{fontSize:11,color:'var(--text3)'}}>{isLocal?'—':`${o.currency} @ ${o.fx_rate}`}</td>
            <td className="td-right td-mono" style={{fontSize:12}}>{tzs(o.total_tzs)}</td>
            <td className="td-right td-mono" style={{fontSize:12,color:otherCosts>0?'var(--blue)':'var(--text3)'}}>{otherCosts>0?tzs(otherCosts):'—'}</td>
            <td className="td-right td-mono" style={{fontSize:12,fontWeight:700,color:'var(--accent)'}}>{tzs(o.total_landed_tzs)}</td>
          </tr>
        )
      })}
    </tbody><tfoot>
      <tr style={{background:'var(--surface2)',fontWeight:700}}>
        <td colSpan={5} style={{padding:'10px 14px',fontFamily:'var(--mono)',fontSize:11,textTransform:'uppercase',color:'var(--text3)'}}>Totals — {filteredOrders.length} orders</td>
        <td className="td-right td-mono" style={{padding:'10px 14px'}}>{tzs(filteredOrders.reduce((s,o)=>s+(o.total_tzs||0),0))}</td>
        <td className="td-right td-mono" style={{padding:'10px 14px',color:'var(--blue)'}}>{tzs(filteredOrders.reduce((s,o)=>s+((o.total_landed_tzs||0)-(o.total_tzs||0)),0))}</td>
        <td className="td-right td-mono" style={{padding:'10px 14px',color:'var(--accent)'}}>{tzs(filteredOrders.reduce((s,o)=>s+(o.total_landed_tzs||0),0))}</td>
      </tr>
    </tfoot></table></div></div>}
    {toast&&<Toast message={toast} type={toastType} onClose={()=>setToast('')}/>}
  </div>)
}
