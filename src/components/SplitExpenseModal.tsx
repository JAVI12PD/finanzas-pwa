import { useEffect, useMemo, useState } from 'react';
import {
  X,
  Check,
  Calendar,
  FileText,
  CreditCard,
  ArrowRight,
  ArrowLeft,
  ChevronRight,
  Link2,
  Tag,
  Calculator,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  DEFAULT_EXPENSE_CATEGORY_NAMES,
  PAYMENT_METHODS,
  type SplitExpense,
  type SplitGroupMember,
  type SplitSyncSetting,
  type Workspace,
} from '../lib/types';
import { formatEUR, todayISO } from '../lib/format';
import { DateInputES } from './DateInputES';
import {
  CalculatorPad,
  evaluateCalcExpression,
  formatCalcDisplay,
} from './CalculatorPad';

type SplitMode = 'equal' | 'single' | 'exact';

interface SplitExpenseModalProps {
  open: boolean;
  onClose: () => void;
  groupId: string;
  members: SplitGroupMember[];
  myMemberId: string | null;
  mySyncSetting: SplitSyncSetting | null;
  targetWorkspace: Workspace | null;
  categoryOptions: string[];
  editingExpense?: SplitExpense | null;
  prefillSettlement?: {
    fromMemberId: string;
    toMemberId: string;
    amount: number;
  } | null;
  onSaved: () => void;
}

const AVATAR_BG = [
  '#10B981',
  '#6366F1',
  '#F59E0B',
  '#EC4899',
  '#0EA5E9',
  '#8B5CF6',
];

function getMemberBg(index: number): string {
  return AVATAR_BG[index % AVATAR_BG.length];
}

