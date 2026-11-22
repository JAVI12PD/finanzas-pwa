import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Users,
  Plus,
  UserPlus,
  UserCheck,
  Link2,
  ArrowRight,
  Upload,
  Pencil,
  Trash2,
  CheckCircle2,
  Search,
  RefreshCw,
  Handshake,
  Loader2,
  X,
  SlidersHorizontal,
  BarChart3,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { supabase } from '../lib/supabase';
import {
  DEFAULT_EXPENSE_CATEGORY_NAMES,
  type Category,
  type SplitExpense,
  type SplitGroup,
  type SplitGroupMember,
  type SplitSyncSetting,
  type Workspace,
} from '../lib/types';
import {
  calculateGroupBalances,
  formatRelativeDateES,
} from '../lib/splitUtils';
import { formatEUR, formatMonthLabel, getMonthKey } from '../lib/format';
import { SplitExpenseModal } from '../components/SplitExpenseModal';
import { SettleUpImportModal } from '../components/SettleUpImportModal';
import { MonthStrip } from '../components/MonthStrip';

interface GroupsProps {
  userId: string;
  workspaces: Workspace[];
  activeWorkspaceCategories: Category[];
  onFinancesChanged: () => void;
  openNewTrigger?: number;
}

const AVATAR_PALETTE = [
  '#10B981',
  '#6366F1',
  '#F59E0B',
  '#EC4899',
  '#0EA5E9',
  '#8B5CF6',
];

const CHART_PALETTE = [
  '#10B981',
  '#6366F1',
  '#F59E0B',
  '#EC4899',
  '#0EA5E9',
  '#8B5CF6',
  '#EF4444',
  '#14B8A6',
  '#64748B',
];

