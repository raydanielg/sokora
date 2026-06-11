import { useState, useRef, useCallback, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Toast from '../components/Toast'
import { postLedgerEntry } from '../lib/itemLedger'

// ─── Types ─────────────────────────────────────────────────────────────────

type ImportSource = 'tally_xml' | 'excel_csv' | 'quickbooks' | 'manual_csv'
type ImportEntity = 'customers' | 'products' | 'accounts' | 'opening_balances'
type Step = 'source' | 'entity' | 'upload' | 'map' | 'preview' | 'done'
type Toast_ = { msg: string; type: 'success' | 'error' } | null

interface FieldDef {
  key: string
  label: string
  required: boolean
  type: 'string' | 'number' | 'boolean' | 'date'
  hint?: string
  example?: string
}

interface MappedRow { [sokoraKey: string]: string }
interface ParsedRow  { [col: string]: string }
interface StockLocation { id: string; code: string; name: string; branch_code: string }

// ─── Field Definitions ──────────────────────────────────────────────────────

const BASE_PRODUCT_FIELDS: FieldDef[] = [
  { key: 'name',          label: 'Product Name',        required: true,  type: 'string',  example: 'Spectra S1 Breast Pump' },
  { key: 'sku',           label: 'SKU / Item Code',     required: false, type: 'string',  example: 'BPM-001', hint: 'Auto-generated if blank' },
  { key: 'barcode',       label: 'Barcode / EAN',       required: false, type: 'string',  example: '6938120113456' },
  { key: 'brand',         label: 'Brand',               required: false, type: 'string',  example: 'Spectra' },
  { key: 'category',      label: 'Category',            required: false, type: 'string',  example: 'Feeding', hint: 'Feeding / Maternity / Postpartum / Newborn / General' },
  { key: 'unit',          label: 'Unit of Measure',     required: false, type: 'string',  example: 'Piece', hint: 'Piece / Box / Set / Pair / Pack' },
  { key: 'cost_price',    label: 'Cost Price (TZS)',    required: false, type: 'number',  example: '180000', hint: 'Defaults to 0 if blank' },
  { key: 'selling_price', label: 'Selling Price (TZS)', required: false, type: 'number',  example: '250000', hint: 'Defaults to 0 if blank' },
  { key: 'reorder_point', label: 'Reorder Point',       required: false, type: 'number',  example: '5' },
  { key: 'qty_on_hand',   label: 'Total Qty in Stock',  required: false, type: 'number',  example: '24', hint: 'Overall total across all locations' },
]

function getProductFields(locations: StockLocation[]): FieldDef[] {
  const locFields: FieldDef[] = locations.map(loc => ({
    key: `loc_${loc.code}`,
    label: `Qty — ${loc.name} (${loc.code})`,
    required: false,
    type: 'number' as const,
    example: '0',
    hint: `Stock qty at ${loc.name}`,
  }))
  return [...BASE_PRODUCT_FIELDS, ...locFields]
}

const ENTITY_FIELDS_STATIC: Record<ImportEntity, FieldDef[]> = {
  customers: [
    { key: 'name',           label: 'Full Name / Company',   required: true,  type: 'string', example: 'Amina Mohamed' },
    { key: 'customer_type',  label: 'Customer Type',         required: true,  type: 'string', hint: 'cash or debtor', example: 'cash' },
    { key: 'whatsapp',       label: 'WhatsApp Number',       required: false, type: 'string', example: '+255712345678' },
    { key: 'contact_person', label: 'Contact Person',        required: false, type: 'string', example: 'John Mwamba' },
    { key: 'email',          label: 'Email Address',         required: false, type: 'string', example: 'amina@example.com' },
    { key: 'credit_limit',   label: 'Credit Limit (TZS)',    required: false, type: 'number', example: '500000' },
    { key: 'credit_period',  label: 'Credit Period (days)',  required: false, type: 'number', example: '30' },
    { key: 'balance',        label: 'Opening Balance (TZS)', required: false, type: 'number', hint: 'Positive = owes you', example: '150000' },
    { key: 'pregnancy_stage',label: 'Pregnancy Stage',       required: false, type: 'string', hint: 'pregnant / postpartum / ttc / newborn', example: 'pregnant' },
    { key: 'segment',        label: 'Segment',               required: false, type: 'string', hint: 'B2B or B2C', example: 'B2C' },
    { key: 'address',        label: 'Address',               required: false, type: 'string', example: 'Dar es Salaam' },
  ],
  products: BASE_PRODUCT_FIELDS,
  accounts: [
    { key: 'code',     label: 'Account Code',          required: true,  type: 'string', example: '4001' },
    { key: 'name',     label: 'Account Name',          required: true,  type: 'string', example: 'Sales Revenue' },
    { key: 'type',     label: 'Account Type',          required: true,  type: 'string', hint: 'Asset / Liability / Equity / Revenue / Expense', example: 'Revenue' },
    { key: 'category', label: 'Category / Group',      required: false, type: 'string', example: 'Current Assets' },
    { key: 'balance',  label: 'Opening Balance (TZS)', required: false, type: 'number', hint: 'Dr positive, Cr negative', example: '0' },
  ],
  opening_balances: [
    { key: 'account_code', label: 'Account Code',            required: true,  type: 'string', example: '1001' },
    { key: 'account_name', label: 'Account Name',            required: false, type: 'string', example: 'Cash in Hand' },
    { key: 'debit',        label: 'Debit Amount (TZS)',      required: false, type: 'number', example: '500000' },
    { key: 'credit',       label: 'Credit Amount (TZS)',     required: false, type: 'number', example: '0' },
    { key: 'date',         label: 'As-at Date',              required: false, type: 'date',   example: '2025-01-01' },
    { key: 'description',  label: 'Description / Narration', required: false, type: 'string', example: 'Opening balance' },
  ],
}

// ─── Template Download ─────────────────────────────────────────────────────

interface TemplateCol { header: string; ex1: string; ex2: string; ex3: string; note: string }

function getTemplateCols(entity: ImportEntity, locations: StockLocation[]): TemplateCol[] {
  if (entity === 'products') {
    const locCols: TemplateCol[] = locations.map(loc => ({
      header: `Qty - ${loc.name} (${loc.code})`,
      ex1: '10', ex2: '5', ex3: '0',
      note: `Stock qty at ${loc.name}. Leave blank for 0.`,
    }))
    return [
      { header: 'Product Name *',      ex1: 'Spectra S1 Breast Pump',   ex2: 'PeaceTouch Belly Binder', ex3: 'U-Shape Pregnancy Pillow', note: 'Required. Full product name as it appears in store.' },
      { header: 'SKU',                  ex1: 'BPM-001',                  ex2: 'BB-PCT-001',              ex3: 'PIL-USH-001',             note: 'Optional. Auto-generated if blank. Must be unique.' },
      { header: 'Barcode / EAN',        ex1: '6938120113456',            ex2: '',                        ex3: '6901295859765',           note: 'Optional. Barcode number for scanning.' },
      { header: 'Brand',                ex1: 'Spectra',                  ex2: 'SOKORA',                  ex3: 'Generic',                 note: 'Optional. Product brand name.' },
      { header: 'Category',             ex1: 'Feeding',                  ex2: 'Postpartum',              ex3: 'Maternity',               note: 'Use: Feeding, Maternity, Postpartum, Newborn, General.' },
      { header: 'Unit',                 ex1: 'Piece',                    ex2: 'Set',                     ex3: 'Piece',                   note: 'Use: Piece, Box, Set, Pair, Pack, Bottle.' },
      { header: 'Cost Price (TZS)',     ex1: '180000',                   ex2: '45000',                   ex3: '55000',                   note: 'Purchase cost in TZS. Numbers only, no commas or symbols.' },
      { header: 'Selling Price (TZS)',  ex1: '250000',                   ex2: '65000',                   ex3: '85000',                   note: 'Customer selling price in TZS.' },
      { header: 'Reorder Point',        ex1: '5',                        ex2: '3',                       ex3: '2',                       note: 'Qty that triggers low-stock alert in Inventory.' },
      { header: 'Total Qty',            ex1: '20',                       ex2: '15',                      ex3: '8',                       note: 'Overall stock total. Use per-location columns below for split.' },
      ...locCols,
    ]
  }
  if (entity === 'customers') {
    return [
      { header: 'Full Name / Company *', ex1: 'Amina Mohamed',          ex2: 'Tanzania Medical Stores', ex3: 'Rehema Juma',             note: 'Required. For debtors, use company name.' },
      { header: 'Customer Type *',       ex1: 'cash',                   ex2: 'debtor',                  ex3: 'cash',                    note: 'Required. Use: cash (walk-in) or debtor (credit account).' },
      { header: 'Contact Person',        ex1: '',                       ex2: 'Dr. James Mwamba',        ex3: '',                        note: 'For companies — the person to contact.' },
      { header: 'WhatsApp Number',       ex1: '+255712345678',          ex2: '+255222345678',           ex3: '+255756789012',           note: 'Include country code. Used for Konnect messages.' },
      { header: 'Email',                 ex1: '',                       ex2: 'procurement@tms.co.tz',   ex3: '',                        note: 'Optional.' },
      { header: 'Segment',              ex1: 'B2C',                    ex2: 'B2B',                     ex3: 'B2C',                     note: 'B2C for individuals, B2B for businesses.' },
      { header: 'Pregnancy Stage',       ex1: 'pregnant',               ex2: '',                        ex3: 'postpartum',              note: 'Use: pregnant, postpartum, ttc, newborn.' },
      { header: 'Address',              ex1: 'Dar es Salaam',           ex2: 'Arusha',                  ex3: 'Mwanza',                  note: 'Optional.' },
      { header: 'Credit Limit (TZS)',   ex1: '',                       ex2: '2000000',                 ex3: '',                        note: 'For debtors only. Max credit allowed.' },
      { header: 'Credit Period (days)', ex1: '',                       ex2: '30',                      ex3: '',                        note: 'For debtors only. Days until payment due.' },
      { header: 'Opening Balance (TZS)',ex1: '0',                      ex2: '500000',                  ex3: '0',                       note: 'Amount they already owe you. Positive = they owe you.' },
    ]
  }
  if (entity === 'accounts') {
    return [
      { header: 'Account Code *',   ex1: '1001',             ex2: '2001',               ex3: '4001',            note: 'Required. Unique numeric code.' },
      { header: 'Account Name *',   ex1: 'Cash in Hand',     ex2: 'Trade Creditors',    ex3: 'Product Sales',   note: 'Required. Clear descriptive name.' },
      { header: 'Account Type *',   ex1: 'Asset',            ex2: 'Liability',          ex3: 'Revenue',         note: 'Required. Use: Asset, Liability, Equity, Revenue, Expense.' },
      { header: 'Category / Group', ex1: 'Current Assets',   ex2: 'Current Liabilities',ex3: 'Operating Revenue',note: 'Optional. Sub-group.' },
      { header: 'Opening Balance',  ex1: '500000',           ex2: '0',                  ex3: '0',               note: 'TZS. Debit positive, Credit negative.' },
    ]
  }
  return [
    { header: 'Account Code *', ex1: '1001',           ex2: '1100',          ex3: '2001',          note: 'Required. Must match an existing account code.' },
    { header: 'Account Name',   ex1: 'Cash in Hand',   ex2: 'Trade Debtors', ex3: 'Trade Creditors',note: 'Optional. For reference.' },
    { header: 'Debit',          ex1: '500000',         ex2: '1200000',       ex3: '0',             note: 'Enter debit amount. Leave blank if credit entry.' },
    { header: 'Credit',         ex1: '0',              ex2: '0',             ex3: '800000',        note: 'Enter credit amount. Leave blank if debit entry.' },
    { header: 'As-at Date',     ex1: '2025-01-01',     ex2: '2025-01-01',    ex3: '2025-01-01',    note: 'Format: YYYY-MM-DD.' },
    { header: 'Description',    ex1: 'Opening balance',ex2: 'Opening AR',    ex3: 'Opening AP',    note: 'Brief narration for the journal entry.' },
  ]
}

function downloadTemplate(entity: ImportEntity, locations: StockLocation[]) {
  const cols = getTemplateCols(entity, locations)
  const labels = { products: 'Inventory', customers: 'Customers', accounts: 'Chart_of_Accounts', opening_balances: 'Opening_Balances' }
  const esc = (v: string) => (v.includes(',') || v.includes('"') || v.includes('\n')) ? `"${v.replace(/"/g, '""')}"` : v

  const rows = [
    `"SOKORA Import Template — ${labels[entity]}"`,
    `"INSTRUCTIONS: Row 4 is the header row. Enter your data from row 5 onwards. Delete rows 1-3 and 5-7 (instructions and sample rows) before uploading. Columns marked * are required."`,
    cols.map(c => esc(`[${c.note}]`)).join(','),
    cols.map(c => esc(c.header)).join(','),
    cols.map(c => esc(c.ex1)).join(','),
    cols.map(c => esc(c.ex2)).join(','),
    cols.map(c => esc(c.ex3)).join(','),
  ]

  const blob = new Blob(['\uFEFF' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `SOKORA_${labels[entity]}_Template.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Auto-mapping ──────────────────────────────────────────────────────────

const AUTO_MAP_HINTS: Record<string, string> = {
  // Customer fields
  'party name': 'name', 'ledger name': 'name', 'customer name': 'name', 'name': 'name',
  'company': 'name', 'organisation': 'name', 'organization': 'name', 'full name': 'name',
  'full name / company *': 'name', 'full name / company': 'name',
  'mobile': 'whatsapp', 'phone': 'whatsapp', 'whatsapp': 'whatsapp', 'contact': 'whatsapp',
  'mobile no': 'whatsapp', 'phone number': 'whatsapp', 'cell': 'whatsapp', 'whatsapp number': 'whatsapp',
  'email': 'email', 'e-mail': 'email', 'email address': 'email',
  'contact person': 'contact_person', 'attention': 'contact_person', 'attn': 'contact_person',
  'credit limit': 'credit_limit', 'credit limit (tzs)': 'credit_limit',
  'credit days': 'credit_period', 'payment terms': 'credit_period', 'credit period (days)': 'credit_period',
  'balance': 'balance', 'outstanding': 'balance', 'opening balance (tzs)': 'balance',
  'address': 'address', 'city': 'address', 'town': 'address',
  'customer type': 'customer_type', 'customer type *': 'customer_type',
  'segment': 'segment', 'customer segment': 'segment',
  'pregnancy stage': 'pregnancy_stage',
  // Product fields
  'item name': 'name', 'stock item': 'name', 'product name': 'name', 'product name *': 'name',
  'name of item': 'name', 'item description': 'name',
  'item code': 'sku', 'sku': 'sku', 'code': 'sku', 'part no': 'sku', 'part number': 'sku',
  'alias': 'sku', 'short name': 'sku', 'product code': 'sku',
  'barcode': 'barcode', 'barcode / ean': 'barcode', 'ean': 'barcode', 'upc': 'barcode',
  'brand': 'brand', 'manufacturer': 'brand', 'make': 'brand',
  'unit': 'unit', 'uom': 'unit', 'unit of measure': 'unit', 'base unit': 'unit', 'baseunits': 'unit',
  'purchase rate': 'cost_price', 'cost': 'cost_price', 'cost price': 'cost_price',
  'buying price': 'cost_price', 'purchase price': 'cost_price', 'last purchase cost': 'cost_price',
  'cost price (tzs)': 'cost_price', 'standard cost': 'cost_price',
  'sales rate': 'selling_price', 'selling price': 'selling_price', 'price': 'selling_price',
  'rate': 'selling_price', 'mrp': 'selling_price', 'list price': 'selling_price',
  'selling price (tzs)': 'selling_price', 'retail price': 'selling_price',
  'quantity': 'qty_on_hand', 'qty': 'qty_on_hand', 'stock': 'qty_on_hand',
  'closing stock': 'qty_on_hand', 'opening qty': 'qty_on_hand', 'opening quantity': 'qty_on_hand',
  'opening stock': 'qty_on_hand', 'stock in hand': 'qty_on_hand', 'current stock': 'qty_on_hand',
  'balance qty': 'qty_on_hand', 'total qty': 'qty_on_hand', 'total qty in stock': 'qty_on_hand',
  'reorder': 'reorder_point', 'reorder point': 'reorder_point', 'min qty': 'reorder_point',
  'reorder point (qty)': 'reorder_point',
  'group': 'category', 'category': 'category', 'item group': 'category', 'parent': 'category',
  'stock group': 'category', 'product group': 'category', 'classification': 'category',
  // Account fields
  'account code': 'code', 'ledger code': 'code', 'gl code': 'code', 'account no': 'code',
  'account name': 'name', 'ledger': 'name',
  'account type': 'type', 'nature': 'type',
  'account group': 'category', 'closing balance': 'balance',
  // Opening balance fields
  'debit': 'debit', 'dr': 'debit', 'debit amount': 'debit',
  'credit': 'credit', 'cr': 'credit', 'credit amount': 'credit',
  'narration': 'description', 'remarks': 'description',
  'date': 'date', 'as at': 'date', 'as-at date': 'date',
  'account code *': 'account_code', 'account name *': 'account_name',
}

function autoMap(columns: string[], entity: ImportEntity, locations: StockLocation[]): Record<string, string> {
  const fields = entity === 'products'
    ? getProductFields(locations).map(f => f.key)
    : ENTITY_FIELDS_STATIC[entity].map(f => f.key)

  const result: Record<string, string> = {}

  // Generate multiple normalized variants of a column name to try
  const variants = (col: string): string[] => {
    const base = col.toLowerCase().trim()
    const stripped = base
      .replace(/\*/g, '')          // remove asterisks
      .replace(/\(tzs\)/g, '')     // remove (TZS)
      .replace(/\(%\)/g, '')       // remove (%)
      .replace(/\(days\)/g, '')    // remove (days)
      .replace(/\(qty\)/g, '')     // remove (qty)
      .replace(/\s+/g, ' ')        // collapse spaces
      .trim()
    const noParens = base.replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim()
    return [...new Set([base, stripped, noParens])]
  }

  columns.forEach(col => {
    // Try each variant against hints
    for (const v of variants(col)) {
      const mapped = AUTO_MAP_HINTS[v]
      if (mapped && fields.includes(mapped) && !Object.values(result).includes(mapped)) {
        result[col] = mapped; return
      }
    }
    // Dynamic location qty matching
    const norm = col.toLowerCase().trim()
    const locMatch = norm.match(/qty\s*[-—]\s*(.+?)\s*\((\w+)\)/)
    if (locMatch) {
      const locCode = locMatch[2].toUpperCase()
      const locKey = `loc_${locCode}`
      if (fields.includes(locKey) && !Object.values(result).includes(locKey)) {
        result[col] = locKey; return
      }
    }
    const locByName = locations.find(l => norm.includes(l.name.toLowerCase()))
    if (locByName && norm.includes('qty')) {
      const key = `loc_${locByName.code}`
      if (fields.includes(key) && !Object.values(result).includes(key)) result[col] = key
    }
  })
  return result
}

// ─── Parsers ───────────────────────────────────────────────────────────────

function parseCSV(text: string): ParsedRow[] {
  const allLines = text.trim().split(/\r?\n/)
  // Skip instruction/comment rows (start with quotes containing [ or SOKORA)
  const lines = allLines.filter(l => {
    const t = l.trim()
    return t && !t.startsWith('"SOKORA') && !t.startsWith('"INSTRUCTIONS') && !t.match(/^"?\[/)
  })
  if (lines.length < 2) return []

  const parseRow = (line: string): string[] => {
    const vals: string[] = []
    let inQuote = false, cur = ''
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === '"') {
        if (inQuote && line[i+1] === '"') { cur += '"'; i++ }
        else inQuote = !inQuote
      } else if (c === ',' && !inQuote) {
        vals.push(cur.trim()); cur = ''
      } else { cur += c }
    }
    vals.push(cur.trim())
    return vals
  }

  const headers = parseRow(lines[0]).map(h => h.replace(/\*/g, '').trim())
  return lines.slice(1).map(line => {
    const vals = parseRow(line)
    const row: ParsedRow = {}
    headers.forEach((h, i) => { row[h] = (vals[i] || '').trim() })
    return row
  }).filter(r => Object.values(r).some(v => v))
}

function parseTallyXML(xmlText: string): { entity: string; rows: ParsedRow[] } {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlText, 'text/xml')
  const stockItems = doc.querySelectorAll('STOCKITEM')
  const ledgers    = doc.querySelectorAll('LEDGER')

  if (stockItems.length > 0) {
    const rows = Array.from(stockItems).map(item => ({
      'Item Name':     item.getAttribute('NAME') || item.querySelector('NAME')?.textContent || '',
      'Group':         item.querySelector('PARENT')?.textContent || '',
      'Unit':          item.querySelector('BASEUNITS')?.textContent || '',
      'Cost Price':    item.querySelector('COSTPRICE')?.textContent || item.querySelector('LASTPURCHASECOST')?.textContent || '',
      'Selling Price': item.querySelector('SELLINGPRICE')?.textContent || '',
      'Opening Qty':   item.querySelector('OPENINGBALANCE')?.textContent?.replace(/[^\d.-]/g, '') || '0',
    }))
    return { entity: 'products', rows }
  }

  if (ledgers.length > 0) {
    const rows = Array.from(ledgers).map(l => ({
      'Ledger Name':    l.getAttribute('NAME') || l.querySelector('NAME')?.textContent || '',
      'Group':          l.querySelector('PARENT')?.textContent || '',
      'Opening Balance':l.querySelector('OPENINGBALANCE')?.textContent?.replace(/[^\d.-]/g, '') || '0',
      'Phone':          l.querySelector('MOBILE')?.textContent || l.querySelector('PHONE')?.textContent || '',
      'Email':          l.querySelector('EMAIL')?.textContent || '',
      'Address':        l.querySelector('ADDRESS')?.textContent || '',
      'Credit Limit':   l.querySelector('CREDITLIMIT')?.textContent?.replace(/[^\d.-]/g, '') || '',
      'Credit Days':    l.querySelector('CREDITPERIOD')?.textContent?.replace(/\D/g, '') || '',
    }))
    return { entity: 'customers', rows }
  }

  return { entity: 'customers', rows: [] }
}

// ─── Validators ────────────────────────────────────────────────────────────

function validateRow(row: MappedRow, fields: FieldDef[], idx: number): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  fields.filter(f => f.required).forEach(f => {
    if (!row[f.key] || !row[f.key].trim()) errors.push(`Row ${idx + 1}: "${f.label}" is required`)
  })
  fields.filter(f => f.type === 'number').forEach(f => {
    if (row[f.key] && isNaN(parseFloat(row[f.key].replace(/,/g, '')))) {
      errors.push(`Row ${idx + 1}: "${f.label}" must be a number`)
    }
  })
  return { valid: errors.length === 0, errors }
}

function coerceRow(row: MappedRow, entity: ImportEntity, locations: StockLocation[]): Record<string, string | number | boolean> {
  const fields = entity === 'products' ? getProductFields(locations) : ENTITY_FIELDS_STATIC[entity]
  const out: Record<string, string | number | boolean> = {}
  fields.forEach(f => {
    const val = (row[f.key] || '').trim().replace(/,/g, '')
    if (!val) return
    if (f.type === 'number')  { out[f.key] = parseFloat(val) || 0 }
    else if (f.type === 'boolean') { out[f.key] = ['yes','true','1','y'].includes(val.toLowerCase()) }
    else if (f.key === 'customer_type') {
      const m: Record<string,string> = { b2c:'cash', b2b:'debtor', customer:'cash', party:'debtor' }
      out[f.key] = m[val.toLowerCase()] || val.toLowerCase()
    } else if (f.key === 'sku') { out[f.key] = val.toUpperCase() }
    else { out[f.key] = val }
  })
  return out
}

// ─── Writers ───────────────────────────────────────────────────────────────

async function writeCustomers(rows: MappedRow[]): Promise<{ ok: number; failed: number; errors: string[] }> {
  let ok = 0; let failed = 0; const errors: string[] = []
  for (const row of rows) {
    const payload: Record<string, unknown> = {
      ...coerceRow(row, 'customers', []),
      is_active: true,
      segment: row['segment'] || (row['customer_type'] === 'debtor' ? 'B2B' : 'B2C'),
    }
    const prefix = payload['customer_type'] === 'debtor' ? 'DEB' : 'CSH'
    const { data: last } = await supabase.from('customers').select('customer_number').ilike('customer_number', `${prefix}%`).order('customer_number', { ascending: false }).limit(1)
    const lastNum = parseInt(last?.[0]?.customer_number?.replace(prefix, '') || '0')
    payload['customer_number'] = `${prefix}${String(lastNum + 1).padStart(4, '0')}`
    const { error } = await supabase.from('customers').insert(payload)
    if (error) { failed++; errors.push(error.message) } else ok++
  }
  return { ok, failed, errors }
}

async function writeProducts(rows: MappedRow[], locations: StockLocation[]): Promise<{ ok: number; failed: number; errors: string[] }> {
  let ok = 0; let failed = 0; const errors: string[] = []
  // One shared import ref per batch so the audit trail groups entries together
  const importRef = `IMPORT-${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '').slice(0, 12)}`
  const importDate = new Date().toISOString().slice(0, 10)

  for (const row of rows) {
    const coerced = coerceRow(row, 'products', locations)

    // Auto-generate SKU from name
    let sku = (coerced['sku'] as string) || ''
    if (!sku && coerced['name']) {
      const base = (coerced['name'] as string)
        .toUpperCase().replace(/[^A-Z0-9\s]/g, '').trim()
        .split(/\s+/).map((w: string) => w.slice(0, 3)).join('-').slice(0, 15)
      sku = `${base}-${Math.floor(Math.random() * 900 + 100)}`
    }
    if (!sku) { failed++; errors.push('Skipped: no product name'); continue }

    // Collect per-location qty
    let locTotal = 0
    const locEntries: { loc: StockLocation; qty: number }[] = []
    for (const loc of locations) {
      const qty = parseFloat((row[`loc_${loc.code}`] || '0').replace(/,/g, '')) || 0
      if (qty > 0) { locEntries.push({ loc, qty }); locTotal += qty }
    }
    const totalQty = locTotal > 0 ? locTotal : ((coerced['qty_on_hand'] as number) || 0)
    const costPrice = (coerced['cost_price'] as number) ?? 0

    const payload: Record<string, unknown> = {
      is_active: true, sku,
      name:          coerced['name'] || '',
      category:      coerced['category'] || 'General',
      unit:          coerced['unit'] || 'Piece',
      cost_price:    costPrice,
      selling_price: coerced['selling_price'] ?? 0,
      reorder_point: coerced['reorder_point'] ?? 5,
      qty_on_hand:   totalQty,
    }
    if (coerced['barcode']) payload['barcode'] = coerced['barcode']
    if (coerced['brand'])   payload['brand']   = coerced['brand']

    // Check if product existed before (to detect newly-created vs updated)
    const { data: existing } = await supabase
      .from('products').select('id, qty_on_hand').eq('sku', sku).maybeSingle()
    const isNewProduct = !existing

    const { data: prod, error: pe } = await supabase
      .from('products').upsert(payload, { onConflict: 'sku' }).select('id').single()

    if (pe) { failed++; errors.push(`${sku}: ${pe.message}`); continue }

    // Write per-location stock AND item ledger entries for audit trail
    if (prod) {
      // Only write opening-stock ledger entries for brand-new products with qty.
      // Existing products' ledger history should not be touched by re-imports.
      const writeLedger = isNewProduct && totalQty > 0

      if (locEntries.length > 0) {
        for (const { loc, qty } of locEntries) {
          await supabase.from('product_locations').upsert({
            product_id: prod.id, location_id: loc.id, location_code: loc.code, qty_on_hand: qty,
          }, { onConflict: 'product_id,location_id' })

          if (writeLedger) {
            await postLedgerEntry({
              product_id: prod.id,
              entry_type: 'opening_stock',
              document_type: 'data_import',
              document_ref: importRef,
              posting_date: importDate,
              qty,
              cost_amount: qty * costPrice,
              location: { id: loc.id, code: loc.code },
            })
          }
        }
      } else if (totalQty > 0 && locations.length > 0) {
        const defLoc = locations.find(l => l.code.includes('FO') || l.code.endsWith('01')) || locations[0]
        await supabase.from('product_locations').upsert({
          product_id: prod.id, location_id: defLoc.id, location_code: defLoc.code, qty_on_hand: totalQty,
        }, { onConflict: 'product_id,location_id' })

        if (writeLedger) {
          await postLedgerEntry({
            product_id: prod.id,
            entry_type: 'opening_stock',
            document_type: 'data_import',
            document_ref: importRef,
            posting_date: importDate,
            qty: totalQty,
            cost_amount: totalQty * costPrice,
            location: { id: defLoc.id, code: defLoc.code },
          })
        }
      }
    }
    ok++
  }
  return { ok, failed, errors }
}

async function writeAccounts(rows: MappedRow[]): Promise<{ ok: number; failed: number; errors: string[] }> {
  let ok = 0; let failed = 0; const errors: string[] = []
  const typeMap: Record<string, string> = {
    'sundry debtors':'Asset','sundry creditors':'Liability','bank accounts':'Asset',
    'cash-in-hand':'Asset','cash in hand':'Asset','capital account':'Equity',
    'sales accounts':'Revenue','purchase accounts':'Expense',
    'direct expenses':'Expense','indirect expenses':'Expense',
    'direct income':'Revenue','indirect income':'Revenue',
    'current assets':'Asset','current liabilities':'Liability','fixed assets':'Asset',
  }
  for (const row of rows) {
    const payload = coerceRow(row, 'accounts', [])
    if (payload['type']) payload['type'] = typeMap[(payload['type'] as string).toLowerCase()] || payload['type']
    const { error } = await supabase.from('accounts').upsert(payload, { onConflict: 'code' })
    if (error) { failed++; errors.push(error.message) } else ok++
  }
  return { ok, failed, errors }
}

async function writeOpeningBalances(rows: MappedRow[]): Promise<{ ok: number; failed: number; errors: string[] }> {
  let ok = 0; let failed = 0; const errors: string[] = []
  for (const row of rows) {
    const debit  = parseFloat((row['debit']  || '0').replace(/,/g, '')) || 0
    const credit = parseFloat((row['credit'] || '0').replace(/,/g, '')) || 0
    const amount = debit - credit
    let acctId: string | null = null
    if (row['account_code']) {
      const { data } = await supabase.from('accounts').select('id').eq('code', row['account_code'].trim()).maybeSingle()
      acctId = data?.id || null
    }
    if (!acctId && row['account_name']) {
      const { data } = await supabase.from('accounts').select('id').ilike('name', row['account_name'].trim()).maybeSingle()
      acctId = data?.id || null
    }
    if (!acctId) { failed++; errors.push(`Account not found: ${row['account_code'] || row['account_name']}`); continue }
    const { error } = await supabase.from('ledger_entries').insert({
      account_id: acctId, amount, description: row['description'] || 'Opening balance import',
      entry_date: row['date'] || new Date().toISOString().slice(0,10),
      entry_type: 'opening_balance', source: 'import',
    })
    if (error) { failed++; errors.push(error.message) } else ok++
  }
  return { ok, failed, errors }
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const s = {
  page:     { padding: '32px 28px', maxWidth: 1100, margin: '0 auto' } as React.CSSProperties,
  h1:       { fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 26, margin: '0 0 4px', color: 'var(--fg)' } as React.CSSProperties,
  sub:      { fontSize: 13, color: 'var(--muted)', margin: '0 0 32px' } as React.CSSProperties,
  stepper:  { display: 'flex', gap: 0, marginBottom: 36, borderBottom: '1px solid var(--border)' } as React.CSSProperties,
  stepItem: (active: boolean, done: boolean): React.CSSProperties => ({
    padding: '10px 18px', fontSize: 12, fontWeight: 600,
    borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
    color: active ? 'var(--accent)' : done ? 'var(--muted)' : 'var(--muted-light,#bbb)',
  }),
  grid2:    { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 } as React.CSSProperties,
  card:     (sel: boolean): React.CSSProperties => ({
    border: `1.5px solid ${sel ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 10,
    padding: '16px 18px', cursor: 'pointer', background: sel ? 'var(--accent-dim)' : 'var(--card)',
    transition: 'border-color .15s, background .15s',
  }),
  badge:    { fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: 'var(--accent)', color: '#fff', marginLeft: 8 } as React.CSSProperties,
  label:    { fontSize: 13, fontWeight: 600, color: 'var(--fg)', margin: '0 0 4px', display: 'flex', alignItems: 'center' } as React.CSSProperties,
  desc:     { fontSize: 12, color: 'var(--muted)', margin: '4px 0 0', lineHeight: 1.5 } as React.CSSProperties,
  btn:      { padding: '10px 22px', borderRadius: 8, border: '1.5px solid var(--accent)', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' } as React.CSSProperties,
  btnGhost: { padding: '10px 22px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--fg)', fontSize: 13, fontWeight: 600, cursor: 'pointer' } as React.CSSProperties,
  btnTeal:  { padding: '8px 16px', borderRadius: 8, border: '1.5px solid var(--accent)', background: 'transparent', color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 } as React.CSSProperties,
  dropzone: (drag: boolean): React.CSSProperties => ({
    border: `2px dashed ${drag ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 12,
    padding: '40px 24px', textAlign: 'center', cursor: 'pointer',
    background: drag ? 'var(--accent-dim)' : 'var(--card)', transition: 'all .15s',
  }),
  table:    { width: '100%', borderCollapse: 'collapse' as const, fontSize: 12 },
  th:       { padding: '8px 10px', textAlign: 'left' as const, fontWeight: 600, fontSize: 11, color: 'var(--muted)', borderBottom: '1px solid var(--border)', background: 'var(--card)' },
  td:       { padding: '7px 10px', borderBottom: '1px solid var(--border)', color: 'var(--fg)', verticalAlign: 'top' as const },
  select:   { width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--fg)', fontSize: 12 } as React.CSSProperties,
  textarea: { width: '100%', minHeight: 200, padding: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--fg)', fontFamily: 'var(--mono)', fontSize: 12, resize: 'vertical' as const, boxSizing: 'border-box' as const } as React.CSSProperties,
  tplBox:   { background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: 10, padding: '16px 18px', marginBottom: 20 } as React.CSSProperties,
}

const DownloadIcon = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
)

const STEPS: { id: Step; label: string }[] = [
  { id: 'source',  label: '1. Source'    },
  { id: 'entity',  label: '2. Data Type' },
  { id: 'upload',  label: '3. Upload'    },
  { id: 'map',     label: '4. Map Fields'},
  { id: 'preview', label: '5. Preview'   },
  { id: 'done',    label: '6. Done'      },
]

const SOURCES: { id: ImportSource; label: string; ext: string; desc: string; badge?: string }[] = [
  { id: 'tally_xml',  label: 'Tally XML',   ext: '.xml',       desc: 'Export from Tally ERP 9 or TallyPrime via Data > Export > XML', badge: 'Auto-detect' },
  { id: 'excel_csv',  label: 'Excel / CSV', ext: '.csv,.xlsx', desc: 'Any spreadsheet. Download the SOKORA template for the exact format.' },
  { id: 'quickbooks', label: 'QuickBooks',  ext: '.csv',       desc: 'Export via Reports > Export to Excel/CSV, then save as CSV.' },
  { id: 'manual_csv', label: 'Paste Data',  ext: '',           desc: 'Paste comma or tab-separated data directly from clipboard.' },
]

const ENTITIES: { id: ImportEntity; label: string; icon: string; desc: string }[] = [
  { id: 'customers',        label: 'Customers',         icon: 'C', desc: 'Cash customers and debtors with contacts and opening balances' },
  { id: 'products',         label: 'Products / Stock',  icon: 'P', desc: 'Inventory with SKU, pricing, brand, and per-location stock' },
  { id: 'accounts',         label: 'Chart of Accounts', icon: 'A', desc: 'GL accounts with codes, types, and opening balances' },
  { id: 'opening_balances', label: 'Opening Balances',  icon: 'O', desc: 'Journal entries to set account balances at migration date' },
]

// ─── Main Component ─────────────────────────────────────────────────────────

export default function DataImport() {
  const [step, setStep]           = useState<Step>('source')
  const [source, setSource]       = useState<ImportSource | null>(null)
  const [entity, setEntity]       = useState<ImportEntity | null>(null)
  const [rawRows, setRawRows]     = useState<ParsedRow[]>([])
  const [columns, setColumns]     = useState<string[]>([])
  const [mapping, setMapping]     = useState<Record<string, string>>({})
  const [pasteText, setPasteText] = useState('')
  const [dragOver, setDragOver]   = useState(false)
  const [fileName, setFileName]   = useState('')
  const [validRows, setValidRows] = useState<MappedRow[]>([])
  const [validErrs, setValidErrs] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const [result, setResult]       = useState<{ ok: number; failed: number; errors: string[] } | null>(null)
  const [toast, setToast]         = useState<Toast_>(null)
  const [locations, setLocations] = useState<StockLocation[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.from('stock_locations').select('id, code, name, branch_code')
      .eq('is_active', true).order('code')
      .then(({ data }) => { if (data) setLocations(data) })
  }, [])

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3500)
  }

  const stepIdx = (id: Step) => STEPS.findIndex(st => st.id === id)

  const activeFields = entity === 'products'
    ? getProductFields(locations)
    : entity ? ENTITY_FIELDS_STATIC[entity] : []

  const ingestRows = useCallback((rows: ParsedRow[], ent: ImportEntity) => {
    if (!rows.length) { showToast('No data rows found', 'error'); return }
    const cols = Object.keys(rows[0])
    setRawRows(rows); setColumns(cols)
    setMapping(autoMap(cols, ent, locations))
    setStep('map')
  }, [locations])

  const processFile = useCallback((file: File, ent: ImportEntity, src: ImportSource) => {
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = e => {
      const text = e.target?.result as string
      if (src === 'tally_xml' || file.name.endsWith('.xml')) {
        const { rows } = parseTallyXML(text); ingestRows(rows, ent)
      } else {
        ingestRows(parseCSV(text), ent)
      }
    }
    reader.readAsText(file)
  }, [ingestRows])

  const buildMappedRows = (): MappedRow[] =>
    rawRows.map(raw => {
      const out: MappedRow = {}
      Object.entries(mapping).forEach(([col, mkey]) => { if (mkey && raw[col] !== undefined) out[mkey] = raw[col] })
      return out
    })

  const goToPreview = () => {
    const mapped = buildMappedRows()
    const allErrs: string[] = []
    const valid: MappedRow[] = []
    mapped.forEach((row, i) => {
      const v = validateRow(row, activeFields, i)
      valid.push(row)
      if (!v.valid) allErrs.push(...v.errors)
    })
    setValidRows(valid); setValidErrs(allErrs); setStep('preview')
  }

  const runImport = async () => {
    if (!entity) return
    setImporting(true)
    try {
      let res: { ok: number; failed: number; errors: string[] }
      if (entity === 'customers')     res = await writeCustomers(validRows)
      else if (entity === 'products') res = await writeProducts(validRows, locations)
      else if (entity === 'accounts') res = await writeAccounts(validRows)
      else                            res = await writeOpeningBalances(validRows)
      setResult(res); setStep('done')
      if (res.ok > 0) showToast(`${res.ok} records imported`, 'success')
    } catch (err: unknown) {
      showToast((err as Error).message, 'error')
    } finally { setImporting(false) }
  }

  const reset = () => {
    setStep('source'); setSource(null); setEntity(null); setRawRows([])
    setColumns([]); setMapping({}); setPasteText(''); setFileName('')
    setValidRows([]); setValidErrs([]); setResult(null)
  }

  // ── Steps ─────────────────────────────────────────────────────────────────

  const StepSource = () => (
    <div>
      <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 20 }}>Select where your data is coming from.</p>
      <div style={s.grid2}>
        {SOURCES.map(src => (
          <div key={src.id} style={s.card(source === src.id)} onClick={() => setSource(src.id)}>
            <div style={s.label}>{src.label}{src.badge && <span style={s.badge}>{src.badge}</span>}</div>
            {src.ext && <div style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--mono)', marginTop: 2 }}>{src.ext}</div>}
            <div style={s.desc}>{src.desc}</div>
          </div>
        ))}
      </div>
      {source === 'tally_xml' && (
        <div style={{ marginTop: 20, padding: '14px 16px', background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: 8, fontSize: 12, lineHeight: 1.7 }}>
          <strong>How to export from Tally:</strong><br />
          1. Go to <strong>Gateway of Tally &gt; Display &gt; List of Accounts</strong> (ledgers) or <strong>Stock Summary</strong> (items)<br />
          2. Press <strong>E</strong> for Export, select <strong>XML</strong> format, save and upload here.
        </div>
      )}
      <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
        <button style={s.btn} disabled={!source} onClick={() => setStep('entity')}>Continue</button>
      </div>
    </div>
  )

  const StepEntity = () => (
    <div>
      <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 20 }}>What kind of data are you importing?</p>
      <div style={s.grid2}>
        {ENTITIES.map(ent => (
          <div key={ent.id} style={s.card(entity === ent.id)} onClick={() => setEntity(ent.id)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, fontFamily: 'Syne, sans-serif' }}>{ent.icon}</div>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{ent.label}</span>
            </div>
            <div style={s.desc}>{ent.desc}</div>
          </div>
        ))}
      </div>

      {entity && (
        <div style={s.tplBox}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Download the import template first</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
                Pre-formatted CSV with all columns, notes, and 3 sample rows.
                Fill in your data, delete the sample rows, and upload.
                {entity === 'products' && locations.length > 0 && (
                  <> Template includes per-location columns for: <strong>{locations.map(l => `${l.name} (${l.code})`).join(', ')}</strong>.</>
                )}
              </div>
            </div>
            <button style={s.btnTeal} onClick={() => downloadTemplate(entity, locations)}>
              <DownloadIcon /> Download Template
            </button>
          </div>

          {entity === 'products' && (
            <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px,1fr))', gap: 8 }}>
              {[
                { label: 'Product Name', note: 'Required' },
                { label: 'SKU', note: 'Auto-gen if blank' },
                { label: 'Barcode / EAN', note: 'Optional' },
                { label: 'Brand', note: 'Optional' },
                { label: 'Category', note: 'Optional' },
                { label: 'Unit', note: 'Piece / Box / Set' },
                { label: 'Cost Price', note: 'In TZS' },
                { label: 'Selling Price', note: 'In TZS' },
                { label: 'Reorder Point', note: 'Low-stock alert' },
                ...locations.map(l => ({ label: `Qty: ${l.name}`, note: l.code })),
              ].map((col, i) => (
                <div key={i} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px' }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{col.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{col.note}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between' }}>
        <button style={s.btnGhost} onClick={() => setStep('source')}>Back</button>
        <button style={s.btn} disabled={!entity} onClick={() => setStep('upload')}>Continue</button>
      </div>
    </div>
  )

  const StepUpload = () => {
    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault(); setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) processFile(file, entity!, source!)
    }
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>Don't have the file yet?</span>
          <button style={s.btnTeal} onClick={() => downloadTemplate(entity!, locations)}>
            <DownloadIcon /> Download Template First
          </button>
        </div>
        {source === 'manual_csv' ? (
          <div>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10 }}>Paste comma or tab-separated data. First row must be column headers.</p>
            <textarea style={s.textarea} placeholder="Product Name,SKU,Category,Cost Price,Selling Price&#10;Spectra S1 Breast Pump,BPM-001,Feeding,180000,250000" value={pasteText} onChange={e => setPasteText(e.target.value)} />
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between' }}>
              <button style={s.btnGhost} onClick={() => setStep('entity')}>Back</button>
              <button style={s.btn} onClick={() => {
                const rows = parseCSV(pasteText)
                if (!rows.length) {
                  const lines = pasteText.trim().split('\n')
                  const hs = lines[0].split('\t').map(h => h.trim())
                  const parsed = lines.slice(1).map(line => {
                    const vals = line.split('\t')
                    const row: ParsedRow = {}
                    hs.forEach((h, i) => { row[h] = (vals[i] || '').trim() })
                    return row
                  }).filter(r => Object.values(r).some(v => v))
                  ingestRows(parsed, entity!)
                } else { ingestRows(rows, entity!) }
              }}>Parse Data</button>
            </div>
          </div>
        ) : (
          <div>
            <div
              style={s.dropzone(dragOver)}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
            >
              <div style={{ fontSize: 32, marginBottom: 12 }}>&#8593;</div>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{fileName || 'Drop file here or click to browse'}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                {source === 'tally_xml' ? 'Accepts .xml files from Tally' : 'Accepts .csv files — save Excel as CSV first'}
              </div>
              <input ref={fileRef} type="file" accept={SOURCES.find(s => s.id === source)?.ext || '.csv'} style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f, entity!, source!) }} />
            </div>
            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between' }}>
              <button style={s.btnGhost} onClick={() => setStep('entity')}>Back</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  const StepMap = () => {
    const unmappedReq = activeFields.filter(f => f.required && !Object.values(mapping).includes(f.key))
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <p style={{ margin: '0 0 4px', fontSize: 14 }}><strong>{rawRows.length} rows</strong> from <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{fileName || 'pasted data'}</span></p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>Auto-mapped common column names. Review and fix any mismatches.</p>
          </div>
          {unmappedReq.length > 0 && (
            <div style={{ fontSize: 12, color: '#991b1b', background: '#fee2e2', padding: '6px 12px', borderRadius: 6 }}>
              {unmappedReq.length} required field{unmappedReq.length > 1 ? 's' : ''} not yet mapped
            </div>
          )}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={s.table}>
            <thead><tr>
              <th style={s.th}>Your Column</th>
              <th style={s.th}></th>
              <th style={s.th}>SOKORA Field</th>
              <th style={s.th}>Sample Value</th>
            </tr></thead>
            <tbody>
              {columns.map(col => (
                <tr key={col}>
                  <td style={s.td}><span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{col}</span></td>
                  <td style={{ ...s.td, textAlign: 'center', color: 'var(--muted)' }}>&#8594;</td>
                  <td style={s.td}>
                    <select style={s.select} value={mapping[col] || ''} onChange={e => setMapping(m => ({ ...m, [col]: e.target.value }))}>
                      <option value="">-- skip --</option>
                      {activeFields.map(f => <option key={f.key} value={f.key}>{f.label}{f.required ? ' *' : ''}{f.hint ? ` — ${f.hint}` : ''}</option>)}
                    </select>
                  </td>
                  <td style={{ ...s.td, fontFamily: 'var(--mono)', color: 'var(--muted)', fontSize: 11 }}>{rawRows[0]?.[col] || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>Field status</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {activeFields.map(f => {
              const mapped = Object.values(mapping).includes(f.key)
              return (
                <span key={f.key} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, fontFamily: 'var(--mono)', background: mapped ? '#d1fae5' : f.required ? '#fee2e2' : 'var(--accent-dim)', color: mapped ? '#065f46' : f.required ? '#991b1b' : 'var(--muted)' }}>
                  {f.key}{f.required ? ' *' : ''}
                </span>
              )
            })}
          </div>
        </div>
        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between' }}>
          <button style={s.btnGhost} onClick={() => setStep('upload')}>Back</button>
          <button style={s.btn} disabled={unmappedReq.length > 0} onClick={goToPreview}>Preview Import</button>
        </div>
      </div>
    )
  }

  const StepPreview = () => {
    const mappedFields = activeFields.filter(f => Object.values(mapping).includes(f.key))
    return (
      <div>
        <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
          {[
            { label: 'rows', val: validRows.length, color: 'var(--accent)' },
            { label: 'fields', val: mappedFields.length, color: '#065f46' },
            { label: 'warnings', val: validErrs.length, color: validErrs.length > 0 ? '#991b1b' : '#065f46' },
          ].map(st => (
            <div key={st.label} style={{ flex: 1, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--mono)', color: st.color }}>{st.val}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{st.label}</div>
            </div>
          ))}
        </div>

        {entity === 'products' && locations.length > 0 && (
          <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: 8, fontSize: 12 }}>
            After import: products appear automatically in <strong>Cash Sale</strong>, <strong>Sales Invoice</strong>, and <strong>Inventory</strong>.
            Stock distributed to: {locations.map(l => <span key={l.code}><strong> {l.name}</strong> ({l.code})</span>)}.
          </div>
        )}

        {validErrs.length > 0 && (
          <div style={{ marginBottom: 16, padding: '12px 16px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#92400e', marginBottom: 6 }}>{validErrs.length} warnings — rows still import</div>
            <div style={{ maxHeight: 100, overflowY: 'auto' }}>
              {validErrs.slice(0, 10).map((e, i) => <div key={i} style={{ fontSize: 11, color: '#92400e', marginTop: 2 }}>{e}</div>)}
              {validErrs.length > 10 && <div style={{ fontSize: 11, color: '#92400e', marginTop: 4 }}>...and {validErrs.length - 10} more</div>}
            </div>
          </div>
        )}

        <div style={{ overflowX: 'auto', maxHeight: 320, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
          <table style={s.table}>
            <thead><tr>
              <th style={s.th}>#</th>
              {mappedFields.map(f => <th key={f.key} style={s.th}>{f.label}</th>)}
            </tr></thead>
            <tbody>
              {validRows.slice(0, 50).map((row, i) => (
                <tr key={i}>
                  <td style={{ ...s.td, color: 'var(--muted)', fontFamily: 'var(--mono)', width: 32 }}>{i + 1}</td>
                  {mappedFields.map(f => (
                    <td key={f.key} style={{ ...s.td, fontFamily: f.type === 'number' ? 'var(--mono)' : 'inherit' }}>
                      {row[f.key] || <span style={{ color: 'var(--muted)' }}>—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {validRows.length > 50 && (
            <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--muted)', borderTop: '1px solid var(--border)' }}>
              Showing first 50 of {validRows.length} rows
            </div>
          )}
        </div>

        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button style={s.btnGhost} onClick={() => setStep('map')}>Back to Mapping</button>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              {entity === 'products' ? 'Upsert' : 'Add'} {validRows.length} records
            </span>
            <button style={{ ...s.btn, opacity: importing ? .6 : 1 }} disabled={importing || !validRows.length} onClick={runImport}>
              {importing ? 'Importing...' : `Import ${validRows.length} Records`}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const StepDone = () => (
    <div style={{ textAlign: 'center', padding: '40px 0' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>{result?.failed === 0 ? '✓' : '⚠'}</div>
      <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 22, marginBottom: 8 }}>
        {result?.ok} record{result?.ok !== 1 ? 's' : ''} imported
      </div>
      {result && result.failed > 0 && <div style={{ fontSize: 14, color: '#991b1b', marginBottom: 8 }}>{result.failed} records failed</div>}
      {result?.errors.slice(0, 5).map((e, i) => <div key={i} style={{ fontSize: 12, color: '#991b1b', marginTop: 4 }}>{e}</div>)}
      {entity === 'products' && (result?.ok ?? 0) > 0 && (
        <div style={{ marginTop: 20, padding: '12px 20px', background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: 8, fontSize: 13, display: 'inline-block' }}>
          Products are now live in Cash Sale, Sales Invoice, and Inventory.
        </div>
      )}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 28 }}>
        <button style={s.btnGhost} onClick={reset}>Import More Data</button>
        <button style={s.btn} onClick={() => { window.location.hash = { customers:'customers', products:'inventory', accounts:'chart-of-accounts', opening_balances:'chart-of-accounts' }[entity!] || '' }}>
          View Imported Records
        </button>
      </div>
    </div>
  )

  return (
    <div style={s.page}>
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <h1 style={s.h1}>Data Import Studio</h1>
      <p style={s.sub}>Migrate data from Tally, QuickBooks, Excel, or any spreadsheet into SOKORA.</p>

      {/* ── Template Download Bar — always visible ── */}
      <div style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: 12, padding: '16px 20px', marginBottom: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Step 0 — Download a template first</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Pre-formatted CSV with all columns, notes, and sample rows. Fill it in, then upload below.</div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {ENTITIES.map(ent => (
            <button key={ent.id} style={s.btnTeal} onClick={() => downloadTemplate(ent.id, locations)}>
              <DownloadIcon /> {ent.label}
            </button>
          ))}
        </div>
      </div>
      <div style={s.stepper}>
        {STEPS.map((st, i) => <div key={st.id} style={s.stepItem(step === st.id, i < stepIdx(step))}>{st.label}</div>)}
      </div>
      {step === 'source'  && <StepSource />}
      {step === 'entity'  && <StepEntity />}
      {step === 'upload'  && <StepUpload />}
      {step === 'map'     && <StepMap />}
      {step === 'preview' && <StepPreview />}
      {step === 'done'    && <StepDone />}
      {step !== 'done' && (
        <div style={{ marginTop: 40, padding: '16px 20px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Before you import</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 24px', fontSize: 12, color: 'var(--muted)', lineHeight: 1.7 }}>
            <div>Download the template so your columns match exactly</div>
            <div>Amounts in TZS — numbers only, no commas or symbols</div>
            <div>Products use SKU as unique key — re-import updates existing</div>
            <div>Opening balances require Chart of Accounts to exist first</div>
            <div>Dates in YYYY-MM-DD format</div>
          </div>
        </div>
      )}
    </div>
  )
}
