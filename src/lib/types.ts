export type TransactionType = 'income' | 'expense' | 'investment';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  avatar_color: string;
}

export interface Workspace {
  id: string;
  name: string;
  type: 'personal' | 'shared';
  currency: string;
  initial_balance: number;
  created_by: string;
}

export interface Category {
  id: string;
  workspace_id: string;
  name: string;
  type: TransactionType;
  icon: string;
  color: string;
  monthly_budget: number | null;
  is_archived: boolean;
}

export interface Transaction {
  id: string;
  workspace_id: string;
  user_id: string;
  category_id: string | null;
  type: TransactionType;
  amount: number;
  transaction_date: string;
  description: string;
  payment_method: string;
  is_fixed: boolean;
  recurring_rule_id: string | null;
  recurring_month: string | null;
  split_expense_id?: string | null;
  split_member_id?: string | null;
  created_at: string;
  profiles?: { full_name: string; avatar_color: string } | null;
}

export interface RecurringRule {
  id: string;
  workspace_id: string;
  user_id: string;
  category_id: string | null;
  type: TransactionType;
  amount: number;
  description: string;
  payment_method: string;
  day_of_month: number;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
}

export interface SavingsGoal {
  id: string;
  workspace_id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline: string | null;
  icon: string;
  color: string;
}

export interface SplitGroup {
  id: string;
  name: string;
  icon: string;
  color: string;
  created_by: string;
  created_at: string;
}

export interface SplitGroupMember {
  id: string;
  group_id: string;
  user_id: string | null;
  display_name: string;
  role: 'owner' | 'member';
  created_at: string;
}

export interface SplitSyncSetting {
  member_id: string;
  user_id: string;
  workspace_id: string | null;
  sync_enabled: boolean;
}

export interface SplitExpenseShare {
  id?: string;
  expense_id?: string;
  member_id: string;
  share_amount: number;
}

export interface SplitExpense {
  id: string;
  group_id: string;
  created_by: string;
  paid_by_member_id: string;
  type: 'expense' | 'settlement';
  total_amount: number;
  expense_date: string;
  description: string;
  category_name: string;
  payment_method: string;
  external_ref: string | null;
  import_batch_id?: string | null;
  import_filename?: string | null;
  created_at: string;
  split_expense_shares: SplitExpenseShare[];
}

export const PAYMENT_METHODS = [
  'Tarjeta',
  'Efectivo',
  'Bizum',
  'Transferencia',
  'Domiciliación',
] as const;

export const DEFAULT_EXPENSE_CATEGORY_NAMES = [
  'Comida y Restaurantes',
  'Supermercado',
  'Ocio',
  'Compras',
  'Transporte / Coche',
  'Viajes',
  'Vivienda / Alquiler',
  'Suministros',
  'Salud y Deporte',
  'Suscripciones',
  'Otros gastos',
] as const;