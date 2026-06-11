/**
 * CRM Inbox - WATI WhatsApp Integration
 * Displays real WhatsApp conversations from WATI
 * Allows sending replies back through WATI API
 */

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'



interface WATIConversation {
  id: string
  wati_id: string
  phone_number: string
  customer_id: string | null
  customer_name: string
  customer_full_name?: string
  crown_tier?: string
  last_message_at: string
  unread_count: number
  status: 'open' | 'resolved' | 'archived'
  assigned_to: string | null
  assigned_to_name?: string
  last_message?: string
  created_at: string
}

interface WATIMessage {
  id: string
  conversation_id: string
  message_type: string
  content: string
  sender: 'customer' | 'business'
  is_read: boolean
  created_at: string
}

export default function CRMInbox() {
  const [conversations, setConversations] = useState<WATIConversation[]>([])
  const [selectedConvo, setSelectedConvo] = useState<WATIConversation | null>(null)
  const [messages, setMessages] = useState<WATIMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')

  // Load conversations on mount
  useEffect(() => {
    loadConversations()
    
    // Subscribe to real-time updates
    const channel = supabase
      .channel('wati_conversations_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wati_conversations' },
        () => loadConversations()
      )
      .subscribe()
    
    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  // Load messages when conversation changes
  useEffect(() => {
    if (selectedConvo) {
      loadMessages(selectedConvo.id)
      markAsRead(selectedConvo.id)
    }
  }, [selectedConvo])

  const loadConversations = async () => {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('wati_conversations_recent')
        .select('*')
        .eq('status', 'open')
        .order('last_message_at', { ascending: false })

      if (data) {
        setConversations(data as WATIConversation[])
        if (!selectedConvo && data.length > 0) {
          setSelectedConvo(data[0])
        }
      }
    } catch (err) {
      console.error('Error loading conversations:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadMessages = async (conversationId: string) => {
    try {
      const { data } = await supabase
        .from('wati_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })

      if (data) {
        setMessages(data as WATIMessage[])
      }
    } catch (err) {
      console.error('Error loading messages:', err)
    }
  }

  const markAsRead = async (conversationId: string) => {
    try {
      await supabase.rpc('mark_conversation_read', { conv_id: conversationId })
      
      setConversations(convos =>
        convos.map(c =>
          c.id === conversationId ? { ...c, unread_count: 0 } : c
        )
      )
    } catch (err) {
      console.error('Error marking as read:', err)
    }
  }

  const sendReply = async () => {
    if (!replyText.trim() || !selectedConvo) return

    setSending(true)
    try {
      // Get WATI API key
      const { data: watiSettings } = await supabase
        .from('wati_settings')
        .select('api_key')
        .eq('is_active', true)
        .single()

      if (!watiSettings?.api_key) {
        throw new Error('WATI API key not configured')
      }

      // Send through WATI API
      const response = await fetch(
        `https://live-server.wati.io/api/v1/sendMessage?token=${watiSettings.api_key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phoneNumber: selectedConvo.phone_number,
            message: replyText
          })
        }
      )

      if (!response.ok) {
        throw new Error('Failed to send message through WATI')
      }

      // Save to database
      await supabase.from('wati_messages').insert({
        conversation_id: selectedConvo.id,
        message_type: 'text',
        content: replyText,
        sender: 'business',
        is_read: true,
        created_at: new Date().toISOString()
      })

      // Update conversation timestamp
      await supabase
        .from('wati_conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', selectedConvo.id)

      setReplyText('')
      loadMessages(selectedConvo.id)
    } catch (err) {
      console.error('Error sending reply:', err)
      alert('Failed to send message')
    } finally {
      setSending(false)
    }
  }

  const resolveConversation = async () => {
    if (!selectedConvo) return
    try {
      await supabase
        .from('wati_conversations')
        .update({ status: 'resolved' })
        .eq('id', selectedConvo.id)

      loadConversations()
      setSelectedConvo(null)
    } catch (err) {
      console.error('Error resolving conversation:', err)
    }
  }

  const filteredConvos = conversations.filter(c =>
    filter === 'all' ? true : c.unread_count > 0
  )

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        Loading conversations...
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 80px)', background: '#000' }}>
      {/* Sidebar */}
      <div style={{ width: 380, borderRight: '1px solid #333', overflowY: 'auto', background: '#0a0a0a' }}>
        <div style={{ padding: 16, borderBottom: '1px solid #333', display: 'flex', gap: 8 }}>
          <button
            onClick={() => setFilter('all')}
            style={{
              flex: 1,
              padding: '8px 12px',
              background: filter === 'all' ? '#00d084' : '#1a1a1a',
              color: filter === 'all' ? '#000' : '#fff',
              border: 'none',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            All
          </button>
          <button
            onClick={() => setFilter('unread')}
            style={{
              flex: 1,
              padding: '8px 12px',
              background: filter === 'unread' ? '#00d084' : '#1a1a1a',
              color: filter === 'unread' ? '#000' : '#fff',
              border: 'none',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Unread
          </button>
        </div>

        {filteredConvos.map(convo => (
          <div
            key={convo.id}
            onClick={() => setSelectedConvo(convo)}
            style={{
              padding: 12,
              background: selectedConvo?.id === convo.id ? '#1a1a1a' : 'transparent',
              borderLeft: selectedConvo?.id === convo.id ? '3px solid #00d084' : 'none',
              cursor: 'pointer',
              borderBottom: '1px solid #333'
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 4 }}>
              {convo.customer_full_name || convo.customer_name}
            </div>
            <div style={{ fontSize: 12, color: '#999', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {convo.last_message || 'No messages yet'}
            </div>
            {convo.unread_count > 0 && (
              <div style={{ fontSize: 11, color: '#00d084', marginTop: 4 }}>
                {convo.unread_count} unread
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Main Chat Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {selectedConvo ? (
          <>
            {/* Header */}
            <div style={{ padding: 20, borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>
                  {selectedConvo.customer_full_name || selectedConvo.customer_name}
                </div>
                <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                  {selectedConvo.phone_number}
                </div>
              </div>
              <button
                onClick={() => resolveConversation()}
                style={{
                  padding: '8px 12px',
                  background: '#ff6b6b',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 12,
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Resolve
              </button>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {messages.map(msg => (
                <div
                  key={msg.id}
                  style={{
                    maxWidth: '70%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: msg.sender === 'customer' ? '#1a1a1a' : '#00d084',
                    color: msg.sender === 'customer' ? '#fff' : '#000',
                    alignSelf: msg.sender === 'customer' ? 'flex-start' : 'flex-end',
                    fontSize: 13
                  }}
                >
                  {msg.content}
                </div>
              ))}
            </div>

            {/* Input Area */}
            <div style={{ padding: 20, borderTop: '1px solid #333', display: 'flex', gap: 8 }}>
              <input
                style={{
                  flex: 1,
                  background: '#1a1a1a',
                  border: '1px solid #333',
                  color: '#fff',
                  padding: '10px 12px',
                  borderRadius: 8,
                  fontFamily: 'inherit',
                  fontSize: 13
                }}
                type="text"
                placeholder="Type a message..."
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                onKeyPress={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    sendReply()
                  }
                }}
              />
              <button
                style={{
                  padding: '10px 16px',
                  background: '#00d084',
                  color: '#000',
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 600,
                  cursor: 'pointer',
                  opacity: sending || !replyText.trim() ? 0.6 : 1
                }}
                onClick={sendReply}
                disabled={sending || !replyText.trim()}
              >
                {sending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#999' }}>
            {filteredConvos.length === 0 ? 'No conversations yet' : 'Select a conversation'}
          </div>
        )}
      </div>
    </div>
  )
}
