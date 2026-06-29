import React, { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Wallet, TrendingUp, CircleCheck as CheckCircle2, TriangleAlert as AlertTriangle, Download, IndianRupee, ChartBar as BarChart3 } from 'lucide-react';
import { toast } from 'sonner';

const PIE_COLORS = ['#00AFD1', '#2D2D2D', '#F59E0B', '#EF4444', '#8B5CF6'];

export default function CashFlowPage() {
  const [stats, setStats] = useState(null);
  const [statement, setStatement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('monthly');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    api.get('/cashflow/stats').then(r => setStats(r.data)).catch(console.error).finally(() => setLoading(false));
  }, []);

  const loadStatement = async () => {
    try {
      const r = await api.get('/cashflow/statement', { params: { period, start_date: startDate, end_date: endDate } });
      setStatement(r.data);
    } catch { toast.error('Failed to load statement'); }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadStatement(); }, [period]);

  if (loading || !stats) {
    return <div className="space-y-6"><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">{[1,2,3,4].map(i => <div key={i} className="h-28 bg-neutral-100 rounded-lg animate-pulse" />)}</div></div>;
  }

  const statCards = [
    { label: 'Total Revenue', value: `Rs.${(stats.total_collected || 0).toLocaleString()}`, sub: `of Rs.${(stats.total_value || 0).toLocaleString()} total`, icon: Wallet, color: '#00AFD1' },
    { label: 'Outstanding', value: `Rs.${(stats.total_outstanding || 0).toLocaleString()}`, sub: `${stats.pending_balance_customers} customers`, icon: AlertTriangle, color: '#EF4444' },
    { label: 'Plots Sold', value: `${stats.sold_plots}/${stats.total_plots}`, sub: `${stats.available_plots} available · ${stats.reserved_plots} reserved`, icon: TrendingUp, color: '#10B981' },
    { label: 'Fully Paid', value: stats.fully_paid_customers, sub: `${stats.pending_balance_customers} with balance`, icon: CheckCircle2, color: '#F59E0B' },
  ];

  const modeData = Object.entries(stats.mode_breakdown || {}).map(([k, v]) => ({ name: k.replace('_', ' '), value: v }));

  return (
    <div data-testid="cashflow-page" className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold text-neutral-900 tracking-tight" style={{ fontFamily: 'Outfit' }}>Cash Flow</h1>
        <p className="text-sm text-neutral-500 mt-0.5">Plot payment tracking and financial overview</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s, i) => (
          <div key={i} data-testid={`cf-stat-${i}`} className="stat-card">
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Collection Trend */}
        <div className="lg:col-span-2 bg-white border border-neutral-200 rounded-lg p-6">
          <h3 className="text-sm font-semibold text-neutral-900 mb-4" style={{ fontFamily: 'Outfit' }}>Monthly Collection Trend</h3>
          <div className="h-64" style={{ minWidth: 0 }}>
            <ResponsiveContainer width="100%" height={256}>
              <AreaChart data={stats.trend || []}>
                <defs>
                  <linearGradient id="colorCF" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00AFD1" stopOpacity={0.15}/><stop offset="95%" stopColor="#00AFD1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} />
                <YAxis tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ fontFamily: 'IBM Plex Sans', fontSize: 12 }} formatter={v => [`Rs.${v.toLocaleString()}`, '']} />
                <Area type="monotone" dataKey="collected" stroke="#00AFD1" fill="url(#colorCF)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Payment Mode Breakdown */}
        <div className="bg-white border border-neutral-200 rounded-lg p-6">
          <h3 className="text-sm font-semibold text-neutral-900 mb-4" style={{ fontFamily: 'Outfit' }}>Payment Mode Breakdown</h3>
          {modeData.length === 0 ? (
            <p className="text-sm text-neutral-400 text-center py-8">No payment data</p>
          ) : (
            <>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={modeData} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                      {modeData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={v => `Rs.${v.toLocaleString()}`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1.5 mt-2">
                {modeData.map((d, i) => (
                  <div key={d.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} /><span className="capitalize text-neutral-600">{d.name}</span></span>
                    <span className="font-mono font-medium">Rs.{d.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Period Statement */}
      <div className="bg-white border border-neutral-200 rounded-lg p-6">
        <div className="flex items-center justify-between flex-wrap gap-4 mb-5">
          <h3 className="text-sm font-semibold text-neutral-900" style={{ fontFamily: 'Outfit' }}>
            <BarChart3 className="w-4 h-4 inline mr-1.5 text-neutral-400" /> Payment Statement
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger data-testid="cf-period-select" className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="half_yearly">Half-Yearly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>
            {period === 'custom' && (
              <>
                <Input data-testid="cf-start-date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-36" />
                <Input data-testid="cf-end-date" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-36" />
                <Button size="sm" onClick={loadStatement} variant="outline">Apply</Button>
              </>
            )}
          </div>
        </div>

        {!statement || (statement.plots || []).length === 0 ? (
          <p className="text-sm text-neutral-400 text-center py-8">No payments in this period</p>
        ) : (
          <>
            <p className="text-xs text-neutral-400 mb-3">Period: {statement.start_date} to {statement.end_date} · Total: <span className="font-mono font-medium text-neutral-700">Rs.{(statement.total || 0).toLocaleString()}</span></p>
            <Table>
              <TableHeader><TableRow className="bg-neutral-50">
                <TableHead className="text-[10px] uppercase tracking-wider font-medium text-neutral-500">Plot</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider font-medium text-neutral-500">Customer</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider font-medium text-neutral-500 text-right">Total Price</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider font-medium text-neutral-500 text-right">Period Collection</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider font-medium text-neutral-500 text-right">Payments</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(statement.plots || []).map((p, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-sm font-medium">{p.plot_number}</TableCell>
                    <TableCell className="text-sm text-neutral-600">{p.customer_name || '-'}</TableCell>
                    <TableCell className="text-right font-mono text-sm">Rs.{(p.total_price || 0).toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold text-emerald-600">Rs.{(p.period_total || 0).toLocaleString()}</TableCell>
                    <TableCell className="text-right text-sm text-neutral-500">{(p.payments || []).length}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </div>
    </div>
  );
}
