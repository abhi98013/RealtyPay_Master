import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Building2 } from 'lucide-react';

function formatApiError(detail) {
  if (detail == null) return "Something went wrong.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map(e => e?.msg || JSON.stringify(e)).filter(Boolean).join(" ");
  if (detail?.msg) return detail.msg;
  return String(detail);
}

export default function LoginPage() {
  const { login, register } = useAuth();
  const [tab, setTab] = useState('login');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [regForm, setRegForm] = useState({ email: '', password: '', name: '', role: 'viewer' });

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await login(loginForm.email, loginForm.password);
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail) || err.message);
    }
    setLoading(false);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await register(regForm.email, regForm.password, regForm.name, regForm.role);
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail) || err.message);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
      {/* Left - Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-[#0052CC] flex items-center justify-center">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 data-testid="login-title" className="text-2xl font-semibold text-neutral-900" style={{ fontFamily: 'Outfit' }}>RealtyPay</h1>
              <p className="text-xs text-neutral-400 tracking-wider uppercase">Payment Management</p>
            </div>
          </div>

          <Tabs value={tab} onValueChange={(v) => { setTab(v); setError(''); }}>
            <TabsList className="w-full mb-6">
              <TabsTrigger data-testid="login-tab" value="login" className="flex-1">Sign In</TabsTrigger>
              <TabsTrigger data-testid="register-tab" value="register" className="flex-1">Register</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <Label htmlFor="login-email" className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Email</Label>
                  <Input data-testid="login-email" id="login-email" type="email" placeholder="admin@realtypay.com" value={loginForm.email} onChange={e => setLoginForm(p => ({...p, email: e.target.value}))} required className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor="login-password" className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Password</Label>
                  <Input data-testid="login-password" id="login-password" type="password" placeholder="Enter password" value={loginForm.password} onChange={e => setLoginForm(p => ({...p, password: e.target.value}))} required className="mt-1.5" />
                </div>
                {error && <p data-testid="auth-error" className="text-sm text-red-600 bg-red-50 p-2.5 rounded-lg">{error}</p>}
                <Button data-testid="login-submit-btn" type="submit" className="w-full" disabled={loading} style={{ backgroundColor: '#0052CC' }}>
                  {loading ? 'Signing in...' : 'Sign In'}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="register">
              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <Label htmlFor="reg-name" className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Full Name</Label>
                  <Input data-testid="register-name" id="reg-name" placeholder="John Doe" value={regForm.name} onChange={e => setRegForm(p => ({...p, name: e.target.value}))} required className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor="reg-email" className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Email</Label>
                  <Input data-testid="register-email" id="reg-email" type="email" placeholder="you@company.com" value={regForm.email} onChange={e => setRegForm(p => ({...p, email: e.target.value}))} required className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor="reg-password" className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Password</Label>
                  <Input data-testid="register-password" id="reg-password" type="password" placeholder="Min 6 characters" value={regForm.password} onChange={e => setRegForm(p => ({...p, password: e.target.value}))} required className="mt-1.5" />
                </div>
                {error && <p data-testid="auth-error" className="text-sm text-red-600 bg-red-50 p-2.5 rounded-lg">{error}</p>}
                <Button data-testid="register-submit-btn" type="submit" className="w-full" disabled={loading} style={{ backgroundColor: '#0052CC' }}>
                  {loading ? 'Creating account...' : 'Create Account'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Right - Visual */}
      <div className="hidden lg:flex flex-1 items-center justify-center bg-neutral-950 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.15) 1px, transparent 0)', backgroundSize: '40px 40px' }} />
        <div className="relative z-10 text-center p-12">
          <div className="w-20 h-20 rounded-2xl bg-[#0052CC] mx-auto flex items-center justify-center mb-6">
            <Building2 className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-3xl font-semibold text-white mb-3" style={{ fontFamily: 'Outfit' }}>Smart Property Payments</h2>
          <p className="text-neutral-400 text-sm max-w-sm mx-auto leading-relaxed">
            Track EMIs, manage customers, send WhatsApp reminders, and generate branded reports — all in one place.
          </p>
        </div>
      </div>
    </div>
  );
}
