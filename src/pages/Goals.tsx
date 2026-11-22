import { useState } from 'react';
import {
  Plus,
  PiggyBank,
  Trash2,
  Calendar,
  ArrowUpCircle,
  ArrowDownCircle,
  CheckCircle2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { SavingsGoal } from '../lib/types';
import { formatDateES, formatEUR } from '../lib/format';
import { CategoryIcon } from '../lib/icons';
import { DateInputES } from '../components/DateInputES';
import { IconPicker } from '../components/IconPicker';

interface GoalsProps {
  workspaceId: string;
  goals: SavingsGoal[];
  totalAccumulatedSavings: number;
  onUpdated: () => void;
}

const GOAL_COLORS = [
  '#10B981',
  '#0EA5E9',
  '#6366F1',
  '#F59E0B',
  '#EC4899',
  '#8B5CF6',
  '#14B8A6',
];

export function Goals({
  workspaceId,
  goals,
  totalAccumulatedSavings,
  onUpdated,
}: GoalsProps) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [currentAmount, setCurrentAmount] = useState('0');
  const [deadline, setDeadline] = useState('');
  const [icon, setIcon] = useState('PiggyBank');
  const [color, setColor] = useState('#10B981');
  const [saving, setSaving] = useState(false);

  const [adjustGoalId, setAdjustGoalId] = useState<string | null>(null);
  const [adjustValue, setAdjustValue] = useState('');

  const totalAssignedToGoals = goals.reduce(
    (sum, g) => sum + Number(g.current_amount),
    0
  );

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const target = parseFloat(targetAmount.replace(',', '.'));
    const current = parseFloat(currentAmount.replace(',', '.')) || 0;
    if (!name.trim() || isNaN(target) || target <= 0) return;

    setSaving(true);
    const { error } = await supabase.from('savings_goals').insert({
      workspace_id: workspaceId,
      name: name.trim(),
      target_amount: target,
      current_amount: Math.max(0, current),
      deadline: deadline || null,
      icon,
      color,
    });
    setSaving(false);

    if (!error) {
      setName('');
      setTargetAmount('');
      setCurrentAmount('0');
      setDeadline('');
      setShowForm(false);
      onUpdated();
    }
  }

  async function updateGoalAmount(goal: SavingsGoal, delta: number) {
    const next = Math.max(0, Number(goal.current_amount) + delta);
    await supabase
      .from('savings_goals')
      .update({ current_amount: next })
      .eq('id', goal.id);
    setAdjustGoalId(null);
    setAdjustValue('');
    onUpdated();
  }

  async function handleDelete(id: string) {
    if (!window.confirm('¿Eliminar esta hucha/meta?')) return;
    await supabase.from('savings_goals').delete().eq('id', id);
    onUpdated();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <PiggyBank className="w-5 h-5 text-emerald-400" />
            Huchas y metas de ahorro
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Organiza tus objetivos sin distorsionar tus gastos mensuales.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 rounded-xl text-xs font-semibold text-slate-950 cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Nueva hucha
        </button>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <p className="text-xs text-slate-400">Ahorro acumulado total del espacio</p>
          <p className="text-2xl font-bold text-white mt-1">
            {formatEUR(totalAccumulatedSavings)}
          </p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <p className="text-xs text-slate-400">Total asignado en huchas</p>
          <p className="text-2xl font-bold text-emerald-400 mt-1">
            {formatEUR(totalAssignedToGoals)}
          </p>
        </div>
      </div>

      {/* Formulario nueva hucha */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="bg-slate-900 border border-emerald-500/40 rounded-2xl p-4 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre (ej. Viaje, Fondo emergencia)"
              className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
            />
            <input
              type="text"
              inputMode="decimal"
              required
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
              placeholder="Objetivo (€)"
              className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
            />
            <input
              type="text"
              inputMode="decimal"
              value={currentAmount}
              onChange={(e) => setCurrentAmount(e.target.value)}
              placeholder="Saldo inicial (€)"
              className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                Fecha límite opcional (Día / Mes / Año)
              </label>
              <DateInputES
                value={deadline}
                onChange={setDeadline}
                allowEmpty
                showQuickButtons={false}
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Color</label>
              <div className="flex items-center gap-2 pt-1.5 flex-wrap">
                {GOAL_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-7 h-7 rounded-full cursor-pointer ${
                      color === c
                        ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900'
                        : ''
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-2">Icono</label>
            <IconPicker value={icon} color={color} onChange={setIcon} />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs px-5 py-2.5 rounded-xl cursor-pointer"
            >
              {saving ? 'Creando...' : 'Crear hucha'}
            </button>
          </div>
        </form>
      )}

      {/* Grid de huchas */}
      {goals.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center text-sm text-slate-400">
          No tienes huchas creadas todavía. Crea una para seguir tus objetivos de ahorro paso a paso.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {goals.map((g) => {
            const current = Number(g.current_amount);
            const target = Number(g.target_amount);
            const pct = Math.min(100, (current / target) * 100);
            const completed = current >= target;

            return (
              <div
                key={g.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: `${g.color}22`, color: g.color }}
                    >
                      <CategoryIcon name={g.icon} className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white flex items-center gap-1.5">
                        {g.name}
                        {completed && (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        )}
                      </h3>
                      {g.deadline && (
                        <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                          <Calendar className="w-3 h-3" /> Objetivo:{' '}
                          {formatDateES(g.deadline)}
                        </p>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDelete(g.id)}
                    className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div>
                  <div className="flex items-baseline justify-between text-xs mb-1.5">
                    <span className="text-lg font-bold text-white">
                      {formatEUR(current)}
                    </span>
                    <span className="text-slate-400">
                      de {formatEUR(target)} ({pct.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: g.color }}
                    />
                  </div>
                  {!completed && (
                    <p className="text-[11px] text-slate-400 mt-1.5">
                      Faltan {formatEUR(target - current)}
                    </p>
                  )}
                </div>

                {adjustGoalId === g.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      autoFocus
                      value={adjustValue}
                      onChange={(e) => setAdjustValue(e.target.value)}
                      placeholder="Cantidad (€)"
                      className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const val = parseFloat(adjustValue.replace(',', '.'));
                        if (!isNaN(val) && val > 0) updateGoalAmount(g, val);
                      }}
                      className="px-2.5 py-1.5 bg-emerald-500 text-slate-950 font-semibold text-xs rounded-xl cursor-pointer"
                    >
                      Sumar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const val = parseFloat(adjustValue.replace(',', '.'));
                        if (!isNaN(val) && val > 0) updateGoalAmount(g, -val);
                      }}
                      className="px-2.5 py-1.5 bg-rose-500/20 text-rose-300 font-semibold text-xs rounded-xl cursor-pointer"
                    >
                      Retirar
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => updateGoalAmount(g, 50)}
                      className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-emerald-300 rounded-lg cursor-pointer"
                    >
                      +50 €
                    </button>
                    <button
                      type="button"
                      onClick={() => updateGoalAmount(g, 100)}
                      className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-emerald-300 rounded-lg cursor-pointer"
                    >
                      +100 €
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAdjustGoalId(g.id);
                        setAdjustValue('');
                      }}
                      className="ml-auto flex items-center gap-1 px-2.5 py-1.5 bg-slate-950 border border-slate-700 hover:border-slate-500 text-xs text-slate-200 rounded-lg cursor-pointer"
                    >
                      <ArrowUpCircle className="w-3.5 h-3.5 text-emerald-400" />
                      <ArrowDownCircle className="w-3.5 h-3.5 text-rose-400" />
                      Ajustar
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}