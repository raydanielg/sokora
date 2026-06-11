// ── SOKORA WHATSAPP SERVICE ───────────────────────────────────────────────
// Infrastructure ready — plug in API credentials via Settings → WhatsApp
// Supports: Wati, Twilio, Infobip, Custom webhook
// All sends logged to whatsapp_sends table in Supabase

import { supabase } from './supabase'

export interface WAConfig {
  provider: 'wati' | 'twilio' | 'infobip' | 'custom' | ''
  api_key: string
  api_url: string
  sender_number: string
  enabled: boolean
  template_receipt: string
  template_invoice: string
}

export const DEFAULT_WA_CONFIG: WAConfig = {
  provider: '',
  api_key: '',
  api_url: '',
  sender_number: '',
  enabled: false,
  template_receipt: `Habari *{{customer_name}}*! 🌸

Asante kwa ununuzi wako na SOKORA.

🧾 *Receipt: {{ref}}*
📅 Tarehe: {{date}}
💳 Malipo: {{payment_method}}

{{items}}

💰 *Jumla: TZS {{total}}*

Maswali? WhatsApp sisi wakati wowote. Tunakupenda, Mama! 💕
_Your Organization_`,
  template_invoice: `Habari *{{customer_name}}*,

Tuma invoice kutoka Your Organization.

📄 *Invoice: {{ref}}*
📅 Tarehe: {{date}}
⏰ Due: {{due_date}}
💳 Terms: {{payment_terms}}

{{items}}

💰 *Invoice Total: TZS {{total}}*
{{outstanding_block}}

Lipa kupitia:
🏦 NMB Bank — *{{bank_account}}*
Ref: {{ref}}

Maswali? Wasiliana nasi. Asante! 🙏
_Your Organization_`,
}

export interface WASendPayload {
  to: string           // WhatsApp number e.g. +255743100212
  message: string      // Formatted message body
  type: 'receipt' | 'invoice' | 'custom'
  ref: string          // Voucher ref for logging
  customer_id?: string
  customer_name?: string
  /**
   * When TRUE the send is treated as transactional (receipt, invoice, payment
   * confirmation) and bypasses the stage_paused check. When FALSE or omitted
   * the send is treated as marketing/automation and is BLOCKED if the
   * customer's profile is paused (sensitive exit). Manual Brenda-typed
   * messages from CRM Inbox should also pass true since she's handling the
   * sensitive case herself.
   */
  is_transactional?: boolean
}

export interface WASendResult {
  success: boolean
  message_id?: string
  error?: string
  provider?: string
}

// ── LOAD CONFIG FROM SUPABASE ─────────────────────────────────────────────
export const loadWAConfig = async (): Promise<WAConfig> => {
  const { data } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'whatsapp_config')
    .single()
  if (data?.value) {
    try { return { ...DEFAULT_WA_CONFIG, ...JSON.parse(data.value) } } catch {}
  }
  return DEFAULT_WA_CONFIG
}

// ── SAVE CONFIG TO SUPABASE ───────────────────────────────────────────────
export const saveWAConfig = async (config: WAConfig): Promise<void> => {
  await supabase.from('system_settings').upsert(
    { key: 'whatsapp_config', value: JSON.stringify(config) },
    { onConflict: 'key' }
  )
}

// ── FORMAT PHONE NUMBER ───────────────────────────────────────────────────
export const formatPhone = (phone: string): string => {
  const cleaned = phone.replace(/[\s\-\(\)]/g, '')
  // Convert 07XX to +25507XX for Tanzania
  if (cleaned.startsWith('07') || cleaned.startsWith('06')) {
    return '+255' + cleaned.slice(1)
  }
  if (cleaned.startsWith('255') && !cleaned.startsWith('+')) {
    return '+' + cleaned
  }
  return cleaned
}

