import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { PlusCircle, Grid3X3, MapPin, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

export default function LayoutsPage() {
  const [layouts, setLayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
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

  return (
    <div data-testid="layouts-page" className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-neutral-900 tracking-tight" style={{ fontFamily: 'Outfit' }}>Plot Layouts</h1>
          <p className="text-sm text-neutral-500 mt-0.5">Manage property layouts and plot configurations</p>
        </div>
        <Button data-testid="create-layout-btn" onClick={() => setShowCreate(true)} style={{ backgroundColor: 'var(--brand-primary)' }}>
          <PlusCircle className="w-4 h-4 mr-1.5" /> New Layout
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
              className="bg-white border border-neutral-200 rounded-lg p-5 cursor-pointer hover:shadow-sm transition-all duration-200 hover:-translate-y-[1px]"
              onClick={() => navigate(`/layouts/${l.id}`)}
            >
              <div className="flex items-start justify-between mb-4">
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
    </div>
  );
}
