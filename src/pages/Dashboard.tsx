import { useMemo, useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  PiggyBank,
  LineChart,
  Landmark,
  AlertTriangle,
  Settings as SettingsIcon,
  Calendar,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  CartesianGrid,
} from 'recharts';
import type { Category, Transaction, Workspace } from '../lib/types';
import { formatEUR, getMonthKey } from '../lib/format';
import { CategoryIcon } from '../lib/icons';
import { MonthStrip } from '../components/MonthStrip';

interface DashboardProps {
  workspace: Workspace;
  transactions: Transaction[];
  categories: Category[];
  selectedYear: number;
  selectedMonth: number;
  onChangeMonth: (year: number, month: number) => void;
  onGoToSettings: () => void;
}

export function Dashboard({
  workspace,
  transactions,
  categories,
  selectedYear,
  selectedMonth,
  onChangeMonth,
  onGoToSettings,
}: DashboardProps) {
  const [viewMode, setViewMode] = useState<'month' | 'year'>('month');

  const now = new Date();
  const realYear = now.getFullYear();
  const currentMonthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
  const currentYearPrefix = `${selectedYear}-`;
  const cutoffMonthKey =
    viewMode === 'year' ? `${selectedYear}-12` : currentMonthKey;

  const activeMonthKeys = useMemo(
    () => new Set(transactions.map((t) => getMonthKey(t.transaction_date))),
    [transactions]
  );

  const catMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories]
  );

  // KPIs del periodo seleccionado (mes o año completo)
  const periodStats = useMemo(() => {
    let income = 0;
    let expense = 0;
    let fixedExpense = 0;
    let variableExpense = 0;
    let investment = 0;

    for (const t of transactions) {
      const inPeriod =
        viewMode === 'year'
          ? t.transaction_date.startsWith(currentYearPrefix)
          : getMonthKey(t.transaction_date) === currentMonthKey;

      if (!inPeriod) continue;
      const amt = Number(t.amount);
      if (t.type === 'income') income += amt;
      else if (t.type === 'expense') {
        expense += amt;
        if (t.is_fixed) fixedExpense += amt;
        else variableExpense += amt;
      } else if (t.type === 'investment') {
        investment += amt;
      }
    }

    const totalSaved = income - expense;
    const netLiquidity = totalSaved - investment;
    const savingsRate = income > 0 ? (totalSaved / income) * 100 : 0;
    const fixedPct = expense > 0 ? (fixedExpense / expense) * 100 : 0;

    return {
      income,
      expense,
      fixedExpense,
      variableExpense,
      fixedPct,
      investment,
      totalSaved,
      netLiquidity,
      savingsRate,
    };
  }, [transactions, viewMode, currentMonthKey, currentYearPrefix]);

  // Ahorro acumulado histórico hasta el final del periodo seleccionado
  const accumulatedStats = useMemo(() => {
    let totalIncome = 0;
    let totalExpense = 0;
    let totalInvested = 0;

    for (const t of transactions) {
      if (getMonthKey(t.transaction_date) > cutoffMonthKey) continue;
      const amt = Number(t.amount);
      if (t.type === 'income') totalIncome += amt;
      else if (t.type === 'expense') totalExpense += amt;
      else if (t.type === 'investment') totalInvested += amt;
    }

    const base = Number(workspace.initial_balance || 0);
    const totalAccumulated = base + totalIncome - totalExpense;
    const cashAccumulated = totalAccumulated - totalInvested;

    return { totalAccumulated, totalInvested, cashAccumulated };
  }, [transactions, workspace.initial_balance, cutoffMonthKey]);

  // Serie temporal: últimos 6 meses (vista mensual) o los 12 meses del año (vista anual)
  const chartSeries = useMemo(() => {
    const months: { key: string; label: string; year: number; month: number }[] = [];

    if (viewMode === 'year') {
      for (let m = 0; m < 12; m++) {
        const d = new Date(selectedYear, m, 1);
        const key = `${selectedYear}-${String(m + 1).padStart(2, '0')}`;
        const shortLabel = new Intl.DateTimeFormat('es-ES', { month: 'short' }).format(d);
        months.push({
          key,
          year: selectedYear,
          month: m,
          label: shortLabel.charAt(0).toUpperCase() + shortLabel.slice(1),
        });
      }
    } else {
      for (let i = 5; i >= 0; i--) {
        const d = new Date(selectedYear, selectedMonth - i, 1);
        const y = d.getFullYear();
        const m = d.getMonth();
        const key = `${y}-${String(m + 1).padStart(2, '0')}`;
        const shortLabel = new Intl.DateTimeFormat('es-ES', { month: 'short' }).format(d);
        months.push({
          key,
          year: y,
          month: m,
          label: shortLabel.charAt(0).toUpperCase() + shortLabel.slice(1),
        });
      }
    }

    const firstKey = months[0].key;
    let runningAccumulated = Number(workspace.initial_balance || 0);

    for (const t of transactions) {
      const k = getMonthKey(t.transaction_date);
      if (k < firstKey) {
        const amt = Number(t.amount);
        if (t.type === 'income') runningAccumulated += amt;
        else if (t.type === 'expense') runningAccumulated -= amt;
      }
    }

    return months.map(({ key, label, year, month }) => {
      let ingresos = 0;
      let gastos = 0;
      let inversion = 0;

      for (const t of transactions) {
        if (getMonthKey(t.transaction_date) !== key) continue;
        const amt = Number(t.amount);
        if (t.type === 'income') ingresos += amt;
        else if (t.type === 'expense') gastos += amt;
        else if (t.type === 'investment') inversion += amt;
      }

      const ahorro = ingresos - gastos;
      runningAccumulated += ahorro;

      return {
        key,
        year,
        month,
        label,
        ingresos: Number(ingresos.toFixed(2)),
        gastos: Number(gastos.toFixed(2)),
        inversion: Number(inversion.toFixed(2)),
        ahorro: Number(ahorro.toFixed(2)),
        acumulado: Number(runningAccumulated.toFixed(2)),
      };
    });
  }, [transactions, viewMode, selectedYear, selectedMonth, workspace.initial_balance]);

  // Distribución de gastos del periodo por categoría
  const expenseByCategory = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; color: string; icon: string; amount: number }
    >();

    for (const t of transactions) {
      if (t.type !== 'expense') continue;
      const inPeriod =
        viewMode === 'year'
          ? t.transaction_date.startsWith(currentYearPrefix)
          : getMonthKey(t.transaction_date) === currentMonthKey;
      if (!inPeriod) continue;

      const cat = t.category_id ? catMap.get(t.category_id) : undefined;
      const key = cat?.id ?? 'uncategorized';
      const existing = map.get(key);
      if (existing) {
        existing.amount += Number(t.amount);
      } else {
        map.set(key, {
          id: key,
          name: cat?.name ?? 'Sin categoría',
          color: cat?.color ?? '#64748B',
          icon: cat?.icon ?? 'Tag',
          amount: Number(t.amount),
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }, [transactions, catMap, viewMode, currentMonthKey, currentYearPrefix]);

  // Presupuestos configurados (mensual o anualizado x12)
  const budgetedCategories = useMemo(() => {
    const spentMap = new Map(expenseByCategory.map((e) => [e.id, e.amount]));
    const multiplier = viewMode === 'year' ? 12 : 1;

    return categories
      .filter((c) => c.type === 'expense' && !c.is_archived && c.monthly_budget)
      .map((c) => {
        const spent = spentMap.get(c.id) ?? 0;
        const budget = Number(c.monthly_budget) * multiplier;
        const pct = (spent / budget) * 100;
        return { category: c, spent, budget, pct };
      })
      .sort((a, b) => b.pct - a.pct);
  }, [categories, expenseByCategory, viewMode]);

  return (
    <div className="space-y-5">
      {/* Selector de modo: Vista mensual / Vista anual */}
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex bg-slate-900 border border-slate-800 rounded-xl p-1">
          <button
            type="button"
            onClick={() => setViewMode('month')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
              viewMode === 'month'
                ? 'bg-emerald-500 text-slate-950'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Vista mensual
          </button>
          <button
            type="button"
            onClick={() => setViewMode('year')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
              viewMode === 'year'
                ? 'bg-emerald-500 text-slate-950'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Resumen anual
          </button>
        </div>

        <span className="text-xs text-slate-400 hidden sm:inline">
          {viewMode === 'year'
            ? `Balance completo de ${selectedYear}`
            : 'Balance mensual detallado'}
        </span>
      </div>

      {/* Selector de periodo */}
      {viewMode === 'month' ? (
        <MonthStrip
          selectedYear={selectedYear}
          selectedMonth={selectedMonth}
          onChangeMonth={onChangeMonth}
          activeMonthKeys={activeMonthKeys}
        />
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white">
                  Año {selectedYear}
                </h2>
                {selectedYear === realYear && (
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    Año actual
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                Acumulado de enero a diciembre de {selectedYear}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {selectedYear !== realYear && (
              <button
                type="button"
                onClick={() => onChangeMonth(realYear, selectedMonth)}
                className="px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-xs font-semibold text-emerald-300 cursor-pointer"
              >
                Año actual
              </button>
            )}
            <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-xl px-1.5 py-1">
              <button
                type="button"
                onClick={() => onChangeMonth(selectedYear - 1, selectedMonth)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
                aria-label="Año anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-bold text-white px-3">
                {selectedYear}
              </span>
              <button
                type="button"
                onClick={() => onChangeMonth(selectedYear + 1, selectedMonth)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
                aria-label="Año siguiente"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ahorro acumulado total */}
      <div className="bg-gradient-to-br from-emerald-500/15 via-slate-900 to-slate-900 border border-emerald-500/30 rounded-2xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
              <Landmark className="w-4 h-4" />
              Ahorro acumulado total ({workspace.name})
            </div>
            <p className="text-3xl sm:text-4xl font-extrabold text-white mt-1">
              {formatEUR(accumulatedStats.totalAccumulated)}
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl px-3.5 py-2">
              <span className="text-slate-400 block">Liquidez acumulada</span>
              <span className="text-sm font-bold text-emerald-300">
                {formatEUR(accumulatedStats.cashAccumulated)}
              </span>
            </div>
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl px-3.5 py-2">
              <span className="text-slate-400 block">Invertido acumulado</span>
              <span className="text-sm font-bold text-sky-400">
                {formatEUR(accumulatedStats.totalInvested)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 4 KPIs del periodo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>{viewMode === 'year' ? `Ingresos ${selectedYear}` : 'Ingresos'}</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-xl sm:text-2xl font-bold text-emerald-400 mt-2">
            {formatEUR(periodStats.income)}
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>{viewMode === 'year' ? `Gastos ${selectedYear}` : 'Gastos'}</span>
            <TrendingDown className="w-4 h-4 text-rose-400" />
          </div>
          <p className="text-xl sm:text-2xl font-bold text-rose-400 mt-2">
            {formatEUR(periodStats.expense)}
          </p>
          {periodStats.expense > 0 && (
            <p className="text-[11px] text-slate-400 mt-1">
              Fijos {periodStats.fixedPct.toFixed(0)}% · Variables{' '}
              {(100 - periodStats.fixedPct).toFixed(0)}%
            </p>
          )}
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>{viewMode === 'year' ? `Inversión ${selectedYear}` : 'Inversión'}</span>
            <LineChart className="w-4 h-4 text-sky-400" />
          </div>
          <p className="text-xl sm:text-2xl font-bold text-sky-400 mt-2">
            {formatEUR(periodStats.investment)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            Liquidez {viewMode === 'year' ? 'año' : 'mes'}:{' '}
            {formatEUR(periodStats.netLiquidity)}
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>{viewMode === 'year' ? `Ahorro ${selectedYear}` : 'Ahorro del mes'}</span>
            <PiggyBank className="w-4 h-4 text-amber-400" />
          </div>
          <p
            className={`text-xl sm:text-2xl font-bold mt-2 ${
              periodStats.totalSaved >= 0 ? 'text-white' : 'text-rose-400'
            }`}
          >
            {formatEUR(periodStats.totalSaved)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            Tasa de ahorro:{' '}
            <span className="font-semibold text-emerald-400">
              {periodStats.savingsRate.toFixed(1)}%
            </span>
          </p>
        </div>
      </div>

      {/* Desglose visual Fijos vs Variables */}
      {periodStats.expense > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs mb-2">
            <span className="font-semibold text-white">
              Distribución de gastos ({viewMode === 'year' ? selectedYear : 'mes'}): Fijos vs Variables
            </span>
            <div className="flex items-center gap-4">
              <span className="text-indigo-300">
                Fijos: <strong>{formatEUR(periodStats.fixedExpense)}</strong> (
                {periodStats.fixedPct.toFixed(0)}%)
              </span>
              <span className="text-rose-300">
                Variables: <strong>{formatEUR(periodStats.variableExpense)}</strong> (
                {(100 - periodStats.fixedPct).toFixed(0)}%)
              </span>
            </div>
          </div>
          <div className="h-2.5 bg-rose-500/80 rounded-full overflow-hidden flex">
            <div
              className="h-full bg-indigo-500 transition-all"
              style={{ width: `${periodStats.fixedPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">
            Ingresos vs Gastos vs Inversión (
            {viewMode === 'year' ? `Año ${selectedYear}` : 'últimos 6 meses'})
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="label" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: '12px',
                    fontSize: '12px',
                  }}
                  formatter={(value) => formatEUR(Number(value ?? 0))}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                <Bar dataKey="ingresos" name="Ingresos" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="gastos" name="Gastos" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="inversion" name="Inversión" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">
            Evolución del ahorro acumulado (
            {viewMode === 'year' ? `Año ${selectedYear}` : 'últimos 6 meses'})
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartSeries}>
                <defs>
                  <linearGradient id="accGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="label" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: '12px',
                    fontSize: '12px',
                  }}
                  formatter={(value) => formatEUR(Number(value ?? 0))}
                />
                <Area
                  type="monotone"
                  dataKey="acumulado"
                  name="Ahorro acumulado"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  fill="url(#accGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Ahorro neto mes a mes (clicable para saltar a ese mes) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
          Ahorro neto mes a mes ({viewMode === 'year' ? selectedYear : 'últimos 6 meses'})
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {chartSeries.map((m) => {
            const isSelected = viewMode === 'month' && m.key === currentMonthKey;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => {
                  onChangeMonth(m.year, m.month);
                  setViewMode('month');
                }}
                className={`text-left p-3 rounded-xl border transition cursor-pointer ${
                  isSelected
                    ? 'bg-slate-800 border-emerald-500/60'
                    : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                }`}
              >
                <p className="text-[11px] font-medium text-slate-400">
                  {m.label} {m.year}
                </p>
                <p
                  className={`text-sm font-bold mt-1 ${
                    m.ahorro > 0
                      ? 'text-emerald-400'
                      : m.ahorro < 0
                      ? 'text-rose-400'
                      : 'text-slate-400'
                  }`}
                >
                  {m.ahorro > 0 ? '+' : ''}
                  {formatEUR(m.ahorro)}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Distribución por categorías + Presupuestos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">
            Gastos por categoría ({viewMode === 'year' ? selectedYear : 'mes'})
          </h3>
          {expenseByCategory.length === 0 ? (
            <p className="text-sm text-slate-400 py-12 text-center">
              Sin gastos registrados en este periodo.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={expenseByCategory}
                      dataKey="amount"
                      nameKey="name"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                    >
                      {expenseByCategory.map((entry) => (
                        <Cell key={entry.id} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        borderColor: '#334155',
                        borderRadius: '12px',
                        fontSize: '12px',
                      }}
                      formatter={(value) => formatEUR(Number(value ?? 0))}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {expenseByCategory.map((item) => {
                  const pct =
                    periodStats.expense > 0
                      ? (item.amount / periodStats.expense) * 100
                      : 0;
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between text-xs gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="text-slate-200 truncate">{item.name}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-semibold text-white">
                          {formatEUR(item.amount)}
                        </span>
                        <span className="text-slate-500 ml-1.5">
                          ({pct.toFixed(0)}%)
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Presupuestos límite */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">
              Presupuestos por categoría{' '}
              {viewMode === 'year' && (
                <span className="text-xs font-normal text-slate-400">(Anual)</span>
              )}
            </h3>
            <button
              type="button"
              onClick={onGoToSettings}
              className="text-xs text-emerald-400 hover:text-emerald-300 font-medium cursor-pointer"
            >
              Editar límites
            </button>
          </div>
          {budgetedCategories.length === 0 ? (
            <div className="py-10 text-center space-y-3">
              <p className="text-sm text-slate-400">
                Aún no has fijado presupuestos límite para tus categorías de gasto.
              </p>
              <button
                type="button"
                onClick={onGoToSettings}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white rounded-xl transition cursor-pointer"
              >
                <SettingsIcon className="w-3.5 h-3.5 text-emerald-400" />
                Ir a Ajustes para configurarlos
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {budgetedCategories.map(({ category, spent, budget, pct }) => {
                const barColor =
                  pct >= 100
                    ? 'bg-rose-500'
                    : pct >= 80
                    ? 'bg-amber-400'
                    : 'bg-emerald-500';
                return (
                  <div key={category.id} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span style={{ color: category.color }}>
                          <CategoryIcon name={category.icon} className="w-4 h-4" />
                        </span>
                        <span className="font-medium text-slate-200">
                          {category.name}
                        </span>
                        {pct >= 100 && (
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                        )}
                      </div>
                      <span className="text-slate-300">
                        <strong className="text-white">{formatEUR(spent)}</strong> /{' '}
                        {formatEUR(budget)} ({pct.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${barColor}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}