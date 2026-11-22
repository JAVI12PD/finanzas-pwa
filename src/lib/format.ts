import type { Category, Transaction } from './types';

export function formatEUR(amount: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDateES(isoDate: string): string {
  if (!isoDate) return '';
  const parts = isoDate.split('-').map(Number);
  if (parts.length !== 3) return isoDate;
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function formatMonthLabel(year: number, monthIndex: number): string {
  const date = new Date(year, monthIndex, 1);
  const label = new Intl.DateTimeFormat('es-ES', {
    month: 'long',
    year: 'numeric',
  }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function getMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7); // "YYYY-MM"
}

export function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function offsetDaysISO(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function exportTransactionsToCSV(
  transactions: Transaction[],
  categories: Category[],
  workspaceName: string
) {
  const catMap = new Map(categories.map((c) => [c.id, c.name]));
  const typeLabel: Record<string, string> = {
    income: 'Ingreso',
    expense: 'Gasto',
    investment: 'Inversión',
  };

  const headers = [
    'Fecha',
    'Tipo',
    'Categoría',
    'Importe (€)',
    'Método de pago',
    'Fijo',
    'Descripción',
    'Usuario',
  ];

  const rows = transactions.map((t) => [
    t.transaction_date,
    typeLabel[t.type] ?? t.type,
    t.category_id ? (catMap.get(t.category_id) ?? 'Sin categoría') : 'Sin categoría',
    Number(t.amount).toFixed(2).replace('.', ','),
    t.payment_method,
    t.is_fixed ? 'Sí' : 'No',
    `"${(t.description || '').replace(/"/g, '""')}"`,
    t.profiles?.full_name ?? '',
  ]);

  const csvContent =
    '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = workspaceName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  a.href = url;
  a.download = `finanzas-${safeName}-${todayISO()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}