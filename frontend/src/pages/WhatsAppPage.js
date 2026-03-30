import React, { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Send, MessageSquare, Users, Filter } from 'lucide-react';
import { toast } from 'sonner';

const MSG_TYPES = [
  { value: 'monthly_reminder', label: 'Monthly Reminder' },
  { value: 'overdue_alert', label: 'Overdue Alert' },
  { value: 'balance_request', label: 'Balance Request' },
  { value: 'payment_received', label: 'Payment Received' },
  { value: 'partial_payment', label: 'Partial Payment' },
  { value: 'annual_statement', label: 'Annual Statement' },
];

export default function WhatsAppPage() {
  const [customers, setCustomers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [msgType, setMsgType] = useState('monthly_reminder');
  const [filter, setFilter] = useState('all');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/customers'),
      api.get('/whatsapp/messages')
    ]).then(([cRes, mRes]) => {
      setCustomers(cRes.data);
      setMessages(mRes.data);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const selectAll = () => {
    const filtered = getFilteredCustomers();
    if (selectedIds.length === filtered.length) setSelectedIds([]);
    else setSelectedIds(filtered.map(c => c.id));
  };

  const getFilteredCustomers = () => {
    if (filter === 'all') return customers;
    // For overdue/pending filter, we'd need payment data
    return customers;
  };

  const handleBulkSend = async () => {
    if (selectedIds.length === 0) {
      toast.error('Select at least one customer');
      return;
    }
    setSending(true);
    try {
      const res = await api.post('/whatsapp/bulk-send', { customer_ids: selectedIds, message_type: msgType });
      toast.success(res.data.message);
      setSelectedIds([]);
      const mRes = await api.get('/whatsapp/messages');
      setMessages(mRes.data);
    } catch (err) {
      toast.error('Failed to send messages');
    }
    setSending(false);
  };

  const filteredCustomers = getFilteredCustomers();

  return (
    <div data-testid="whatsapp-page" className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-neutral-900 tracking-tight" style={{ fontFamily: 'Outfit' }}>WhatsApp Center</h1>
          <p className="text-sm text-neutral-500 mt-0.5">Send reminders and notifications via WhatsApp (MOCK)</p>
        </div>
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">
          <div className="w-2 h-2 bg-amber-400 rounded-full" />
          <span className="text-xs font-medium text-amber-700">MOCK MODE</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left - Customer Selection */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white border border-neutral-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <Select value={msgType} onValueChange={setMsgType}>
                  <SelectTrigger data-testid="msg-type-select" className="w-48">
                    <SelectValue placeholder="Message Type" />
                  </SelectTrigger>
                  <SelectContent>
                    {MSG_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button
                data-testid="bulk-send-btn"
                disabled={sending || selectedIds.length === 0}
                onClick={handleBulkSend}
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                <Send className="w-4 h-4 mr-1.5" />
                {sending ? 'Sending...' : `Send to ${selectedIds.length} selected`}
              </Button>
            </div>

            <Table>
              <TableHeader>
                <TableRow className="bg-neutral-50">
                  <TableHead className="w-10">
                    <Checkbox
                      data-testid="select-all-checkbox"
                      checked={selectedIds.length > 0 && selectedIds.length === filteredCustomers.length}
                      onCheckedChange={selectAll}
                    />
                  </TableHead>
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
                  <TableRow key={c.id} data-testid={`whatsapp-customer-${c.customer_id}`}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.includes(c.id)}
                        onCheckedChange={() => toggleSelect(c.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-medium text-neutral-900">{c.name}</p>
                      <p className="text-[10px] text-neutral-400 font-mono">{c.customer_id}</p>
                    </TableCell>
                    <TableCell className="text-sm text-neutral-600">{c.phone}</TableCell>
                    <TableCell className="text-sm text-neutral-600">{c.property_name}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Right - Message Log */}
        <div className="lg:col-span-2">
          <div className="bg-white border border-neutral-200 rounded-lg">
            <div className="p-4 border-b border-neutral-200">
              <h3 className="text-sm font-semibold text-neutral-900" style={{ fontFamily: 'Outfit' }}>
                <MessageSquare className="w-4 h-4 inline mr-1.5 text-neutral-400" />
                Recent Messages
              </h3>
            </div>
            <div className="max-h-[500px] overflow-y-auto divide-y divide-neutral-100">
              {messages.length === 0 ? (
                <div className="text-center py-12 text-neutral-400">
                  <Send className="w-8 h-8 mx-auto mb-2 text-neutral-300" />
                  <p className="text-sm">No messages sent yet</p>
                </div>
              ) : messages.slice(0, 20).map(m => (
                <div key={m.id} className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-neutral-700">{m.customer_name}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${m.status === 'delivered' ? 'bg-emerald-50 text-emerald-600' : 'bg-neutral-100 text-neutral-500'}`}>
                      {m.status}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-500 truncate">{m.message_text?.substring(0, 100)}...</p>
                  <p className="text-[9px] text-neutral-300 mt-1">{m.sent_at ? new Date(m.sent_at).toLocaleString() : ''}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
