import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  LayoutDashboard,
  List,
  Repeat,
  PiggyBank,
  Settings as SettingsIcon,
  Plus,
  Users,
  User,
  Loader2,
  Wallet,
  ChevronDown,
} from 'lucide-react';
import { supabase } from './lib/supabase';
import type {
  Category,
  Profile as ProfileType,
  RecurringRule,
  SavingsGoal,
  Transaction,
  Workspace,
} from './lib/types';
import { Auth, PasswordRecoveryScreen } from './components/Auth';
import { TransactionModal } from './components/TransactionModal';
import { Dashboard } from './pages/Dashboard';
import { Transactions } from './pages/Transactions';
import { Groups } from './pages/Groups';
import { Recurring } from './pages/Recurring';
import { Goals } from './pages/Goals';
import { Settings } from './pages/Settings';
import { Profile } from './pages/Profile';

type Tab =
  | 'groups'
  | 'dashboard'
  | 'transactions'
  | 'recurring'
  | 'goals'
  | 'settings'
  | 'profile';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  const [profile, setProfile] = useState<ProfileType | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>('');

  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [recurringRules, setRecurringRules] = useState<RecurringRule[]>([]);
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  // Pantalla principal: Grupos (estilo Settle Up)
  const [activeTab, setActiveTab] = useState<Tab>('groups');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [groupNewTrigger, setGroupNewTrigger] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const loadBaseData = useCallback(async (userId: string) => {
    const [{ data: prof }, { data: wsList }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('workspaces').select('*').order('created_at', { ascending: true }),
    ]);

    if (prof) setProfile(prof as ProfileType);
    if (wsList && wsList.length > 0) {
      const typed = wsList as Workspace[];
      setWorkspaces(typed);
      setActiveWorkspaceId((prev) =>
        typed.some((w) => w.id === prev) ? prev : typed[0].id
      );
    }
  }, []);

  const loadWorkspaceData = useCallback(
    async (wsId: string, autoSyncRecurring = false) => {
      if (!wsId) return;
      setLoadingData(true);

      if (autoSyncRecurring) {
        const d = new Date();
        const currentMonthStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
        await supabase.rpc('sync_recurring_transactions', {
          p_workspace_id: wsId,
          p_target_month: currentMonthStart,
        });
      }

      const [
        { data: cats },
        { data: txs },
        { data: rules },
        { data: gList },
      ] = await Promise.all([
        supabase
          .from('categories')
          .select('*')
          .eq('workspace_id', wsId)
          .order('name', { ascending: true }),
        supabase
          .from('transactions')
          .select('*, profiles(full_name, avatar_color)')
          .eq('workspace_id', wsId)
          .order('transaction_date', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase
          .from('recurring_rules')
          .select('*')
          .eq('workspace_id', wsId)
          .order('day_of_month', { ascending: true }),
        supabase
          .from('savings_goals')
          .select('*')
          .eq('workspace_id', wsId)
          .order('created_at', { ascending: true }),
      ]);

      setCategories((cats as Category[]) ?? []);
      setTransactions((txs as unknown as Transaction[]) ?? []);
      setRecurringRules((rules as RecurringRule[]) ?? []);
      setGoals((gList as SavingsGoal[]) ?? []);
      setLoadingData(false);
    },
    []
  );

  useEffect(() => {
    if (session?.user.id) {
      loadBaseData(session.user.id);
    }
  }, [session?.user.id, loadBaseData]);

  useEffect(() => {
    if (activeWorkspaceId) {
      loadWorkspaceData(activeWorkspaceId, true);
    }
  }, [activeWorkspaceId, loadWorkspaceData]);

  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.id === activeWorkspaceId) ?? null,
    [workspaces, activeWorkspaceId]
  );

  const totalAccumulatedSavings = useMemo(() => {
    if (!activeWorkspace) return 0;
    let total = Number(activeWorkspace.initial_balance || 0);
    for (const t of transactions) {
      if (t.type === 'income') total += Number(t.amount);
      else if (t.type === 'expense') total -= Number(t.amount);
    }
    return total;
  }, [activeWorkspace, transactions]);

  function handleQuickAdd() {
    if (activeTab === 'groups') {
      setGroupNewTrigger((n) => n + 1);
    } else {
      setEditingTx(null);
      setModalOpen(true);
    }
  }

  function goHome() {
    const today = new Date();
    setSelectedYear(today.getFullYear());
    setSelectedMonth(today.getMonth());
    setActiveTab('groups');
  }

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-emerald-400">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (isPasswordRecovery) {
    return (
      <PasswordRecoveryScreen onDone={() => setIsPasswordRecovery(false)} />
    );
  }

  if (!session) {
    return <Auth />;
  }

  const navItems: {
    id: Exclude<Tab, 'profile'>;
    label: string;
    mobileLabel: string;
    icon: typeof LayoutDashboard;
  }[] = [
    { id: 'groups', label: 'Grupos', mobileLabel: 'Grupos', icon: Users },
    { id: 'dashboard', label: 'Resumen', mobileLabel: 'Resumen', icon: LayoutDashboard },
    { id: 'transactions', label: 'Movimientos', mobileLabel: 'Movs.', icon: List },
    { id: 'recurring', label: 'Fijos', mobileLabel: 'Fijos', icon: Repeat },
    { id: 'goals', label: 'Huchas', mobileLabel: 'Huchas', icon: PiggyBank },
    { id: 'settings', label: 'Ajustes', mobileLabel: 'Ajustes', icon: SettingsIcon },
  ];

  const userInitial = (profile?.full_name || profile?.email || 'U')
    .trim()
    .charAt(0)
    .toUpperCase();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-24 md:pb-8">
      {/* Barra superior */}
      <header className="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={goHome}
              title="Ir a inicio (Grupos)"
              className="w-9 h-9 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 flex items-center justify-center shrink-0 transition cursor-pointer focus:outline-none"
            >
              <Wallet className="w-5 h-5 text-emerald-400" />
            </button>

            {workspaces.length > 0 && (
              <div className="relative flex items-center">
                <span className="pointer-events-none absolute left-3 flex items-center">
                  {activeWorkspace?.type === 'shared' ? (
                    <Users className="w-4 h-4 text-sky-400" />
                  ) : (
                    <User className="w-4 h-4 text-emerald-400" />
                  )}
                </span>
                <select
                  aria-label="Cambiar perfil financiero"
                  value={activeWorkspaceId}
                  onChange={(e) => setActiveWorkspaceId(e.target.value)}
                  className="appearance-none bg-slate-900 hover:bg-slate-800/80 border border-slate-800 rounded-xl pl-9 pr-8 py-1.5 text-sm font-semibold text-white focus:outline-none focus:border-emerald-500 max-w-[155px] sm:max-w-[210px] truncate transition cursor-pointer"
                >
                  {workspaces.map((ws) => (
                    <option key={ws.id} value={ws.id}>
                      {ws.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none w-4 h-4 text-slate-400 absolute right-2.5" />
              </div>
            )}
          </div>

          {/* Navegación escritorio */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-1.5 px-2.5 lg:px-3 py-2 rounded-xl text-xs font-semibold transition cursor-pointer focus:outline-none ${
                    active
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : 'text-slate-400 hover:text-white hover:bg-slate-900'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Derecha: botón rápido + acceso directo a Perfil */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleQuickAdd}
              className="hidden sm:flex items-center gap-1.5 px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs rounded-xl transition cursor-pointer focus:outline-none"
            >
              <Plus className="w-4 h-4" />
              {activeTab === 'groups' ? 'Gasto grupo' : 'Nuevo'}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              title="Mi Perfil y Contraseña"
              className={`flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full border transition cursor-pointer focus:outline-none ${
                activeTab === 'profile'
                  ? 'bg-emerald-500/15 border-emerald-500 text-white'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white'
              }`}
            >
              <span
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold text-white"
                style={{ backgroundColor: profile?.avatar_color || '#10B981' }}
              >
                {userInitial}
              </span>
              <span className="text-xs font-semibold hidden lg:inline">
                Perfil
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Contenido principal */}
      <main className="max-w-6xl mx-auto px-4 py-5">
        {loadingData && !activeWorkspace ? (
          <div className="flex justify-center py-20 text-emerald-400">
            <Loader2 className="w-7 h-7 animate-spin" />
          </div>
        ) : activeWorkspace ? (
          <>
            {activeTab === 'groups' && (
              <Groups
                userId={session.user.id}
                workspaces={workspaces}
                activeWorkspaceCategories={categories}
                onFinancesChanged={() => loadWorkspaceData(activeWorkspace.id)}
                openNewTrigger={groupNewTrigger}
              />
            )}

            {activeTab === 'dashboard' && (
              <Dashboard
                workspace={activeWorkspace}
                transactions={transactions}
                categories={categories}
                selectedYear={selectedYear}
                selectedMonth={selectedMonth}
                onChangeMonth={(y, m) => {
                  setSelectedYear(y);
                  setSelectedMonth(m);
                }}
                onGoToSettings={() => setActiveTab('settings')}
              />
            )}

            {activeTab === 'transactions' && (
              <Transactions
                workspace={activeWorkspace}
                transactions={transactions}
                categories={categories}
                selectedYear={selectedYear}
                selectedMonth={selectedMonth}
                onChangeMonth={(y, m) => {
                  setSelectedYear(y);
                  setSelectedMonth(m);
                }}
                onEdit={(tx) => {
                  setEditingTx(tx);
                  setModalOpen(true);
                }}
                onDeleted={() => loadWorkspaceData(activeWorkspace.id)}
              />
            )}

            {activeTab === 'recurring' && (
              <Recurring
                workspaceId={activeWorkspace.id}
                rules={recurringRules}
                categories={categories}
                onUpdated={() => loadWorkspaceData(activeWorkspace.id)}
              />
            )}

            {activeTab === 'goals' && (
              <Goals
                workspaceId={activeWorkspace.id}
                goals={goals}
                totalAccumulatedSavings={totalAccumulatedSavings}
                onUpdated={() => loadWorkspaceData(activeWorkspace.id)}
              />
            )}

            {activeTab === 'settings' && (
              <Settings
                profile={profile}
                workspace={activeWorkspace}
                workspaces={workspaces}
                categories={categories}
                transactions={transactions}
                onRefreshAll={() => {
                  if (session?.user.id) loadBaseData(session.user.id);
                  loadWorkspaceData(activeWorkspace.id);
                }}
                onSelectWorkspace={(wsId) => setActiveWorkspaceId(wsId)}
              />
            )}

            {activeTab === 'profile' && (
              <Profile
                profile={profile}
                onUpdated={() => {
                  if (session?.user.id) loadBaseData(session.user.id);
                }}
              />
            )}
          </>
        ) : (
          <div className="text-center py-20 text-slate-400 text-sm">
            Cargando tu espacio financiero...
          </div>
        )}
      </main>

      {/* Botón flotante (+) para móvil — contextual (Calculadora en Grupos / Finanzas en el resto) */}
      {activeTab !== 'profile' && (
        <button
          type="button"
          onClick={handleQuickAdd}
          className="sm:hidden fixed right-5 bottom-20 z-40 w-14 h-14 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-xl shadow-emerald-500/30 flex items-center justify-center active:scale-95 transition cursor-pointer focus:outline-none"
          aria-label={
            activeTab === 'groups'
              ? 'Añadir gasto al grupo'
              : 'Añadir movimiento'
          }
        >
          <Plus className="w-7 h-7 stroke-[2.5]" />
        </button>
      )}

      {/* Barra inferior para móvil */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-slate-950/95 backdrop-blur-md border-t border-slate-800 px-1.5 py-1.5">
        <div className="grid grid-cols-6 gap-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col items-center justify-center py-1.5 rounded-xl text-[10px] font-medium transition cursor-pointer focus:outline-none ${
                  active ? 'text-emerald-400' : 'text-slate-400'
                }`}
              >
                <Icon className="w-5 h-5 mb-0.5" />
                {item.mobileLabel}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Modal de creación / edición rápida de finanzas */}
      {activeWorkspace && (
        <TransactionModal
          open={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setEditingTx(null);
          }}
          workspaceId={activeWorkspace.id}
          categories={categories}
          editingTransaction={editingTx}
          onSaved={() => loadWorkspaceData(activeWorkspace.id)}
        />
      )}
    </div>
  );
}