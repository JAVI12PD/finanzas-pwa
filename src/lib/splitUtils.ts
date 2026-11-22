import type { SplitExpense, SplitGroupMember } from './types';

export interface MemberBalance {
  memberId: string;
  name: string;
  paid: number;
  consumed: number;
  netBalance: number;
}

export interface SimplifiedDebt {
  fromMemberId: string;
  fromName: string;
  toMemberId: string;
  toName: string;
  amount: number;
}

export function formatRelativeDateES(isoDate: string): string {
  if (!isoDate) return '';
  const parts = isoDate.split('-').map(Number);
  if (parts.length !== 3) return isoDate;

  const target = new Date(parts[0], parts[1] - 1, parts[2]);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round(
    (today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Ayer';
  if (diffDays > 1 && diffDays <= 7) return `Hace ${diffDays} días`;

  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(target);
}

export function calculateGroupBalances(
  members: SplitGroupMember[],
  expenses: SplitExpense[]
): { balances: MemberBalance[]; debts: SimplifiedDebt[] } {
  const map = new Map<string, MemberBalance>();

  for (const m of members) {
    map.set(m.id, {
      memberId: m.id,
      name: m.display_name,
      paid: 0,
      consumed: 0,
      netBalance: 0,
    });
  }

  for (const exp of expenses) {
    const total = Number(exp.total_amount);
    const payer = map.get(exp.paid_by_member_id);

    if (payer) {
      payer.netBalance += total;
      if (exp.type === 'expense') {
        payer.paid += total;
      }
    }

    for (const share of exp.split_expense_shares ?? []) {
      const amt = Number(share.share_amount);
      const target = map.get(share.member_id);
      if (target) {
        target.netBalance -= amt;
        if (exp.type === 'expense') {
          target.consumed += amt;
        }
      }
    }
  }

  const balances = Array.from(map.values()).map((b) => ({
    ...b,
    paid: Number(b.paid.toFixed(2)),
    consumed: Number(b.consumed.toFixed(2)),
    netBalance: Number(b.netBalance.toFixed(2)),
  }));

  const debtors = balances
    .filter((b) => b.netBalance < -0.01)
    .map((b) => ({ id: b.memberId, name: b.name, amount: -b.netBalance }))
    .sort((a, b) => b.amount - a.amount);

  const creditors = balances
    .filter((b) => b.netBalance > 0.01)
    .map((b) => ({ id: b.memberId, name: b.name, amount: b.netBalance }))
    .sort((a, b) => b.amount - a.amount);

  const debts: SimplifiedDebt[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amount, creditors[j].amount);
    const rounded = Number(pay.toFixed(2));
    if (rounded > 0.01) {
      debts.push({
        fromMemberId: debtors[i].id,
        fromName: debtors[i].name,
        toMemberId: creditors[j].id,
        toName: creditors[j].name,
        amount: rounded,
      });
    }
    debtors[i].amount = Number((debtors[i].amount - pay).toFixed(2));
    creditors[j].amount = Number((creditors[j].amount - pay).toFixed(2));

    if (debtors[i].amount <= 0.01) i++;
    if (creditors[j].amount <= 0.01) j++;
  }

  return { balances, debts };
}

// ============================================================================
// PARSER CSV DE SETTLE UP (UTF-16 / UTF-8 + AJUSTE EXACTO DE CÉNTIMOS)
// ============================================================================

export interface ParsedSettleUpRow {
  whoPaid: string;
  totalAmount: number;
  dateISO: string;
  description: string;
  categoryName: string;
  type: 'expense' | 'settlement';
  shares: { name: string; amount: number }[];
  externalRef: string;
}

function parseCSVLines(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        currentRow.push(field);
        field = '';
      } else if (ch === '\r' && next === '\n') {
        currentRow.push(field);
        rows.push(currentRow);
        currentRow = [];
        field = '';
        i++;
      } else if (ch === '\n') {
        currentRow.push(field);
        rows.push(currentRow);
        currentRow = [];
        field = '';
      } else {
        field += ch;
      }
    }
  }

  if (field.length > 0 || currentRow.length > 0) {
    currentRow.push(field);
    rows.push(currentRow);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

export async function parseSettleUpFile(file: File): Promise<{
  rows: ParsedSettleUpRow[];
  detectedNames: string[];
}> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  let encoding = 'utf-8';
  if (bytes.length >= 2) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = 'utf-16le';
    else if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = 'utf-16be';
  }

  const decoded = new TextDecoder(encoding).decode(buffer).replace(/^\uFEFF/, '');
  const matrix = parseCSVLines(decoded);

  if (matrix.length < 2) {
    throw new Error('El archivo CSV está vacío o no tiene filas de datos.');
  }

  const headers = matrix[0].map((h) => h.trim().toLowerCase());
  const idx = {
    whoPaid: headers.indexOf('who paid'),
    amount: headers.indexOf('amount'),
    converted: headers.indexOf('converted amount'),
    forWhom: headers.indexOf('for whom'),
    splitAmounts: headers.indexOf('split amounts'),
    purpose: headers.indexOf('purpose'),
    category: headers.indexOf('category'),
    dateTime: headers.indexOf('date & time'),
    type: headers.indexOf('type'),
  };

  if (idx.whoPaid === -1 || idx.forWhom === -1 || idx.splitAmounts === -1) {
    throw new Error(
      'Formato no reconocido. Asegúrate de exportar el CSV estándar desde Settle Up.'
    );
  }

  const namesSet = new Set<string>();
  const parsed: ParsedSettleUpRow[] = [];
  let oddAdjustCount = 0;

  for (let r = 1; r < matrix.length; r++) {
    const cols = matrix[r];
    const rawWhoPaid = (cols[idx.whoPaid] ?? '').trim();
    const whoPaid = rawWhoPaid.split(';')[0]?.trim() ?? '';
    if (!whoPaid) continue;

    const rawAmt = (
      (idx.converted !== -1 && cols[idx.converted]?.trim()) ||
      cols[idx.amount] ||
      '0'
    ).replace(',', '.');
    const totalAmount = Number(parseFloat(rawAmt).toFixed(2));
    if (isNaN(totalAmount) || totalAmount <= 0) continue;

    const forWhomList = (cols[idx.forWhom] ?? '')
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    const splitCentsList = (cols[idx.splitAmounts] ?? '')
      .split(';')
      .map((s) => Math.round(parseFloat(s.replace(',', '.')) * 100));

    const validEntries: { name: string; cents: number }[] = [];
    for (let k = 0; k < forWhomList.length; k++) {
      const name = forWhomList[k];
      const cents = splitCentsList[k];
      if (name && !isNaN(cents) && cents > 0) {
        validEntries.push({ name, cents });
        namesSet.add(name);
      }
    }

    if (validEntries.length === 0) continue;
    namesSet.add(whoPaid);

    // Corrige el +0,01 € que Settle Up mete al redondear mitades impares en el CSV
    const totalCents = Math.round(totalAmount * 100);
    const sumCents = validEntries.reduce((acc, e) => acc + e.cents, 0);
    const diffCents = sumCents - totalCents;

    if (diffCents !== 0 && Math.abs(diffCents) <= validEntries.length) {
      const step = diffCents > 0 ? -1 : 1;
      for (let k = 0; k < Math.abs(diffCents); k++) {
        const targetIdx = (oddAdjustCount + k) % validEntries.length;
        if (validEntries[targetIdx].cents + step > 0) {
          validEntries[targetIdx].cents += step;
        }
      }
      oddAdjustCount++;
    }

    const shares = validEntries.map((e) => ({
      name: e.name,
      amount: Number((e.cents / 100).toFixed(2)),
    }));

    const rawDateTime = (cols[idx.dateTime] ?? '').trim();
    const dateISO = /^\d{4}-\d{2}-\d{2}/.test(rawDateTime)
      ? rawDateTime.slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    const rawType = (cols[idx.type] ?? 'expense').trim().toLowerCase();
    const type: 'expense' | 'settlement' =
      rawType === 'transfer' ? 'settlement' : 'expense';

    const description = (cols[idx.purpose] ?? '').trim();
    const rawCat = (cols[idx.category] ?? '').trim();
    const categoryName = rawCat || 'Otros gastos';

    const externalRef = `su|${rawDateTime}|${whoPaid}|${totalAmount.toFixed(2)}|${description}|${forWhomList.join(';')}`;

    parsed.push({
      whoPaid,
      totalAmount,
      dateISO,
      description,
      categoryName,
      type,
      shares,
      externalRef,
    });
  }

  return {
    rows: parsed,
    detectedNames: Array.from(namesSet).sort((a, b) => a.localeCompare(b)),
  };
}