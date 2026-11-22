import { useMemo, useState } from 'react';
import {
  X,
  Upload,
  CheckCircle2,
  AlertCircle,
  Users,
  Search,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  DEFAULT_EXPENSE_CATEGORY_NAMES,
  type SplitGroupMember,
} from '../lib/types';
import { parseSettleUpFile, type ParsedSettleUpRow } from '../lib/splitUtils';
import { formatEUR } from '../lib/format';

interface EditableImportRow extends ParsedSettleUpRow {
  rowKey: number;
  selected: boolean;
}

interface SettleUpImportModalProps {
  open: boolean;
  onClose: () => void;
  groupId: string;
  members: SplitGroupMember[];
  mySyncEnabled: boolean;
  onImported: () => void;
}

function rescaleShares(
  shares: { name: string; amount: number }[],
  newTotal: number
): { name: string; amount: number }[] {
  const newTotalCents = Math.round(newTotal * 100);
  const oldSum = shares.reduce((acc, s) => acc + s.amount, 0);
  if (shares.length === 0 || newTotalCents <= 0) return shares;

  const rawCents = shares.map((s) =>
    oldSum > 0
      ? Math.floor((s.amount / oldSum) * newTotalCents)
      : Math.floor(newTotalCents / shares.length)
  );
  let remainder = newTotalCents - rawCents.reduce((a, b) => a + b, 0);

  return shares.map((s, idx) => {
    const cents = rawCents[idx] + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;
    return { name: s.name, amount: Number((cents / 100).toFixed(2)) };
  });
}

