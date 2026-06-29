import React, { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Send, MessageSquare, Smartphone, Users, CircleAlert as AlertCircle, CircleCheck as CheckCircle2, Circle as XCircle, Info } from 'lucide-react';
import { toast } from 'sonner';

const WA_MSG_TYPES = [
  { value: 'monthly_reminder', label: 'Monthly Reminder' },
  { value: 'overdue_alert', label: 'Overdue Alert' },
  { value: 'balance_request', label: 'Balance Request' },
  { value: 'payment_received', label: 'Payment Received' },
  { value: 'partial_payment', label: 'Partial Payment' },
  { value: 'annual_statement', label: 'Annual Statement' },
];

const SMS_MSG_TYPES = [
  { value: 'payment_reminder', label: 'Payment Reminder' },
  { value: 'payment_received', label: 'Payment Received' },
  { value: 'booking_confirmation', label: 'Booking Confirmation' },
  { value: 'custom', label: 'Custom Message' },
];

function StatusBadge({ configured }) {
  if (configured) {
    return (
      <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
        <CheckCircle2 className="w-3 h-3" /> LIVE
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
      <XCircle className="w-3 h-3" /> API KEY NEEDED
    </span>
  );
}

export default function WhatsAppPage() {
  const [customers, setCustomers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [smsMessages, setSmsMessages] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [waMsgType, setWaMsgType] = useState('monthly_reminder');
  const [smsMsgType, setSmsMsgType] = useState('payment_reminder');
  const [customSms, setCustomSms] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [confirmBulk, setConfirmBulk] = useState(null);
  const [msgStatus, setMsgStatus] = useState({ sms_configured: false, whatsapp_configured: false });
  const [singleSmsPhone, setSingleSmsPhone] = useState('');
  const [singleSmsMsg, setSingleSmsMsg] = useState('');
  const [singleSmsCustId, setSingleSmsCustId] = useState('');
  const [singleWaCustomerId, setSingleWaCustomerId] = useState('');
  const [singleWaMsgType, setSingleWaMsgType] = useState('monthly_reminder');
  const [sendingWa, setSendingWa] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/customers'),
      api.get('/whatsapp/messages'),
      api.get('/sms/history').catch(() => ({ data: [] })),
      api.get('/messaging/status').catch(() => ({ data: {} })),
    ]).then(([cRes, mRes, sRes, stRes]) => {
      setCustomers(cRes.data);
      setMessages(mRes.data);
      setSmsMessages(sRes.data);
      setMsgStatus(stRes.data || {});
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const toggleSelect = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const filteredCustomers = customers;

  const selectAll = () => {
    if (selectedIds.length === filteredCustomers.length) setSelectedIds([]);
    else setSelectedIds(filteredCustomers.map(c => c.id));
  };

  const handleWaSingleSend = async () => {
    if (!singleWaCustomerId) { toast.error('Select a customer'); return; }
    setSendingWa(true);
    try {
      const res = await api.post('/whatsapp/send', { customer_id: singleWaCustomerId, message_type: singleWaMsgType });
      toast.success(res.data.message);
      const mRes = await api.get('/whatsapp/messages');
      setMessages(mRes.data);
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to send'); }
    setSendingWa(false);
  };

  const handleWaBulkSend = async () => {
    if (selectedIds.length === 0) { toast.error('Select at least one customer'); return; }
    setSending(true);
    try {
      const res = await api.post('/whatsapp/bulk-send', { customer_ids: selectedIds, message_type: waMsgType });
      toast.success(res.data.message);
      setSelectedIds([]);
      const mRes = await api.get('/whatsapp/messages');
      setMessages(mRes.data);
    } catch { toast.error('Failed to send'); }
    setSending(false);
    setConfirmBulk(null);
  };

  const handleSmsBulkSend = async () => {
    if (selectedIds.length === 0) { toast.error('Select at least one customer'); return; }
    setSending(true);
    try {
      const res = await api.post('/sms/bulk-send', {
        customer_ids: selectedIds,
        message_type: smsMsgType,
        custom_message: smsMsgType === 'custom' ? customSms : ''
      });
      toast.success(res.data.message);
      if (res.data.results?.errors?.length > 0) {
        res.data.results.errors.forEach(e => toast.error(e));
      }
      setSelectedIds([]);
      const sRes = await api.get('/sms/history');
      setSmsMessages(sRes.data);
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to send SMS'); }
    setSending(false);
    setConfirmBulk(null);
  };

  const handleSingleSms = async () => {
    if (!singleSmsMsg.trim()) { toast.error('Message cannot be empty'); return; }
    if (singleSmsMsg.length > 160) { toast.error('SMS must be 160 characters or less'); return; }
    if (!singleSmsPhone && !singleSmsCustId) { toast.error('Enter a phone number or select a customer'); return; }
    setSending(true);
    try {
      const res = await api.post('/sms/send', {
        customer_id: singleSmsCustId,
        phone: singleSmsPhone,
        message: singleSmsMsg,
        message_type: 'custom'
      });
      if (res.data.success) {
        toast.success('SMS sent successfully');
      } else {
        toast.error(res.data.data?.error || 'SMS failed');
      }
      setSingleSmsMsg('');
      setSingleSmsPhone('');
      const sRes = await api.get('/sms/history');
      setSmsMessages(sRes.data);
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to send SMS'); }
    setSending(false);
  };

  const allMessages = [
    ...messages.map(m => ({...m, channel: m.channel || 'whatsapp'})),
    ...smsMessages.map(m => ({...m, channel: 'sms'}))
  ].sort((a, b) => (b.sent_at || '').localeCompare(a.sent_at || ''));

  return (
    <div data-testid="whatsapp-page" className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-neutral-900 tracking-tight" style={{ fontFamily: 'Outfit' }}>Messaging Center</h1>
          <p className="text-sm text-neutral-500 mt-0.5">Send WhatsApp messages and SMS to customers via Fast2SMS</p>
        </div>
      </div>

      {/* Connection status bar */}
      <div className="flex flex-wrap gap-3">
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium ${msgStatus.whatsapp_configured ? 'bg-[#E8FCE8] border-green-200 text-green-800' : 'bg-neutral-50 border-neutral-200 text-neutral-500'}`}>
          <MessageSquare className="w-3.5 h-3.5" />
          WhatsApp (Fast2SMS) &nbsp;<StatusBadge configured={msgStatus.whatsapp_configured} />
        </div>
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium ${msgStatus.sms_configured ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-neutral-50 border-neutral-200 text-neutral-500'}`}>
          <Smartphone className="w-3.5 h-3.5" />
          SMS (Fast2SMS) &nbsp;<StatusBadge configured={msgStatus.sms_configured} />
        </div>
        {!msgStatus.api_key_set && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-amber-50 border-amber-200 text-amber-700 text-xs">
            <Info className="w-3.5 h-3.5 shrink-0" />
            Add your Fast2SMS API key in <strong className="ml-1">Brand Settings → Fast2SMS API Key</strong> to activate sending.
          </div>
        )}
      </div>

      <Tabs defaultValue="whatsapp">
        <TabsList>
          <TabsTrigger data-testid="tab-whatsapp" value="whatsapp" className="gap-1.5">
            <MessageSquare className="w-3.5 h-3.5" /> WhatsApp
            {msgStatus.whatsapp_configured && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 ml-0.5" />}
          </TabsTrigger>
          <TabsTrigger data-testid="tab-sms" value="sms" className="gap-1.5">
            <Smartphone className="w-3.5 h-3.5" /> SMS
            {msgStatus.sms_configured && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 ml-0.5" />}
          </TabsTrigger>
          <TabsTrigger data-testid="tab-history" value="history" className="gap-1.5">All History</TabsTrigger>
        </TabsList>

        {/* ───── WhatsApp Tab ───── */}
        <TabsContent value="whatsapp" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3 space-y-4">

              {/* Single WhatsApp Send */}
              <div className="bg-white border border-neutral-200 rounded-lg p-5">
                <h3 className="text-sm font-semibold text-neutral-900 mb-3 flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                  <MessageSquare className="w-4 h-4 text-[#25D366]" /> Send Individual WhatsApp
                </h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Customer</Label>
                      <Select value={singleWaCustomerId || 'none'} onValueChange={v => setSingleWaCustomerId(v === 'none' ? '' : v)}>
                        <SelectTrigger className="mt-1"><SelectValue placeholder="Select customer..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">-- Choose --</SelectItem>
                          {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name} ({c.phone})</SelectItem>)}
                          )
                          }
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Message Type</Label>
                      <Select value={singleWaMsgType} onValueChange={setSingleWaMsgType}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {WA_MSG_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                          )
                          }
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button
                    onClick={handleWaSingleSend}
                    disabled={sendingWa || !singleWaCustomerId}
                    className="gap-1.5"
                    style={{ backgroundColor: '#25D366' }}
                  >
                    <MessageSquare className="w-4 h-4" />
                    {sendingWa ? 'Sending...' : 'Send WhatsApp'}
                  </Button>
                </div>
              </div>

              {/* Bulk WhatsApp */}
              <div className="bg-white border border-neutral-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-semibold text-neutral-900" style={{ fontFamily: 'Outfit' }}>Bulk WhatsApp</h3>
                    <Select value={waMsgType} onValueChange={setWaMsgType}>
                      <SelectTrigger data-testid="wa-msg-type-select" className="w-48"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {WA_MSG_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                        )
                        }
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    data-testid="wa-bulk-send-btn"
                    disabled={sending || selectedIds.length === 0}
                    onClick={() => setConfirmBulk({ type: 'whatsapp', count: selectedIds.length })}
                    style={{ backgroundColor: '#25D366' }}
                  >
                    <Send className="w-4 h-4 mr-1.5" /> Send to {selectedIds.length} selected
                  </Button>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-neutral-50">
                      <TableHead className="w-10"><Checkbox data-testid="wa-select-all" checked={selectedIds.length > 0 && selectedIds.length === filteredCustomers.length} onCheckedChange={selectAll} /></TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider font-medium text-neutral-500">Customer</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider font-medium text-neutral-500">Phone</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider font-medium text-neutral-500">Property</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow><TableCell colSpan={4} className="text-center py-8 text-neutral-400">Loading...</TableCell></TableRow>
                    ) : filteredCustomers.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center py-8 text-neutral-400">No customers</TableCell></TableRow>
                    ) : filteredCustomers.map(c => (
                      <TableRow key={c.id}>
                        <TableCell><Checkbox checked={selectedIds.includes(c.id)} onCheckedChange={() => toggleSelect(c.id)} /></TableCell>
                        <TableCell><p className="text-sm font-medium text-neutral-900">{c.name}</p></TableCell>
                        <TableCell className="text-sm text-neutral-600 font-mono">{c.phone}</TableCell>
                        <TableCell className="text-sm text-neutral-600">{c.property_name}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* WhatsApp History */}
            <div className="lg:col-span-2">
              <div className="bg-white border border-neutral-200 rounded-lg">
                <div className="p-4 border-b border-neutral-200">
                  <h3 className="text-sm font-semibold text-neutral-900" style={{ fontFamily: 'Outfit' }}>WhatsApp History</h3>
                </div>
                <div className="max-h-[500px] overflow-y-auto divide-y divide-neutral-100">
                  {messages.length === 0
                    ? <div className="text-center py-12 text-neutral-400"><MessageSquare className="w-8 h-8 mx-auto mb-2 text-neutral-300" /><p className="text-sm">No messages yet</p></div>
                    : messages.slice(0, 20).map(m => (
                      <div key={m.id} className="p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-neutral-700">{m.customer_name}</span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${m.status === 'delivered' ? 'bg-emerald-50 text-emerald-600' : m.status === 'failed' ? 'bg-rose-50 text-rose-600' : 'bg-neutral-100 text-neutral-500'}`}>{m.status}</span>
                          {m.is_mock && <span className="text-[9px] px-1 py-0.5 rounded bg-amber-50 text-amber-500 font-medium">queued</span>}
                          }
                        </div>
                        <p className="text-xs text-neutral-500 truncate">{m.message_text?.substring(0, 100)}</p>
                        {m.error && <p className="text-[10px] text-rose-500 mt-0.5">{m.error}</p>}
                        }
                        <p className="text-[9px] text-neutral-300 mt-1">{m.sent_at ? new Date(m.sent_at).toLocaleString() : ''}</p>
                      </div>
                    ))
                  }
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ───── SMS Tab ───── */}
        <TabsContent value="sms" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3 space-y-4">
              {/* Single SMS */}
              <div className="bg-white border border-neutral-200 rounded-lg p-5">
                <h3 className="text-sm font-semibold text-neutral-900 mb-3" style={{ fontFamily: 'Outfit' }}>
                  <Smartphone className="w-4 h-4 inline mr-1.5 text-neutral-400" /> Send Individual SMS
                </h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Phone Number</Label>
                      <Input data-testid="sms-phone-input" value={singleSmsPhone} onChange={e => setSingleSmsPhone(e.target.value)} placeholder="10-digit mobile number" className="mt-1 font-mono" />
                    </div>
                    <div>
                      <Label className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Or Select Customer</Label>
                      <Select value={singleSmsCustId || "none"} onValueChange={v => {
                        if (v === "none") { setSingleSmsCustId(''); return; }
                        setSingleSmsCustId(v);
                        const c = customers.find(x => x.id === v);
                        if (c?.phone) setSingleSmsPhone(c.phone);
                      }}>
                        <SelectTrigger data-testid="sms-customer-select" className="mt-1"><SelectValue placeholder="Choose..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">-- Direct Number --</SelectItem>
                          {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name} ({c.phone})</SelectItem>)}
                          )
                          }
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Message ({160 - singleSmsMsg.length} chars left)</Label>
                    <Textarea
                      data-testid="sms-message-input"
                      value={singleSmsMsg}
                      onChange={e => setSingleSmsMsg(e.target.value.slice(0, 160))}
                      placeholder="Type your SMS message (max 160 chars)..."
                      className="mt-1 h-20 resize-none"
                      maxLength={160}
                    />
                  </div>
                  <Button data-testid="send-single-sms-btn" onClick={handleSingleSms} disabled={sending} style={{ backgroundColor: 'var(--brand-primary)' }}>
                    <Send className="w-4 h-4 mr-1.5" /> {sending ? 'Sending...' : 'Send SMS'}
                  </Button>
                </div>
              </div>

              {/* Bulk SMS */}
              <div className="bg-white border border-neutral-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-semibold text-neutral-900" style={{ fontFamily: 'Outfit' }}>Bulk SMS</h3>
                    <Select value={smsMsgType} onValueChange={setSmsMsgType}>
                      <SelectTrigger data-testid="sms-msg-type-select" className="w-48"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SMS_MSG_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                        )
                        }
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    data-testid="bulk-sms-send-btn"
                    disabled={sending || selectedIds.length === 0}
                    onClick={() => setConfirmBulk({ type: 'sms', count: selectedIds.length })}
                    style={{ backgroundColor: 'var(--brand-primary)' }}
                  >
                    <Send className="w-4 h-4 mr-1.5" /> Send SMS to {selectedIds.length} selected
                  </Button>
                </div>
                {smsMsgType === 'custom' && (
                  <div className="mb-3">
                    <Textarea data-testid="bulk-sms-custom-msg" value={customSms} onChange={e => setCustomSms(e.target.value.slice(0, 160))} placeholder="Custom message (max 160 chars)..." className="h-16 resize-none" maxLength={160} />
                  </div>
                )}
                <Table>
                  <TableHeader>
                    <TableRow className="bg-neutral-50">
                      <TableHead className="w-10"><Checkbox data-testid="sms-select-all" checked={selectedIds.length > 0 && selectedIds.length === filteredCustomers.length} onCheckedChange={selectAll} /></TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider font-medium text-neutral-500">Customer</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider font-medium text-neutral-500">Phone</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider font-medium text-neutral-500">Property</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow><TableCell colSpan={4} className="text-center py-8 text-neutral-400">Loading...</TableCell></TableRow>
                    ) : filteredCustomers.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center py-8 text-neutral-400">No customers found</TableCell></TableRow>
                    ) : filteredCustomers.map(c => (
                      <TableRow key={c.id} data-testid={`sms-customer-${c.customer_id}`}>
                        <TableCell><Checkbox checked={selectedIds.includes(c.id)} onCheckedChange={() => toggleSelect(c.id)} /></TableCell>
                        <TableCell><p className="text-sm font-medium text-neutral-900">{c.name}</p><p className="text-[10px] text-neutral-400 font-mono">{c.customer_id}</p></TableCell>
                        <TableCell className="text-sm text-neutral-600 font-mono">{c.phone}</TableCell>
                        <TableCell className="text-sm text-neutral-600">{c.property_name}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* SMS History */}
            <div className="lg:col-span-2">
              <div className="bg-white border border-neutral-200 rounded-lg">
                <div className="p-4 border-b border-neutral-200">
                  <h3 className="text-sm font-semibold text-neutral-900" style={{ fontFamily: 'Outfit' }}>
                    <Smartphone className="w-4 h-4 inline mr-1.5 text-neutral-400" /> SMS History
                  </h3>
                </div>
                <div className="max-h-[600px] overflow-y-auto divide-y divide-neutral-100">
                  {smsMessages.length === 0 ? (
                    <div className="text-center py-12 text-neutral-400"><Smartphone className="w-8 h-8 mx-auto mb-2 text-neutral-300" /><p className="text-sm">No SMS sent yet</p></div>
                  ) : smsMessages.slice(0, 30).map(m => (
                    <div key={m.id} className="p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-neutral-700">{m.customer_name || m.phone}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${m.status === 'delivered' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>{m.status}</span>
                      </div>
                      <p className="text-xs text-neutral-500 truncate">{m.message_text?.substring(0, 120)}</p>
                      {m.error && <p className="text-[10px] text-rose-500 mt-0.5">{m.error}</p>}
                      }
                      <p className="text-[9px] text-neutral-300 mt-1">{m.sent_at ? new Date(m.sent_at).toLocaleString() : ''}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ───── All History Tab ───── */}
        <TabsContent value="history" className="mt-4">
          <div className="bg-white border border-neutral-200 rounded-lg">
            <div className="p-4 border-b border-neutral-200">
              <h3 className="text-sm font-semibold text-neutral-900" style={{ fontFamily: 'Outfit' }}>All Message History</h3>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="bg-neutral-50">
                  <TableHead className="text-[10px] uppercase tracking-wider font-medium text-neutral-500">Channel</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider font-medium text-neutral-500">Customer</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider font-medium text-neutral-500">Phone</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider font-medium text-neutral-500">Type</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider font-medium text-neutral-500">Message</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider font-medium text-neutral-500">Status</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider font-medium text-neutral-500">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allMessages.slice(0, 50).map(m => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${m.channel === 'sms' ? 'bg-blue-50 text-blue-700' : 'bg-[#E8FCE8] text-green-700'}`}>
                        {m.channel === 'sms' ? 'SMS' : 'WhatsApp'}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{m.customer_name || '-'}</TableCell>
                    <TableCell className="text-xs font-mono text-neutral-500">{m.phone}</TableCell>
                    <TableCell className="text-xs text-neutral-500 capitalize">{(m.message_type || '').replace(/_/g, ' ').replace('sms ', '')}</TableCell>
                    <TableCell className="text-xs text-neutral-500 max-w-[200px] truncate">{m.message_text?.substring(0, 80)}</TableCell>
                    <TableCell>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${m.status === 'delivered' ? 'bg-emerald-50 text-emerald-600' : m.status === 'failed' ? 'bg-rose-50 text-rose-600' : 'bg-neutral-100 text-neutral-500'}`}>{m.status}</span>
                    </TableCell>
                    <TableCell className="text-[10px] text-neutral-400">{m.sent_at ? new Date(m.sent_at).toLocaleString() : ''}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Bulk Confirm Dialog */}
      <Dialog open={!!confirmBulk} onOpenChange={() => setConfirmBulk(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle style={{ fontFamily: 'Outfit' }}>Confirm Bulk Send</DialogTitle></DialogHeader>
          <div className="flex items-center gap-3 py-2">
            <AlertCircle className="w-10 h-10 text-amber-500 shrink-0" />
            <p className="text-sm text-neutral-600">
              Send {confirmBulk?.type === 'sms' ? 'SMS' : 'WhatsApp'} to <strong>{confirmBulk?.count}</strong> customers. Confirm?
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmBulk(null)}>Cancel</Button>
            <Button
              data-testid="confirm-bulk-send-btn"
              onClick={confirmBulk?.type === 'sms' ? handleSmsBulkSend : handleWaBulkSend}
              disabled={sending}
              style={{ backgroundColor: confirmBulk?.type === 'whatsapp' ? '#25D366' : 'var(--brand-primary)' }}
            >
              {sending ? 'Sending...' : 'Confirm Send'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
