import { useEffect, useState } from 'react';
import { X, Check, Calendar, CreditCard, FileText, Repeat } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  PAYMENT_METHODS,
  type Category,
  type Transaction,
  type TransactionType,
} from '../lib/types';
import { CategoryIcon } from '../lib/icons';
import { todayISO } from '../lib/format';
import { DateInputES } from './DateInputES';

interface TransactionModalProps {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  categories: Category[];
  editingTransaction?: Transaction | null;
  onSaved: () => void;
}

export function TransactionModal({
  open,
  onClose,
  workspaceId,
  categories,
  editingTransaction,
  onSaved,
}: TransactionModalProps) {
  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [date, setDate] = useState(todayISO());
  const [paymentMethod, setPaymentMethod] = useState<string>('Tarjeta');
  const [description, setDescription] = useState('');
  const [isFixed, setIsFixed] = useState(false);
  const [autoRepeatMonthly, setAutoRepeatMonthly] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredCategories = categories.filter(
    (c) =>
      c.type === type &&
      (!c.is_archived || c.id === editingTransaction?.category_id)
  );

  useEffect(() => {
    if (!open) return;
    setError(null);
    setAutoRepeatMonthly(false);
    if (editingTransaction) {
      setType(editingTransaction.type);
      setAmount(String(editingTransaction.amount));
      setCategoryId(editingTransaction.category_id ?? '');
      setDate(editingTransaction.transaction_date);
      setPaymentMethod(editingTransaction.payment_method);
      setDescription(editingTransaction.description ?? '');
      setIsFixed(editingTransaction.is_fixed);
    } else {
      setType('expense');
      setAmount('');
      setDate(todayISO());
      setPaymentMethod('Tarjeta');
      setDescription('');
      setIsFixed(false);
      const firstCat = categories.find((c) => c.type === 'expense' && !c.is_archived);
      setCategoryId(firstCat?.id ?? '');
    }
  }, [open, editingTransaction, categories]);

  useEffect(() => {
    if (!open) return;
    const valid = filteredCategories.some((c) => c.id === categoryId);
    if (!valid) {
      setCategoryId(filteredCategories[0]?.id ?? '');
    }
  }, [type, open, categoryId, filteredCategories]);

  if (!open) return null;

  const selectedDay = Number(date.split('-')[2]) || 1;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const numericAmount = parseFloat(amount.replace(',', '.'));
    if (isNaN(numericAmount) || numericAmount <= 0) {
      setError('Introduce un importe válido mayor que 0.');
      return;
    }

    setSaving(true);
    setError(null);

    // Si es nuevo y el usuario eligió repetirlo todos los meses, creamos la regla fija y la aplicamos a ese mes
    if (!editingTransaction && isFixed && autoRepeatMonthly) {
      const catName =
        categories.find((c) => c.id === categoryId)?.name ?? 'Movimiento fijo';
      const monthStart = `${date.slice(0, 7)}-01`;

      const { error: ruleErr } = await supabase.from('recurring_rules').insert({
        workspace_id: workspaceId,
        category_id: categoryId || null,
        type,
        amount: numericAmount,
        description: description.trim() || catName,
        payment_method: paymentMethod,
        day_of_month: selectedDay,
        start_date: monthStart,
        is_active: true,
      });

      if (ruleErr) {
        setSaving(false);
        setError('Error al crear la regla fija: ' + ruleErr.message);
        return;
      }

      const { error: syncErr } = await supabase.rpc('sync_recurring_transactions', {
        p_workspace_id: workspaceId,
        p_target_month: monthStart,
      });

      setSaving(false);
      if (syncErr) {
        setError('Regla creada, pero falló al aplicarla este mes: ' + syncErr.message);
        return;
      }

      onSaved();
      onClose();
      return;
    }

    const payload = {
      workspace_id: workspaceId,
      category_id: categoryId || null,
      type,
      amount: numericAmount,
      transaction_date: date,
      description: description.trim(),
      payment_method: paymentMethod,
      is_fixed: isFixed,
    };

    const { error: err } = editingTransaction
      ? await supabase
          .from('transactions')
          .update(payload)
          .eq('id', editingTransaction.id)
      : await supabase.from('transactions').insert(payload);

    setSaving(false);

    if (err) {
      setError('Error al guardar el movimiento: ' + err.message);
      return;
    }

    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full sm:max-w-lg bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl max-h-[92vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur-xs flex items-center justify-between px-5 py-4 border-b border-slate-800 z-10">
          <h2 className="text-base font-semibold text-white">
            {editingTransaction ? 'Editar movimiento' : 'Nuevo movimiento'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {/* Selector de tipo */}
          <div className="grid grid-cols-3 gap-2 p-1 bg-slate-950 rounded-xl border border-slate-800">
            {(
              [
                { id: 'expense', label: 'Gasto', active: 'bg-rose-500 text-white' },
                { id: 'income', label: 'Ingreso', active: 'bg-emerald-500 text-slate-950' },
                { id: 'investment', label: 'Inversión', active: 'bg-sky-500 text-slate-950' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setType(opt.id)}
                className={`py-2 text-sm font-semibold rounded-lg transition cursor-pointer ${
                  type === opt.id ? opt.active : 'text-slate-400 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Importe grande */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Importe (€)
            </label>
            <div className="relative">
              <input
                type="text"
                inputMode="decimal"
                autoFocus
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-2xl font-bold text-white focus:outline-none focus:border-emerald-500 pr-12"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xl font-bold text-slate-500">
                €
              </span>
            </div>
          </div>

          {/* Categorías con iconos */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">
              Categoría
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-44 overflow-y-auto pr-1">
              {filteredCategories.map((cat) => {
                const selected = cat.id === categoryId;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategoryId(cat.id)}
                    className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border text-center transition cursor-pointer ${
                      selected
                        ? 'bg-slate-800 border-emerald-500 ring-1 ring-emerald-500'
                        : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${cat.color}22`, color: cat.color }}
                    >
                      <CategoryIcon name={cat.icon} className="w-4 h-4" />
                    </div>
                    <span className="text-[11px] font-medium text-slate-200 leading-tight line-clamp-2">
                      {cat.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Fecha (Día / Mes / Año) y nota */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-1.5">
                <Calendar className="w-3.5 h-3.5" /> Fecha (Día / Mes / Año)
              </label>
              <DateInputES value={date} onChange={setDate} />
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-1.5">
                <FileText className="w-3.5 h-3.5" /> Nota / Subcategoría
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ej. Mercadona, Gasolina..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Método de pago */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-2">
              <CreditCard className="w-3.5 h-3.5" /> Método de pago
            </label>
            <div className="flex flex-wrap gap-2">
              {PAYMENT_METHODS.map((pm) => (
                <button
                  key={pm}
                  type="button"
                  onClick={() => setPaymentMethod(pm)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
                    paymentMethod === pm
                      ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {pm}
                </button>
              ))}
            </div>
          </div>

          {/* Fijo / Recurrente */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-3">
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <div>
                <p className="text-sm font-medium text-white">
                  Etiquetar como movimiento fijo
                </p>
                <p className="text-xs text-slate-400">
                  Lo separa de tus gastos variables en el resumen mensual.
                </p>
              </div>
              <input
                type="checkbox"
                checked={isFixed}
                onChange={(e) => {
                  setIsFixed(e.target.checked);
                  if (!e.target.checked) setAutoRepeatMonthly(false);
                }}
                className="w-5 h-5 accent-emerald-500 cursor-pointer shrink-0"
              />
            </label>

            {!editingTransaction && isFixed && (
              <label className="flex items-center justify-between gap-3 pt-3 border-t border-slate-800 cursor-pointer">
                <div className="flex items-start gap-2">
                  <Repeat className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-indigo-300">
                      Repetir automáticamente todos los meses (día {selectedDay})
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Se guardará también en tu pestaña Fijos para los próximos meses.
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={autoRepeatMonthly}
                  onChange={(e) => setAutoRepeatMonthly(e.target.checked)}
                  className="w-4 h-4 accent-indigo-500 cursor-pointer shrink-0"
                />
              </label>
            )}
          </div>

          {error && (
            <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-semibold py-3 rounded-xl transition cursor-pointer"
          >
            <Check className="w-5 h-5" />
            {saving
              ? 'Guardando...'
              : editingTransaction
              ? 'Guardar cambios'
              : autoRepeatMonthly
              ? 'Guardar y activar cada mes'
              : 'Añadir movimiento'}
          </button>
        </form>
      </div>
    </div>
  );
}