import { offsetDaysISO, todayISO } from '../lib/format';

const MONTHS_ES = [
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

interface DateInputESProps {
  value: string; // "YYYY-MM-DD" o ""
  onChange: (isoDate: string) => void;
  allowEmpty?: boolean;
  showQuickButtons?: boolean;
}

export function DateInputES({
  value,
  onChange,
  allowEmpty = false,
  showQuickButtons = true,
}: DateInputESProps) {
  const now = new Date();
  const currentYear = now.getFullYear();

  const parsed = value && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value.split('-').map(Number)
    : null;

  const year = parsed ? parsed[0] : currentYear;
  const month = parsed ? parsed[1] : now.getMonth() + 1;
  const day = parsed ? parsed[2] : now.getDate();

  const daysInMonth = new Date(year, month, 0).getDate();

  const years: number[] = [];
  for (let y = currentYear - 5; y <= currentYear + 10; y++) {
    years.push(y);
  }
  if (!years.includes(year)) years.push(year);

  function emit(y: number, m: number, d: number) {
    const maxDay = new Date(y, m, 0).getDate();
    const safeDay = Math.min(d, maxDay);
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
    onChange(iso);
  }

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-3 gap-1.5">
        {/* DÍA */}
        <select
          aria-label="Día"
          value={parsed ? day : ''}
          onChange={(e) => {
            if (!e.target.value) {
              if (allowEmpty) onChange('');
              return;
            }
            emit(year, month, Number(e.target.value));
          }}
          className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
        >
          {allowEmpty && !parsed && <option value="">Día</option>}
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>
              {String(d).padStart(2, '0')}
            </option>
          ))}
        </select>

        {/* MES */}
        <select
          aria-label="Mes"
          value={parsed ? month : ''}
          onChange={(e) => {
            if (!e.target.value) {
              if (allowEmpty) onChange('');
              return;
            }
            emit(year, Number(e.target.value), day);
          }}
          className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
        >
          {allowEmpty && !parsed && <option value="">Mes</option>}
          {MONTHS_ES.map((label, idx) => (
            <option key={label} value={idx + 1}>
              {label}
            </option>
          ))}
        </select>

        {/* AÑO */}
        <select
          aria-label="Año"
          value={parsed ? year : ''}
          onChange={(e) => {
            if (!e.target.value) {
              if (allowEmpty) onChange('');
              return;
            }
            emit(Number(e.target.value), month, day);
          }}
          className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
        >
          {allowEmpty && !parsed && <option value="">Año</option>}
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      {showQuickButtons && (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onChange(todayISO())}
            className={`px-2 py-0.5 rounded-md text-[11px] font-medium border transition cursor-pointer ${
              value === todayISO()
                ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={() => onChange(offsetDaysISO(-1))}
            className={`px-2 py-0.5 rounded-md text-[11px] font-medium border transition cursor-pointer ${
              value === offsetDaysISO(-1)
                ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Ayer
          </button>
          {allowEmpty && value && (
            <button
              type="button"
              onClick={() => onChange('')}
              className="ml-auto px-2 py-0.5 rounded-md text-[11px] text-slate-400 hover:text-rose-400 cursor-pointer"
            >
              Quitar fecha
            </button>
          )}
        </div>
      )}
    </div>
  );
}