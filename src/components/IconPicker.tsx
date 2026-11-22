import { CategoryIcon, ICON_NAMES } from '../lib/icons';

interface IconPickerProps {
  value: string;
  color: string;
  onChange: (iconName: string) => void;
}

export function IconPicker({ value, color, onChange }: IconPickerProps) {
  return (
    <div className="grid grid-cols-7 sm:grid-cols-10 md:grid-cols-14 gap-1.5">
      {ICON_NAMES.map((ic) => {
        const selected = ic === value;
        return (
          <button
            key={ic}
            type="button"
            onClick={() => onChange(ic)}
            title={ic}
            className={`h-9 rounded-lg flex items-center justify-center border transition cursor-pointer ${
              selected
                ? 'border-emerald-400 bg-slate-800 ring-1 ring-emerald-400'
                : 'border-slate-800 bg-slate-900 hover:border-slate-600'
            }`}
            style={{ color: selected ? color : '#94a3b8' }}
          >
            <CategoryIcon name={ic} className="w-4 h-4" />
          </button>
        );
      })}
    </div>
  );
}