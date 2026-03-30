import React, { useState } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Download, Calendar } from 'lucide-react';
import { toast } from 'sonner';

const MONTHS = [
  { value: '1', label: 'January' }, { value: '2', label: 'February' },
  { value: '3', label: 'March' }, { value: '4', label: 'April' },
  { value: '5', label: 'May' }, { value: '6', label: 'June' },
  { value: '7', label: 'July' }, { value: '8', label: 'August' },
  { value: '9', label: 'September' }, { value: '10', label: 'October' },
  { value: '11', label: 'November' }, { value: '12', label: 'December' },
];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

export default function ReportsPage() {
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [year, setYear] = useState(String(currentYear));
  const [downloading, setDownloading] = useState('');

  const downloadMonthlyPDF = async () => {
    setDownloading('pdf');
    try {
      const response = await api.get('/reports/monthly-pdf', {
        params: { month: parseInt(month), year: parseInt(year) },
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `report_${MONTHS.find(m => m.value === month)?.label}_${year}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
      toast.success('PDF downloaded');
    } catch {
      toast.error('Failed to download PDF');
    }
    setDownloading('');
  };

  return (
    <div data-testid="reports-page" className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold text-neutral-900 tracking-tight" style={{ fontFamily: 'Outfit' }}>Reports</h1>
        <p className="text-sm text-neutral-500 mt-0.5">Generate and download payment reports</p>
      </div>

      {/* Monthly Report */}
      <div className="bg-white border border-neutral-200 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
            <FileText className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-neutral-900" style={{ fontFamily: 'Outfit' }}>Monthly Payment Report</h3>
            <p className="text-xs text-neutral-400">Branded PDF with all customer payment statuses</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-5">
          <div>
            <Label className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Month</Label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger data-testid="report-month-select" className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Year</Label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger data-testid="report-year-select" className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button
          data-testid="download-pdf-btn"
          className="w-full"
          onClick={downloadMonthlyPDF}
          disabled={!!downloading}
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          <Download className="w-4 h-4 mr-1.5" />
          {downloading === 'pdf' ? 'Generating PDF...' : 'Download Monthly PDF Report'}
        </Button>
      </div>

      {/* Info Card */}
      <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-5">
        <h4 className="text-sm font-semibold text-neutral-700 mb-2" style={{ fontFamily: 'Outfit' }}>Report Contents</h4>
        <ul className="space-y-1.5 text-sm text-neutral-500">
          <li className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 mt-1.5 shrink-0" />
            Brand logo and name at the top
          </li>
          <li className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 mt-1.5 shrink-0" />
            Customer-wise payment status (Paid, Pending, Overdue, Partial)
          </li>
          <li className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 mt-1.5 shrink-0" />
            EMI amounts, collected amounts, remaining balances, penalties
          </li>
          <li className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 mt-1.5 shrink-0" />
            Total collection and outstanding summary
          </li>
          <li className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 mt-1.5 shrink-0" />
            Custom footer text from brand settings
          </li>
        </ul>
      </div>
    </div>
  );
}
