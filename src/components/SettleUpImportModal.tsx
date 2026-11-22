import { useState } from 'react';
import { X, Upload, CheckCircle2, AlertCircle, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { SplitGroupMember } from '../lib/types';
import { parseSettleUpFile, type ParsedSettleUpRow } from '../lib/splitUtils';
import { formatEUR } from '../lib/format';

interface SettleUpImportModalProps {
  open: boolean;
  onClose: () => void;
  groupId: string;
  members: SplitGroupMember[];
  mySyncEnabled: boolean;
  onImported: () => void;
}

export function SettleUpImportModal({
  open,
  onClose,
  groupId,
  members,
  mySyncEnabled,
  onImported,
}: SettleUpImportModalProps) {
  const [rows, setRows] = useState<ParsedSettleUpRow[]>([]);
  const [detectedNames, setDetectedNames] = useState<string[]>([]);
  const [nameMapping, setNameMapping] = useState<Record<string, string>>({});
  const [syncHistorical, setSyncHistorical] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ inserted: number; skipped: number } | null>(
    null
  );

  if (!open) return null;

  function resetAll() {
    setRows([]);
    setDetectedNames([]);
    setNameMapping({});
    setSyncHistorical(false);
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
      setRows(parsed.rows);
      setDetectedNames(parsed.detectedNames);

      // Emparejado automático inteligente por similitud de nombre
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

  async function handleImport() {
    if (rows.length === 0) return;
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

      // 2. Prepara el lote con IDs reales
      const payloadItems = rows.map((r) => ({
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

      // 3. Envía en bloques de 100 filas para ir rápido y sin saturar la red
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

  const totalVolume = rows
    .filter((r) => r.type === 'expense')
    .reduce((acc, r) => acc + r.totalAmount, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full sm:max-w-lg bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl max-h-[92vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur-xs flex items-center justify-between px-5 py-4 border-b border-slate-800">
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
                  Selecciona el archivo <code>.csv</code> exportado desde Settle Up.
                </p>
                <label className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white rounded-xl cursor-pointer transition">
                  <Upload className="w-4 h-4 text-emerald-400" />
                  Elegir archivo CSV
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
                      <span className="text-slate-400 block">Movimientos leídos</span>
                      <span className="text-base font-bold text-white">
                        {rows.length}
                      </span>
                    </div>
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                      <span className="text-slate-400 block">Gastos totales</span>
                      <span className="text-base font-bold text-emerald-400">
                        {formatEUR(totalVolume)}
                      </span>
                    </div>
                  </div>

                  {/* Mapeo de personas */}
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
                              {m.user_id ? ' (Cuenta app)' : ' (Invitado)'}
                            </option>
                          ))}
                          <option value="__create_guest__">
                            + Crear "{csvName}" como invitado
                          </option>
                        </select>
                      </div>
                    ))}
                  </div>

                  {/* Opción de pasar histórico a finanzas */}
                  <label className="flex items-start justify-between gap-3 p-3.5 bg-slate-950 border border-slate-800 rounded-xl cursor-pointer">
                    <div>
                      <p className="text-xs font-semibold text-white">
                        Copiar también este histórico a mis Finanzas
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {mySyncEnabled
                          ? 'Si lo marcas, se añadirá tu parte de todos estos meses a tu perfil conectado.'
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
                    disabled={importing}
                    onClick={handleImport}
                    className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-semibold text-sm rounded-xl transition cursor-pointer"
                  >
                    {importing
                      ? 'Importando movimientos...'
                      : `Importar ${rows.length} movimientos`}
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