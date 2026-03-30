import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { UserPlus, Search, Phone, Mail, Building, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

const emptyCustomer = {
  name: '', phone: '', email: '', property_name: '', unit_no: '',
  total_property_value: '', emi_amount: '', agreement_start_date: '', due_date_day: 5
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ ...emptyCustomer });
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    api.get('/customers', { params: { search } })
      .then(r => setCustomers(r.data))
      .catch(e => toast.error('Failed to load customers'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [search]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        total_property_value: parseFloat(form.total_property_value) || 0,
        emi_amount: parseFloat(form.emi_amount) || 0,
        due_date_day: parseInt(form.due_date_day) || 5,
      };
      await api.post('/customers', payload);
      toast.success('Customer added successfully');
      setShowAdd(false);
      setForm({ ...emptyCustomer });
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to add customer');
    }
    setSaving(false);
  };

  const updateField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  return (
    <div data-testid="customers-page" className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-neutral-900 tracking-tight" style={{ fontFamily: 'Outfit' }}>Customers</h1>
          <p className="text-sm text-neutral-500 mt-0.5">{customers.length} registered customers</p>
        </div>
        <Button data-testid="add-customer-btn" onClick={() => setShowAdd(true)} style={{ backgroundColor: 'var(--brand-primary)' }}>
          <UserPlus className="w-4 h-4 mr-1.5" /> Add Customer
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
        <Input
          data-testid="customer-search"
          className="pl-10"
          placeholder="Search by name, phone, or ID..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-neutral-50">
              <TableHead className="text-[10px] uppercase tracking-wider font-medium text-neutral-500">Customer</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider font-medium text-neutral-500">Property</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider font-medium text-neutral-500 text-right">EMI</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider font-medium text-neutral-500">Due Date</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider font-medium text-neutral-500">Contact</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-12 text-neutral-400">Loading...</TableCell></TableRow>
            ) : customers.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-12 text-neutral-400">No customers found. Add your first customer.</TableCell></TableRow>
            ) : customers.map(c => (
              <TableRow
                key={c.id}
                data-testid={`customer-row-${c.customer_id}`}
                className="cursor-pointer hover:bg-neutral-50/50"
                onClick={() => navigate(`/customers/${c.id}`)}
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-neutral-200 flex items-center justify-center text-xs font-semibold text-neutral-600">
                      {(c.name || '?')[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-neutral-900">{c.name}</p>
                      <p className="text-[10px] text-neutral-400 font-mono">{c.customer_id}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <p className="text-sm text-neutral-700">{c.property_name}</p>
                  <p className="text-xs text-neutral-400">Unit {c.unit_no}</p>
                </TableCell>
                <TableCell className="text-right">
                  <span className="font-mono text-sm font-medium text-neutral-900">Rs.{(c.emi_amount || 0).toLocaleString()}</span>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-neutral-600">{c.due_date_day}th of month</span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2 text-neutral-400">
                    <Phone className="w-3 h-3" />
                    <span className="text-xs">{c.phone}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <ChevronRight className="w-4 h-4 text-neutral-300" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Add Customer Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Outfit' }}>Add New Customer</DialogTitle>
            <DialogDescription>Enter customer and property details to create a profile.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Full Name</Label>
                <Input data-testid="input-customer-name" value={form.name} onChange={e => updateField('name', e.target.value)} required className="mt-1" placeholder="Ramesh Patil" />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Phone (WhatsApp)</Label>
                <Input data-testid="input-customer-phone" value={form.phone} onChange={e => updateField('phone', e.target.value)} required className="mt-1" placeholder="+919876543210" />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Email</Label>
                <Input data-testid="input-customer-email" type="email" value={form.email} onChange={e => updateField('email', e.target.value)} className="mt-1" placeholder="email@example.com" />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Property Name</Label>
                <Input data-testid="input-property-name" value={form.property_name} onChange={e => updateField('property_name', e.target.value)} required className="mt-1" placeholder="Sunrise Towers" />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Unit No.</Label>
                <Input data-testid="input-unit-no" value={form.unit_no} onChange={e => updateField('unit_no', e.target.value)} required className="mt-1" placeholder="4B" />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Total Property Value</Label>
                <Input data-testid="input-total-value" type="number" value={form.total_property_value} onChange={e => updateField('total_property_value', e.target.value)} required className="mt-1" placeholder="3000000" />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider text-neutral-500 font-medium">EMI Amount (Monthly)</Label>
                <Input data-testid="input-emi-amount" type="number" value={form.emi_amount} onChange={e => updateField('emi_amount', e.target.value)} required className="mt-1" placeholder="25000" />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Agreement Start Date</Label>
                <Input data-testid="input-start-date" type="date" value={form.agreement_start_date} onChange={e => updateField('agreement_start_date', e.target.value)} required className="mt-1" />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Due Date (Day of Month)</Label>
                <Input data-testid="input-due-day" type="number" min={1} max={28} value={form.due_date_day} onChange={e => updateField('due_date_day', e.target.value)} className="mt-1" placeholder="5" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button data-testid="submit-customer-btn" type="submit" disabled={saving} style={{ backgroundColor: 'var(--brand-primary)' }}>
                {saving ? 'Saving...' : 'Add Customer'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
