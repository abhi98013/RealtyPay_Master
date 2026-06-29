import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { UserPlus, Search, Phone, ChevronRight, MoveHorizontal as MoreHorizontal, Pencil, Trash2, Eye, TriangleAlert as AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const emptyCustomer = {
  name: '', phone: '', email: '', property_name: '', unit_no: '',
  total_property_value: '', emi_amount: '', agreement_start_date: '', due_date_day: 5, tenure_months: 12
};

function CustomerForm({ form, updateField, onSubmit, saving, submitLabel, onCancel }) {
  return (
    <form onSubmit={onSubmit} className="space-y-4 mt-2">
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
          <Input data-testid="input-due-day" type="number" min={1} max={31} value={form.due_date_day} onChange={e => updateField('due_date_day', e.target.value)} className="mt-1" placeholder="5" />
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Tenure (Months)</Label>
          <Input data-testid="input-tenure" type="number" min={1} max={60} value={form.tenure_months} onChange={e => updateField('tenure_months', e.target.value)} className="mt-1" placeholder="12" />
          <p className="text-[10px] text-neutral-400 mt-0.5">1 to 60 months (5 years max)</p>
        </div>
      </div>
      {form.agreement_start_date && form.tenure_months > 0 && (
        <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3 text-sm">
          <span className="text-neutral-500">Final Due Date: </span>
          <span className="font-mono font-medium text-neutral-800">
            {(() => {
              try {
                const start = new Date(form.agreement_start_date);
                const end = new Date(start);
                end.setMonth(end.getMonth() + parseInt(form.tenure_months || 12));
                return end.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
              } catch { return '-'; }
            })()}
          </span>
          <span className="text-neutral-400 ml-2">({form.tenure_months} installments)</span>
        </div>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button data-testid="submit-customer-btn" type="submit" disabled={saving} style={{ backgroundColor: 'var(--brand-primary)' }}>
          {saving ? 'Saving...' : submitLabel}
        </Button>
      </div>
    </form>
  );
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [form, setForm] = useState({ ...emptyCustomer });
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    api.get('/customers', { params: { search } })
      .then(r => setCustomers(r.data))
      .catch(() => toast.error('Failed to load customers'))
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [search]);

  const updateField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const buildPayload = () => ({
    ...form,
    total_property_value: parseFloat(form.total_property_value) || 0,
    emi_amount: parseFloat(form.emi_amount) || 0,
    due_date_day: parseInt(form.due_date_day) || 5,
    tenure_months: parseInt(form.tenure_months) || 12,
  });

  // ── Add ──
  const handleAdd = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/customers', buildPayload());
      toast.success('Customer added successfully');
      setShowAdd(false);
      setForm({ ...emptyCustomer });
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to add customer');
    }
    setSaving(false);
  };

  // ── Edit ──
  const openEdit = (c) => {
    setEditingCustomer(c);
    setForm({
      name: c.name || '', phone: c.phone || '', email: c.email || '',
      property_name: c.property_name || '', unit_no: c.unit_no || '',
      total_property_value: c.total_property_value || '',
      emi_amount: c.emi_amount || '',
      agreement_start_date: c.agreement_start_date || '',
      due_date_day: c.due_date_day || 5,
      tenure_months: c.tenure_months || 12,
    });
    setShowEdit(true);
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    if (!editingCustomer) return;
    setSaving(true);
    try {
      await api.put(`/customers/${editingCustomer.id}`, buildPayload());
      toast.success('Customer updated successfully');
      setShowEdit(false);
      setEditingCustomer(null);
      setForm({ ...emptyCustomer });
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update customer');
    }
    setSaving(false);
  };

  // ── Delete ──
  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setSaving(true);
    try {
      await api.delete(`/customers/${deleteConfirm.id}`);
      toast.success(`${deleteConfirm.name} deleted`);
      setDeleteConfirm(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete customer');
    }
    setSaving(false);
  };

  return (
    <div data-testid="customers-page" className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-neutral-900 tracking-tight" style={{ fontFamily: 'Outfit' }}>Customers</h1>
          <p className="text-sm text-neutral-500 mt-0.5">{customers.length} registered customers</p>
        </div>
        <Button data-testid="add-customer-btn" onClick={() => { setForm({ ...emptyCustomer }); setShowAdd(true); }} style={{ backgroundColor: 'var(--brand-primary)' }}>
          <UserPlus className="w-4 h-4 mr-1.5" /> Add Customer
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
        <Input data-testid="customer-search" className="pl-10" placeholder="Search by name, phone, or ID..." value={search} onChange={e => setSearch(e.target.value)} />
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
              <TableHead className="text-[10px] uppercase tracking-wider font-medium text-neutral-500 w-16">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-12 text-neutral-400">Loading...</TableCell></TableRow>
            ) : customers.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-12 text-neutral-400">No customers found. Add your first customer.</TableCell></TableRow>
            ) : customers.map(c => (
              <TableRow key={c.id} data-testid={`customer-row-${c.customer_id}`} className="hover:bg-neutral-50/50">
                <TableCell className="cursor-pointer" onClick={() => navigate(`/customers/${c.id}`)}>
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
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button data-testid={`customer-actions-${c.customer_id}`} variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
                        <MoreHorizontal className="w-4 h-4 text-neutral-400" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem data-testid={`view-customer-${c.customer_id}`} onClick={() => navigate(`/customers/${c.id}`)}>
                        <Eye className="w-3.5 h-3.5 mr-2" /> View Profile
                      </DropdownMenuItem>
                      <DropdownMenuItem data-testid={`edit-customer-${c.customer_id}`} onClick={() => openEdit(c)}>
                        <Pencil className="w-3.5 h-3.5 mr-2" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem data-testid={`delete-customer-${c.customer_id}`} className="text-red-600 focus:text-red-600" onClick={() => setDeleteConfirm(c)}>
                        <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
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
          <CustomerForm form={form} updateField={updateField} onSubmit={handleAdd} saving={saving} submitLabel="Add Customer" onCancel={() => setShowAdd(false)} />
        </DialogContent>
      </Dialog>

      {/* Edit Customer Dialog */}
      <Dialog open={showEdit} onOpenChange={(open) => { if (!open) { setShowEdit(false); setEditingCustomer(null); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Outfit' }}>Edit Customer</DialogTitle>
            <DialogDescription>Update {editingCustomer?.name}'s details. Changes to EMI amount won't affect existing payment records.</DialogDescription>
          </DialogHeader>
          <CustomerForm form={form} updateField={updateField} onSubmit={handleEdit} saving={saving} submitLabel="Save Changes" onCancel={() => { setShowEdit(false); setEditingCustomer(null); }} />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Outfit' }}>Delete Customer</DialogTitle>
          </DialogHeader>
          <div className="flex items-start gap-3 py-2">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-neutral-700">
                Are you sure you want to delete <strong>{deleteConfirm?.name}</strong> ({deleteConfirm?.customer_id})?
              </p>
              <p className="text-xs text-neutral-500 mt-1">This will also remove all associated payments and messages. This action cannot be undone.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button data-testid="confirm-delete-customer-btn" variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving ? 'Deleting...' : 'Delete Customer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
