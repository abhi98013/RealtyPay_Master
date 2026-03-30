import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { IndianRupee, Users, AlertTriangle, CheckCircle2, Clock, Send, FileText, PlusCircle } from 'lucide-react';

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/dashboard/stats').then(r => setStats(r.data)).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading || !stats) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="stat-card animate-pulse h-28 bg-neutral-100 rounded-lg" />)}
        </div>
      </div>
    );
  }

  const statCards = [
    { label: 'Total Collected', value: `Rs.${(stats.total_collected || 0).toLocaleString()}`, sub: `Target: Rs.${(stats.total_target || 0).toLocaleString()}`, icon: IndianRupee, color: '#0052CC' },
    { label: 'Paid Customers', value: stats.paid_count, sub: `of ${stats.total_customers} total`, icon: CheckCircle2, color: '#10B981' },
    { label: 'Overdue', value: stats.overdue_count, sub: `Rs.${(stats.total_outstanding || 0).toLocaleString()} outstanding`, icon: AlertTriangle, color: '#EF4444' },
    { label: 'Pending', value: stats.pending_count + stats.partial_count, sub: `${stats.partial_count} partial`, icon: Clock, color: '#F59E0B' },
  ];

  return (
    <div data-testid="dashboard-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-neutral-900 tracking-tight" style={{ fontFamily: 'Outfit' }}>Dashboard</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} Overview
          </p>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s, i) => (
          <div key={i} data-testid={`stat-card-${i}`} className="stat-card">
            <div className="flex items-start justify-between mb-3">
              <span className="text-[10px] uppercase tracking-widest text-neutral-400 font-medium">{s.label}</span>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: s.color + '12' }}>
                <s.icon className="w-4 h-4" style={{ color: s.color }} />
              </div>
            </div>
            <p className="text-2xl font-semibold text-neutral-900 font-mono">{s.value}</p>
            <p className="text-xs text-neutral-400 mt-1">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        <Button data-testid="quick-add-payment" size="sm" onClick={() => navigate('/payments')} style={{ backgroundColor: 'var(--brand-primary)' }}>
          <PlusCircle className="w-4 h-4 mr-1.5" /> Add Payment
        </Button>
        <Button data-testid="quick-send-reminders" size="sm" variant="outline" onClick={() => navigate('/whatsapp')}>
          <Send className="w-4 h-4 mr-1.5" /> Send Reminders
        </Button>
        <Button data-testid="quick-view-overdue" size="sm" variant="outline" onClick={() => navigate('/payments')}>
          <AlertTriangle className="w-4 h-4 mr-1.5" /> View Overdue
        </Button>
        <Button data-testid="quick-export-report" size="sm" variant="outline" onClick={() => navigate('/reports')}>
          <FileText className="w-4 h-4 mr-1.5" /> Export Report
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Collection Trend Chart */}
        <div className="lg:col-span-2 bg-white border border-neutral-200 rounded-lg p-6">
          <h3 className="text-sm font-semibold text-neutral-900 mb-4" style={{ fontFamily: 'Outfit' }}>Collection Trend</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.trend || []}>
                <defs>
                  <linearGradient id="colorCol" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0052CC" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#0052CC" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} />
                <YAxis tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ fontFamily: 'IBM Plex Sans', fontSize: 12 }} formatter={(v) => [`Rs.${v.toLocaleString()}`, '']} />
                <Area type="monotone" dataKey="collected" stroke="#0052CC" fill="url(#colorCol)" strokeWidth={2} />
                <Area type="monotone" dataKey="target" stroke="#E5E5E5" fill="none" strokeWidth={1} strokeDasharray="4 4" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Overdue */}
        <div className="bg-white border border-neutral-200 rounded-lg p-6">
          <h3 className="text-sm font-semibold text-neutral-900 mb-4" style={{ fontFamily: 'Outfit' }}>Top Overdue Accounts</h3>
          <div className="space-y-3">
            {(stats.top_overdue || []).length === 0 && (
              <p className="text-sm text-neutral-400 text-center py-8">No overdue accounts</p>
            )}
            {(stats.top_overdue || []).map((item, i) => (
              <div key={i} data-testid={`overdue-item-${i}`} className="flex items-center gap-3 p-3 rounded-lg bg-neutral-50 hover:bg-neutral-100 transition-colors cursor-pointer" onClick={() => navigate(`/customers/${item.customer_id}`)}>
                <div className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 text-xs font-semibold">
                  {(item.customer_name || '?')[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-neutral-900 truncate">{item.customer_name}</p>
                  <p className="text-[10px] text-neutral-400">{item.property_name} · {item.days_overdue}d overdue</p>
                </div>
                <span className="text-sm font-mono font-semibold text-rose-600">Rs.{(item.amount || 0).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
