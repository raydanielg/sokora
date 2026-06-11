import { PRODUCTS } from '../lib/data'
import { tzs } from '../lib/utils'
import type { LineItem } from '../lib/types'

interface LineItemsTableProps {
  lines: LineItem[]
  setLines: (l: LineItem[]) => void
  showProduct?: boolean
  showPrice?: boolean
  priceLabel?: string
}

export default function LineItemsTable({
  lines, setLines,
  showProduct = true,
  showPrice = true,
  priceLabel = 'Price (TZS)'
}: LineItemsTableProps) {

  const update = (i: number, field: keyof LineItem, val: string | number) => {
    const nl = [...lines]
    nl[i] = { ...nl[i], [field]: val }
    if (field === 'qty' || field === 'price') {
      nl[i].amount = nl[i].qty * nl[i].price
    }
    if (field === 'productId') {
      const p = PRODUCTS.find(p => p.id === val)
      if (p) { nl[i].desc = p.name; nl[i].price = p.price; nl[i].amount = nl[i].qty * p.price }
    }
    setLines(nl)
  }

  const add = () => setLines([...lines, { productId: '', desc: '', qty: 1, price: 0, amount: 0 }])
  const remove = (i: number) => setLines(lines.filter((_, idx) => idx !== i))

  const subtotal = lines.reduce((s, l) => s + l.amount, 0)
  const total = subtotal

  return (
    <div>
      <div className="table-wrap" style={{ marginBottom: 8 }}>
        <table>
          <thead>
            <tr>
              {showProduct && <th>Product</th>}
              <th>Description</th>
              <th style={{ width: 80, textAlign: 'center' }}>Qty</th>
              {showPrice && <th style={{ textAlign: 'right', width: 150 }}>{priceLabel}</th>}
              <th style={{ textAlign: 'right', width: 150 }}>Amount (TZS)</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <tr key={i}>
                {showProduct && (
                  <td>
                    <select
                      className="form-input"
                      style={{ fontSize: 12, padding: '6px 8px' }}
                      value={line.productId}
                      onChange={e => update(i, 'productId', e.target.value)}>
                      <option value="">— Select —</option>
                      {PRODUCTS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </td>
                )}
                <td>
                  <input
                    className="form-input"
                    style={{ fontSize: 12, padding: '6px 8px' }}
                    value={line.desc}
                    onChange={e => update(i, 'desc', e.target.value)}
                    placeholder="Description"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    className="form-input"
                    style={{ fontSize: 12, padding: '6px 8px', textAlign: 'center' }}
                    value={line.qty}
                    min={1}
                    onChange={e => update(i, 'qty', parseInt(e.target.value) || 1)}
                  />
                </td>
                {showPrice && (
                  <td>
                    <input
                      type="number"
                      className="form-input"
                      style={{ fontSize: 12, padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--mono)' }}
                      value={line.price}
                      onChange={e => update(i, 'price', parseInt(e.target.value) || 0)}
                    />
                  </td>
                )}
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text)' }}>
                  {line.amount.toLocaleString()}
                </td>
                <td>
                  <button
                    onClick={() => remove(i)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 14 }}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button className="btn btn-ghost btn-sm" onClick={add} style={{ marginBottom: 16 }}>+ Add Line</button>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{
          width: 280, background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: 'var(--r)', padding: 14
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0' }}>
            <span style={{ color: 'var(--text3)' }}>Subtotal</span>
            <span style={{ fontFamily: 'var(--mono)' }}>{subtotal.toLocaleString()}</span>
          </div>
          <div style={{
            display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700,
            padding: '10px 0 0', borderTop: '1px solid var(--border2)', marginTop: 6
          }}>
            <span>TOTAL</span>
            <span style={{ fontFamily: 'var(--mono)', color: 'var(--green)' }}>{tzs(total)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