// ── SEND VIA WATI ─────────────────────────────────────────────────────────
const sendViaWati = async (config: WAConfig, payload: WASendPayload): Promise<WASendResult> => {
  // Wati API: POST https://live-server-XXXX.wati.io/api/v1/sendSessionMessage/{phone}
  // Headers: Authorization: Bearer {api_key}
  try {
    const phone = formatPhone(payload.to).replace('+', '')
    const url = `${config.api_url}/api/v1/sendSessionMessage/${phone}`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.api_key}`,
      },
      body: JSON.stringify({ messageText: payload.message }),
    })
    const data = await res.json()
    if (res.ok) {
      return { success: true, message_id: data.id || data.messageId, provider: 'wati' }
    }
    return { success: false, error: data.message || 'Wati API error', provider: 'wati' }
  } catch (err: any) {
    return { success: false, error: err.message, provider: 'wati' }
  }
}

// ── SEND VIA TWILIO ───────────────────────────────────────────────────────
const sendViaTwilio = async (config: WAConfig, payload: WASendPayload): Promise<WASendResult> => {
  // Twilio WhatsApp: POST https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Messages.json
  // config.api_key = "AccountSid:AuthToken"
  // config.sender_number = "whatsapp:+14155238886"
  try {
    const [accountSid, authToken] = config.api_key.split(':')
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
    const body = new URLSearchParams({
      From: `whatsapp:${config.sender_number}`,
      To: `whatsapp:${formatPhone(payload.to)}`,
      Body: payload.message,
    })
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
      },
      body: body.toString(),
    })
    const data = await res.json()
    if (res.ok) {
      return { success: true, message_id: data.sid, provider: 'twilio' }
    }
    return { success: false, error: data.message || 'Twilio error', provider: 'twilio' }
  } catch (err: any) {
    return { success: false, error: err.message, provider: 'twilio' }
  }
}

// ── SEND VIA INFOBIP ──────────────────────────────────────────────────────
const sendViaInfobip = async (config: WAConfig, payload: WASendPayload): Promise<WASendResult> => {
  // Infobip: POST https://{base_url}/whatsapp/1/message/text
  try {
    const res = await fetch(`${config.api_url}/whatsapp/1/message/text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `App ${config.api_key}`,
      },
      body: JSON.stringify({
        from: config.sender_number,
        to: formatPhone(payload.to),
        content: { text: payload.message },
      }),
    })
    const data = await res.json()
    if (res.ok) {
      return { success: true, message_id: data.messages?.[0]?.messageId, provider: 'infobip' }
    }
    return { success: false, error: data.requestError?.serviceException?.text || 'Infobip error', provider: 'infobip' }
  } catch (err: any) {
    return { success: false, error: err.message, provider: 'infobip' }
  }
}

