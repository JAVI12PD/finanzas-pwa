import { useEffect, useState } from 'react';
import {
  Plus,
  Pencil,
  Archive,
  RotateCcw,
  Users,
  User,
  UserPlus,
  Save,
  LogOut,
  Download,
  Check,
  X,
  Wallet,
  Trash2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type {
  Category,
  Profile,
  Transaction,
  TransactionType,
  Workspace,
} from '../lib/types';
import { CategoryIcon } from '../lib/icons';
import { exportTransactionsToCSV, formatEUR } from '../lib/format';
import { IconPicker } from '../components/IconPicker';

interface SettingsProps {
  profile: Profile | null;
  workspace: Workspace;
  workspaces: Workspace[];
  categories: Category[];
  transactions: Transaction[];
  onRefreshAll: () => void;
  onSelectWorkspace: (wsId: string) => void;
}

interface MemberRow {
  user_id: string;
  role: 'owner' | 'member';
  profiles: { email: string; full_name: string; avatar_color: string } | null;
}

const CAT_COLORS = [
  '#6366F1',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#3B82F6',
  '#EC4899',
  '#8B5CF6',
  '#06B6D4',
  '#0EA5E9',
  '#14B8A6',
  '#64748B',
];

export function Settings({
  profile,
  workspace,
  workspaces,
  categories,
  transactions,
  onRefreshAll,
  onSelectWorkspace,
}: SettingsProps) {
  // Categorías
  const [catTab, setCatTab] = useState<TransactionType>('expense');
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [catName, setCatName] = useState('');
  const [catIcon, setCatIcon] = useState('Tag');
  const [catColor, setCatColor] = useState('#6366F1');
  const [catBudget, setCatBudget] = useState('');
  const [savingCat, setSavingCat] = useState(false);

  // Espacio actual
  const [wsName, setWsName] = useState(workspace.name);
  const [wsType, setWsType] = useState<'personal' | 'shared'>(workspace.type);
  const [wsInitialBalance, setWsInitialBalance] = useState(
    String(workspace.initial_balance ?? 0)
  );
  const [wsMsg, setWsMsg] = useState<string | null>(null);

  // Crear nuevo espacio (Personal / Puntual o Compartido)
  const [newWsName, setNewWsName] = useState('');
  const [newWsType, setNewWsType] = useState<'personal' | 'shared'>('personal');
  const [creatingWs, setCreatingWs] = useState(false);

  // Miembros
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);

  // Perfil de usuario
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [profileMsg, setProfileMsg] = useState<string | null>(null);

  useEffect(() => {
    setWsName(workspace.name);
    setWsType(workspace.type);
    setWsInitialBalance(String(workspace.initial_balance ?? 0));
    setWsMsg(null);
    setInviteMsg(null);

    async function loadMembers() {
      const { data } = await supabase
        .from('workspace_members')
        .select('user_id, role, profiles(email, full_name, avatar_color)')
        .eq('workspace_id', workspace.id);
      if (data) setMembers(data as unknown as MemberRow[]);
    }
    loadMembers();
  }, [workspace]);

  useEffect(() => {
    if (profile) setFullName(profile.full_name);
  }, [profile]);

  function startEditCat(c: Category) {
    setEditingCat(c);
    setCatTab(c.type);
    setCatName(c.name);
    setCatIcon(c.icon);
    setCatColor(c.color);
    setCatBudget(c.monthly_budget ? String(c.monthly_budget) : '');
  }

  function resetCatForm() {
    setEditingCat(null);
    setCatName('');
    setCatIcon('Tag');
    setCatColor('#6366F1');
    setCatBudget('');
  }

  async function handleSaveCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!catName.trim()) return;
    setSavingCat(true);

    const parsedBudget =
      catTab === 'expense' && catBudget.trim() !== ''
        ? parseFloat(catBudget.replace(',', '.'))
        : null;

    const payload = {
      workspace_id: workspace.id,
      name: catName.trim(),
      type: catTab,
      icon: catIcon,
      color: catColor,
      monthly_budget:
        parsedBudget && !isNaN(parsedBudget) && parsedBudget > 0
          ? parsedBudget
          : null,
    };

    const { error } = editingCat
      ? await supabase.from('categories').update(payload).eq('id', editingCat.id)
      : await supabase.from('categories').insert(payload);

    setSavingCat(false);
    if (!error) {
      resetCatForm();
      onRefreshAll();
    }
  }

  async function toggleArchiveCat(c: Category) {
    await supabase
      .from('categories')
      .update({ is_archived: !c.is_archived })
      .eq('id', c.id);
    onRefreshAll();
  }

  async function handleSaveWorkspace(e: React.FormEvent) {
    e.preventDefault();
    setWsMsg(null);

    if (wsType === 'personal' && members.length > 1) {
      setWsMsg(
        'No puedes pasarlo a Personal mientras haya más de un miembro en este espacio.'
      );
      return;
    }

    const num = parseFloat(wsInitialBalance.replace(',', '.')) || 0;
    const { error } = await supabase
      .from('workspaces')
      .update({
        name: wsName.trim() || workspace.name,
        type: wsType,
        initial_balance: num,
      })
      .eq('id', workspace.id);

    if (error) {
      setWsMsg('Error: ' + error.message);
      return;
    }

    setWsMsg('Perfil / espacio actualizado.');
    onRefreshAll();
  }

  async function handleDeleteWorkspace(ws: Workspace) {
    if (workspaces.length <= 1) {
      window.alert('Debes mantener al menos un espacio activo.');
      return;
    }

    const ok = window.confirm(
      `¿Eliminar el perfil "${ws.name}"? Se borrarán TODOS sus movimientos, fijos, categorías y huchas de forma permanente.`
    );
    if (!ok) return;

    const { error } = await supabase.from('workspaces').delete().eq('id', ws.id);
    if (error) {
      window.alert('Solo el propietario puede eliminar este espacio: ' + error.message);
      return;
    }

    const fallback = workspaces.find((w) => w.id !== ws.id);
    if (fallback && ws.id === workspace.id) {
      onSelectWorkspace(fallback.id);
    }
    onRefreshAll();
  }

  async function handleCreateWorkspace(e: React.FormEvent) {
    e.preventDefault();
    if (!newWsName.trim()) return;
    setCreatingWs(true);

    const { data, error } = await supabase
      .from('workspaces')
      .insert({
        name: newWsName.trim(),
        type: newWsType,
        initial_balance: 0,
      })
      .select()
      .single();

    setCreatingWs(false);
    if (!error && data) {
      setNewWsName('');
      onRefreshAll();
      onSelectWorkspace(data.id);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteMsg(null);
    if (!inviteEmail.trim()) return;

    const { error } = await supabase.rpc('add_member_to_workspace', {
      p_workspace_id: workspace.id,
      p_member_email: inviteEmail.trim(),
    });

    if (error) {
      setInviteMsg('Error: ' + error.message);
      return;
    }

    setInviteEmail('');
    setInviteMsg('Usuario añadido correctamente.');
    const { data } = await supabase
      .from('workspace_members')
      .select('user_id, role, profiles(email, full_name, avatar_color)')
      .eq('workspace_id', workspace.id);
    if (data) setMembers(data as unknown as MemberRow[]);
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !fullName.trim()) return;
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName.trim() })
      .eq('id', profile.id);
    if (!error) {
      setProfileMsg('Nombre actualizado.');
      onRefreshAll();
    }
  }

  const visibleCats = categories.filter((c) => c.type === catTab);
  const isOwnerOfCurrent = workspace.created_by === profile?.id;

  return (
    <div className="space-y-6">
      {/* 1. CATEGORÍAS Y PRESUPUESTOS */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-white">
              Categorías y presupuestos mensuales
            </h2>
            <p className="text-xs text-slate-400">
              Personaliza nombres, iconos, colores y fija límites de gasto mensual.
            </p>
          </div>
          <div className="inline-flex bg-slate-950 border border-slate-800 rounded-xl p-1">
            {(
              [
                { id: 'expense', label: 'Gastos' },
                { id: 'income', label: 'Ingresos' },
                { id: 'investment', label: 'Inversión' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setCatTab(t.id);
                  resetCatForm();
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer ${
                  catTab === t.id
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Formulario categoría */}
        <form
          onSubmit={handleSaveCategory}
          className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              required
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              placeholder={editingCat ? 'Editar nombre...' : 'Nueva categoría...'}
              className="bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
            />
            {catTab === 'expense' && (
              <input
                type="text"
                inputMode="decimal"
                value={catBudget}
                onChange={(e) => setCatBudget(e.target.value)}
                placeholder="Presupuesto límite €/mes (opcional)"
                className="bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            )}
          </div>

          <div>
            <p className="text-[11px] font-medium text-slate-400 mb-2">
              Color e icono
            </p>
            <div className="flex items-center gap-1.5 flex-wrap mb-3">
              {CAT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCatColor(c)}
                  className={`w-6 h-6 rounded-full cursor-pointer ${
                    catColor === c
                      ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-950'
                      : ''
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <IconPicker value={catIcon} color={catColor} onChange={setCatIcon} />
          </div>

          <div className="flex items-center justify-end gap-2">
            {editingCat && (
              <button
                type="button"
                onClick={resetCatForm}
                className="flex items-center gap-1 px-3 py-2 text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" /> Cancelar
              </button>
            )}
            <button
              type="submit"
              disabled={savingCat}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs rounded-xl cursor-pointer"
            >
              {editingCat ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {editingCat ? 'Guardar categoría' : 'Añadir categoría'}
            </button>
          </div>
        </form>

        {/* Lista categorías */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {visibleCats.map((c) => (
            <div
              key={c.id}
              className={`flex items-center justify-between p-3 bg-slate-950/70 border border-slate-800 rounded-xl ${
                c.is_archived ? 'opacity-50' : ''
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${c.color}22`, color: c.color }}
                >
                  <CategoryIcon name={c.icon} className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{c.name}</p>
                  <p className="text-[11px] text-slate-400">
                    {c.monthly_budget
                      ? `Límite: ${formatEUR(Number(c.monthly_budget))}/mes`
                      : 'Sin límite de presupuesto'}
                    {c.is_archived ? ' · Archivada' : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => startEditCat(c)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer"
                  title="Editar"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => toggleArchiveCat(c)}
                  className="p-1.5 text-slate-400 hover:text-amber-400 rounded-lg cursor-pointer"
                  title={c.is_archived ? 'Restaurar' : 'Archivar'}
                >
                  {c.is_archived ? (
                    <RotateCcw className="w-4 h-4" />
                  ) : (
                    <Archive className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 2. GESTIÓN DE PERFILES / ESPACIOS (EDITAR, CREAR PUNTUALES, COMPARTIR Y BORRAR) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Wallet className="w-5 h-5 text-emerald-400" />
              Editar perfil actual
            </h2>
            {isOwnerOfCurrent && workspaces.length > 1 && (
              <button
                type="button"
                onClick={() => handleDeleteWorkspace(workspace)}
                className="flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" /> Eliminar
              </button>
            )}
          </div>

          <form onSubmit={handleSaveWorkspace} className="space-y-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Nombre del perfil / cuenta
              </label>
              <input
                type="text"
                value={wsName}
                onChange={(e) => setWsName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Tipo de perfil
              </label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950 border border-slate-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => setWsType('personal')}
                  className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                    wsType === 'personal'
                      ? 'bg-emerald-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <User className="w-3.5 h-3.5" /> Personal
                </button>
                <button
                  type="button"
                  onClick={() => setWsType('shared')}
                  className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                    wsType === 'shared'
                      ? 'bg-sky-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" /> Compartido
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Ahorro previo inicial (€) — punto de partida del acumulado
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={wsInitialBalance}
                onChange={(e) => setWsInitialBalance(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            {wsMsg && <p className="text-xs text-emerald-400">{wsMsg}</p>}
            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs rounded-xl cursor-pointer"
            >
              <Save className="w-4 h-4" /> Guardar cambios
            </button>
          </form>

          {/* Miembros si es compartido */}
          {workspace.type === 'shared' && (
            <div className="pt-4 border-t border-slate-800 space-y-3">
              <p className="text-xs font-semibold text-sky-400">
                Miembros de "{workspace.name}"
              </p>
              <div className="space-y-1.5">
                {members.map((m) => (
                  <div
                    key={m.user_id}
                    className="flex items-center justify-between text-xs bg-slate-950 border border-slate-800 rounded-xl px-3 py-2"
                  >
                    <span className="text-white font-medium">
                      {m.profiles?.full_name ?? m.profiles?.email ?? 'Usuario'}
                    </span>
                    <span className="text-slate-400">
                      {m.role === 'owner' ? 'Propietario' : 'Miembro'}
                    </span>
                  </div>
                ))}
              </div>

              <form onSubmit={handleInvite} className="flex gap-2">
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="Email del usuario (ya creado en Supabase)"
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="submit"
                  className="flex items-center gap-1 px-3 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs rounded-xl cursor-pointer shrink-0"
                >
                  <UserPlus className="w-4 h-4" /> Añadir
                </button>
              </form>
              {inviteMsg && <p className="text-xs text-sky-300">{inviteMsg}</p>}
            </div>
          )}
        </section>

        {/* Todos tus perfiles + crear uno nuevo (personal puntual o cuenta conjunta) */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-sky-400" />
            Todos tus perfiles y cuentas
          </h2>

          <div className="space-y-2">
            {workspaces.map((ws) => {
              const active = ws.id === workspace.id;
              return (
                <div
                  key={ws.id}
                  className={`flex items-center justify-between gap-2 p-3 rounded-xl border ${
                    active
                      ? 'bg-emerald-500/10 border-emerald-500/40'
                      : 'bg-slate-950 border-slate-800'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectWorkspace(ws.id)}
                    className="flex items-center gap-2.5 text-left min-w-0 flex-1 cursor-pointer"
                  >
                    {ws.type === 'shared' ? (
                      <Users className="w-4 h-4 text-sky-400 shrink-0" />
                    ) : (
                      <User className="w-4 h-4 text-emerald-400 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">
                        {ws.name}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {ws.type === 'shared' ? 'Cuenta Conjunta' : 'Personal / Puntual'}
                        {active ? ' · Activo' : ''}
                      </p>
                    </div>
                  </button>

                  {ws.created_by === profile?.id && workspaces.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleDeleteWorkspace(ws)}
                      className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg cursor-pointer"
                      title="Eliminar perfil"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="pt-3 border-t border-slate-800 space-y-2.5">
            <p className="text-xs font-semibold text-slate-300">
              Crear nuevo perfil (cuenta conjunta o proyecto puntual)
            </p>
            <form onSubmit={handleCreateWorkspace} className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950 border border-slate-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => setNewWsType('personal')}
                  className={`py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                    newWsType === 'personal'
                      ? 'bg-emerald-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Personal / Puntual
                </button>
                <button
                  type="button"
                  onClick={() => setNewWsType('shared')}
                  className={`py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                    newWsType === 'shared'
                      ? 'bg-sky-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Cuenta Conjunta
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  value={newWsName}
                  onChange={(e) => setNewWsName(e.target.value)}
                  placeholder={
                    newWsType === 'shared'
                      ? 'Ej. Casa / Cuenta Conjunta'
                      : 'Ej. Viaje verano, Coche...'
                  }
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="submit"
                  disabled={creatingWs}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs rounded-xl cursor-pointer shrink-0"
                >
                  {creatingWs ? 'Creando...' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </section>
      </div>

      {/* 3. PERFIL DE USUARIO, BACKUP Y SESIÓN */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <form onSubmit={handleSaveProfile} className="flex-1 space-y-2 max-w-sm">
          <label className="block text-xs text-slate-400">
            Tu nombre visible ({profile?.email})
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl cursor-pointer"
            >
              Guardar
            </button>
          </div>
          {profileMsg && <p className="text-xs text-emerald-400">{profileMsg}</p>}
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              exportTransactionsToCSV(transactions, categories, workspace.name)
            }
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 rounded-xl cursor-pointer"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            Backup CSV completo
          </button>

          <button
            type="button"
            onClick={() => supabase.auth.signOut()}
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-xs font-semibold text-rose-300 rounded-xl cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Cerrar sesión
          </button>
        </div>
      </section>
    </div>
  );
}