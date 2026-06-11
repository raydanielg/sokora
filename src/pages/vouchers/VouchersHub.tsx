import React from 'react'
import type { Page } from '../../lib/types'

interface Props { onNav: (p: Page) => void }

const SECTIONS = [
  {
    title: 'Money Vouchers', desc: 'Payments, receipts and transfers', items: [
      { icon: 'cash-out', name: 'Payment Voucher', desc: 'Pay any expense or supplier (cash or bank)', color: 'rgba(255,71,87,.12)', page: 'cash-payment' as Page },
      { icon: 'cash-in', name: 'Receipt Voucher', desc: 'Receive money — single, batch, or other income (cash or bank)', color: 'rgba(0,229,160,.12)', page: 'cash-receipt' as Page },
      { icon: 'transfer', name: 'Bank Transfer', desc: 'Between your own accounts', color: 'rgba(61,139,255,.12)', page: 'bank-transfer' as Page },
      { icon: 'petty', name: 'Petty Cash', desc: 'Small cash office expenses', color: 'rgba(255,211,42,.12)', page: 'petty-cash' as Page },
      { icon: 'contra', name: 'Contra Entry', desc: 'Cash deposit to bank or withdrawal', color: 'rgba(168,85,247,.12)', page: 'contra' as Page },
    ]
  },
  {
    title: 'Sales', desc: 'Sales invoices, cash sales and returns', items: [
      { icon: 'cash-sale', name: 'Cash Sale', desc: 'Counter POS — WhatsApp receipt', color: 'rgba(212,135,74,.12)', page: 'cash-sale' as Page },
      { icon: 'invoice', name: 'Sales Invoice', desc: 'Wholesale sale — creates AR entry', color: 'rgba(0,229,160,.12)', page: 'sales-invoice' as Page },
      { icon: 'invoice', name: 'Proforma Invoice', desc: 'Quotation · Convert to Sales Invoice', color: 'rgba(94,168,162,.12)', page: 'proforma' as Page },
      { icon: 'invoice', name: 'Proformas List', desc: 'Browse · Edit · Reprint · Convert', color: 'rgba(94,168,162,.12)', page: 'proformas-list' as Page },
      { icon: 'return', name: 'Sales Return', desc: 'Customer return / refund', color: 'rgba(255,71,87,.12)', page: 'sales-return' as Page },
      { icon: 'send', name: 'Debit Note', desc: 'Charge customer additional amount', color: 'rgba(255,71,87,.12)', page: 'debit-note' as Page },
      { icon: 'cash-in', name: 'Credit Note', desc: 'Credit customer — reduce balance', color: 'rgba(0,229,160,.12)', page: 'credit-note' as Page },
    ]
  },
  {
    title: 'Procurement', desc: 'Purchasing stock and receiving goods', items: [
      { icon: 'po', name: 'Purchase Order', desc: 'Order to supplier — no journal', color: 'rgba(100,116,139,.12)', page: 'purchase-order' as Page },
      { icon: 'grn', name: 'GRN', desc: 'Receive goods — updates stock', color: 'rgba(251,146,60,.12)', page: 'grn' as Page },
      { icon: 'pinv', name: 'Purchase Invoice', desc: 'Supplier bill — creates AP entry', color: 'rgba(168,85,247,.12)', page: 'purchase-invoice' as Page },
      { icon: 'return', name: 'Purchase Return', desc: 'Return goods to supplier', color: 'rgba(255,71,87,.12)', page: 'purchase-return' as Page },
    ]
  },
  {
    title: 'Inventory Adjustments', desc: 'Stock corrections and transfers', items: [
      { icon: 'package', name: 'Opening Stock', desc: 'Enter initial stock quantities', color: 'rgba(212,135,74,.12)', page: 'opening-stock' as Page },
      { icon: 'adjust', name: 'Stock Adjustment', desc: 'Physical count correction or write-off', color: 'rgba(255,71,87,.12)', page: 'stock-adjustment' as Page },
      { icon: 'stock-xfer', name: 'Stock Transfer', desc: 'Move stock between branches', color: 'rgba(61,139,255,.12)', page: 'stock-transfer' as Page },
      { icon: 'adjust', name: 'Internal Use', desc: 'Samples, own use, damage, training', color: 'rgba(212,135,74,.12)', page: 'internal-use' as Page },
    ]
  },
  {
    title: 'Journal & Corrections', desc: 'Manual double-entry postings', items: [
      { icon: 'stock-xfer', name: 'Journal Entry', desc: 'Manual debit/credit — must balance', color: 'rgba(212,135,74,.12)', page: 'journal-entry' as Page },
    ]
  },
]


const VIcon = ({ name, color }: { name: string; color: string }) => {
  const p = { width: 28, height: 28, fill: 'none', stroke: color, strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' }
  const icons: Record<string, React.ReactNode> = {
    'cash-sale': <svg {...p}><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 12h.01M18 12h.01"/></svg>,
    'cash-out':  <svg {...p}><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M12 9v6M9 12l3-3 3 3"/></svg>,
    'cash-in':   <svg {...p}><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M12 15V9M9 12l3 3 3-3"/></svg>,
    bank:        <svg {...p}><path d="M3 10L12 3l9 7"/><rect x="5" y="10" width="3" height="8"/><rect x="10.5" y="10" width="3" height="8"/><rect x="16" y="10" width="3" height="8"/><path d="M2 18h20"/></svg>,
    send:        <svg {...p}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
    transfer:    <svg {...p}><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>,
    contra:      <svg {...p}><path d="M7 16V4m0 0L3 8m4-4l4 4"/><path d="M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>,
    petty:       <svg {...p}><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>,
    invoice:     <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
    return:      <svg {...p}><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>,
    po:          <svg {...p}><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>,
    grn:         <svg {...p}><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>,
    pinv:        <svg {...p}><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2"/><line x1="16" y1="8" x2="8" y2="8"/><line x1="16" y1="12" x2="8" y2="12"/></svg>,
    package:     <svg {...p}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
    adjust:      <svg {...p}><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>,
    'stock-xfer':<svg {...p}><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>,
    journal:     <svg {...p}><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
    debit:       <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 12 15 15"/></svg>,
    credit:      <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="12" x2="12" y2="18"/><polyline points="9 15 12 18 15 15"/></svg>,
  }
  return <>{icons[name] ?? icons.journal}</>
}

export default function VouchersHub({ onNav }: Props) {
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Vouchers</div>
          <div className="page-sub">Every voucher auto-creates a double-entry journal · Stock updates automatically</div>
        </div>
      </div>
      {SECTIONS.map((section, si) => (
        <div key={si} style={{ marginBottom: 32 }}>
          <div className="section-label">
            <div className="section-bar"></div>
            <div className="section-title-txt">{section.title}</div>
            <div className="section-desc-txt">— {section.desc}</div>
          </div>
          <div className="voucher-grid">
            {section.items.map((item, ii) => (
              <div key={ii} className="voucher-card" onClick={() => onNav(item.page)}>
                <div className="voucher-card-icon" style={{ background: item.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><VIcon name={item.icon} color="currentColor" /></div>
                <div className="voucher-card-name">{item.name}</div>
                <div className="voucher-card-desc">{item.desc}</div>
                <div className="voucher-card-action">Open {item.name} →</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
