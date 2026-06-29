import React, { useState, useEffect } from 'react';
import api, { API_URL } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Palette, Upload, Building2, Save, MessageSquare, Smartphone, Eye, EyeOff, CircleCheck as CheckCircle2, Circle as XCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function BrandSettingsPage() {
  const [brand, setBrand] = useState({
    brand_name: '', tagline: '', primary_color: '#00AFD1',
    accent_color: '#2D2D2D', footer_text: '', penalty_rate: 1, phone: '',
    dlt_sender_id: '', dlt_entity_id: '', dlt_template_id: '',
    fast2sms_api_key: '',
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    api.get('/brand').then(r => {
      setBrand(r.data);
      if (r.data.logo_path) {
        setLogoUrl(`${API_URL}/api/brand/logo?t=${Date.now()}`);
      }
    }).catch(console.error);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.put('/brand', brand);
      setBrand(res.data);
      document.documentElement.style.setProperty('--brand-primary', res.data.primary_color || '#00AFD1');
      document.documentElement.style.setProperty('--brand-accent', res.data.accent_color || '#2D2D2D');
      toast.success('Brand settings saved');
    } catch {
      toast.error('Failed to save');
    }
    setSaving(false);
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
      toast.error('Only PNG/JPG files allowed');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await api.post('/brand/logo', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setLogoUrl(`${API_URL}/api/brand/logo?t=${Date.now()}`);
      toast.success('Logo uploaded');
    } catch {
      toast.error('Failed to upload logo');
    }
    setUploading(false);
  };

  const updateField = (field, value) => setBrand(prev => ({ ...prev, [field]: value }));

  return (
    <div data-testid="brand-settings-page" className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold text-neutral-900 tracking-tight" style={{ fontFamily: 'Outfit' }}>Brand Settings</h1>
        <p className="text-sm text-neutral-500 mt-0.5">Customize your brand identity across the platform</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Settings Form */}
        <div className="bg-white border border-neutral-200 rounded-lg p-6 space-y-5">
          <div>
            <Label className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Brand Name</Label>
            <Input data-testid="brand-name-input" value={brand.brand_name} onChange={e => updateField('brand_name', e.target.value)} className="mt-1" placeholder="Your Company Name" />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Tagline</Label>
            <Input data-testid="brand-tagline-input" value={brand.tagline} onChange={e => updateField('tagline', e.target.value)} className="mt-1" placeholder="Smart Property Payment Management" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Primary Color</Label>
              <div className="flex items-center gap-2 mt-1">
                <input type="color" value={brand.primary_color} onChange={e => updateField('primary_color', e.target.value)} className="w-10 h-10 rounded border border-neutral-200 cursor-pointer" />
                <Input data-testid="brand-primary-color" value={brand.primary_color} onChange={e => updateField('primary_color', e.target.value)} className="flex-1 font-mono text-sm" />
              </div>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Accent Color</Label>
              <div className="flex items-center gap-2 mt-1">
                <input type="color" value={brand.accent_color} onChange={e => updateField('accent_color', e.target.value)} className="w-10 h-10 rounded border border-neutral-200 cursor-pointer" />
                <Input data-testid="brand-accent-color" value={brand.accent_color} onChange={e => updateField('accent_color', e.target.value)} className="flex-1 font-mono text-sm" />
              </div>
            </div>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Footer Text</Label>
            <Input data-testid="brand-footer-input" value={brand.footer_text} onChange={e => updateField('footer_text', e.target.value)} className="mt-1" placeholder="Your Company - Building Dreams" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Penalty Rate (% per day)</Label>
              <Input data-testid="penalty-rate-input" type="number" step="0.1" value={brand.penalty_rate} onChange={e => updateField('penalty_rate', parseFloat(e.target.value) || 0)} className="mt-1 font-mono" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Contact Phone</Label>
              <Input data-testid="brand-phone-input" value={brand.phone} onChange={e => updateField('phone', e.target.value)} className="mt-1" placeholder="+91-9876543210" />
            </div>
          </div>

          {/* Logo Upload */}
          <div>
            <Label className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Brand Logo</Label>
            <div className="mt-2 border-2 border-dashed border-neutral-200 rounded-lg p-6 text-center hover:border-neutral-300 transition-colors">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="max-h-20 mx-auto mb-3 object-contain" />
              ) : (
                <Upload className="w-8 h-8 mx-auto mb-2 text-neutral-300" />
              )}
              <label className="cursor-pointer">
                <span className="text-sm font-medium" style={{ color: 'var(--brand-primary)' }}>
                  {uploading ? 'Uploading...' : logoUrl ? 'Change Logo' : 'Upload Logo'}
                </span>
                <input data-testid="logo-upload-input" type="file" accept="image/png,image/jpeg" onChange={handleLogoUpload} className="hidden" disabled={uploading} />
              </label>
              <p className="text-xs text-neutral-400 mt-1">PNG or JPG, recommended 200x200px</p>
            </div>
          </div>

          {/* DLT SMS Configuration */}
          <div className="border-t border-neutral-200 pt-5">
            <p className="text-xs uppercase tracking-widest text-neutral-400 font-medium mb-3">SMS Configuration (DLT)</p>
            <p className="text-xs text-neutral-400 mb-3">Register at any telecom DLT portal (Jio/Airtel/Vodafone), then add your credentials here. Without DLT, SMS will use the quick route (may be blocked).</p>
            <div className="space-y-3">
              <div>
                <Label className="text-xs uppercase tracking-wider text-neutral-500 font-medium">DLT Sender ID</Label>
                <Input data-testid="dlt-sender-input" value={brand.dlt_sender_id || ''} onChange={e => updateField('dlt_sender_id', e.target.value)} className="mt-1 font-mono" placeholder="e.g., KKNJAS (6 chars)" maxLength={6} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs uppercase tracking-wider text-neutral-500 font-medium">DLT Entity ID</Label>
                  <Input data-testid="dlt-entity-input" value={brand.dlt_entity_id || ''} onChange={e => updateField('dlt_entity_id', e.target.value)} className="mt-1 font-mono" placeholder="Optional" />
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wider text-neutral-500 font-medium">DLT Template ID</Label>
                  <Input data-testid="dlt-template-input" value={brand.dlt_template_id || ''} onChange={e => updateField('dlt_template_id', e.target.value)} className="mt-1 font-mono" placeholder="Optional" />
                </div>
              </div>
              <div className={`text-xs px-3 py-2 rounded-lg ${brand.dlt_sender_id ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                {brand.dlt_sender_id
                  ? `DLT route active — SMS will send via DLT with sender "${brand.dlt_sender_id}"`
                  : 'DLT not configured — SMS will attempt quick route (may fail if blocked)'}
              </div>
            </div>
          </div>

          {/* Fast2SMS API Key + WhatsApp */}
          <div className="border-t border-neutral-200 pt-5">
            <div className="flex items-center gap-2 mb-1">
              <MessageSquare className="w-4 h-4 text-[#25D366]" />
              <p className="text-xs uppercase tracking-widest text-neutral-400 font-medium">Fast2SMS API Key</p>
              {brand.fast2sms_api_key ? (
                <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="w-3 h-3" /> Configured
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                  <XCircle className="w-3 h-3" /> Not Set
                </span>
              )}
            </div>
            <p className="text-xs text-neutral-400 mb-3">
              Used for both SMS and WhatsApp sending. Get your key from{' '}
              <span className="font-medium text-neutral-600">fast2sms.com → API → API Credentials</span>.
            </p>
            <div className="relative">
              <Label className="text-xs uppercase tracking-wider text-neutral-500 font-medium">API Key</Label>
              <div className="relative mt-1">
                <Input
                  data-testid="fast2sms-api-key-input"
                  type={showApiKey ? 'text' : 'password'}
                  value={brand.fast2sms_api_key || ''}
                  onChange={e => updateField('fast2sms_api_key', e.target.value)}
                  className="font-mono pr-10"
                  placeholder="Paste your Fast2SMS API key here"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(v => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${brand.fast2sms_api_key ? 'bg-[#DCF8C6] border-green-200 text-green-800' : 'bg-neutral-50 border-neutral-200 text-neutral-400'}`}>
                <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                WhatsApp {brand.fast2sms_api_key ? 'Live' : 'Not Active'}
              </div>
              <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${brand.fast2sms_api_key ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-neutral-50 border-neutral-200 text-neutral-400'}`}>
                <Smartphone className="w-3.5 h-3.5 shrink-0" />
                SMS {brand.fast2sms_api_key ? 'Live' : 'Not Active'}
              </div>
            </div>
          </div>

          <Button data-testid="save-brand-btn" className="w-full" onClick={handleSave} disabled={saving} style={{ backgroundColor: 'var(--brand-primary)' }}>
            <Save className="w-4 h-4 mr-1.5" /> {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>

        {/* Live Preview */}
        <div className="space-y-4">
          <p className="text-xs uppercase tracking-widest text-neutral-400 font-medium">Live Preview</p>
          {/* Dashboard Preview */}
          <div className="bg-white border border-neutral-200 rounded-lg p-5">
            <div className="flex items-center gap-3 mb-4">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="w-10 h-10 rounded-lg object-contain" />
              ) : (
                <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold" style={{ backgroundColor: brand.primary_color }}>
                  {(brand.brand_name || 'R')[0]}
                </div>
              )}
              <div>
                <h3 className="text-base font-semibold" style={{ fontFamily: 'Outfit', color: brand.primary_color }}>{brand.brand_name || 'Your Brand'}</h3>
                <p className="text-xs text-neutral-400">{brand.tagline || 'Your tagline'}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <div className="flex-1 p-3 rounded-lg text-white text-center" style={{ backgroundColor: brand.primary_color }}>
                <p className="text-xs opacity-80">Primary</p>
                <p className="font-mono text-sm">{brand.primary_color}</p>
              </div>
              <div className="flex-1 p-3 rounded-lg text-white text-center" style={{ backgroundColor: brand.accent_color }}>
                <p className="text-xs opacity-80">Accent</p>
                <p className="font-mono text-sm">{brand.accent_color}</p>
              </div>
            </div>
          </div>

          {/* WhatsApp Preview */}
          <div className="bg-white border border-neutral-200 rounded-lg p-5">
            <p className="text-[10px] uppercase tracking-widest text-neutral-400 font-medium mb-3">WhatsApp Message Preview</p>
            <div className="bg-[#DCF8C6] rounded-lg p-3 text-sm text-neutral-800 leading-relaxed" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
              Dear Customer,<br />
              Your EMI of Rs.25,000 for Sunrise Towers (4B) is due on 5th of this month.<br />
              Please make the payment to avoid a late fee.<br />
              <span className="font-medium">- {brand.brand_name || 'Your Brand'}</span>
            </div>
          </div>

          {/* Footer Preview */}
          {brand.footer_text && (
            <div className="bg-neutral-900 rounded-lg p-4 text-center">
              <p className="text-xs text-neutral-400 italic">{brand.footer_text}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
