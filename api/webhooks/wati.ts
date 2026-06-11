import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// CRITICAL: Tell Vercel not to parse body so we can do it manually
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Vercel auto-parses JSON - but log raw to confirm
  const body = req.body;
  console.log('WATI BODY TYPE:', typeof body);
  console.log('WATI BODY:', JSON.stringify(body));

  try {
    let phone: string | null = null;
    let messageText = '';
    let customerName = '';
    let messageId = '';

    // Handle all WATI payload shapes
    if (body?.waId) {
      phone = String(body.waId);
      messageText = body?.text?.body || body?.message || '';
      customerName = body?.senderName || body?.contactName || phone;
      messageId = body?.id || body?.wamid || '';
    } else if (body?.contact?.wa_id) {
      phone = String(body.contact.wa_id);
      customerName = body?.contact?.name || phone;
      const msg = body?.messages?.[0];
      messageText = msg?.text?.body || '';
      messageId = msg?.id || '';
    } else if (body?.data?.waId) {
      phone = String(body.data.waId);
      messageText = body?.data?.text?.body || body?.data?.message || '';
      customerName = body?.data?.senderName || phone;
      messageId = body?.data?.id || '';
    }

    console.log('PARSED phone:', phone, '| msg:', messageText);

    if (!phone) {
      console.log('No phone - skipping. Keys in body:', Object.keys(body || {}));
      return res.status(200).json({ status: 'skipped' });
    }

    // Find or create conversation
    const { data: existing, error: findErr } = await supabase
      .from('wati_conversations')
      .select('id, unread_count')
      .eq('phone_number', phone)
      .maybeSingle();

    if (findErr) console.error('findErr:', findErr.message);

    let conversationId: string | null = null;

    if (existing) {
      conversationId = existing.id;
      await supabase
        .from('wati_conversations')
        .update({
          last_message_at: new Date().toISOString(),
          unread_count: (existing.unread_count || 0) + 1,
          customer_name: customerName,
          status: 'open',
        })
        .eq('id', conversationId);
    } else {
      const { data: customer } = await supabase
        .from('customers')
        .select('id, name')
        .or(`phone.eq.${phone},phone.eq.+${phone}`)
        .maybeSingle();

      const { data: newConv, error: insertErr } = await supabase
        .from('wati_conversations')
        .insert({
          phone_number: phone,
          customer_name: customer?.name || customerName,
          customer_id: customer?.id || null,
          last_message_at: new Date().toISOString(),
          unread_count: 1,
          status: 'open',
        })
        .select('id')
        .single();

      if (insertErr) {
        console.error('INSERT ERROR:', insertErr.message, insertErr.details);
      } else {
        conversationId = newConv?.id;
        console.log('New conversation created:', conversationId);
      }
    }

    if (conversationId && messageText) {
      const { error: msgErr } = await supabase.from('wati_messages').insert({
        conversation_id: conversationId,
        content: messageText,
        sender: 'customer',
        message_type: 'text',
        is_read: false,
        wati_message_id: messageId,
      });
      if (msgErr) console.error('MSG INSERT ERROR:', msgErr.message);
      else console.log('Message saved OK');
    }

    return res.status(200).json({ status: 'ok', conversationId, phone });

  } catch (err: any) {
    console.error('CRASH:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
