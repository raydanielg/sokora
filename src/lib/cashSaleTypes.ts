/**
 * CashSale shared types and constants
 * Extracted from CashSale.tsx to be importable by both the page and lib files
 */

export interface DBProduct {
  id: string; sku: string; name: string; category: string
  cost_price: number; selling_price: number; qty_on_hand: number
}

export interface DBCustomer {
  id: string; name: string; whatsapp: string; crown_points: number
  pregnancy_stage: string; last_purchase_date: string
  last_purchase_amount: number; balance: number
}

export interface SaleLine {
  productId: string
  name: string
  qty: number
  /**
   * Price BEFORE any line-level discount is applied. Cashiers can still
   * type a custom price here for a free-form override; the discountPct
   * field is layered on top of that.
   */
  price: number
  /**
   * Per-line discount in PERCENT (0-100). Defaults to 0.
   * Applied to (qty × price) to compute the final amount.
   * Stored separately so reports can show "discount given" totals
   * and so the future approval gate can compare to a threshold.
   */
  discountPct: number
  /**
   * Final line amount after discount. Always equals
   *   qty × price × (1 - discountPct/100)
   * Kept in state to avoid recomputing on every render.
   */
  amount: number
}

export interface SplitLine {
  methodId: string; accountId: string; amount: number; ref: string
}

export interface PaymentMethod {
  id: string
  label: string
  sublabel: string
  accountCode: string
  color: string
  bg: string
  showRef: boolean
}

export const PAYMENT_METHODS: PaymentMethod[] = [
  { id: 'cash',  label: 'Cash',        sublabel: 'Cash in Hand',                    accountCode: '1010', color: '#22c55e', bg: '#14532d', showRef: false },
  { id: 'mpesa', label: 'M-Pesa',      sublabel: '50582099 · SOKORA',      accountCode: '1020', color: '#ef4444', bg: '#7f1d1d', showRef: true  },
  { id: 'mixx',  label: 'Mixx by YAS', sublabel: '17915715 · SOKORA',      accountCode: '1021', color: '#facc15', bg: '#1e3a8a', showRef: true  },
  { id: 'nmb',   label: 'NMB Bank',    sublabel: '22510074972 · SOKORA',   accountCode: '1022', color: '#60a5fa', bg: '#1e3a5f', showRef: true  },
  { id: 'crdb',  label: 'CRDB Bank',   sublabel: '015C874857300 · SOKORA', accountCode: '1030', color: '#4ade80', bg: '#14532d', showRef: true  },
  { id: 'pos',   label: 'POS Card',    sublabel: 'CRDB Card Machine',               accountCode: '1030', color: '#c084fc', bg: '#3b0764', showRef: true  },
]
