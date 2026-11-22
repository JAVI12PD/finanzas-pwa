import { useMemo, useState } from 'react';
import {
  Search,
  Download,
  Pencil,
  Trash2,
  Repeat,
  ArrowUpRight,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Category, Transaction, TransactionType, Workspace } from '../lib/types';
import {
  exportTransactionsToCSV,
  formatDateES,
  formatEUR,
  getMonthKey,
} from '../lib/format';
import { CategoryIcon } from '../lib/icons';
import { MonthStrip } from '../components/MonthStrip';

interface TransactionsProps {
  workspace: Workspace;
  transactions: Transaction[];
  categories: Category[];
  selectedYear: number;
  selectedMonth: number;
  onChangeMonth: (year: number, month: number) => void;
  onEdit: (tx: Transaction) => void;
  onDeleted: () => void;
}

export function Transactions({
  workspace,
  transactions,
  categories,
  selectedYear,
  selectedMonth,
  onChangeMonth,
  onEdit,
  onDeleted,
}: TransactionsProps) {
  const [scope, setScope] = useState<'month' | 'all'>('month');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | TransactionType>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [fixedFilter, setFixedFilter] = useState<'all' | 'fixed' | 'variable'>('all');

  const currentMonthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;

  const activeMonthKeys = useMemo(
    () => new Set(transactions.map((t) => getMonthKey(t.transaction_date))),
    [transactions]
  );

  const catMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter((t) => {
      if (scope === 'month' && getMonthKey(t.transaction_date) !== currentMonthKey) {
        return false;
      }
      if (typeFilter !== 'all' && t.type !== typeFilter) return false;
      if (categoryFilter !== 'all' && t.category_id !== categoryFilter) return false;
      if (fixedFilter === 'fixed' && !t.is_fixed) return false;
      if (fixedFilter === 'variable' && t.is_fixed) return false;
      if (q) {
        const catName = t.category_id ? (catMap.get(t.category_id)?.name ?? '') : '';
        const text = `${t.description} ${catName} ${t.payment_method}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [
    transactions,
    scope,
    currentMonthKey,
    typeFilter,
    categoryFilter,
    fixedFilter,
    search,
    catMap,
  ]);

  async function handleDelete(id: string) {
    if (!window.confirm('¿Seguro que quieres eliminar este movimiento?')) return;
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    if (!error) onDeleted();
  }

  return (
    <div className="space-y-4">
      {/* Cabecera: selector Por mes / Histórico + Exportar CSV */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex bg-slate-900 border border-slate-800 rounded-xl p-1">
          <button
            type="button"
            onClick={() => setScope('month')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
              scope === 'month'
                ? 'bg-emerald-500 text-slate-950'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Por mes
          </button>
          <button
            type="button"
            onClick={() => setScope('all')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
              scope === 'all'
                ? 'bg-emerald-500 text-slate-950'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Todo el histórico
          </button>
        </div>

        <button
          type="button"
          onClick={() =>
            exportTransactionsToCSV(filtered, categories, workspace.name)
          }
          className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-xl text-xs font-semibold text-slate-200 transition cursor-pointer"
        >
          <Download className="w-4 h-4 text-emerald-400" />
          Exportar CSV ({filtered.length})
        </button>
      </div>

      {/* Selector visual de meses cuando está en modo "Por mes" */}
      {scope === 'month' && (
        <MonthStrip
          selectedYear={selectedYear}
          selectedMonth={selectedMonth}
          onChangeMonth={onChangeMonth}
          activeMonthKeys={activeMonthKeys}
        />
      )}

      {/* Filtros */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 bg-slate-900 border border-slate-800 rounded-2xl p-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nota, categoría..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
          />
        </div>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as 'all' | TransactionType)}
          className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
        >
          <option value="all">Todos los tipos</option>
          <option value="expense">Solo Gastos</option>
          <option value="income">Solo Ingresos</option>
          <option value="investment">Solo Inversión</option>
        </select>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
        >
          <option value="all">Todas las categorías</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          value={fixedFilter}
          onChange={(e) =>
            setFixedFilter(e.target.value as 'all' | 'fixed' | 'variable')
          }
          className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
        >
          <option value="all">Fijos y variables</option>
          <option value="fixed">Solo fijos</option>
          <option value="variable">Solo variables</option>
        </select>
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center text-sm text-slate-400">
          No hay movimientos que coincidan con estos filtros.
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl divide-y divide-slate-800/80 overflow-hidden">
          {filtered.map((tx) => {
            const cat = tx.category_id ? catMap.get(tx.category_id) : undefined;
            const amountColor =
              tx.type === 'income'
                ? 'text-emerald-400'
                : tx.type === 'investment'
                ? 'text-sky-400'
                : 'text-rose-400';

            return (
              <div
                key={tx.id}
                className="flex items-center justify-between gap-3 p-3.5 sm:px-5 hover:bg-slate-800/40 transition"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: `${cat?.color ?? '#64748B'}22`,
                      color: cat?.color ?? '#94A3B8',
                    }}
                  >
                    <CategoryIcon name={cat?.icon ?? 'Tag'} className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-white truncate">
                        {tx.description || cat?.name || 'Movimiento'}
                      </p>
                      {tx.is_fixed && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-indigo-500/15 text-indigo-300 shrink-0">
                          <Repeat className="w-2.5 h-2.5" /> Fijo
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400 mt-0.5">
                      <span>{formatDateES(tx.transaction_date)}</span>
                      <span>·</span>
                      <span>{cat?.name ?? 'Sin categoría'}</span>
                      <span>·</span>
                      <span>{tx.payment_method}</span>
                      {workspace.type === 'shared' && tx.profiles?.full_name && (
                        <>
                          <span>·</span>
                          <span className="text-emerald-400/90">
                            {tx.profiles.full_name}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                  <span
                    className={`inline-flex items-center gap-0.5 text-sm sm:text-base font-bold ${amountColor}`}
                  >
                    {tx.type === 'income' && '+'}
                    {tx.type === 'expense' && '-'}
                    {tx.type === 'investment' && (
                      <ArrowUpRight className="w-4 h-4 shrink-0" />
                    )}
                    {formatEUR(Number(tx.amount))}
                  </span>
                  <button
                    type="button"
                    onClick={() => onEdit(tx)}
                    className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg cursor-pointer"
                    title="Editar"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(tx.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg cursor-pointer"
                    title="Eliminar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}