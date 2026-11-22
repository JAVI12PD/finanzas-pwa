import { useEffect, useState } from 'react';
import {
  User,
  KeyRound,
  Mail,
  LogOut,
  CheckCircle2,
  AlertCircle,
  Save,
  ShieldCheck,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Profile as ProfileType } from '../lib/types';

interface ProfileProps {
  profile: ProfileType | null;
  onUpdated: () => void;
}

const AVATAR_COLORS = [
  '#10B981',
  '#3B82F6',
  '#6366F1',
  '#EC4899',
  '#F59E0B',
  '#8B5CF6',
  '#14B8A6',
  '#EF4444',
];

export function Profile({ profile, onUpdated }: ProfileProps) {
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [avatarColor, setAvatarColor] = useState(
    profile?.avatar_color ?? '#10B981'
  );
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPass, setSavingPass] = useState(false);
  const [passError, setPassError] = useState<string | null>(null);
  const [passMsg, setPassMsg] = useState<string | null>(null);

  const [sendingReset, setSendingReset] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name);
      setAvatarColor(profile.avatar_color || '#10B981');
    }
  }, [profile]);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !fullName.trim()) return;
    setSavingProfile(true);
    setProfileMsg(null);

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName.trim(),
        avatar_color: avatarColor,
      })
      .eq('id', profile.id);

    setSavingProfile(false);
    if (!error) {
      setProfileMsg('Datos de perfil actualizados.');
      onUpdated();
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPassError(null);
    setPassMsg(null);

    if (newPassword.length < 6) {
      setPassError('La nueva contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPassError('Las contraseñas no coinciden.');
      return;
    }

    setSavingPass(true);
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    setSavingPass(false);

    if (error) {
      setPassError('Error al cambiar la contraseña: ' + error.message);
      return;
    }

    setNewPassword('');
    setConfirmPassword('');
    setPassMsg('Contraseña cambiada correctamente.');
  }

  async function handleSendResetEmail() {
    if (!profile?.email) return;
    setSendingReset(true);
    setResetMsg(null);

    const { error } = await supabase.auth.resetPasswordForEmail(profile.email, {
      redirectTo: window.location.origin,
    });
    setSendingReset(false);

    if (error) {
      setResetMsg('No se pudo enviar: ' + error.message);
      return;
    }
    setResetMsg(
      `Correo de recuperación enviado a ${profile.email}. Revisa tu bandeja de entrada.`
    );
  }

  const initial = (fullName || profile?.email || 'U').trim().charAt(0).toUpperCase();

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Cabecera perfil */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-center gap-4">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-extrabold text-white shrink-0 shadow-lg"
          style={{ backgroundColor: avatarColor }}
        >
          {initial}
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-white truncate">
            {profile?.full_name || 'Mi Perfil'}
          </h2>
          <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5 truncate">
            <Mail className="w-3.5 h-3.5 shrink-0" />
            {profile?.email}
          </p>
        </div>
      </div>

      {/* Editar nombre y color */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <User className="w-4 h-4 text-emerald-400" />
          Datos personales
        </h3>

        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">
              Nombre visible en la app y en grupos
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-2">
              Color de tu avatar
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              {AVATAR_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setAvatarColor(c)}
                  className={`w-7 h-7 rounded-full cursor-pointer transition ${
                    avatarColor === c
                      ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900 scale-110'
                      : ''
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {profileMsg && (
            <p className="text-xs text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" /> {profileMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={savingProfile}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-semibold text-xs rounded-xl cursor-pointer"
          >
            <Save className="w-4 h-4" />
            {savingProfile ? 'Guardando...' : 'Guardar perfil'}
          </button>
        </form>
      </section>

      {/* Cambiar contraseña */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-sky-400" />
          Cambiar contraseña
        </h3>

        <form onSubmit={handleChangePassword} className="space-y-3">
          <input
            type="password"
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Nueva contraseña (mínimo 6 caracteres)"
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
          />
          <input
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repite la nueva contraseña"
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
          />

          {passError && (
            <p className="text-xs text-rose-400 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0" /> {passError}
            </p>
          )}
          {passMsg && (
            <p className="text-xs text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 shrink-0" /> {passMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={savingPass}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-semibold text-xs rounded-xl cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4" />
            {savingPass ? 'Actualizando...' : 'Actualizar contraseña'}
          </button>
        </form>

        <div className="pt-3 border-t border-slate-800 space-y-2">
          <p className="text-xs text-slate-400">
            Si alguna vez olvidas tu contraseña, también puedes usar{' '}
            <strong className="text-slate-200">"¿Olvidaste tu contraseña?"</strong> en la pantalla de inicio de sesión o probar el envío ahora:
          </p>
          <button
            type="button"
            disabled={sendingReset}
            onClick={handleSendResetEmail}
            className="px-3.5 py-2 bg-slate-950 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 rounded-xl cursor-pointer"
          >
            {sendingReset
              ? 'Enviando...'
              : 'Enviar email de recuperación de prueba'}
          </button>
          {resetMsg && <p className="text-xs text-sky-300">{resetMsg}</p>}
        </div>
      </section>

      {/* Cerrar sesión */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => supabase.auth.signOut()}
          className="flex items-center gap-2 px-5 py-2.5 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-xs font-semibold text-rose-300 rounded-xl cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}