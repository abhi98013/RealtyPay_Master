import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api, { API_URL } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ArrowLeft, PlusCircle, Upload, Download, ZoomIn, ZoomOut,
  Trash2, FileText, IndianRupee, MapPin, Pencil, Eye, X
} from 'lucide-react';
import { toast } from 'sonner';

const emptyPlot = { plot_number: '', area: '', plot_type: 'residential', price_per_sqft: '', status: 'available' };

function PlotTile({ plot, onClick }) {
  const colorMap = {
    available: 'bg-emerald-500 hover:bg-emerald-600',
    sold: 'bg-rose-500 hover:bg-rose-600',
    reserved: 'bg-amber-400 hover:bg-amber-500',
  };
  const bg = colorMap[plot.status] || colorMap.available;
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            data-testid={`plot-tile-${plot.plot_number}`}
            className={`${bg} text-white rounded-lg p-2.5 text-center transition-all duration-200 hover:-translate-y-[1px] hover:shadow-md cursor-pointer min-w-[80px]`}
            onClick={() => onClick(plot)}
          >
            <p className="text-xs font-bold truncate">{plot.plot_number}</p>
            <p className="text-[9px] opacity-80 font-mono">{plot.area} sqft</p>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="bg-neutral-900 text-white border-none p-3 max-w-xs">
          <div className="space-y-1">
            <p className="font-semibold text-sm">Plot {plot.plot_number}</p>
            <p className="text-xs text-neutral-300">Area: {plot.area} sq.ft | Type: {plot.plot_type}</p>
            <p className="text-xs text-neutral-300">Rs.{plot.price_per_sqft}/sqft</p>
            <p className="text-xs font-mono font-semibold">Total: Rs.{(plot.total_price || 0).toLocaleString()}</p>
            <p className={`text-xs font-semibold ${plot.status === 'available' ? 'text-emerald-400' : plot.status === 'sold' ? 'text-rose-400' : 'text-amber-400'}`}>
              {plot.status.toUpperCase()}
            </p>
            {plot.customer_name && <p className="text-xs text-neutral-400">Customer: {plot.customer_name}</p>}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function LayoutDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [layout, setLayout] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAddPlot, setShowAddPlot] = useState(false);
  const [showEditPlot, setShowEditPlot] = useState(false);
  const [editingPlot, setEditingPlot] = useState(null);
  const [plotForm, setPlotForm] = useState({ ...emptyPlot });
  const [saving, setSaving] = useState(false);
  const [selectedPlot, setSelectedPlot] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [viewingMap, setViewingMap] = useState(null);
  const [viewerZoom, setViewerZoom] = useState(1);
  const [customers, setCustomers] = useState([]);
  const [payForm, setPayForm] = useState({ amount: '', payment_date: '', payment_mode: 'upi', cheque_number: '', reference_number: '', notes: '' });
  const [plotPayments, setPlotPayments] = useState([]);
  const [plotStats, setPlotStats] = useState({ total_paid: 0, remaining_balance: 0 });

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([api.get(`/layouts/${id}`), api.get('/customers')])
      .then(([lr, cr]) => { setLayout(lr.data); setCustomers(cr.data); })
      .catch(() => toast.error('Failed to load layout'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const loadPlotDetails = async (plot) => {
    try {
      const r = await api.get(`/plots/${plot.id}`);
      setPlotPayments(r.data.payments || []);
      setPlotStats({ total_paid: r.data.total_paid, remaining_balance: r.data.remaining_balance });
    } catch { setPlotPayments([]); setPlotStats({ total_paid: 0, remaining_balance: 0 }); }
  };

  // ── Add Plot ──
  const handleAddPlot = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/plots', {
        layout_id: id, plot_number: plotForm.plot_number,
        area: parseFloat(plotForm.area),
        plot_type: plotForm.plot_type, price_per_sqft: parseFloat(plotForm.price_per_sqft),
        status: plotForm.status
      });
      toast.success('Plot added');
      setShowAddPlot(false);
      setPlotForm({ ...emptyPlot });
      load();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to add plot'); }
    setSaving(false);
  };

  // ── Edit Plot (from list/canvas) ──
  const openEditPlot = (plot, e) => {
    if (e) e.stopPropagation();
    setEditingPlot(plot);
    setPlotForm({
      plot_number: plot.plot_number, area: plot.area || '',
      plot_type: plot.plot_type || 'residential', price_per_sqft: plot.price_per_sqft || '',
      status: plot.status || 'available'
    });
    setShowEditPlot(true);
  };

  const handleEditPlot = async (e) => {
    e.preventDefault();
    if (!editingPlot) return;
    setSaving(true);
    try {
      await api.put(`/plots/${editingPlot.id}`, {
        plot_number: plotForm.plot_number,
        area: parseFloat(plotForm.area) || 0,
        plot_type: plotForm.plot_type,
        price_per_sqft: parseFloat(plotForm.price_per_sqft) || 0,
        status: plotForm.status,
      });
      toast.success('Plot updated');
      setShowEditPlot(false);
      setEditingPlot(null);
      setPlotForm({ ...emptyPlot });
      load();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to update plot'); }
    setSaving(false);
  };

  // ── Plot Detail Sheet (click tile) ──
  const openPlotSheet = (plot) => {
    setSelectedPlot(plot);
    setEditForm({
      status: plot.status, customer_id: plot.customer_id || '', customer_name: plot.customer_name || '',
      booking_date: plot.booking_date || '', agreement_date: plot.agreement_date || ''
    });
    setPayForm({ amount: '', payment_date: new Date().toISOString().split('T')[0], payment_mode: 'upi', cheque_number: '', reference_number: '', notes: '' });
    loadPlotDetails(plot);
    setSheetOpen(true);
  };

  const handleStatusChange = (newStatus) => {
    if (selectedPlot?.status === 'sold' && newStatus !== 'sold') {
      setConfirmDialog({ message: `Change plot ${selectedPlot.plot_number} from SOLD to ${newStatus.toUpperCase()}?`, onConfirm: () => { setEditForm(p => ({ ...p, status: newStatus })); setConfirmDialog(null); } });
    } else {
      setEditForm(p => ({ ...p, status: newStatus }));
    }
  };

  const handleDeletePlot = async (plot) => {
    try {
      await api.delete(`/plots/${plot.id}`);
      toast.success(`Plot ${plot.plot_number} deleted`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete plot');
    }
  };

  const handleUpdatePlotSheet = async () => {
    if (!selectedPlot) return;
    setSaving(true);
    try {
      await api.put(`/plots/${selectedPlot.id}`, editForm);
      toast.success('Plot updated');
      setSheetOpen(false);
      load();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to update'); }
    setSaving(false);
  };

  const handleRecordPayment = async () => {
    if (!selectedPlot) return;
    const amount = parseFloat(payForm.amount);
    if (!amount || amount <= 0) { toast.error('Enter a valid amount'); return; }
    if (!payForm.payment_date) { toast.error('Payment date required'); return; }
    setSaving(true);
    try {
      await api.post('/plot-payments', { plot_id: selectedPlot.id, amount, ...payForm });
      toast.success('Payment recorded');
      setPayForm({ amount: '', payment_date: new Date().toISOString().split('T')[0], payment_mode: 'upi', cheque_number: '', reference_number: '', notes: '' });
      await loadPlotDetails(selectedPlot);
      load();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to record payment'); }
    setSaving(false);
  };

  // ── Map functions ──
  const handleUploadMap = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ['image/png', 'image/jpeg', 'image/svg+xml', 'application/pdf'];
    if (!allowed.includes(file.type)) { toast.error('Invalid file type. Only PDF, JPG, PNG, SVG allowed.'); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error('File size exceeds 10MB limit'); return; }
    setUploading(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      await api.post(`/layouts/${id}/maps`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Map uploaded');
      load();
    } catch (err) { toast.error(err.response?.data?.detail || 'Upload failed'); }
    setUploading(false);
  };

  const downloadMap = async (map) => {
    try {
      const r = await api.get(`/layout-maps/${map.id}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([r.data]));
      const link = document.createElement('a'); link.href = url; link.download = map.file_name; link.click();
      window.URL.revokeObjectURL(url);
    } catch { toast.error('Download failed'); }
  };

  const openMapViewer = async (map) => {
    try {
      const r = await api.get(`/layout-maps/${map.id}/download`, { responseType: 'blob' });
      setViewingMap({ ...map, blobUrl: window.URL.createObjectURL(r.data) });
      setViewerZoom(1);
    } catch { toast.error('Failed to load map'); }
  };

  const closeMapViewer = () => {
    if (viewingMap?.blobUrl) window.URL.revokeObjectURL(viewingMap.blobUrl);
    setViewingMap(null); setViewerZoom(1);
  };

  const deleteMap = async (map) => {
    try {
      await api.delete(`/layout-maps/${map.id}`);
      toast.success('Map deleted');
      load();
    } catch { toast.error('Failed to delete map'); }
  };

  const downloadStatement = async () => {
    if (!selectedPlot) return;
    try {
      const r = await api.get(`/plot-statements/${selectedPlot.id}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([r.data]));
      const link = document.createElement('a'); link.href = url; link.download = `statement_${selectedPlot.plot_number}.pdf`; link.click();
      window.URL.revokeObjectURL(url);
      toast.success('Statement downloaded');
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed'); }
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-neutral-400">Loading...</div>;
  if (!layout) return <div className="text-center py-12 text-neutral-400">Layout not found</div>;

  const plots = layout.plots || [];
  const maps = layout.maps || [];

  // Shared plot form JSX
  const PlotFormFields = () => (
    <>
      <div>
        <Label className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Plot Number</Label>
        <Input data-testid="input-plot-number" value={plotForm.plot_number} onChange={e => setPlotForm(p => ({...p, plot_number: e.target.value}))} required placeholder="e.g., A-12" className="mt-1" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Area (sq.ft)</Label>
          <Input data-testid="input-plot-area" type="number" step="0.01" min="0.01" value={plotForm.area} onChange={e => setPlotForm(p => ({...p, area: e.target.value}))} required className="mt-1 font-mono" placeholder="e.g., 1200" />
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Price per sq.ft</Label>
          <Input data-testid="input-price-sqft" type="number" step="0.01" min="0.01" value={plotForm.price_per_sqft} onChange={e => setPlotForm(p => ({...p, price_per_sqft: e.target.value}))} required className="mt-1 font-mono" placeholder="e.g., 500" />
        </div>
      </div>
      <div>
        <Label className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Plot Type</Label>
        <Select value={plotForm.plot_type} onValueChange={v => setPlotForm(p => ({...p, plot_type: v}))}>
          <SelectTrigger data-testid="select-plot-type" className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="residential">Residential</SelectItem>
            <SelectItem value="commercial">Commercial</SelectItem>
            <SelectItem value="corner">Corner</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {plotForm.area && plotForm.price_per_sqft && parseFloat(plotForm.area) > 0 && parseFloat(plotForm.price_per_sqft) > 0 && (
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm font-mono">
          <span className="text-neutral-500">Total Price: </span>
          <span className="font-semibold text-neutral-800">Rs.{(parseFloat(plotForm.area) * parseFloat(plotForm.price_per_sqft)).toLocaleString()}</span>
        </div>
      )}
    </>
  );

  return (
    <div data-testid="layout-detail-page" className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/layouts')} data-testid="back-layouts-btn"><ArrowLeft className="w-4 h-4" /></Button>
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold text-neutral-900 tracking-tight" style={{ fontFamily: 'Outfit' }}>{layout.name}</h1>
            {layout.description && <p className="text-sm text-neutral-500">{layout.description}</p>}
          </div>
        </div>
        <div className="flex gap-2">
          <label>
            <Button data-testid="upload-map-btn" variant="outline" size="sm" asChild disabled={uploading}>
              <span><Upload className="w-4 h-4 mr-1.5" />{uploading ? 'Uploading...' : 'Upload Map'}</span>
            </Button>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.svg" onChange={handleUploadMap} className="hidden" />
          </label>
          <Button data-testid="add-plot-btn" size="sm" onClick={() => { setPlotForm({...emptyPlot}); setShowAddPlot(true); }} style={{ backgroundColor: 'var(--brand-primary)' }}>
            <PlusCircle className="w-4 h-4 mr-1.5" /> Add Plot
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white border border-neutral-200 rounded-lg p-4 text-center"><p className="text-2xl font-semibold font-mono text-neutral-900">{plots.length}</p><p className="text-[10px] uppercase tracking-widest text-neutral-400 font-medium">Total Plots</p></div>
        <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-4 text-center"><p className="text-2xl font-semibold font-mono text-emerald-700">{plots.filter(p => p.status === 'available').length}</p><p className="text-[10px] uppercase tracking-widest text-emerald-500 font-medium">Available</p></div>
        <div className="bg-rose-50 border border-rose-100 rounded-lg p-4 text-center"><p className="text-2xl font-semibold font-mono text-rose-700">{plots.filter(p => p.status === 'sold').length}</p><p className="text-[10px] uppercase tracking-widest text-rose-500 font-medium">Sold</p></div>
        <div className="bg-amber-50 border border-amber-100 rounded-lg p-4 text-center"><p className="text-2xl font-semibold font-mono text-amber-700">{plots.filter(p => p.status === 'reserved').length}</p><p className="text-[10px] uppercase tracking-widest text-amber-500 font-medium">Reserved</p></div>
      </div>

      <Tabs defaultValue="canvas">
        <TabsList>
          <TabsTrigger data-testid="tab-canvas" value="canvas">Plot Canvas</TabsTrigger>
          <TabsTrigger data-testid="tab-maps" value="maps">Maps ({maps.length})</TabsTrigger>
          <TabsTrigger data-testid="tab-list" value="list">Plot List</TabsTrigger>
        </TabsList>

        {/* Canvas */}
        <TabsContent value="canvas" className="mt-4">
          <div className="bg-white border border-neutral-200 rounded-lg p-6">
            {plots.length === 0 ? (
              <div className="text-center py-16 text-neutral-400"><MapPin className="w-8 h-8 mx-auto mb-2 text-neutral-300" /><p className="text-sm">No plots added yet.</p></div>
            ) : (
              <>
                <div className="flex items-center gap-4 mb-4 text-xs text-neutral-500">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500" /> Available</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-rose-500" /> Sold</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-400" /> Reserved</span>
                </div>
                <div className="flex flex-wrap gap-2.5">
                  {plots.map(p => <PlotTile key={p.id} plot={p} onClick={openPlotSheet} />)}
                </div>
              </>
            )}
          </div>
        </TabsContent>

        {/* Maps */}
        <TabsContent value="maps" className="mt-4">
          <div className="space-y-4">
            {maps.length === 0 ? (
              <div className="bg-white border border-neutral-200 rounded-lg p-12 text-center text-neutral-400">
                <Upload className="w-8 h-8 mx-auto mb-2 text-neutral-300" /><p className="text-sm">No map uploaded. Upload a PDF or image.</p>
              </div>
            ) : maps.map(m => (
              <div key={m.id} className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between p-3 border-b border-neutral-100">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-neutral-100 flex items-center justify-center shrink-0">
                      {m.file_type === 'application/pdf' ? <FileText className="w-4 h-4 text-rose-500" /> : <MapPin className="w-4 h-4 text-cyan-600" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-neutral-900 truncate">{m.file_name}</p>
                      <p className="text-[10px] text-neutral-400">{m.uploader_name} · {new Date(m.upload_date).toLocaleDateString()} · {(m.file_size / 1024).toFixed(0)} KB</p>
                    </div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <Button data-testid={`view-map-${m.id}`} variant="outline" size="sm" className="gap-1.5" onClick={() => openMapViewer(m)}><Eye className="w-3.5 h-3.5" /> View</Button>
                    <Button variant="ghost" size="icon" onClick={() => downloadMap(m)}><Download className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" className="hover:text-red-600 hover:bg-red-50" onClick={() => setConfirmDialog({ message: `Delete map "${m.file_name}"?`, onConfirm: () => { deleteMap(m); setConfirmDialog(null); } })}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>
                {m.file_type?.startsWith('image') && (
                  <div className="p-3 bg-neutral-50 cursor-pointer hover:bg-neutral-100 transition-colors" onClick={() => openMapViewer(m)}>
                    <img src={`${API_URL}/api/layout-maps/${m.id}/download`} alt={m.file_name} className="max-h-48 rounded-lg border border-neutral-200 object-contain mx-auto" />
                    <p className="text-[10px] text-center text-neutral-400 mt-2">Click to view full size</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </TabsContent>

        {/* Plot List with Edit/Delete */}
        <TabsContent value="list" className="mt-4">
          <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
            <Table>
              <TableHeader><TableRow className="bg-neutral-50">
                <TableHead className="text-[10px] uppercase tracking-wider font-medium text-neutral-500">Plot No.</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider font-medium text-neutral-500 text-right">Area (sqft)</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider font-medium text-neutral-500">Type</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider font-medium text-neutral-500 text-right">Price/sqft</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider font-medium text-neutral-500 text-right">Total</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider font-medium text-neutral-500">Customer</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider font-medium text-neutral-500">Status</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider font-medium text-neutral-500 w-20">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {plots.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-neutral-400">No plots</TableCell></TableRow>
                ) : plots.map(p => (
                  <TableRow key={p.id} className="hover:bg-neutral-50/50" data-testid={`plot-row-${p.plot_number}`}>
                    <TableCell className="font-mono font-medium text-sm cursor-pointer" onClick={() => openPlotSheet(p)}>{p.plot_number}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{p.area} sqft</TableCell>
                    <TableCell className="text-xs capitalize text-neutral-500">{p.plot_type}</TableCell>
                    <TableCell className="text-right font-mono text-sm">Rs.{p.price_per_sqft}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-medium">Rs.{(p.total_price || 0).toLocaleString()}</TableCell>
                    <TableCell className="text-sm text-neutral-600">{p.customer_name || '-'}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wider ${p.status === 'available' ? 'bg-emerald-100 text-emerald-800' : p.status === 'sold' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>
                        {p.status.toUpperCase()}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button data-testid={`edit-plot-${p.plot_number}`} variant="ghost" size="icon" className="h-7 w-7 hover:bg-blue-50 hover:text-blue-600" onClick={(e) => openEditPlot(p, e)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-neutral-100" onClick={() => openPlotSheet(p)}>
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        <Button data-testid={`delete-plot-${p.plot_number}`} variant="ghost" size="icon" className="h-7 w-7 hover:bg-red-50 hover:text-red-600" onClick={() => setConfirmDialog({ message: `Delete plot "${p.plot_number}" (${p.area} sqft, Rs.${(p.total_price||0).toLocaleString()})? This will also remove all payments for this plot.`, onConfirm: () => { handleDeletePlot(p); setConfirmDialog(null); } })}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Add Plot Dialog */}
      <Dialog open={showAddPlot} onOpenChange={setShowAddPlot}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Outfit' }}>Add New Plot</DialogTitle>
            <DialogDescription>Enter area and pricing details.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddPlot} className="space-y-4 mt-2">
            <PlotFormFields />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowAddPlot(false)}>Cancel</Button>
              <Button data-testid="submit-plot-btn" type="submit" disabled={saving} style={{ backgroundColor: 'var(--brand-primary)' }}>
                {saving ? 'Adding...' : 'Add Plot'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Plot Dialog */}
      <Dialog open={showEditPlot} onOpenChange={(open) => { if (!open) { setShowEditPlot(false); setEditingPlot(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Outfit' }}>Edit Plot {editingPlot?.plot_number}</DialogTitle>
            <DialogDescription>Update plot details. Total price auto-calculates from area and price/sqft.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditPlot} className="space-y-4 mt-2">
            <PlotFormFields />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => { setShowEditPlot(false); setEditingPlot(null); }}>Cancel</Button>
              <Button data-testid="save-edit-plot-btn" type="submit" disabled={saving} style={{ backgroundColor: 'var(--brand-primary)' }}>
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Plot Detail Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle style={{ fontFamily: 'Outfit' }}>Plot {selectedPlot?.plot_number}</SheetTitle>
            <SheetDescription>{selectedPlot?.area} sq.ft | {selectedPlot?.plot_type} | Rs.{selectedPlot?.price_per_sqft}/sqft</SheetDescription>
          </SheetHeader>
          {selectedPlot && (
            <Tabs defaultValue="details" className="mt-4">
              <TabsList className="w-full">
                <TabsTrigger value="details" className="flex-1">Details</TabsTrigger>
                <TabsTrigger value="payments" className="flex-1">Payments</TabsTrigger>
              </TabsList>
              <TabsContent value="details" className="space-y-4 mt-4">
                <div className="bg-neutral-50 rounded-lg p-4 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-neutral-500">Total Price</span><span className="font-mono font-semibold">Rs.{(selectedPlot.total_price || 0).toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-neutral-500">Paid</span><span className="font-mono text-emerald-600">Rs.{plotStats.total_paid.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-neutral-500">Remaining</span><span className="font-mono text-rose-600">Rs.{plotStats.remaining_balance.toLocaleString()}</span></div>
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Status</Label>
                  <Select value={editForm.status} onValueChange={handleStatusChange}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="available">Available</SelectItem><SelectItem value="reserved">Reserved</SelectItem><SelectItem value="sold">Sold</SelectItem></SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Assign Customer</Label>
                  <Select value={editForm.customer_id || "none"} onValueChange={v => { const c = customers.find(c => c.id === v); setEditForm(p => ({ ...p, customer_id: v === "none" ? "" : v, customer_name: c ? c.name : "" })); }}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select customer" /></SelectTrigger>
                    <SelectContent><SelectItem value="none">-- None --</SelectItem>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name} ({c.customer_id})</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Booking Date</Label><Input type="date" value={editForm.booking_date} onChange={e => setEditForm(p => ({...p, booking_date: e.target.value}))} className="mt-1" /></div>
                  <div><Label className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Agreement Date</Label><Input type="date" value={editForm.agreement_date} onChange={e => setEditForm(p => ({...p, agreement_date: e.target.value}))} className="mt-1" /></div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button data-testid="save-plot-btn" className="flex-1" onClick={handleUpdatePlotSheet} disabled={saving} style={{ backgroundColor: 'var(--brand-primary)' }}>{saving ? 'Saving...' : 'Save Changes'}</Button>
                  <Button variant="outline" onClick={() => openEditPlot(selectedPlot)}><Pencil className="w-4 h-4" /></Button>
                  <Button variant="outline" onClick={downloadStatement}><FileText className="w-4 h-4" /></Button>
                </div>
              </TabsContent>
              <TabsContent value="payments" className="space-y-4 mt-4">
                <div className="bg-neutral-50 rounded-lg p-4 space-y-3">
                  <p className="text-xs uppercase tracking-widest text-neutral-400 font-medium">Record Payment</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Input type="number" placeholder="Amount" value={payForm.amount} onChange={e => setPayForm(p => ({...p, amount: e.target.value}))} className="font-mono" />
                    <Input type="date" value={payForm.payment_date} onChange={e => setPayForm(p => ({...p, payment_date: e.target.value}))} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={payForm.payment_mode} onValueChange={v => setPayForm(p => ({...p, payment_mode: v}))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="upi">UPI</SelectItem><SelectItem value="cash">Cash</SelectItem><SelectItem value="cheque">Cheque</SelectItem><SelectItem value="bank_transfer">Bank Transfer</SelectItem></SelectContent>
                    </Select>
                    {payForm.payment_mode === 'cheque' && <Input placeholder="Cheque No." value={payForm.cheque_number} onChange={e => setPayForm(p => ({...p, cheque_number: e.target.value}))} />}
                    <Input placeholder="Reference" value={payForm.reference_number} onChange={e => setPayForm(p => ({...p, reference_number: e.target.value}))} />
                  </div>
                  <Button size="sm" className="w-full" onClick={handleRecordPayment} disabled={saving} style={{ backgroundColor: 'var(--brand-primary)' }}>
                    <IndianRupee className="w-3 h-3 mr-1" /> {saving ? 'Recording...' : 'Record Payment'}
                  </Button>
                </div>
                <div className="space-y-1">
                  {plotPayments.length === 0 ? <p className="text-sm text-neutral-400 text-center py-4">No payments</p> : plotPayments.map(p => (
                    <div key={p.id} className="flex items-center justify-between p-2.5 bg-white border border-neutral-100 rounded-lg text-sm">
                      <div><span className="font-mono font-medium text-emerald-600">Rs.{p.amount.toLocaleString()}</span><span className="text-neutral-400 mx-2">·</span><span className="text-xs text-neutral-500 capitalize">{p.payment_mode}</span></div>
                      <span className="text-xs text-neutral-400 font-mono">{p.payment_date}</span>
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          )}
        </SheetContent>
      </Sheet>

      {/* Confirm Dialog */}
      <Dialog open={!!confirmDialog} onOpenChange={() => setConfirmDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle style={{ fontFamily: 'Outfit' }}>Confirm</DialogTitle></DialogHeader>
          <p className="text-sm text-neutral-600">{confirmDialog?.message}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(null)}>Cancel</Button>
            <Button onClick={confirmDialog?.onConfirm} style={{ backgroundColor: 'var(--brand-primary)' }}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Full-Screen Map Viewer */}
      {viewingMap && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 bg-black/60 backdrop-blur-sm border-b border-white/10 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <MapPin className="w-4 h-4 text-cyan-400 shrink-0" />
              <p className="text-sm font-medium text-white truncate">{viewingMap.file_name}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={() => setViewerZoom(z => Math.max(z - 0.25, 0.25))}><ZoomOut className="w-4 h-4" /></Button>
              <span className="text-xs font-mono text-neutral-300 w-12 text-center">{Math.round(viewerZoom * 100)}%</span>
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={() => setViewerZoom(z => Math.min(z + 0.25, 5))}><ZoomIn className="w-4 h-4" /></Button>
              <Button variant="ghost" size="sm" className="text-white hover:bg-white/10 text-xs ml-1" onClick={() => setViewerZoom(1)}>Reset</Button>
              <div className="w-px h-6 bg-white/20 mx-2" />
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={() => downloadMap(viewingMap)}><Download className="w-4 h-4" /></Button>
              <Button variant="ghost" size="icon" className="text-white hover:bg-red-500/80" onClick={closeMapViewer}><X className="w-5 h-5" /></Button>
            </div>
          </div>
          <div className="flex-1 overflow-auto flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) closeMapViewer(); }}>
            {viewingMap.file_type?.startsWith('image') && <img src={viewingMap.blobUrl} alt={viewingMap.file_name} className="max-w-none select-none" style={{ transform: `scale(${viewerZoom})`, transformOrigin: 'center center', transition: 'transform 0.2s ease-out' }} draggable={false} />}
            {viewingMap.file_type === 'application/pdf' && <iframe src={viewingMap.blobUrl} title={viewingMap.file_name} className="w-full h-full rounded-lg border border-white/10" style={{ minHeight: '80vh' }} />}
          </div>
        </div>
      )}
    </div>
  );
}