// ── SEND VIA CUSTOM WEBHOOK ───────────────────────────────────────────────
const sendViaCustom = async (config: WAConfig, payload: WASendPayload): Promise<WASendResult> => {
  try {
    const res = await fetch(config.api_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.api_key}`,
      },
      body: JSON.stringify({
        to: formatPhone(payload.to),
        message: payload.message,
        type: payload.type,
      }),
    })
    const data = await res.json()
    return { success: res.ok, message_id: data.id, error: res.ok ? undefined : data.error, provider: 'custom' }
  } catch (err: any) {
    return { success: false, error: err.message, provider: 'custom' }
  }
}

// ── MAIN SEND FUNCTION ────────────────────────────────────────────────────
export const sendWhatsApp = async (
  config: WAConfig,
  payload: WASendPayload
): Promise<WASendResult> => {
  if (!config.enabled || !config.api_key || !config.provider) {
    return { success: false, error: 'WhatsApp not configured. Set up in Settings → WhatsApp.' }
  }
  if (!payload.to || payload.to.length < 8) {
    return { success: false, error: 'Invalid phone number' }
  }

  // ── Sensitive exit enforcement ─────────────────────────────────────────
  // Paused profiles never receive non-transactional messages. This is the
  // single chokepoint for all WhatsApp sends so we know automations,
  // feedback requests, ambassador messages etc. all respect the rule.
  // Receipts and invoices pass is_transactional=true to bypass.
  if (payload.customer_id && !payload.is_transactional) {
    const { data: customer } = await supabase
      .from('customers')
      .select('stage_paused')
      .eq('id', payload.customer_id)
      .maybeSingle()
    if (customer?.stage_paused === true) {
      // Log the blocked send so Brenda can audit if needed
      await supabase.from('whatsapp_sends').insert({
        customer_id: payload.customer_id,
        customer_name: payload.customer_name || null,
        phone: formatPhone(payload.to),
        message_type: payload.type,
        voucher_ref: payload.ref,
        provider: config.provider,
        status: 'blocked_paused',
        error: 'Profile paused (sensitive exit) — automated send suppressed',
        sent_at: new Date().toISOString(),
      })
      return {
        success: false,
        error: 'Customer profile is paused. Automated sends are suppressed for sensitive exits.',
      }
    }
  }

  let result: WASendResult

  switch (config.provider) {
    case 'wati':     result = await sendViaWati(config, payload);     break
    case 'twilio':   result = await sendViaTwilio(config, payload);   break
    case 'infobip':  result = await sendViaInfobip(config, payload);  break
    case 'custom':   result = await sendViaCustom(config, payload);   break
    default:         return { success: false, error: 'Unknown provider' }
  }

  // Log every attempt to Supabase
  await supabase.from('whatsapp_sends').insert({
    customer_id: payload.customer_id || null,
    customer_name: payload.customer_name || null,
    phone: formatPhone(payload.to),
    message_type: payload.type,
    voucher_ref: payload.ref,
    provider: config.provider,
    status: result.success ? 'sent' : 'failed',
    message_id: result.message_id || null,
    error: result.error || null,
    sent_at: new Date().toISOString(),
  }).then(({ error }) => {
    if (error) console.warn('WA log error:', error.message)
  })

  return result
}

// ── MESSAGE FORMATTERS ────────────────────────────────────────────────────
export const formatReceiptMessage = (
  template: string,
  data: {
    customer_name: string
    ref: string
    date: string
    payment_method: string
    items: { name: string; qty: number; amount: number }[]
    total: number
  }
): string => {
  const itemLines = data.items
    .map(i => `  • ${i.name} x${i.qty} — TZS ${i.amount.toLocaleString()}`)
    .join('\n')

  return template
    .replace('{{customer_name}}', data.customer_name)
    .replace('{{ref}}', data.ref)
    .replace('{{date}}', data.date)
    .replace('{{payment_method}}', data.payment_method)
    .replace('{{items}}', itemLines)
    .replace('{{total}}', data.total.toLocaleString())
}

export const formatInvoiceMessage = (
  template: string,
  data: {
    customer_name: string
    ref: string
    date: string
    due_date: string
    payment_terms: string
    items: { name: string; qty: number; amount: number }[]
    total: number
    outstanding: number
    bank_account: string
  }
): string => {
  const itemLines = data.items
    .map(i => `  • ${i.name} x${i.qty} — TZS ${i.amount.toLocaleString()}`)
    .join('\n')

  const outstandingBlock = data.outstanding > 0
    ? `\n⚠️ *Previous Balance: TZS ${data.outstanding.toLocaleString()}*\n💳 *Total Due: TZS ${(data.total + data.outstanding).toLocaleString()}*`
    : ''

  return template
    .replace('{{customer_name}}', data.customer_name)
    .replace('{{ref}}', data.ref)
    .replace('{{date}}', data.date)
    .replace('{{due_date}}', data.due_date || '—')
    .replace('{{payment_terms}}', data.payment_terms || '—')
    .replace('{{items}}', itemLines)
    .replace('{{total}}', data.total.toLocaleString())
    .replace('{{outstanding_block}}', outstandingBlock)
    .replace('{{bank_account}}', data.bank_account)
}
