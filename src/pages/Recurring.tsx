import { useMemo, useState } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Pause,
  Play,
  RefreshCw,
  Calendar,
  Repeat,
  X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  PAYMENT_METHODS,
  type Category,
  type RecurringRule,
  type TransactionType,
} from '../lib/types';
import { formatEUR, todayISO } from '../lib/format';
import { CategoryIcon } from '../lib/icons';

interface RecurringProps {
  workspaceId: string;
  rules: RecurringRule[];
  categories: Category[];
  onUpdated: () => void;
}

export function Recurring({
  workspaceId,
  rules,
  categories,
  onUpdated,
}: RecurringProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<RecurringRule | null>(null);
  const [type, setType] = useState<TransactionType>('expense');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<string>('Domiciliación');
  const [dayOfMonth, setDayOfMonth] = useState('1');
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const catMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories]
  );

  const availableCategories = useMemo(
    () =>
      categories.filter(
        (c) =>
          c.type === type &&
          (!c.is_archived || c.id === editingRule?.category_id)
      ),
    [categories, type, editingRule]
  );

  const totals = useMemo(() => {
    let expenses = 0;
    let incomes = 0;
    let investments = 0;
    for (const r of rules) {
      if (!r.is_active) continue;
      if (r.type === 'expense') expenses += Number(r.amount);
      else if (r.type === 'income') incomes += Number(r.amount);
      else if (r.type === 'investment') investments += Number(r.amount);
    }
    return { expenses, incomes, investments };
  }, [rules]);

  function resetForm() {
    setEditingRule(null);
    setType('expense');
    setDescription('');
    setAmount('');
    setCategoryId('');
    setPaymentMethod('Domiciliación');
    setDayOfMonth('1');
    setShowForm(false);
  }

  function startEdit(rule: RecurringRule) {
    setEditingRule(rule);
    setType(rule.type);
    setDescription(rule.description);
    setAmount(String(rule.amount));
    setCategoryId(rule.category_id ?? '');
    setPaymentMethod(rule.payment_method);
    setDayOfMonth(String(rule.day_of_month));
    setShowForm(true);
    setFeedback(null);
  }

  async function syncCurrentMonth() {
    setSyncing(true);
    setFeedback(null);
    const now = new Date();
    const targetMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const { data, error } = await supabase.rpc('sync_recurring_transactions', {
      p_workspace_id: workspaceId,
      p_target_month: targetMonth,
    });
    setSyncing(false);

    if (error) {
      setFeedback('Error al sincronizar: ' + error.message);
      return;
    }

    const inserted = Number(data ?? 0);
    setFeedback(
      inserted > 0
        ? `Se han insertado ${inserted} movimiento(s) fijo(s) en este mes.`
        : 'Todos los movimientos fijos de este mes ya estaban aplicados.'
    );
    onUpdated();
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const numAmount = parseFloat(amount.replace(',', '.'));
    const day = Math.min(31, Math.max(1, parseInt(dayOfMonth, 10) || 1));
    if (isNaN(numAmount) || numAmount <= 0 || !description.trim()) return;

    setSaving(true);
    const chosenCat = categoryId || availableCategories[0]?.id || null;

    if (editingRule) {
      const { error } = await supabase
        .from('recurring_rules')
        .update({
          category_id: chosenCat,
          type,
          amount: numAmount,
          description: description.trim(),
          payment_method: paymentMethod,
          day_of_month: day,
        })
        .eq('id', editingRule.id);

      setSaving(false);
      if (!error) {
        resetForm();
        setFeedback(
          'Regla fija actualizada. Se aplicará con los nuevos datos a partir del próximo mes.'
        );
        onUpdated();
      }
      return;
    }

    const monthStart = todayISO().slice(0, 7) + '-01';
    const { error } = await supabase.from('recurring_rules').insert({
      workspace_id: workspaceId,
      category_id: chosenCat,
      type,
      amount: numAmount,
      description: description.trim(),
      payment_method: paymentMethod,
      day_of_month: day,
      start_date: monthStart,
      is_active: true,
    });

    if (!error) {
      await supabase.rpc('sync_recurring_transactions', {
        p_workspace_id: workspaceId,
        p_target_month: monthStart,
      });
      resetForm();
      setFeedback('Regla fija creada y aplicada automáticamente al mes actual.');
      onUpdated();
    }
    setSaving(false);
  }

  async function toggleActive(rule: RecurringRule) {
    await supabase
      .from('recurring_rules')
      .update({ is_active: !rule.is_active })
      .eq('id', rule.id);
    onUpdated();
  }

  async function handleDelete(id: string) {
    if (
      !window.confirm(
        '¿Eliminar esta regla fija? Los movimientos ya generados en meses anteriores se conservarán.'
      )
    ) {
      return;
    }
    await supabase.from('recurring_rules').delete().eq('id', id);
    if (editingRule?.id === id) resetForm();
    onUpdated();
  }

  return (
    <div className="space-y-5">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Repeat className="w-5 h-5 text-emerald-400" />
            Movimientos fijos automáticos
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Se insertan solos cada mes al abrir la app sin duplicarse.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={syncCurrentMonth}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-xl text-xs font-semibold text-slate-200 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 text-emerald-400 ${syncing ? 'animate-spin' : ''}`} />
            Aplicar este mes
          </button>
          <button
            type="button"
            onClick={() => {
              if (showForm && !editingRule) resetForm();
              else {
                resetForm();
                setShowForm(true);
              }
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 rounded-xl text-xs font-semibold text-slate-950 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Nuevo fijo
          </button>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5">
          <p className="text-[11px] text-slate-400">Ingresos fijos / mes</p>
          <p className="text-base sm:text-lg font-bold text-emerald-400 mt-1">
            {formatEUR(totals.incomes)}
          </p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5">
          <p className="text-[11px] text-slate-400">Gastos fijos / mes</p>
          <p className="text-base sm:text-lg font-bold text-rose-400 mt-1">
            {formatEUR(totals.expenses)}
          </p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5">
          <p className="text-[11px] text-slate-400">Inversión fija / mes</p>
          <p className="text-base sm:text-lg font-bold text-sky-400 mt-1">
            {formatEUR(totals.investments)}
          </p>
        </div>
      </div>

      {feedback && (
        <div className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 rounded-xl px-4 py-3">
          {feedback}
        </div>
      )}

      {/* Formulario crear / editar regla */}
      {showForm && (
        <form
          onSubmit={handleSave}
          className="bg-slate-900 border border-emerald-500/40 rounded-2xl p-4 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">
              {editingRule ? `Editando: ${editingRule.description}` : 'Nuevo movimiento fijo'}
            </h3>
            <button
              type="button"
              onClick={resetForm}
              className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 p-1 bg-slate-950 rounded-xl border border-slate-800">
            {(
              [
                { id: 'expense', label: 'Gasto fijo', active: 'bg-rose-500 text-white' },
                { id: 'income', label: 'Ingreso fijo', active: 'bg-emerald-500 text-slate-950' },
                { id: 'investment', label: 'Inversión fija', active: 'bg-sky-500 text-slate-950' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setType(opt.id);
                  setCategoryId('');
                }}
                className={`py-2 text-xs font-semibold rounded-lg transition cursor-pointer ${
                  type === opt.id ? opt.active : 'text-slate-400 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <input
              type="text"
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Concepto (ej. Alquiler, Gimnasio, ETF...)"
              className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
            />
            <input
              type="text"
              inputMode="decimal"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Importe (€)"
              className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
            />
            <select
              value={categoryId || availableCategories[0]?.id || ''}
              onChange={(e) => setCategoryId(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
            >
              {availableCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
            >
              {PAYMENT_METHODS.map((pm) => (
                <option key={pm} value={pm}>
                  {pm}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5">
              <Calendar className="w-4 h-4 text-slate-500 shrink-0" />
              <span className="text-xs text-slate-400 shrink-0">Día del mes:</span>
              <input
                type="number"
                min={1}
                max={31}
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(e.target.value)}
                className="w-full bg-transparent text-sm text-white focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-semibold rounded-xl py-2.5 text-sm cursor-pointer"
            >
              {saving
                ? 'Guardando...'
                : editingRule
                ? 'Guardar cambios'
                : 'Guardar y activar'}
            </button>
          </div>
        </form>
      )}

      {/* Lista de reglas */}
      {rules.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center text-sm text-slate-400">
          Todavía no tienes movimientos fijos configurados. Pulsa{' '}
          <strong className="text-white">Nuevo fijo</strong> para añadir alquiler, internet, nómina o aportaciones automáticas.
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl divide-y divide-slate-800">
          {rules.map((r) => {
            const cat = r.category_id ? catMap.get(r.category_id) : undefined;
            const amtColor =
              r.type === 'income'
                ? 'text-emerald-400'
                : r.type === 'investment'
                ? 'text-sky-400'
                : 'text-rose-400';

            return (
              <div
                key={r.id}
                className={`flex items-center justify-between gap-3 p-4 ${
                  r.is_active ? '' : 'opacity-50'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: `${cat?.color ?? '#64748B'}22`,
                      color: cat?.color ?? '#94A3B8',
                    }}
                  >
                    <CategoryIcon name={cat?.icon ?? 'Repeat'} className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">
                      {r.description}
                    </p>
                    <p className="text-xs text-slate-400">
                      Día {r.day_of_month} · {cat?.name ?? 'Sin categoría'} · {r.payment_method}
                      {!r.is_active && ' · Pausado'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                  <span className={`text-sm sm:text-base font-bold mr-1 ${amtColor}`}>
                    {formatEUR(Number(r.amount))}
                  </span>
                  <button
                    type="button"
                    onClick={() => startEdit(r)}
                    className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg cursor-pointer"
                    title="Editar"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleActive(r)}
                    className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg cursor-pointer"
                    title={r.is_active ? 'Pausar' : 'Reanudar'}
                  >
                    {r.is_active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(r.id)}
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