export function SplitExpenseModal({
  open,
  onClose,
  groupId,
  members,
  myMemberId,
  mySyncSetting,
  targetWorkspace,
  categoryOptions,
  editingExpense,
  prefillSettlement,
  onSaved,
}: SplitExpenseModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [modeType, setModeType] = useState<'expense' | 'settlement'>('expense');
  const [expression, setExpression] = useState('');
  const [paidById, setPaidById] = useState('');
  const [settlementToId, setSettlementToId] = useState('');

  const [splitMode, setSplitMode] = useState<SplitMode>('equal');
  const [includedIds, setIncludedIds] = useState<string[]>([]);
  const [singleTargetId, setSingleTargetId] = useState('');
  const [exactAmounts, setExactAmounts] = useState<Record<string, string>>({});

  const [date, setDate] = useState(todayISO());
  const [description, setDescription] = useState('');
  const [categoryName, setCategoryName] = useState('Comida y Restaurantes');
  const [paymentMethod, setPaymentMethod] = useState<string>('Tarjeta');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mergedCategories = useMemo(() => {
    const set = new Set<string>([
      ...categoryOptions,
      ...DEFAULT_EXPENSE_CATEGORY_NAMES,
    ]);
    return Array.from(set);
  }, [categoryOptions]);

  useEffect(() => {
    if (!open) return;
    setError(null);

    const allIds = members.map((m) => m.id);
    const defaultPayer = myMemberId ?? allIds[0] ?? '';
    const otherMember = allIds.find((id) => id !== defaultPayer) ?? defaultPayer;

    if (editingExpense) {
      setStep(2);
      setModeType(editingExpense.type);
      setExpression(String(editingExpense.total_amount).replace('.', ','));
      setPaidById(editingExpense.paid_by_member_id);
      setDate(editingExpense.expense_date);
      setDescription(editingExpense.description ?? '');
      setCategoryName(editingExpense.category_name || 'Otros gastos');
      setPaymentMethod(editingExpense.payment_method || 'Tarjeta');

      const shares = editingExpense.split_expense_shares ?? [];
      if (editingExpense.type === 'settlement') {
        setSettlementToId(shares[0]?.member_id ?? otherMember);
      } else if (shares.length === 1) {
        setSplitMode('single');
        setSingleTargetId(shares[0].member_id);
        setIncludedIds(allIds);
      } else {
        const amounts = shares.map((s) => Number(s.share_amount));
        const allEqual =
          amounts.length > 0 &&
          amounts.every((a) => Math.abs(a - amounts[0]) <= 0.02);

        if (allEqual) {
          setSplitMode('equal');
          setIncludedIds(shares.map((s) => s.member_id));
        } else {
          setSplitMode('exact');
          const exactMap: Record<string, string> = {};
          for (const m of members) {
            const found = shares.find((s) => s.member_id === m.id);
            exactMap[m.id] = found ? String(found.share_amount) : '';
          }
          setExactAmounts(exactMap);
          setIncludedIds(allIds);
        }
      }
      return;
    }

    if (prefillSettlement) {
      setStep(2);
      setModeType('settlement');
      setPaidById(prefillSettlement.fromMemberId);
      setSettlementToId(prefillSettlement.toMemberId);
      setExpression(String(prefillSettlement.amount).replace('.', ','));
      setDate(todayISO());
      setDescription('Pago de deudas');
      setPaymentMethod('Bizum');
      return;
    }

    // Nuevo gasto: arranca directo en Paso 1 (Calculadora estilo Settle Up)
    setStep(1);
    setModeType('expense');
    setExpression('');
    setPaidById(defaultPayer);
    setSettlementToId(otherMember);
    setSplitMode('equal');
    setIncludedIds(allIds);
    setSingleTargetId(otherMember);
    setExactAmounts({});
    setDate(todayISO());
    setDescription('');
    setCategoryName(mergedCategories[0] ?? 'Otros gastos');
    setPaymentMethod('Tarjeta');
  }, [open, editingExpense, prefillSettlement, members, myMemberId, mergedCategories]);

  const evaluated = evaluateCalcExpression(expression);
  const numericTotal = evaluated !== null && evaluated > 0 ? evaluated : 0;
  const hasOperator = /[+\-*/]/.test(expression);

  const computedShares = useMemo(() => {
    if (numericTotal <= 0)
      return [] as { member_id: string; share_amount: number }[];

    if (modeType === 'settlement') {
      if (!settlementToId) return [];
      return [
        { member_id: settlementToId, share_amount: Number(numericTotal.toFixed(2)) },
      ];
    }

    if (splitMode === 'single') {
      if (!singleTargetId) return [];
      return [
        { member_id: singleTargetId, share_amount: Number(numericTotal.toFixed(2)) },
      ];
    }

    if (splitMode === 'equal') {
      if (includedIds.length === 0) return [];
      const totalCents = Math.round(numericTotal * 100);
      const baseCents = Math.floor(totalCents / includedIds.length);
      let remainder = totalCents - baseCents * includedIds.length;

      return includedIds.map((id) => {
        const cents = baseCents + (remainder > 0 ? 1 : 0);
        if (remainder > 0) remainder--;
        return { member_id: id, share_amount: Number((cents / 100).toFixed(2)) };
      });
    }

    return members
      .map((m) => ({
        member_id: m.id,
        share_amount: Number(
          (parseFloat((exactAmounts[m.id] ?? '').replace(',', '.')) || 0).toFixed(2)
        ),
      }))
      .filter((s) => s.share_amount > 0);
  }, [
    numericTotal,
    modeType,
    settlementToId,
    splitMode,
    singleTargetId,
    includedIds,
    members,
    exactAmounts,
  ]);

  const exactSum = computedShares.reduce((acc, s) => acc + s.share_amount, 0);
  const exactDiff = Number((numericTotal - exactSum).toFixed(2));

  const mySharePreview = useMemo(() => {
    if (!myMemberId || modeType === 'settlement') return 0;
    return (
      computedShares.find((s) => s.member_id === myMemberId)?.share_amount ?? 0
    );
  }, [computedShares, myMemberId, modeType]);

  if (!open) return null;

  function toggleIncluded(id: string) {
    setIncludedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function goToStep2() {
    setError(null);
    if (numericTotal <= 0) {
      setError('Introduce un importe mayor que 0.');
      return;
    }
    const cleanStr =
      numericTotal % 1 === 0
        ? String(numericTotal)
        : numericTotal.toFixed(2).replace('.', ',');
    setExpression(cleanStr);
    setStep(2);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (numericTotal <= 0) {
      setError('Introduce un importe mayor que 0.');
      return;
    }
    if (!paidById) {
      setError('Selecciona quién pagó.');
      return;
    }
    if (modeType === 'settlement' && paidById === settlementToId) {
      setError('El pagador y el receptor deben ser personas distintas.');
      return;
    }
    if (computedShares.length === 0) {
      setError('Selecciona al menos una persona para repartir el gasto.');
      return;
    }
    if (splitMode === 'exact' && modeType === 'expense' && Math.abs(exactDiff) > 0.02) {
      setError(
        `La suma de importes (${formatEUR(exactSum)}) no cuadra con el total (${formatEUR(numericTotal)}).`
      );
      return;
    }

    setSaving(true);
    const { error: err } = await supabase.rpc('save_split_expense', {
      p_group_id: groupId,
      p_paid_by_member_id: paidById,
      p_type: modeType,
      p_total_amount: Number(numericTotal.toFixed(2)),
      p_expense_date: date,
      p_description:
        description.trim() ||
        (modeType === 'settlement' ? 'Pago de deudas' : categoryName),
      p_category_name: modeType === 'settlement' ? 'Pago de deudas' : categoryName,
      p_payment_method: paymentMethod,
      p_shares: computedShares,
      p_expense_id: editingExpense?.id ?? null,
    });

    setSaving(false);
    if (err) {
      setError('Error al guardar: ' + err.message);
      return;
    }

    onSaved();
    onClose();
  }

  const paidByMember = members.find((m) => m.id === paidById);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full sm:max-w-md bg-slate-950 border border-slate-800 rounded-t-3xl sm:rounded-2xl max-h-[95vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Cabecera estilo Settle Up */}
        <div className="bg-slate-900 flex items-center justify-between px-4 py-3.5 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            {step === 2 ? (
              <button
                type="button"
                onClick={() => setStep(1)}
                className="p-1.5 -ml-1 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
                title="Volver a la calculadora"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 -ml-1 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            )}

            <select
              value={modeType}
              onChange={(e) =>
                setModeType(e.target.value as 'expense' | 'settlement')
              }
              className="bg-transparent text-base font-bold text-white focus:outline-none cursor-pointer"
            >
              <option value="expense" className="bg-slate-900">
                Nuevo gasto
              </option>
              <option value="settlement" className="bg-slate-900">
                Pago de deudas
              </option>
            </select>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* PASO 1: ESTILO SETTLE UP + CALCULADORA */}
        {step === 1 ? (
          <div className="flex flex-col flex-1 justify-between">
            <div className="p-5 space-y-5 flex-1 flex flex-col justify-between">
              {/* Quién pagó */}
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-2">
                  {modeType === 'settlement' ? 'Quién envía' : 'Quién pagó'}
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  {members.map((m, idx) => {
                    const active = m.id === paidById;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setPaidById(m.id)}
                        className={`flex items-center gap-2 pl-1.5 pr-3.5 py-1.5 rounded-full border text-xs font-semibold transition cursor-pointer ${
                          active
                            ? 'bg-emerald-500/15 border-emerald-500 text-white'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        <span
                          className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                          style={{ backgroundColor: getMemberBg(idx) }}
                        >
                          {m.display_name.charAt(0).toUpperCase()}
                        </span>
                        <span>{m.display_name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Visor gigante del importe + entrada por teclado físico */}
              <div className="py-4 text-right space-y-1">
                {hasOperator && (
                  <p className="text-sm font-mono text-slate-400 truncate">
                    {formatCalcDisplay(expression)} =
                  </p>
                )}
                <div className="flex items-baseline justify-end gap-2">
                  <input
                    type="text"
                    value={formatCalcDisplay(expression)}
                    onChange={(e) => {
                      const clean = e.target.value
                        .replace(/×/g, '*')
                        .replace(/÷/g, '/')
                        .replace(/[^0-9.,+\-*/]/g, '');
                      setExpression(clean);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        goToStep2();
                      }
                    }}
                    placeholder="0"
                    className="w-full bg-transparent text-right text-5xl font-bold text-orange-300 placeholder:text-orange-300/40 focus:outline-none"
                  />
                  <span className="text-xl font-semibold text-orange-300/80 shrink-0">
                    EUR
                  </span>
                </div>
                {hasOperator && evaluated !== null && (
                  <p className="text-sm font-semibold text-emerald-400">
                    Total: {formatEUR(evaluated)}
                  </p>
                )}
                {error && <p className="text-xs text-rose-400 pt-1">{error}</p>}
              </div>
            </div>

            {/* Teclado calculadora integrado */}
            <div>
              <CalculatorPad
                expression={expression}
                onChangeExpression={(next) => {
                  setError(null);
                  setExpression(next);
                }}
              />
              <button
                type="button"
                onClick={goToStep2}
                className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm uppercase tracking-wider flex items-center justify-end pr-6 gap-2 transition cursor-pointer"
              >
                Siguiente
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        ) : (
          /* PASO 2: REPARTO, CONCEPTO, CATEGORÍA Y FECHA */
          <form
            onSubmit={handleSubmit}
            className="p-5 space-y-4 overflow-y-auto flex-1"
          >
            {/* Resumen importe clicable para volver a la calculadora */}
            <button
              type="button"
              onClick={() => setStep(1)}
              className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-emerald-500/50 transition cursor-pointer"
            >
              <div className="text-left">
                <p className="text-[11px] text-slate-400">
                  {paidByMember?.display_name ?? 'Usuario'}{' '}
                  {modeType === 'settlement' ? 'envía' : 'pagó'}
                </p>
                <p className="text-2xl font-extrabold text-orange-300">
                  {formatEUR(numericTotal)}
                </p>
              </div>
              <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-3 py-1.5 rounded-xl">
                <Calculator className="w-4 h-4" />
                Calculadora
              </span>
            </button>

            {/* Receptor si es Pago de deudas / Reparto si es Gasto */}
            {modeType === 'settlement' ? (
              <div className="space-y-2">
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
                  <ArrowRight className="w-3.5 h-3.5 text-sky-400" /> Quién recibe el pago
                </label>
                <div className="flex flex-wrap gap-2">
                  {members.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSettlementToId(m.id)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                        settlementToId === m.id
                          ? 'bg-sky-500/15 border-sky-500 text-sky-300'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {m.display_name}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3 bg-slate-900 border border-slate-800 rounded-2xl p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-white">
                    ¿Para quién es?
                  </span>
                  <div className="inline-flex bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-[11px]">
                    {(
                      [
                        { id: 'equal', label: 'Iguales' },
                        { id: 'single', label: '100% uno' },
                        { id: 'exact', label: 'Exacto' },
                      ] as const
                    ).map((sm) => (
                      <button
                        key={sm.id}
                        type="button"
                        onClick={() => setSplitMode(sm.id)}
                        className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                          splitMode === sm.id
                            ? 'bg-emerald-500 text-slate-950'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {sm.label}
                      </button>
                    ))}
                  </div>
                </div>

                {splitMode === 'equal' && (
                  <div className="grid grid-cols-2 gap-2">
                    {members.map((m) => {
                      const checked = includedIds.includes(m.id);
                      const share =
                        computedShares.find((s) => s.member_id === m.id)
                          ?.share_amount ?? 0;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => toggleIncluded(m.id)}
                          className={`flex items-center justify-between px-3 py-2 rounded-xl border text-xs transition cursor-pointer ${
                            checked
                              ? 'bg-slate-800 border-emerald-500/60 text-white'
                              : 'bg-slate-950 border-slate-800 text-slate-500'
                          }`}
                        >
                          <span className="font-medium truncate">
                            {m.display_name}
                          </span>
                          <span className="font-bold text-emerald-400 shrink-0 ml-2">
                            {checked ? formatEUR(share) : '0 €'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {splitMode === 'single' && (
                  <div className="flex flex-wrap gap-2">
                    {members.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setSingleTargetId(m.id)}
                        className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                          singleTargetId === m.id
                            ? 'bg-indigo-500/20 border-indigo-400 text-indigo-200'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        100% {m.display_name}
                      </button>
                    ))}
                  </div>
                )}

                {splitMode === 'exact' && (
                  <div className="space-y-2">
                    {members.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between gap-3"
                      >
                        <span className="text-xs text-slate-200 font-medium">
                          {m.display_name}
                        </span>
                        <div className="relative w-32">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={exactAmounts[m.id] ?? ''}
                            onChange={(e) =>
                              setExactAmounts((prev) => ({
                                ...prev,
                                [m.id]: e.target.value,
                              }))
                            }
                            placeholder="0,00"
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-right text-white pr-7 focus:outline-none focus:border-emerald-500"
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500">
                            €
                          </span>
                        </div>
                      </div>
                    ))}
                    <p
                      className={`text-[11px] text-right font-medium ${
                        Math.abs(exactDiff) <= 0.02
                          ? 'text-emerald-400'
                          : 'text-amber-400'
                      }`}
                    >
                      {Math.abs(exactDiff) <= 0.02
                        ? 'Cuadrado al céntimo'
                        : exactDiff > 0
                        ? `Faltan por asignar: ${formatEUR(exactDiff)}`
                        : `Te pasas por: ${formatEUR(-exactDiff)}`}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Concepto y Categoría */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-1.5">
                  <FileText className="w-3.5 h-3.5" /> Concepto
                </label>
                <input
                  type="text"
                  autoFocus
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={
                    modeType === 'settlement'
                      ? 'Pago de deudas'
                      : 'Ej. Luz octubre, Cena...'
                  }
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              {modeType === 'expense' && (
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-1.5">
                    <Tag className="w-3.5 h-3.5" /> Categoría
                  </label>
                  <select
                    value={categoryName}
                    onChange={(e) => setCategoryName(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                  >
                    {mergedCategories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Fecha (Día / Mes / Año) y método */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-1.5">
                  <Calendar className="w-3.5 h-3.5" /> Fecha (Día / Mes / Año)
                </label>
                <DateInputES value={date} onChange={setDate} />
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-1.5">
                  <CreditCard className="w-3.5 h-3.5" /> Método
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                >
                  {PAYMENT_METHODS.map((pm) => (
                    <option key={pm} value={pm}>
                      {pm}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Vista previa de sincronización privada */}
            {modeType === 'expense' && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs">
                <Link2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                {mySyncSetting?.sync_enabled && targetWorkspace ? (
                  <p className="text-slate-200">
                    {mySharePreview > 0 ? (
                      <>
                        Tu parte (
                        <strong className="text-emerald-400">
                          {formatEUR(mySharePreview)}
                        </strong>
                        ) entrará sola en{' '}
                        <strong className="text-white">
                          {targetWorkspace.name}
                        </strong>
                        .
                      </>
                    ) : (
                      <>
                        Tu parte es <strong>0,00 €</strong>: no añadirá gasto en{' '}
                        <strong>{targetWorkspace.name}</strong>.
                      </>
                    )}
                  </p>
                ) : (
                  <p className="text-slate-400">
                    Sincronización desactivada en este grupo.
                  </p>
                )}
              </div>
            )}

            {error && (
              <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold py-3.5 rounded-xl transition cursor-pointer"
            >
              <Check className="w-5 h-5" />
              {saving
                ? 'Guardando...'
                : editingExpense
                ? 'Guardar cambios'
                : modeType === 'settlement'
                ? 'Registrar pago de deuda'
                : 'Guardar gasto'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}