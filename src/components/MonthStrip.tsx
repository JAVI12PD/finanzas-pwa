import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatMonthLabel } from '../lib/format';

const SHORT_MONTHS = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];

interface MonthStripProps {
  selectedYear: number;
  selectedMonth: number; // 0..11
  onChangeMonth: (year: number, month: number) => void;
  activeMonthKeys?: Set<string>;
}

export function MonthStrip({
  selectedYear,
  selectedMonth,
  onChangeMonth,
  activeMonthKeys,
}: MonthStripProps) {
  const now = new Date();
  const realYear = now.getFullYear();
  const realMonth = now.getMonth();
  const isCurrentRealMonth =
    selectedYear === realYear && selectedMonth === realMonth;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
      {/* Cabecera: dónde estás + selector de año + botón Hoy */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Calendar className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-white leading-tight">
                {formatMonthLabel(selectedYear, selectedMonth)}
              </h2>
              {isCurrentRealMonth && (
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  Mes actual
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              Pulsa cualquier mes para consultar su balance
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isCurrentRealMonth && (
            <button
              type="button"
              onClick={() => onChangeMonth(realYear, realMonth)}
              className="px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-xs font-semibold text-emerald-300 transition cursor-pointer"
            >
              Volver a hoy
            </button>
          )}

          <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-xl px-1.5 py-1">
            <button
              type="button"
              onClick={() => onChangeMonth(selectedYear - 1, selectedMonth)}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              aria-label="Año anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-bold text-white px-2">
              {selectedYear}
            </span>
            <button
              type="button"
              onClick={() => onChangeMonth(selectedYear + 1, selectedMonth)}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              aria-label="Año siguiente"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 12 meses visuales */}
      <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
        {SHORT_MONTHS.map((label, idx) => {
          const selected = idx === selectedMonth;
          const isToday = selectedYear === realYear && idx === realMonth;
          const key = `${selectedYear}-${String(idx + 1).padStart(2, '0')}`;
          const hasData = activeMonthKeys?.has(key) ?? false;

          return (
            <button
              key={label}
              type="button"
              onClick={() => onChangeMonth(selectedYear, idx)}
              className={`relative flex flex-col items-center justify-center py-2 rounded-xl text-xs font-semibold transition cursor-pointer border ${
                selected
                  ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md shadow-emerald-500/20'
                  : isToday
                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/20'
                  : 'bg-slate-950/70 text-slate-400 border-slate-800 hover:text-white hover:border-slate-700'
              }`}
            >
              <span>{label}</span>
              <span
                className={`mt-1 w-1.5 h-1.5 rounded-full ${
                  hasData
                    ? selected
                      ? 'bg-slate-950/70'
                      : 'bg-emerald-400'
                    : 'bg-transparent'
                }`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}