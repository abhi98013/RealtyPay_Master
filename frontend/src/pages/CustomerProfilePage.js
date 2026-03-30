import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Phone, Mail, Building, Calendar, IndianRupee, Send, FileText, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';

const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function StatusBadge({ status }) {
  const cls = {
    paid: 'status-paid', pending: 'status-pending',
    overdue: 'status-overdue', partial: 'status-partial', waived: 'status-waived'
  }[status] || 'status-pending';
  return <span className={cls}>{(status || 'pending').toUpperCase()}</span>;
}

export default function CustomerProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState('');

  useEffect(() => {
    api.get(`/customers/${id}`)
      .then(r => setCustomer(r.data))
      .catch(() => toast.error('Customer not found'))
      .finally(() => setLoading(false));
  }, [id]);

  const sendMessage = async (type) => {
    setSending(type);
    try {
      await api.post('/whatsapp/send', { customer_id: id, message_type: type });
      toast.success(`${type.replace('_', ' ')} message sent`);
      const r = await api.get(`/customers/${id}`);
      setCustomer(r.data);
    } catch {
      toast.error('Failed to send message');
    }
    setSending('');
  };

  const downloadAnnual = async () => {
    try {
      const year = new Date().getFullYear();
      const response = await api.get(`/reports/annual-pdf/${id}?year=${year}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `annual_statement_${year}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
      toast.success('Statement downloaded');
    } catch {
      toast.error('Failed to download statement');
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-neutral-400">Loading...</div>;
  if (!customer) return <div className="flex items-center justify-center h-64 text-neutral-400">Customer not found</div>;

  return (
    <div data-testid="customer-profile-page" className="space-y-6">
      <Button data-testid="back-btn" variant="ghost" className="text-neutral-500" onClick={() => navigate('/customers')}>
        <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Customers
      </Button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left - Profile */}
        <div className="bg-white border border-neutral-200 rounded-lg p-6 space-y-5">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-neutral-200 flex items-center justify-center text-xl font-semibold text-neutral-600">
              {customer.name[0].toUpperCase()}
            </div>
            <div>
              <h2 data-testid="customer-name" className="text-xl font-semibold text-neutral-900" style={{ fontFamily: 'Outfit' }}>{customer.name}</h2>
              <p className="text-xs text-neutral-400 font-mono">{customer.customer_id}</p>
            </div>
          </div>

          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2 text-neutral-600"><Phone className="w-4 h-4 text-neutral-400" /> {customer.phone}</div>
            {customer.email && <div className="flex items-center gap-2 text-neutral-600"><Mail className="w-4 h-4 text-neutral-400" /> {customer.email}</div>}
            <div className="flex items-center gap-2 text-neutral-600"><Building className="w-4 h-4 text-neutral-400" /> {customer.property_name} - {customer.unit_no}</div>
            <div className="flex items-center gap-2 text-neutral-600"><Calendar className="w-4 h-4 text-neutral-400" /> Due: {customer.due_date_day}th monthly</div>
          </div>

          <div className="border-t border-neutral-200 pt-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">Property Value</span>
              <span className="font-mono font-medium">Rs.{(customer.total_property_value || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">Monthly EMI</span>
              <span className="font-mono font-medium">Rs.{(customer.emi_amount || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">Total Paid</span>
              <span className="font-mono font-semibold text-emerald-600">Rs.{(customer.total_paid || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">Outstanding</span>
              <span className="font-mono font-semibold text-rose-600">Rs.{(customer.total_remaining || 0).toLocaleString()}</span>
            </div>
          </div>

          <div className="border-t border-neutral-200 pt-4 space-y-2">
            <p className="text-[10px] uppercase tracking-widest text-neutral-400 font-medium mb-2">Quick Actions</p>
            <Button data-testid="send-reminder-btn" variant="outline" size="sm" className="w-full justify-start" onClick={() => sendMessage('monthly_reminder')} disabled={!!sending}>
              <Send className="w-3 h-3 mr-2" /> Send Reminder
            </Button>
            <Button data-testid="request-balance-btn" variant="outline" size="sm" className="w-full justify-start" onClick={() => sendMessage('balance_request')} disabled={!!sending}>
              <IndianRupee className="w-3 h-3 mr-2" /> Request Balance
            </Button>
            <Button data-testid="annual-statement-btn" variant="outline" size="sm" className="w-full justify-start" onClick={downloadAnnual}>
              <FileText className="w-3 h-3 mr-2" /> Annual Statement
            </Button>
          </div>
        </div>

        {/* Right - Tabs */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="payments">
            <TabsList>
              <TabsTrigger data-testid="tab-payments" value="payments">Payment History</TabsTrigger>
              <TabsTrigger data-testid="tab-messages" value="messages">WhatsApp Logs</TabsTrigger>
            </TabsList>

            <TabsContent value="payments" className="mt-4">
              <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-neutral-50">
                      <TableHead className="text-[10px] uppercase tracking-wider font-medium text-neutral-500">Month</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider font-medium text-neutral-500 text-right">EMI</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider font-medium text-neutral-500 text-right">Paid</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider font-medium text-neutral-500 text-right">Remaining</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider font-medium text-neutral-500 text-right">Penalty</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider font-medium text-neutral-500">Mode</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider font-medium text-neutral-500">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(customer.payments || []).length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-8 text-neutral-400">No payments recorded</TableCell></TableRow>
                    ) : (customer.payments || []).map(p => (
                      <TableRow key={p.id} data-testid={`payment-row-${p.month}-${p.year}`}>
                        <TableCell className="text-sm">{MONTHS[p.month]} {p.year}</TableCell>
                        <TableCell className="text-right font-mono text-sm">Rs.{(p.emi_amount || 0).toLocaleString()}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-emerald-600">Rs.{(p.amount_paid || 0).toLocaleString()}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-rose-600">Rs.{(p.remaining || 0).toLocaleString()}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-amber-600">Rs.{(p.penalty_amount || 0).toLocaleString()}</TableCell>
                        <TableCell className="text-xs text-neutral-500 capitalize">{p.payment_mode || '-'}</TableCell>
                        <TableCell><StatusBadge status={p.status} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="messages" className="mt-4">
              <div className="bg-white border border-neutral-200 rounded-lg divide-y divide-neutral-100">
                {(customer.messages || []).length === 0 ? (
                  <div className="text-center py-12 text-neutral-400">
                    <MessageSquare className="w-8 h-8 mx-auto mb-2 text-neutral-300" />
                    <p className="text-sm">No messages sent yet</p>
                  </div>
                ) : (customer.messages || []).map(m => (
                  <div key={m.id} data-testid={`message-${m.id}`} className="p-4">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[10px] uppercase tracking-wider bg-neutral-100 text-neutral-500 px-2 py-0.5 rounded-full font-medium">
                        {m.message_type?.replace(/_/g, ' ')}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${m.status === 'delivered' ? 'bg-emerald-50 text-emerald-600' : m.status === 'failed' ? 'bg-rose-50 text-rose-600' : 'bg-neutral-100 text-neutral-500'}`}>
                        {m.status}
                      </span>
                      <span className="text-[10px] text-neutral-400 ml-auto">{m.sent_at ? new Date(m.sent_at).toLocaleString() : ''}</span>
                    </div>
                    <p className="text-sm text-neutral-600 whitespace-pre-line leading-relaxed">{m.message_text}</p>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
