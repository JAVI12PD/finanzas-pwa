import { Delete } from 'lucide-react';

interface CalculatorPadProps {
  expression: string;
  onChangeExpression: (next: string) => void;
}

const OPERATORS = new Set(['+', '-', '*', '/']);

export function evaluateCalcExpression(raw: string): number | null {
  const cleaned = raw.replace(/,/g, '.').replace(/\s+/g, '');
  if (!cleaned) return 0;

  // Quita operadores colgantes al final para permitir vista previa en vivo
  const trimmed = cleaned.replace(/[+\-*/.]+$/, '');
  if (!trimmed) return 0;

  // Tokenizador seguro (números y operadores básicos)
  const tokens: (number | string)[] = [];
  let i = 0;

  while (i < trimmed.length) {
    const ch = trimmed[i];

    // Número (incluyendo signo negativo inicial o tras operador)
    const isUnaryMinus =
      ch === '-' && (tokens.length === 0 || typeof tokens[tokens.length - 1] === 'string');

    if ((ch >= '0' && ch <= '9') || ch === '.' || isUnaryMinus) {
      let numStr = ch;
      i++;
      while (i < trimmed.length && ((trimmed[i] >= '0' && trimmed[i] <= '9') || trimmed[i] === '.')) {
        numStr += trimmed[i];
        i++;
      }
      const val = parseFloat(numStr);
      if (isNaN(val)) return null;
      tokens.push(val);
    } else if (OPERATORS.has(ch)) {
      tokens.push(ch);
      i++;
    } else {
      return null;
    }
  }

  if (tokens.length === 0 || typeof tokens[0] !== 'number') return null;

  // Primera pasada: * y /
  const pass1: (number | string)[] = [tokens[0]];
  for (let t = 1; t < tokens.length; t += 2) {
    const op = tokens[t];
    const rhs = tokens[t + 1];
    if (typeof rhs !== 'number') break;

    if (op === '*' || op === '/') {
      const lhs = pass1.pop() as number;
      if (op === '/' && rhs === 0) return null;
      pass1.push(op === '*' ? lhs * rhs : lhs / rhs);
    } else {
      pass1.push(op, rhs);
    }
  }

  // Segunda pasada: + y -
  let result = pass1[0] as number;
  for (let t = 1; t < pass1.length; t += 2) {
    const op = pass1[t];
    const rhs = pass1[t + 1] as number;
    if (typeof rhs !== 'number') break;
    result = op === '+' ? result + rhs : result - rhs;
  }

  if (!isFinite(result)) return null;
  return Number(result.toFixed(2));
}

export function formatCalcDisplay(expr: string): string {
  return expr.replace(/\*/g, '×').replace(/\//g, '÷').replace(/\./g, ',');
}

export function CalculatorPad({
  expression,
  onChangeExpression,
}: CalculatorPadProps) {
  function appendDigit(digit: string) {
    if (expression === '0') {
      onChangeExpression(digit);
      return;
    }
    onChangeExpression(expression + digit);
  }

  function appendComma() {
    const parts = expression.split(/[+\-*/]/);
    const currentNumber = parts[parts.length - 1] ?? '';
    if (currentNumber.includes(',') || currentNumber.includes('.')) return;
    if (currentNumber === '') {
      onChangeExpression(expression + '0,');
    } else {
      onChangeExpression(expression + ',');
    }
  }

  function appendOperator(op: '+' | '-' | '*' | '/') {
    if (!expression) return;
    const last = expression[expression.length - 1];
    if (OPERATORS.has(last)) {
      onChangeExpression(expression.slice(0, -1) + op);
      return;
    }
    if (last === ',' || last === '.') {
      onChangeExpression(expression.slice(0, -1) + op);
      return;
    }
    onChangeExpression(expression + op);
  }

  function backspace() {
    onChangeExpression(expression.slice(0, -1));
  }

  function resolveNow() {
    const val = evaluateCalcExpression(expression);
    if (val === null) return;
    const formatted =
      val % 1 === 0 ? String(val) : val.toFixed(2).replace('.', ',');
    onChangeExpression(formatted);
  }

  const numBtn =
    'h-14 sm:h-12 flex items-center justify-center text-xl font-medium text-white bg-slate-800/80 hover:bg-slate-700 active:bg-slate-600 transition cursor-pointer select-none';
  const opBtn =
    'h-14 sm:h-12 flex items-center justify-center text-xl font-semibold text-emerald-300 bg-slate-700/80 hover:bg-slate-600 active:bg-slate-500 transition cursor-pointer select-none';

  return (
    <div className="grid grid-cols-4 gap-px bg-slate-900 border-t border-slate-800 overflow-hidden">
      {/* Fila 1 */}
      <button type="button" onClick={() => appendDigit('7')} className={numBtn}>
        7
      </button>
      <button type="button" onClick={() => appendDigit('8')} className={numBtn}>
        8
      </button>
      <button type="button" onClick={() => appendDigit('9')} className={numBtn}>
        9
      </button>
      <button type="button" onClick={() => appendOperator('/')} className={opBtn}>
        ÷
      </button>

      {/* Fila 2 */}
      <button type="button" onClick={() => appendDigit('4')} className={numBtn}>
        4
      </button>
      <button type="button" onClick={() => appendDigit('5')} className={numBtn}>
        5
      </button>
      <button type="button" onClick={() => appendDigit('6')} className={numBtn}>
        6
      </button>
      <button type="button" onClick={() => appendOperator('*')} className={opBtn}>
        ×
      </button>

      {/* Fila 3 */}
      <button type="button" onClick={() => appendDigit('1')} className={numBtn}>
        1
      </button>
      <button type="button" onClick={() => appendDigit('2')} className={numBtn}>
        2
      </button>
      <button type="button" onClick={() => appendDigit('3')} className={numBtn}>
        3
      </button>
      <button type="button" onClick={() => appendOperator('-')} className={opBtn}>
        −
      </button>

      {/* Fila 4 */}
      <button type="button" onClick={appendComma} className={numBtn}>
        ,
      </button>
      <button type="button" onClick={() => appendDigit('0')} className={numBtn}>
        0
      </button>
      <button
        type="button"
        onClick={backspace}
        onDoubleClick={() => onChangeExpression('')}
        title="Borrar (doble clic borra todo)"
        className={numBtn}
      >
        <Delete className="w-5 h-5 text-slate-300" />
      </button>
      <button type="button" onClick={() => appendOperator('+')} className={opBtn}>
        +
      </button>

      {/* Fila 5: Limpiar y "=" */}
      <button
        type="button"
        onClick={() => onChangeExpression('')}
        className="h-11 col-span-2 flex items-center justify-center text-xs font-semibold uppercase tracking-wider text-slate-400 bg-slate-900 hover:bg-slate-800 hover:text-white transition cursor-pointer"
      >
        Borrar todo (C)
      </button>
      <button
        type="button"
        onClick={resolveNow}
        className="h-11 col-span-2 flex items-center justify-center text-lg font-bold text-emerald-300 bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
      >
        = Calcular
      </button>
    </div>
  );
}