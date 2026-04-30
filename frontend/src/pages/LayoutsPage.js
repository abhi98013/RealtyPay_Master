import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { PlusCircle, Grid3X3, ChevronRight, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

export default function LayoutsPage() {
  const [layouts, setLayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editingLayout, setEditingLayout] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    api.get('/layouts').then(r => setLayouts(r.data)).catch(() => toast.error('Failed to load layouts')).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Layout name is required'); return; }
    setSaving(true);
    try {
      await api.post('/layouts', form);
      toast.success('Layout created');
      setShowCreate(false);
      setForm({ name: '', description: '' });
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create');
    }
    setSaving(false);
  };

  const openEdit = (l, e) => {
    e.stopPropagation();
    setEditingLayout(l);
    setForm({ name: l.name, description: l.description || '' });
    setShowEdit(true);
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    if (!editingLayout) return;
    setSaving(true);
    try {
      await api.put(`/layouts/${editingLayout.id}`, form);
      toast.success('Layout updated');
      setShowEdit(false);
      setEditingLayout(null);
      setForm({ name: '', description: '' });
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update');
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setSaving(true);
    try {
      await api.delete(`/layouts/${deleteConfirm.id}`);
      toast.success('Layout deleted');
      setDeleteConfirm(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete');
    }
    setSaving(false);
  };

  return (
    <div data-testid="layouts-page" className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-neutral-900 tracking-tight" style={{ fontFamily: 'Outfit' }}>Plot Layouts</h1>
          <p className="text-sm text-neutral-500 mt-0.5">Manage property layouts and plot configurations</p>
        </div>
        <Button data-testid="create-layout-btn" onClick={() => { setForm({ name: '', description: '' }); setShowCreate(true); }} style={{ backgroundColor: 'var(--brand-primary)' }}>
          <PlusCircle className="w-4 h-4 mr-1.5" /> Add New Layout
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="h-44 bg-neutral-100 rounded-lg animate-pulse" />)}
        </div>
      ) : layouts.length === 0 ? (
        <div className="text-center py-20">
          <Grid3X3 className="w-12 h-12 mx-auto mb-3 text-neutral-300" />
          <p className="text-neutral-500">No layouts yet. Create your first layout.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {layouts.map(l => (
            <div
              key={l.id}
              data-testid={`layout-card-${l.id}`}
              className="bg-white border border-neutral-200 rounded-lg p-5 cursor-pointer hover:shadow-sm transition-all duration-200 hover:-translate-y-[1px] relative group"
              onClick={() => navigate(`/layouts/${l.id}`)}
            >
              {/* Edit/Delete buttons */}
              <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                <Button data-testid={`edit-layout-${l.id}`} variant="ghost" size="icon" className="h-7 w-7 hover:bg-blue-50 hover:text-blue-600" onClick={(e) => openEdit(l, e)}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button data-testid={`delete-layout-${l.id}`} variant="ghost" size="icon" className="h-7 w-7 hover:bg-red-50 hover:text-red-600" onClick={(e) => { e.stopPropagation(); setDeleteConfirm(l); }}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>

              <div className="flex items-start justify-between mb-4 pr-16">
                <div>
                  <h3 className="text-base font-semibold text-neutral-900" style={{ fontFamily: 'Outfit' }}>{l.name}</h3>
                  {l.description && <p className="text-xs text-neutral-400 mt-0.5">{l.description}</p>}
                </div>
                <ChevronRight className="w-4 h-4 text-neutral-300 shrink-0" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-emerald-50 rounded-lg p-2.5 text-center">
                  <p className="text-lg font-semibold font-mono text-emerald-700">{l.available_count || 0}</p>
                  <p className="text-[9px] uppercase tracking-wider text-emerald-500 font-medium">Available</p>
                </div>
                <div className="bg-rose-50 rounded-lg p-2.5 text-center">
                  <p className="text-lg font-semibold font-mono text-rose-700">{l.sold_count || 0}</p>
                  <p className="text-[9px] uppercase tracking-wider text-rose-500 font-medium">Sold</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-2.5 text-center">
                  <p className="text-lg font-semibold font-mono text-amber-700">{l.reserved_count || 0}</p>
                  <p className="text-[9px] uppercase tracking-wider text-amber-500 font-medium">Reserved</p>
                </div>
              </div>
              <p className="text-[10px] text-neutral-300 mt-3 font-mono">{l.plot_count || 0} total plots</p>
            </div>
          ))}
        </div>
      )}

      {/* Create Layout Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Outfit' }}>Create New Layout</DialogTitle>
            <DialogDescription>Add a new property layout to manage plots.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 mt-2">
            <div>
              <Label className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Layout Name</Label>
              <Input data-testid="layout-name-input" value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} placeholder="e.g., Sunrise Colony Phase 1" required className="mt-1" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Description</Label>
              <Input data-testid="layout-desc-input" value={form.description} onChange={e => setForm(p => ({...p, description: e.target.value}))} placeholder="Optional description" className="mt-1" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button data-testid="submit-layout-btn" type="submit" disabled={saving} style={{ backgroundColor: 'var(--brand-primary)' }}>
                {saving ? 'Creating...' : 'Create Layout'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Layout Dialog */}
      <Dialog open={showEdit} onOpenChange={(open) => { if (!open) { setShowEdit(false); setEditingLayout(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Outfit' }}>Edit Layout</DialogTitle>
            <DialogDescription>Update layout name and description.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4 mt-2">
            <div>
              <Label className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Layout Name</Label>
              <Input data-testid="edit-layout-name" value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} required className="mt-1" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Description</Label>
              <Input data-testid="edit-layout-desc" value={form.description} onChange={e => setForm(p => ({...p, description: e.target.value}))} className="mt-1" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => { setShowEdit(false); setEditingLayout(null); }}>Cancel</Button>
              <Button data-testid="save-layout-btn" type="submit" disabled={saving} style={{ backgroundColor: 'var(--brand-primary)' }}>
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle style={{ fontFamily: 'Outfit' }}>Delete Layout</DialogTitle></DialogHeader>
          <div className="flex items-start gap-3 py-2">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-neutral-700">Delete <strong>{deleteConfirm?.name}</strong>?</p>
              <p className="text-xs text-neutral-500 mt-1">This will remove the layout, all plots, and uploaded maps. Cannot be undone.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button data-testid="confirm-delete-layout-btn" variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving ? 'Deleting...' : 'Delete Layout'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
