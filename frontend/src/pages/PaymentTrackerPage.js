import React, { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FULL_MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function CellBadge({ status }) {
  if (!status) return <span className="text-xs text-neutral-300">-</span>;
  const map = {
    paid: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'PAID' },
    pending: { bg: 'bg-neutral-100', text: 'text-neutral-500', label: 'PENDING' },
    overdue: { bg: 'bg-rose-100', text: 'text-rose-700', label: 'OVERDUE' },
    partial: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'PARTIAL' },
    waived: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'WAIVED' },
  };
  const s = map[status] || map.pending;
  return <span className={`${s.bg} ${s.text} px-2 py-1 rounded text-[10px] font-semibold tracking-wider`}>{s.label}</span>;
}

export default function PaymentTrackerPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [matrix, setMatrix] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedCell, setSelectedCell] = useState(null);
  const [payForm, setPayForm] = useState({ amount: '', mode: 'upi', reference: '' });
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/payments/matrix', { params: { year } })
      .then(r => setMatrix(r.data))
      .catch(e => toast.error('Failed to load payment matrix'))
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [year]);

  const openPaySheet = (customer, month, payment) => {
    setSelectedCell({ customer, month, payment });
    setPayForm({ amount: '', mode: 'upi', reference: '' });
    setSheetOpen(true);
  };

  const handlePay = async (status = 'paid') => {
    if (!selectedCell) return;
    setSaving(true);
    try {
      const amount = parseFloat(payForm.amount);
      if (isNaN(amount) || amount <= 0) {
        toast.error('Enter a valid amount');
        setSaving(false);
        return;
      }
      const res = await api.post('/payments/record', {
        customer_id: selectedCell.customer.id,
        month: selectedCell.month,
        year,
        amount_paid: amount,
        payment_mode: payForm.mode,
        reference_number: payForm.reference,
        status: amount >= (selectedCell.customer.emi_amount || 0) ? 'paid' : 'partial'
      });
      toast.success('Payment recorded');
      if (res.data?.sms_sent) {
        toast.success('SMS confirmation sent to customer');
      } else if (res.data?.sms_sent === false) {
        toast.info('Payment saved. SMS delivery pending.');
      }
      setSheetOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to record payment');
    }
    setSaving(false);
  };

  const handleWaive = async () => {
    if (!selectedCell?.payment?.id) return;
    setSaving(true);
    try {
      await api.put(`/payments/${selectedCell.payment.id}/waive`);
      toast.success('Payment waived');
      setSheetOpen(false);
      load();
    } catch (err) {
      toast.error('Failed to waive');
    }
    setSaving(false);
  };

  return (
    <div data-testid="payment-tracker-page" className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-neutral-900 tracking-tight" style={{ fontFamily: 'Outfit' }}>Payment Tracker</h1>
          <p className="text-sm text-neutral-500 mt-0.5">Month-wise payment matrix for {year}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setYear(y => y - 1)} data-testid="prev-year-btn">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span data-testid="year-display" className="text-lg font-semibold font-mono text-neutral-900 px-3">{year}</span>
          <Button variant="outline" size="icon" onClick={() => setYear(y => y + 1)} data-testid="next-year-btn">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-neutral-50">
                <TableHead className="sticky left-0 bg-neutral-50 z-10 text-[10px] uppercase tracking-wider font-medium text-neutral-500 min-w-[180px]">Customer / Property</TableHead>
                {MONTHS.slice(1).map((m, i) => (
                  <TableHead key={i+1} className="text-center text-[10px] uppercase tracking-wider font-medium text-neutral-500 min-w-[80px]">{m}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={13} className="text-center py-12 text-neutral-400">Loading matrix...</TableCell></TableRow>
              ) : !matrix || (matrix.customers || []).length === 0 ? (
                <TableRow><TableCell colSpan={13} className="text-center py-12 text-neutral-400">No customers found. Add customers first.</TableCell></TableRow>
              ) : (matrix.customers || []).map(c => {
                const cPayments = matrix.matrix[c.id] || {};
                return (
                  <TableRow key={c.id} data-testid={`matrix-row-${c.customer_id}`}>
                    <TableCell className="sticky left-0 bg-white z-10 border-r border-neutral-100">
                      <p className="text-sm font-medium text-neutral-900 truncate max-w-[160px]">{c.name}</p>
                      <p className="text-[10px] text-neutral-400">{c.property_name} - {c.unit_no}</p>
                    </TableCell>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(month => {
                      const payment = cPayments[month];
                      return (
                        <TableCell
                          key={month}
                          data-testid={`matrix-cell-${c.customer_id}-${month}`}
                          className="text-center cursor-pointer hover:bg-neutral-50 transition-colors p-1.5"
                          onClick={() => openPaySheet(c, month, payment)}
                        >
                          <CellBadge status={payment?.status} />
                          {payment?.amount_paid > 0 && payment?.status !== 'paid' && (
                            <p className="text-[9px] font-mono text-neutral-400 mt-0.5">Rs.{payment.amount_paid.toLocaleString()}</p>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Payment Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle style={{ fontFamily: 'Outfit' }}>Record Payment</SheetTitle>
            <SheetDescription>
              {selectedCell ? `${selectedCell.customer.name} · ${FULL_MONTHS[selectedCell.month]} ${year}` : ''}
            </SheetDescription>
          </SheetHeader>

          {selectedCell && (
            <div className="mt-6 space-y-5">
              <div className="bg-neutral-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm"><span className="text-neutral-500">Property</span><span className="font-medium">{selectedCell.customer.property_name} - {selectedCell.customer.unit_no}</span></div>
                <div className="flex justify-between text-sm"><span className="text-neutral-500">EMI Amount</span><span className="font-mono font-medium">Rs.{(selectedCell.customer.emi_amount || 0).toLocaleString()}</span></div>
                <div className="flex justify-between text-sm"><span className="text-neutral-500">Status</span><CellBadge status={selectedCell.payment?.status} /></div>
                {selectedCell.payment?.amount_paid > 0 && (
                  <div className="flex justify-between text-sm"><span className="text-neutral-500">Already Paid</span><span className="font-mono text-emerald-600">Rs.{selectedCell.payment.amount_paid.toLocaleString()}</span></div>
                )}
                {selectedCell.payment?.remaining > 0 && (
                  <div className="flex justify-between text-sm"><span className="text-neutral-500">Remaining</span><span className="font-mono text-rose-600">Rs.{selectedCell.payment.remaining.toLocaleString()}</span></div>
                )}
                {selectedCell.payment?.penalty_amount > 0 && (
                  <div className="flex justify-between text-sm"><span className="text-neutral-500">Penalty</span><span className="font-mono text-amber-600">Rs.{selectedCell.payment.penalty_amount.toLocaleString()}</span></div>
                )}
              </div>

              {selectedCell.payment?.status !== 'paid' && selectedCell.payment?.status !== 'waived' && (
                <div className="space-y-4">
                  <div>
                    <Label className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Amount</Label>
                    <Input
                      data-testid="payment-amount-input"
                      type="number"
                      placeholder={`Max Rs.${(selectedCell.payment?.remaining || selectedCell.customer.emi_amount || 0).toLocaleString()}`}
                      value={payForm.amount}
                      onChange={e => setPayForm(p => ({ ...p, amount: e.target.value }))}
                      className="mt-1 font-mono"
                    />
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Payment Mode</Label>
                    <Select value={payForm.mode} onValueChange={v => setPayForm(p => ({ ...p, mode: v }))}>
                      <SelectTrigger data-testid="payment-mode-select" className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="upi">UPI</SelectItem>
                        <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="cheque">Cheque</SelectItem>
                        <SelectItem value="online">Online</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Reference Number</Label>
                    <Input
                      data-testid="payment-reference-input"
                      placeholder="Transaction ID or reference"
                      value={payForm.reference}
                      onChange={e => setPayForm(p => ({ ...p, reference: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button data-testid="record-payment-btn" className="flex-1" onClick={() => handlePay()} disabled={saving} style={{ backgroundColor: 'var(--brand-primary)' }}>
                      {saving ? 'Recording...' : 'Record Payment'}
                    </Button>
                    <Button data-testid="waive-payment-btn" variant="outline" onClick={handleWaive} disabled={saving || !selectedCell.payment?.id}>
                      Waive
                    </Button>
                  </div>
                </div>
              )}

              {(selectedCell.payment?.status === 'paid' || selectedCell.payment?.status === 'waived') && (
                <div className="text-center py-6">
                  <p className="text-sm text-neutral-500">This payment is already {selectedCell.payment.status}.</p>
                  {selectedCell.payment?.payment_mode && <p className="text-xs text-neutral-400 mt-1">Mode: {selectedCell.payment.payment_mode} · Ref: {selectedCell.payment.reference_number || 'N/A'}</p>}
                  }
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