export function SettleUpImportModal({
  open,
  onClose,
  groupId,
  members,
  mySyncEnabled,
  onImported,
}: SettleUpImportModalProps) {
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<EditableImportRow[]>([]);
  const [detectedNames, setDetectedNames] = useState<string[]>([]);
  const [nameMapping, setNameMapping] = useState<Record<string, string>>({});
  const [syncHistorical, setSyncHistorical] = useState(false);

  const [showEditor, setShowEditor] = useState(false);
  const [rowSearch, setRowSearch] = useState('');

  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ inserted: number; skipped: number } | null>(
    null
  );

  const selectedRows = useMemo(() => rows.filter((r) => r.selected), [rows]);

  const filteredEditorRows = useMemo(() => {
    const q = rowSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      `${r.description} ${r.categoryName} ${r.whoPaid} ${r.dateISO}`
        .toLowerCase()
        .includes(q)
    );
  }, [rows, rowSearch]);

  if (!open) return null;

  function resetAll() {
    setFileName('');
    setRows([]);
    setDetectedNames([]);
    setNameMapping({});
    setSyncHistorical(false);
    setShowEditor(false);
    setRowSearch('');
    setError(null);
    setResult(null);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setResult(null);

    try {
      const parsed = await parseSettleUpFile(file);
      setFileName(file.name);
      setRows(
        parsed.rows.map((r, idx) => ({
          ...r,
          rowKey: idx,
          selected: true,
        }))
      );
      setDetectedNames(parsed.detectedNames);

      const initialMap: Record<string, string> = {};
      for (const csvName of parsed.detectedNames) {
        const lower = csvName.toLowerCase();
        const match = members.find(
          (m) =>
            m.display_name.toLowerCase() === lower ||
            m.display_name.toLowerCase().startsWith(lower) ||
            lower.startsWith(m.display_name.toLowerCase())
        );
        initialMap[csvName] = match ? match.id : '__create_guest__';
      }
      setNameMapping(initialMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error leyendo el CSV.');
    }
  }

  function updateRow(
    rowKey: number,
    patch: Partial<Pick<EditableImportRow, 'selected' | 'description' | 'categoryName' | 'dateISO'>>
  ) {
    setRows((prev) =>
      prev.map((r) => (r.rowKey === rowKey ? { ...r, ...patch } : r))
    );
  }

  function updateRowAmount(rowKey: number, raw: string) {
    const parsed = parseFloat(raw.replace(',', '.'));
    if (isNaN(parsed) || parsed <= 0) return;
    const rounded = Number(parsed.toFixed(2));
    setRows((prev) =>
      prev.map((r) =>
        r.rowKey === rowKey
          ? {
              ...r,
              totalAmount: rounded,
              shares: rescaleShares(r.shares, rounded),
            }
          : r
      )
    );
  }

  function toggleAllVisible(checked: boolean) {
    const visibleKeys = new Set(filteredEditorRows.map((r) => r.rowKey));
    setRows((prev) =>
      prev.map((r) => (visibleKeys.has(r.rowKey) ? { ...r, selected: checked } : r))
    );
  }

  async function handleImport() {
    if (selectedRows.length === 0) {
      setError('Selecciona al menos un movimiento para importar.');
      return;
    }
    setImporting(true);
    setError(null);

    try {
      const resolvedIds: Record<string, string> = { ...nameMapping };

      // 1. Crea como invitados los nombres que no existan aún en el grupo
      for (const csvName of detectedNames) {
        if (resolvedIds[csvName] === '__create_guest__' || !resolvedIds[csvName]) {
          const { data: newId, error: memErr } = await supabase.rpc(
            'add_split_group_member',
            {
              p_group_id: groupId,
              p_display_name: csvName,
              p_email: null,
            }
          );
          if (memErr || !newId) {
            throw new Error(
              `No se pudo crear el miembro "${csvName}": ${memErr?.message ?? ''}`
            );
          }
          resolvedIds[csvName] = newId as string;
        }
      }

      // 2. Identificador único de esta carga (para poder revertirla en 1 clic)
      const batchId =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `batch-${Date.now()}`;

      const payloadItems = selectedRows.map((r) => ({
        paid_by_member_id: resolvedIds[r.whoPaid],
        type: r.type,
        total_amount: r.totalAmount,
        expense_date: r.dateISO,
        description: r.description,
        category_name: r.categoryName,
        payment_method: r.type === 'settlement' ? 'Bizum' : 'Tarjeta',
        external_ref: r.externalRef,
        shares: r.shares.map((s) => ({
          member_id: resolvedIds[s.name],
          share_amount: s.amount,
        })),
      }));

      let totalInserted = 0;
      let totalSkipped = 0;
      const chunkSize = 100;

      for (let i = 0; i < payloadItems.length; i += chunkSize) {
        const chunk = payloadItems.slice(i, i + chunkSize);
        const { data, error: rpcErr } = await supabase.rpc(
          'import_split_expenses_batch',
          {
            p_group_id: groupId,
            p_items: chunk,
            p_sync_to_finances: syncHistorical,
            p_batch_id: batchId,
            p_filename: fileName || 'SettleUp.csv',
          }
        );

        if (rpcErr) throw new Error(rpcErr.message);
        const res = data as { inserted?: number; skipped?: number } | null;
        totalInserted += res?.inserted ?? 0;
        totalSkipped += res?.skipped ?? 0;
      }

      setResult({ inserted: totalInserted, skipped: totalSkipped });
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error durante la importación.');
    } finally {
      setImporting(false);
    }
  }

  const totalVolume = selectedRows
    .filter((r) => r.type === 'expense')
    .reduce((acc, r) => acc + r.totalAmount, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full sm:max-w-2xl bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl max-h-[92vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur-xs flex items-center justify-between px-5 py-4 border-b border-slate-800 z-10">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Upload className="w-4 h-4 text-emerald-400" />
            Importar CSV de Settle Up
          </h2>
          <button
            type="button"
            onClick={() => {
              resetAll();
              onClose();
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {result ? (
            <div className="space-y-4 text-center py-4">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
              <div>
                <p className="text-base font-bold text-white">
                  Importación completada
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  <strong className="text-emerald-400">{result.inserted}</strong>{' '}
                  movimientos importados ·{' '}
                  <strong className="text-slate-200">{result.skipped}</strong>{' '}
                  duplicados omitidos.
                </p>
                <p className="text-[11px] text-slate-500 mt-2">
                  Si necesitas deshacer esta carga, podrás revertirla en 1 clic desde{' '}
                  <strong className="text-slate-300">Grupo y Sync → Cargas CSV</strong>.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  resetAll();
                  onClose();
                }}
                className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm rounded-xl cursor-pointer"
              >
                Listo
              </button>
            </div>
          ) : (
            <>
              <div className="bg-slate-950 border border-dashed border-slate-700 rounded-2xl p-5 text-center space-y-2">
                <p className="text-xs text-slate-300">
                  {fileName
                    ? `Archivo cargado: ${fileName}`
                    : 'Selecciona el archivo .csv exportado desde Settle Up.'}
                </p>
                <label className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white rounded-xl cursor-pointer transition">
                  <Upload className="w-4 h-4 text-emerald-400" />
                  {fileName ? 'Cambiar archivo CSV' : 'Elegir archivo CSV'}
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              </div>

              {rows.length > 0 && (
                <>
                  <div className="grid grid-cols-2 gap-2.5 text-xs">
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                      <span className="text-slate-400 block">
                        Seleccionados para importar
                      </span>
                      <span className="text-base font-bold text-white">
                        {selectedRows.length} / {rows.length}
                      </span>
                    </div>
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                      <span className="text-slate-400 block">Gastos totales</span>
                      <span className="text-base font-bold text-emerald-400">
                        {formatEUR(totalVolume)}
                      </span>
                    </div>
                  </div>

                  {/* Emparejamiento de personas */}
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-white">
                      <Users className="w-4 h-4 text-sky-400" />
                      Empareja los nombres del CSV con este grupo
                    </div>
                    {detectedNames.map((csvName) => (
                      <div
                        key={csvName}
                        className="flex items-center justify-between gap-3"
                      >
                        <span className="text-xs font-medium text-slate-200 truncate">
                          CSV: <strong>{csvName}</strong>
                        </span>
                        <select
                          value={nameMapping[csvName] ?? '__create_guest__'}
                          onChange={(e) =>
                            setNameMapping((prev) => ({
                              ...prev,
                              [csvName]: e.target.value,
                            }))
                          }
                          className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                        >
                          {members.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.display_name}
                              {m.user_id ? ' (Cuenta real)' : ' (Invitado)'}
                            </option>
                          ))}
                          <option value="__create_guest__">
                            + Crear "{csvName}" como invitado
                          </option>
                        </select>
                      </div>
                    ))}
                  </div>

                  {/* Vista previa y editor fila a fila antes de subir */}
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setShowEditor((v) => !v)}
                      className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-slate-200 hover:bg-slate-900/70 transition cursor-pointer"
                    >
                      <span>
                        Revisar o editar filas antes de importar ({selectedRows.length} activas)
                      </span>
                      {showEditor ? (
                        <ChevronUp className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                    </button>

                    {showEditor && (
                      <div className="border-t border-slate-800 p-3 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="relative flex-1 min-w-[180px]">
                            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                            <input
                              type="text"
                              value={rowSearch}
                              onChange={(e) => setRowSearch(e.target.value)}
                              placeholder="Filtrar por concepto, fecha o persona..."
                              className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                            />
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px]">
                            <button
                              type="button"
                              onClick={() => toggleAllVisible(true)}
                              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg cursor-pointer"
                            >
                              Marcar visibles
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleAllVisible(false)}
                              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg cursor-pointer"
                            >
                              Desmarcar
                            </button>
                          </div>
                        </div>

                        <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
                          {filteredEditorRows.map((r) => (
                            <div
                              key={r.rowKey}
                              className={`grid grid-cols-12 items-center gap-1.5 p-2 rounded-xl border text-xs ${
                                r.selected
                                  ? 'bg-slate-900 border-slate-800'
                                  : 'bg-slate-950 border-slate-900 opacity-45'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={r.selected}
                                onChange={(e) =>
                                  updateRow(r.rowKey, { selected: e.target.checked })
                                }
                                className="col-span-1 w-4 h-4 accent-emerald-500 cursor-pointer"
                              />
                              <input
                                type="date"
                                value={r.dateISO}
                                onChange={(e) =>
                                  updateRow(r.rowKey, { dateISO: e.target.value })
                                }
                                className="col-span-3 bg-slate-950 border border-slate-800 rounded-lg px-1.5 py-1 text-[11px] text-slate-300"
                              />
                              <input
                                type="text"
                                value={r.description}
                                onChange={(e) =>
                                  updateRow(r.rowKey, { description: e.target.value })
                                }
                                placeholder="Concepto"
                                className="col-span-3 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-white"
                              />
                              <select
                                value={r.categoryName}
                                onChange={(e) =>
                                  updateRow(r.rowKey, { categoryName: e.target.value })
                                }
                                className="col-span-3 bg-slate-950 border border-slate-800 rounded-lg px-1.5 py-1 text-[11px] text-slate-200"
                              >
                                {!DEFAULT_EXPENSE_CATEGORY_NAMES.includes(
                                  r.categoryName as (typeof DEFAULT_EXPENSE_CATEGORY_NAMES)[number]
                                ) && (
                                  <option value={r.categoryName}>
                                    {r.categoryName}
                                  </option>
                                )}
                                {DEFAULT_EXPENSE_CATEGORY_NAMES.map((cat) => (
                                  <option key={cat} value={cat}>
                                    {cat}
                                  </option>
                                ))}
                              </select>
                              <input
                                type="number"
                                step="0.01"
                                min="0.01"
                                defaultValue={r.totalAmount}
                                onBlur={(e) =>
                                  updateRowAmount(r.rowKey, e.target.value)
                                }
                                className="col-span-2 bg-slate-950 border border-slate-800 rounded-lg px-1.5 py-1 text-[11px] text-right font-semibold text-orange-300"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Opción de copiar histórico a finanzas */}
                  <label className="flex items-start justify-between gap-3 p-3.5 bg-slate-950 border border-slate-800 rounded-xl cursor-pointer">
                    <div>
                      <p className="text-xs font-semibold text-white">
                        Copiar también este histórico a mis Finanzas
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {mySyncEnabled
                          ? 'Si lo marcas, se añadirá tu parte de todos estos meses a tu cuenta conectada.'
                          : 'Activa primero tu sincronización en el grupo si quieres que pasen a tus finanzas.'}
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      disabled={!mySyncEnabled}
                      checked={syncHistorical}
                      onChange={(e) => setSyncHistorical(e.target.checked)}
                      className="w-4 h-4 accent-emerald-500 mt-0.5 cursor-pointer shrink-0"
                    />
                  </label>

                  <button
                    type="button"
                    disabled={importing || selectedRows.length === 0}
                    onClick={handleImport}
                    className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-semibold text-sm rounded-xl transition cursor-pointer"
                  >
                    {importing
                      ? 'Importando movimientos...'
                      : `Importar ${selectedRows.length} movimientos`}
                  </button>
                </>
              )}

              {error && (
                <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}