export function Groups({
  userId,
  workspaces,
  activeWorkspaceCategories,
  onFinancesChanged,
  openNewTrigger = 0,
}: GroupsProps) {
  const [groups, setGroups] = useState<SplitGroup[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string>('');
  const [members, setMembers] = useState<SplitGroupMember[]>([]);
  const [expenses, setExpenses] = useState<SplitExpense[]>([]);
  const [mySync, setMySync] = useState<SplitSyncSetting | null>(null);
  const [loading, setLoading] = useState(true);

  // Crear nuevo grupo
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupAutoSync, setNewGroupAutoSync] = useState(true);
  const [newGroupWorkspaceId, setNewGroupWorkspaceId] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);

  // Panel de configuración y miembros
  const [showGroupTools, setShowGroupTools] = useState(false);
  const [memberName, setMemberName] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [memberError, setMemberError] = useState<string | null>(null);
  const [memberSuccess, setMemberSuccess] = useState<string | null>(null);

  // Vincular invitado a cuenta real
  const [linkingMemberId, setLinkingMemberId] = useState<string | null>(null);
  const [linkEmail, setLinkEmail] = useState('');
  const [linkingSaving, setLinkingSaving] = useState(false);

  // Sincronización privada
  const [syncWorkspaceId, setSyncWorkspaceId] = useState('');
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [savingSync, setSavingSync] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  // Filtro temporal del grupo (histórico completo vs mes concreto)
  const now = new Date();
  const [periodScope, setPeriodScope] = useState<'all' | 'month'>('all');
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());

  // Transacciones, recategorización rápida y gráficos
  const [showAllTx, setShowAllTx] = useState(false);
  const [search, setSearch] = useState('');
  const [chartMonths, setChartMonths] = useState<6 | 12>(6);
  const [updatingCatExpId, setUpdatingCatExpId] = useState<string | null>(null);

  // Modales
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<SplitExpense | null>(null);
  const [prefillSettlement, setPrefillSettlement] = useState<{
    fromMemberId: string;
    toMemberId: string;
    amount: number;
  } | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const lastHandledTriggerRef = useRef(openNewTrigger);

  useEffect(() => {
    if (!newGroupWorkspaceId && workspaces.length > 0) {
      setNewGroupWorkspaceId(workspaces[0].id);
    }
  }, [workspaces, newGroupWorkspaceId]);

  const loadGroups = useCallback(async () => {
    const { data } = await supabase
      .from('split_groups')
      .select('*')
      .order('created_at', { ascending: true });
    const list = (data as SplitGroup[]) ?? [];
    setGroups(list);
    setActiveGroupId((prev) =>
      list.some((g) => g.id === prev) ? prev : (list[0]?.id ?? '')
    );
    setLoading(false);
  }, []);

  const loadGroupDetails = useCallback(
    async (groupId: string) => {
      if (!groupId) {
        setMembers([]);
        setExpenses([]);
        setMySync(null);
        return;
      }

      const [{ data: memData }, { data: expData }] = await Promise.all([
        supabase
          .from('split_group_members')
          .select('*')
          .eq('group_id', groupId)
          .order('created_at', { ascending: true }),
        supabase
          .from('split_expenses')
          .select('*, split_expense_shares(*)')
          .eq('group_id', groupId)
          .order('expense_date', { ascending: false })
          .order('created_at', { ascending: false }),
      ]);

      const mems = (memData as SplitGroupMember[]) ?? [];
      setMembers(mems);
      setExpenses((expData as unknown as SplitExpense[]) ?? []);

      const myMem = mems.find((m) => m.user_id === userId);
      if (myMem) {
        const { data: cfg } = await supabase
          .from('split_member_sync_settings')
          .select('*')
          .eq('member_id', myMem.id)
          .maybeSingle();

        const typedCfg = (cfg as SplitSyncSetting | null) ?? null;
        setMySync(typedCfg);
        setSyncEnabled(typedCfg?.sync_enabled ?? false);
        setSyncWorkspaceId(typedCfg?.workspace_id ?? workspaces[0]?.id ?? '');
      } else {
        setMySync(null);
        setSyncEnabled(false);
      }
    },
    [userId, workspaces]
  );

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    if (activeGroupId) {
      setSyncMsg(null);
      setMemberError(null);
      setMemberSuccess(null);
      setLinkingMemberId(null);
      setShowAllTx(false);
      setSearch('');
      loadGroupDetails(activeGroupId);
    }
  }, [activeGroupId, loadGroupDetails]);

  useEffect(() => {
    if (openNewTrigger !== lastHandledTriggerRef.current) {
      lastHandledTriggerRef.current = openNewTrigger;
      if (activeGroupId) {
        setEditingExpense(null);
        setPrefillSettlement(null);
        setExpenseModalOpen(true);
      }
    }
  }, [openNewTrigger, activeGroupId]);

  const activeGroup = useMemo(
    () => groups.find((g) => g.id === activeGroupId) ?? null,
    [groups, activeGroupId]
  );

  const myMember = useMemo(
    () => members.find((m) => m.user_id === userId) ?? null,
    [members, userId]
  );

  const memberColorMap = useMemo(() => {
    const m = new Map<string, string>();
    members.forEach((mem, idx) => {
      m.set(mem.id, AVATAR_PALETTE[idx % AVATAR_PALETTE.length]);
    });
    return m;
  }, [members]);

  const memberMap = useMemo(
    () => new Map(members.map((m) => [m.id, m])),
    [members]
  );

  const targetSyncWorkspace = useMemo(
    () => workspaces.find((w) => w.id === mySync?.workspace_id) ?? null,
    [workspaces, mySync]
  );

  // Saldos y deudas reales (SIEMPRE sobre el histórico completo del grupo)
  const { balances, debts } = useMemo(
    () => calculateGroupBalances(members, expenses),
    [members, expenses]
  );

  const heroBalances = useMemo(() => {
    const sorted = [...balances].sort((a, b) => a.netBalance - b.netBalance);
    return {
      primary: sorted[0] ?? null,
      others: sorted.slice(1),
    };
  }, [balances]);

  // Filtro de periodo (histórico o mes concreto)
  const selectedMonthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;

  const activeMonthKeys = useMemo(
    () => new Set(expenses.map((e) => getMonthKey(e.expense_date))),
    [expenses]
  );

  const scopedExpenses = useMemo(() => {
    if (periodScope === 'all') return expenses;
    return expenses.filter(
      (e) => getMonthKey(e.expense_date) === selectedMonthKey
    );
  }, [expenses, periodScope, selectedMonthKey]);

  const { balances: scopedBalances } = useMemo(
    () => calculateGroupBalances(members, scopedExpenses),
    [members, scopedExpenses]
  );

  const myScopedBalanceRow = useMemo(
    () => scopedBalances.find((b) => b.memberId === myMember?.id) ?? null,
    [scopedBalances, myMember]
  );

  const totalScopedSpent = useMemo(
    () =>
      scopedExpenses
        .filter((e) => e.type === 'expense')
        .reduce((acc, e) => acc + Number(e.total_amount), 0),
    [scopedExpenses]
  );

  const memberComparisonChart = useMemo(
    () =>
      scopedBalances.map((b) => ({
        name: b.name,
        pagado: b.paid,
        consumo: b.consumed,
      })),
    [scopedBalances]
  );

  const monthlySeries = useMemo(() => {
    const baseYear = periodScope === 'month' ? selectedYear : new Date().getFullYear();
    const baseMonth = periodScope === 'month' ? selectedMonth : new Date().getMonth();
    const list: { key: string; label: string }[] = [];

    for (let i = chartMonths - 1; i >= 0; i--) {
      const d = new Date(baseYear, baseMonth - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth();
      const key = `${y}-${String(m + 1).padStart(2, '0')}`;
      const short = new Intl.DateTimeFormat('es-ES', { month: 'short' }).format(d);
      list.push({
        key,
        label: short.charAt(0).toUpperCase() + short.slice(1),
      });
    }

    return list.map(({ key, label }) => {
      let totalGrupo = 0;
      let miParte = 0;

      for (const e of expenses) {
        if (e.type !== 'expense' || getMonthKey(e.expense_date) !== key) continue;
        totalGrupo += Number(e.total_amount);
        if (myMember) {
          const share = (e.split_expense_shares ?? []).find(
            (s) => s.member_id === myMember.id
          );
          if (share) miParte += Number(share.share_amount);
        }
      }

      return {
        label,
        totalGrupo: Number(totalGrupo.toFixed(2)),
        miParte: Number(miParte.toFixed(2)),
      };
    });
  }, [expenses, chartMonths, myMember, periodScope, selectedYear, selectedMonth]);

  const categoryChart = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of scopedExpenses) {
      if (e.type !== 'expense') continue;
      const cat = e.category_name || 'Otros gastos';
      map.set(cat, (map.get(cat) ?? 0) + Number(e.total_amount));
    }
    return Array.from(map.entries())
      .map(([name, amount], idx) => ({
        name,
        amount: Number(amount.toFixed(2)),
        color: CHART_PALETTE[idx % CHART_PALETTE.length],
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [scopedExpenses]);

  const filteredExpenses = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return scopedExpenses;
    return scopedExpenses.filter((e) => {
      const payerName = memberMap.get(e.paid_by_member_id)?.display_name ?? '';
      const text = `${e.description} ${e.category_name} ${payerName}`.toLowerCase();
      return text.includes(q);
    });
  }, [scopedExpenses, search, memberMap]);

  const displayedExpenses =
    showAllTx || periodScope === 'month'
      ? filteredExpenses
      : filteredExpenses.slice(0, 4);

  const expenseCategoryNames = useMemo(
    () =>
      activeWorkspaceCategories
        .filter((c) => c.type === 'expense' && !c.is_archived)
        .map((c) => c.name),
    [activeWorkspaceCategories]
  );

  const quickCategoryOptions = useMemo(() => {
    const set = new Set<string>([
      ...expenseCategoryNames,
      ...DEFAULT_EXPENSE_CATEGORY_NAMES,
    ]);
    return Array.from(set);
  }, [expenseCategoryNames]);

  async function handleCreateGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    setCreatingGroup(true);

    const { data, error } = await supabase
      .from('split_groups')
      .insert({ name: newGroupName.trim() })
      .select()
      .single();

    if (!error && data) {
      const targetWs = newGroupWorkspaceId || workspaces[0]?.id || null;
      if (newGroupAutoSync && targetWs) {
        await supabase.rpc('configure_my_split_sync', {
          p_group_id: data.id,
          p_workspace_id: targetWs,
          p_sync_enabled: true,
          p_backfill: false,
        });
      }
      setNewGroupName('');
      setShowNewGroup(false);
      await loadGroups();
      setActiveGroupId(data.id);
    }
    setCreatingGroup(false);
  }

  async function handleDeleteGroup() {
    if (!activeGroup) return;
    const ok = window.confirm(
      `¿Eliminar el grupo "${activeGroup.name}" y todos sus gastos? Los gastos sincronizados de este grupo también se quitarán de las finanzas.`
    );
    if (!ok) return;

    const { error } = await supabase
      .from('split_groups')
      .delete()
      .eq('id', activeGroup.id);

    if (!error) {
      setShowGroupTools(false);
      await loadGroups();
      onFinancesChanged();
    }
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    if (!activeGroup || (!memberName.trim() && !memberEmail.trim())) return;
    setMemberError(null);
    setMemberSuccess(null);

    const { error } = await supabase.rpc('add_split_group_member', {
      p_group_id: activeGroup.id,
      p_display_name: memberName.trim(),
      p_email: memberEmail.trim() || null,
    });

    if (error) {
      setMemberError(error.message);
      return;
    }

    setMemberName('');
    setMemberEmail('');
    setMemberSuccess('Miembro añadido correctamente.');
    loadGroupDetails(activeGroup.id);
  }

  async function handleLinkGuest(e: React.FormEvent) {
    e.preventDefault();
    if (!activeGroup || !linkingMemberId || !linkEmail.trim()) return;

    setLinkingSaving(true);
    setMemberError(null);
    setMemberSuccess(null);

    const { error } = await supabase.rpc('link_split_guest_to_user', {
      p_member_id: linkingMemberId,
      p_email: linkEmail.trim(),
    });

    setLinkingSaving(false);
    if (error) {
      setMemberError(error.message);
      return;
    }

    setLinkingMemberId(null);
    setLinkEmail('');
    setMemberSuccess(
      'Invitado vinculado a su cuenta real. Todo su historial del grupo ya pertenece a su usuario.'
    );
    loadGroupDetails(activeGroup.id);
  }

  async function handleQuickCategoryChange(expId: string, newCategory: string) {
    if (!activeGroup) return;
    setUpdatingCatExpId(expId);

    const { error } = await supabase.rpc('update_split_expense_category', {
      p_expense_id: expId,
      p_category_name: newCategory,
    });

    setUpdatingCatExpId(null);
    if (!error) {
      await loadGroupDetails(activeGroup.id);
      onFinancesChanged();
    }
  }

  async function handleSaveSync(backfill: boolean) {
    if (!activeGroup) return;
    setSavingSync(true);
    setSyncMsg(null);

    const { data, error } = await supabase.rpc('configure_my_split_sync', {
      p_group_id: activeGroup.id,
      p_workspace_id: syncWorkspaceId || null,
      p_sync_enabled: syncEnabled,
      p_backfill: backfill,
    });

    setSavingSync(false);
    if (error) {
      setSyncMsg('Error: ' + error.message);
      return;
    }

    const syncedCount = Number(data ?? 0);
    if (backfill) {
      setSyncMsg(
        syncedCount > 0
          ? `Listo: se han copiado ${syncedCount} gasto(s) previo(s) a tus finanzas.`
          : 'Todos los gastos previos de este grupo ya estaban en tus finanzas.'
      );
    } else if (syncEnabled) {
      setSyncMsg(
        expenses.length > 0
          ? 'Conectado para futuros gastos. Si ya había gastos creados antes, pulsa "Sincronizar previos".'
          : 'Conectado: tu parte de cada gasto nuevo entrará sola en ese perfil.'
      );
    } else {
      setSyncMsg('Sincronización desactivada para este grupo.');
    }

    await loadGroupDetails(activeGroup.id);
    onFinancesChanged();
  }

  async function handleDeleteExpense(expId: string) {
    if (
      !window.confirm(
        '¿Eliminar este movimiento? También se eliminará automáticamente de las finanzas sincronizadas.'
      )
    ) {
      return;
    }
    const { error } = await supabase.from('split_expenses').delete().eq('id', expId);
    if (!error && activeGroup) {
      await loadGroupDetails(activeGroup.id);
      onFinancesChanged();
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20 text-emerald-400">
        <Loader2 className="w-7 h-7 animate-spin" />
      </div>
    );
  }

  const allSettled = debts.length === 0;
  const isOwner = activeGroup?.created_by === userId;
  const periodLabel =
    periodScope === 'month'
      ? formatMonthLabel(selectedYear, selectedMonth)
      : 'Histórico total';

  return (
    <div className="space-y-5">
      {/* ZONA HERO ESTILO SETTLE UP */}
      {activeGroup ? (
        <div className="bg-slate-950 border border-slate-800/80 rounded-3xl overflow-hidden shadow-xl">
          <div className="relative pt-6 pb-5 px-4 flex flex-col items-center justify-center bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900/60">
            <button
              type="button"
              onClick={() => setShowGroupTools((v) => !v)}
              className={`absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                showGroupTools
                  ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300'
                  : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:text-white'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Grupo y Sync</span>
            </button>

            <button
              type="button"
              onClick={() => setShowGroupTools(true)}
              className={`absolute top-4 left-4 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold border transition cursor-pointer ${
                mySync?.sync_enabled && targetSyncWorkspace
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-slate-900/90 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <Link2 className="w-3.5 h-3.5" />
              {mySync?.sync_enabled && targetSyncWorkspace
                ? targetSyncWorkspace.name
                : 'Sin sync'}
            </button>

            <div className="relative flex items-center justify-center mt-6 mb-2 min-h-[190px]">
              {allSettled || !heroBalances.primary ? (
                <div className="w-44 h-44 sm:w-48 sm:h-48 rounded-full bg-emerald-600/90 shadow-2xl shadow-emerald-600/25 flex flex-col items-center justify-center text-center p-4 border border-emerald-400/30">
                  <CheckCircle2 className="w-8 h-8 text-emerald-100 mb-1" />
                  <p className="text-base font-semibold text-white">¡En paz!</p>
                  <p className="text-2xl font-extrabold text-white mt-0.5">
                    0,00 €
                  </p>
                  <p className="text-xs text-emerald-100/80 mt-1">
                    Sin deudas pendientes
                  </p>
                </div>
              ) : (
                <div className="relative flex items-center justify-center">
                  <div className="w-48 h-48 sm:w-52 sm:h-52 rounded-full bg-emerald-600 shadow-2xl shadow-emerald-600/25 flex flex-col items-center justify-center text-center p-4 border border-emerald-400/25 z-10">
                    <p className="text-lg font-medium text-emerald-50 truncate max-w-[150px]">
                      {heroBalances.primary.name}
                    </p>
                    <p className="text-3xl font-extrabold text-white tracking-tight mt-1">
                      {formatEUR(heroBalances.primary.netBalance)}
                    </p>
                    <p className="text-xs font-medium text-emerald-100/85 mt-1.5">
                      debe pagar
                    </p>
                  </div>

                  {heroBalances.others.length > 0 && (
                    <div className="flex flex-col gap-2 -ml-7 sm:-ml-6 z-20 self-end mb-1">
                      {heroBalances.others.slice(0, 3).map((b) => (
                        <div
                          key={b.memberId}
                          className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-emerald-950/95 border-2 border-emerald-500/40 shadow-xl flex flex-col items-center justify-center text-center p-2"
                        >
                          <p className="text-xs sm:text-sm font-medium text-emerald-200 truncate max-w-[85px]">
                            {b.name}
                          </p>
                          <p className="text-xs sm:text-sm font-bold text-white mt-0.5">
                            {b.netBalance > 0 ? '+' : ''}
                            {formatEUR(b.netBalance)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center border-t border-slate-800/80 bg-slate-950 overflow-x-auto px-2">
            {groups.map((g) => {
              const active = g.id === activeGroupId;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setActiveGroupId(g.id)}
                  className={`px-4 py-3.5 text-xs sm:text-sm font-bold uppercase tracking-wider whitespace-nowrap border-b-2 transition cursor-pointer ${
                    active
                      ? 'border-white text-white'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {g.name}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setShowNewGroup((v) => !v)}
              title="Crear nuevo grupo"
              className="px-4 py-3.5 text-slate-400 hover:text-emerald-400 transition cursor-pointer shrink-0"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
            <Users className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">
              Crea tu primer grupo de gastos compartidos
            </h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
              Lleva las cuentas como en Settle Up y sincroniza automáticamente solo tu parte con tu perfil financiero.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowNewGroup(true)}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs rounded-xl cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Crear grupo ahora
          </button>
        </div>
      )}

      {/* Formulario rápido nuevo grupo */}
      {showNewGroup && (
        <form
          onSubmit={handleCreateGroup}
          className="bg-slate-900 border border-emerald-500/40 rounded-2xl p-4 space-y-3"
        >
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              required
              autoFocus
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="Nombre del nuevo grupo (ej. Aguacate, Viaje, Piso...)"
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={creatingGroup}
                className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs rounded-xl cursor-pointer"
              >
                {creatingGroup ? 'Creando...' : 'Crear grupo'}
              </button>
              <button
                type="button"
                onClick={() => setShowNewGroup(false)}
                className="px-3 py-2.5 bg-slate-800 text-slate-300 text-xs rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>

          {workspaces.length > 0 && (
            <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-800 text-xs">
              <label className="inline-flex items-center gap-2 text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newGroupAutoSync}
                  onChange={(e) => setNewGroupAutoSync(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500 cursor-pointer"
                />
                Sincronizar mi parte automáticamente con:
              </label>
              <select
                value={newGroupWorkspaceId}
                onChange={(e) => setNewGroupWorkspaceId(e.target.value)}
                disabled={!newGroupAutoSync}
                className="bg-slate-950 border border-slate-800 disabled:opacity-40 rounded-lg px-2.5 py-1 text-xs font-semibold text-white"
              >
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </form>
      )}

      {activeGroup && (
        <>
          {/* PANEL DESPLEGABLE: SINCRONIZACIÓN, MIEMBROS (+ VINCULAR INVITADO), IMPORTAR Y BORRAR */}
          {showGroupTools && (
            <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-5 space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">
                  Configuración de "{activeGroup.name}"
                </h3>
                <button
                  type="button"
                  onClick={() => setShowGroupTools(false)}
                  className="p-1 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 1. Conexión privada con Finanzas */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                <div>
                  <p className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                    <Link2 className="w-4 h-4" /> Tu conexión privada con Finanzas
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Solo afecta a tu usuario: únicamente <strong>tu parte</strong> de cada gasto irá al perfil que elijas.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-2 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-medium text-white cursor-pointer">
                    <input
                      type="checkbox"
                      checked={syncEnabled}
                      onChange={(e) => setSyncEnabled(e.target.checked)}
                      className="w-4 h-4 accent-emerald-500 cursor-pointer"
                    />
                    Sincronizar automáticamente
                  </label>

                  <select
                    value={syncWorkspaceId}
                    onChange={(e) => setSyncWorkspaceId(e.target.value)}
                    disabled={!syncEnabled}
                    className="bg-slate-900 border border-slate-800 disabled:opacity-40 rounded-xl px-3 py-2 text-xs font-semibold text-white"
                  >
                    {workspaces.map((w) => (
                      <option key={w.id} value={w.id}>
                        Perfil: {w.name}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    disabled={savingSync}
                    onClick={() => handleSaveSync(false)}
                    className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs rounded-xl cursor-pointer"
                  >
                    Guardar
                  </button>

                  {syncEnabled && expenses.length > 0 && (
                    <button
                      type="button"
                      disabled={savingSync}
                      onClick={() => handleSaveSync(true)}
                      className="flex items-center gap-1 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                      Sincronizar previos
                    </button>
                  )}
                </div>
                {syncMsg && <p className="text-xs text-emerald-300">{syncMsg}</p>}
              </div>

              {/* 2. Miembros + Vincular invitado a cuenta real */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                <p className="text-xs font-bold text-sky-400 flex items-center gap-1.5">
                  <UserPlus className="w-4 h-4" /> Miembros ({members.length})
                </p>

                <div className="space-y-2">
                  {members.map((m, idx) => (
                    <div
                      key={m.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                          style={{
                            backgroundColor: AVATAR_PALETTE[idx % AVATAR_PALETTE.length],
                          }}
                        >
                          {m.display_name.charAt(0).toUpperCase()}
                        </span>
                        <span className="text-xs font-semibold text-white">
                          {m.display_name}
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            m.user_id
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {m.user_id ? 'Cuenta real' : 'Invitado'}
                        </span>
                      </div>

                      {/* Botón para vincular un invitado existente a su cuenta real */}
                      {!m.user_id && isOwner && (
                        linkingMemberId === m.id ? (
                          <form
                            onSubmit={handleLinkGuest}
                            className="flex items-center gap-1.5 w-full sm:w-auto mt-1 sm:mt-0"
                          >
                            <input
                              type="email"
                              required
                              autoFocus
                              value={linkEmail}
                              onChange={(e) => setLinkEmail(e.target.value)}
                              placeholder="Email de su cuenta..."
                              className="flex-1 sm:w-52 bg-slate-950 border border-sky-500/50 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-sky-400"
                            />
                            <button
                              type="submit"
                              disabled={linkingSaving}
                              className="px-2.5 py-1 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs rounded-lg cursor-pointer"
                            >
                              {linkingSaving ? '...' : 'Vincular'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setLinkingMemberId(null);
                                setLinkEmail('');
                              }}
                              className="p-1 text-slate-400 hover:text-white cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </form>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setLinkingMemberId(m.id);
                              setLinkEmail('');
                              setMemberError(null);
                              setMemberSuccess(null);
                            }}
                            className="flex items-center gap-1 px-2.5 py-1 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-sky-300 text-[11px] font-semibold rounded-lg cursor-pointer"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            Vincular cuenta
                          </button>
                        )
                      )}
                    </div>
                  ))}
                </div>

                <form
                  onSubmit={handleAddMember}
                  className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-800"
                >
                  <input
                    type="text"
                    value={memberName}
                    onChange={(e) => setMemberName(e.target.value)}
                    placeholder="Nombre (ej. Valle, Carlos...)"
                    className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                  <input
                    type="email"
                    value={memberEmail}
                    onChange={(e) => setMemberEmail(e.target.value)}
                    placeholder="Email (opcional, si tiene cuenta)"
                    className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="submit"
                    className="bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs rounded-xl py-2 cursor-pointer"
                  >
                    Añadir miembro
                  </button>
                </form>
                {memberError && <p className="text-xs text-rose-400">{memberError}</p>}
                {memberSuccess && (
                  <p className="text-xs text-emerald-400">{memberSuccess}</p>
                )}
              </div>

              {/* 3. Importar Settle Up y Borrar grupo */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setImportOpen(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white rounded-xl cursor-pointer"
                >
                  <Upload className="w-4 h-4 text-sky-400" />
                  Importar CSV de Settle Up
                </button>

                {isOwner && (
                  <button
                    type="button"
                    onClick={handleDeleteGroup}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-xs font-semibold text-rose-300 rounded-xl cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    Eliminar grupo
                  </button>
                )}
              </div>
            </div>
          )}

          {/* SELECTOR DE PERIODO DENTRO DEL GRUPO (HISTÓRICO VS POR MES) */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex bg-slate-900 border border-slate-800 rounded-xl p-1">
                <button
                  type="button"
                  onClick={() => setPeriodScope('all')}
                  className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
                    periodScope === 'all'
                      ? 'bg-emerald-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Todo el histórico
                </button>
                <button
                  type="button"
                  onClick={() => setPeriodScope('month')}
                  className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
                    periodScope === 'month'
                      ? 'bg-emerald-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Filtrar por mes
                </button>
              </div>

              <div className="flex items-center gap-3 text-xs">
                <span className="text-slate-400">
                  {periodScope === 'month' ? 'Gasto del mes:' : 'Total grupo:'}{' '}
                  <strong className="text-white">
                    {formatEUR(totalScopedSpent)}
                  </strong>
                </span>
                <span className="text-slate-400 hidden sm:inline">
                  Tu parte:{' '}
                  <strong className="text-sky-400">
                    {formatEUR(myScopedBalanceRow?.consumed ?? 0)}
                  </strong>
                </span>
              </div>
            </div>

            {periodScope === 'month' && (
              <MonthStrip
                selectedYear={selectedYear}
                selectedMonth={selectedMonth}
                onChangeMonth={(y, m) => {
                  setSelectedYear(y);
                  setSelectedMonth(m);
                }}
                activeMonthKeys={activeMonthKeys}
              />
            )}
          </div>

          {/* TRANSACCIONES */}
          <section className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 border-b border-slate-800/80">
              <h3 className="text-sm font-semibold text-slate-300">
                Transacciones{' '}
                <span className="text-xs font-normal text-slate-500">
                  ({periodLabel})
                </span>
              </h3>

              <div className="flex items-center gap-2">
                {(showAllTx || periodScope === 'month') && (
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar..."
                      className="bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-2.5 py-1 text-xs text-white focus:outline-none focus:border-emerald-500 w-36 sm:w-52"
                    />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setEditingExpense(null);
                    setPrefillSettlement(null);
                    setExpenseModalOpen(true);
                  }}
                  className="hidden sm:flex items-center gap-1 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs rounded-lg cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Nuevo gasto
                </button>
              </div>
            </div>

            {displayedExpenses.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-400">
                {periodScope === 'month'
                  ? `No hay movimientos registrados en ${periodLabel}.`
                  : 'No hay transacciones todavía. Pulsa el botón verde + para añadir el primer gasto.'}
              </div>
            ) : (
              <div className="divide-y divide-slate-800/70">
                {displayedExpenses.map((exp) => {
                  const payer = memberMap.get(exp.paid_by_member_id);
                  const payerName = payer?.display_name ?? '?';
                  const payerColor =
                    memberColorMap.get(exp.paid_by_member_id) ?? '#10B981';
                  const isSettlement = exp.type === 'settlement';
                  const shares = exp.split_expense_shares ?? [];
                  const myShare = myMember
                    ? shares.find((s) => s.member_id === myMember.id)
                        ?.share_amount ?? 0
                    : 0;

                  const rowCatOptions = quickCategoryOptions.includes(
                    exp.category_name
                  )
                    ? quickCategoryOptions
                    : [exp.category_name, ...quickCategoryOptions];

                  return (
                    <div
                      key={exp.id}
                      className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 hover:bg-slate-800/40 transition"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div
                          className="w-11 h-11 rounded-full flex items-center justify-center text-base font-bold text-white shrink-0 shadow-md"
                          style={{ backgroundColor: payerColor }}
                        >
                          {payerName.charAt(0).toUpperCase()}
                        </div>

                        <div className="min-w-0">
                          <p className="text-sm sm:text-base font-semibold text-white truncate">
                            {exp.description || exp.category_name}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                            <span>{formatRelativeDateES(exp.expense_date)}</span>
                            {!isSettlement && (
                              <>
                                <span>·</span>
                                {/* Selector rápido de categoría en 1 toque */}
                                <select
                                  aria-label="Cambiar categoría del gasto"
                                  disabled={updatingCatExpId === exp.id}
                                  value={exp.category_name}
                                  onChange={(e) =>
                                    handleQuickCategoryChange(exp.id, e.target.value)
                                  }
                                  className="bg-slate-950/90 hover:bg-slate-800 border border-slate-800 rounded-lg px-2 py-0.5 text-[11px] font-medium text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer disabled:opacity-50"
                                >
                                  {rowCatOptions.map((catName) => (
                                    <option key={catName} value={catName}>
                                      {catName}
                                    </option>
                                  ))}
                                </select>
                              </>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {isSettlement ? (
                              <span className="text-sky-400 font-medium">
                                {payerName} saldó deuda
                              </span>
                            ) : (
                              <>
                                {payerName} pagó por
                                {myShare > 0 && (
                                  <span className="text-sky-400 ml-1.5 font-medium">
                                    (Tu parte: {formatEUR(Number(myShare))})
                                  </span>
                                )}
                              </>
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex flex-col items-end gap-1.5">
                          <span
                            className={`text-sm sm:text-base font-bold ${
                              isSettlement ? 'text-sky-400' : 'text-orange-300'
                            }`}
                          >
                            {formatEUR(Number(exp.total_amount))}
                          </span>

                          <div className="flex items-center -space-x-1.5">
                            {shares.map((s) => {
                              const mem = memberMap.get(s.member_id);
                              const col =
                                memberColorMap.get(s.member_id) ?? '#64748B';
                              return (
                                <span
                                  key={s.member_id}
                                  title={`${mem?.display_name ?? '?'}: ${formatEUR(Number(s.share_amount))}`}
                                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white ring-2 ring-slate-900"
                                  style={{ backgroundColor: col }}
                                >
                                  {(mem?.display_name ?? '?')
                                    .charAt(0)
                                    .toUpperCase()}
                                </span>
                              );
                            })}
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row items-center gap-0.5 ml-1">
                          <button
                            type="button"
                            onClick={() => {
                              setPrefillSettlement(null);
                              setEditingExpense(exp);
                              setExpenseModalOpen(true);
                            }}
                            className="p-1.5 text-slate-500 hover:text-white rounded-lg cursor-pointer"
                            title="Editar"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteExpense(exp.id)}
                            className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg cursor-pointer"
                            title="Eliminar"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {periodScope === 'all' && filteredExpenses.length > 4 && (
              <button
                type="button"
                onClick={() => setShowAllTx((v) => !v)}
                className="w-full py-3.5 text-center text-xs font-bold uppercase tracking-wider text-emerald-400 hover:bg-slate-800/60 border-t border-slate-800/80 transition cursor-pointer"
              >
                {showAllTx
                  ? 'Mostrar menos'
                  : `Mostrar todo (${filteredExpenses.length})`}
              </button>
            )}
          </section>

          {/* DEUDAS (SIEMPRE ACUMULADO REAL DEL GRUPO) */}
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-300">
                Deudas actuales
              </h3>
              <span className="text-[11px] text-slate-500">
                Balance acumulado real
              </span>
            </div>

            {debts.length === 0 ? (
              <div className="flex items-center gap-2.5 text-sm text-emerald-400 font-medium">
                <CheckCircle2 className="w-5 h-5" />
                No hay ninguna deuda pendiente en este grupo.
              </div>
            ) : (
              <div className="space-y-3">
                {debts.map((d, idx) => {
                  const fromColor =
                    memberColorMap.get(d.fromMemberId) ?? '#10B981';
                  const toColor = memberColorMap.get(d.toMemberId) ?? '#6366F1';
                  return (
                    <div
                      key={`${d.fromMemberId}-${d.toMemberId}-${idx}`}
                      className="flex flex-wrap items-center justify-between gap-3 bg-slate-950/70 border border-slate-800 rounded-2xl p-3.5"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-[210px] justify-between sm:justify-start sm:gap-6">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                            style={{ backgroundColor: fromColor }}
                          >
                            {d.fromName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-white">
                              {d.fromName}
                            </p>
                            <p className="text-xs font-bold text-orange-300">
                              {formatEUR(d.amount)}
                            </p>
                          </div>
                        </div>

                        <div className="w-8 h-8 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                          <ArrowRight className="w-4 h-4" />
                        </div>

                        <div className="flex items-center gap-2.5">
                          <p className="text-sm font-semibold text-white">
                            {d.toName}
                          </p>
                          <div
                            className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                            style={{ backgroundColor: toColor }}
                          >
                            {d.toName.charAt(0).toUpperCase()}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setEditingExpense(null);
                          setPrefillSettlement({
                            fromMemberId: d.fromMemberId,
                            toMemberId: d.toMemberId,
                            amount: d.amount,
                          });
                          setExpenseModalOpen(true);
                        }}
                        className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 font-semibold text-xs rounded-xl cursor-pointer"
                      >
                        <Handshake className="w-4 h-4" />
                        Saldar
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* 3 GRÁFICOS DETALLADOS */}
          {expenses.some((e) => e.type === 'expense') && (
            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-emerald-400" />
                  Análisis de {activeGroup.name}{' '}
                  <span className="text-xs font-normal text-slate-400">
                    ({periodLabel})
                  </span>
                </h3>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                  <h4 className="text-sm font-semibold text-white mb-1">
                    Pagado vs Consumo real ({periodLabel})
                  </h4>
                  <p className="text-[11px] text-slate-400 mb-4">
                    Cuánto ha adelantado cada uno frente a lo que realmente ha consumido.
                  </p>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={memberComparisonChart}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
                        <YAxis stroke="#94a3b8" fontSize={12} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#0f172a',
                            borderColor: '#334155',
                            borderRadius: '12px',
                            fontSize: '12px',
                          }}
                          formatter={(value) => formatEUR(Number(value ?? 0))}
                        />
                        <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '6px' }} />
                        <Bar
                          dataKey="pagado"
                          name="Pagado"
                          fill="#10b981"
                          radius={[6, 6, 0, 0]}
                        />
                        <Bar
                          dataKey="consumo"
                          name="Consumo real"
                          fill="#6366f1"
                          radius={[6, 6, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h4 className="text-sm font-semibold text-white">
                      Evolución mensual: Grupo vs Tu parte
                    </h4>
                    <div className="inline-flex bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-[11px]">
                      {([6, 12] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setChartMonths(m)}
                          className={`px-2 py-0.5 rounded-md font-semibold cursor-pointer ${
                            chartMonths === m
                              ? 'bg-emerald-500 text-slate-950'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {m}M
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 mb-4">
                    Gasto total del grupo cada mes frente a tu cuota real.
                  </p>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={monthlySeries}>
                        <defs>
                          <linearGradient id="grpTot" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="grpMine" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.35} />
                            <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="label" stroke="#94a3b8" fontSize={12} />
                        <YAxis stroke="#94a3b8" fontSize={12} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#0f172a',
                            borderColor: '#334155',
                            borderRadius: '12px',
                            fontSize: '12px',
                          }}
                          formatter={(value) => formatEUR(Number(value ?? 0))}
                        />
                        <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '6px' }} />
                        <Area
                          type="monotone"
                          dataKey="totalGrupo"
                          name="Total grupo"
                          stroke="#6366f1"
                          strokeWidth={2}
                          fill="url(#grpTot)"
                        />
                        <Area
                          type="monotone"
                          dataKey="miParte"
                          name="Tu parte real"
                          stroke="#0ea5e9"
                          strokeWidth={2.5}
                          fill="url(#grpMine)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {categoryChart.length > 0 && (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                  <h4 className="text-sm font-semibold text-white mb-4">
                    Distribución por categorías ({periodLabel})
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                    <div className="h-52">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={categoryChart}
                            dataKey="amount"
                            nameKey="name"
                            innerRadius={52}
                            outerRadius={82}
                            paddingAngle={2}
                          >
                            {categoryChart.map((entry) => (
                              <Cell key={entry.name} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#0f172a',
                              borderColor: '#334155',
                              borderRadius: '12px',
                              fontSize: '12px',
                            }}
                            formatter={(value) => formatEUR(Number(value ?? 0))}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {categoryChart.map((c) => {
                        const pct =
                          totalScopedSpent > 0
                            ? (c.amount / totalScopedSpent) * 100
                            : 0;
                        return (
                          <div
                            key={c.name}
                            className="flex items-center justify-between text-xs gap-2"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: c.color }}
                              />
                              <span className="text-slate-200 truncate">{c.name}</span>
                            </div>
                            <div className="shrink-0">
                              <span className="font-semibold text-white">
                                {formatEUR(c.amount)}
                              </span>
                              <span className="text-slate-500 ml-1.5">
                                ({pct.toFixed(0)}%)
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}

          <SplitExpenseModal
            open={expenseModalOpen}
            onClose={() => {
              setExpenseModalOpen(false);
              setEditingExpense(null);
              setPrefillSettlement(null);
            }}
            groupId={activeGroup.id}
            members={members}
            myMemberId={myMember?.id ?? null}
            mySyncSetting={mySync}
            targetWorkspace={targetSyncWorkspace}
            categoryOptions={expenseCategoryNames}
            editingExpense={editingExpense}
            prefillSettlement={prefillSettlement}
            onSaved={async () => {
              await loadGroupDetails(activeGroup.id);
              onFinancesChanged();
            }}
          />

          <SettleUpImportModal
            open={importOpen}
            onClose={() => setImportOpen(false)}
            groupId={activeGroup.id}
            members={members}
            mySyncEnabled={Boolean(mySync?.sync_enabled && mySync?.workspace_id)}
            onImported={async () => {
              await loadGroupDetails(activeGroup.id);
              onFinancesChanged();
            }}
          />
        </>
      )}
    </div>
  );
}