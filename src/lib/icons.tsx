import {
  Home, ShoppingCart, Utensils, Zap, Car, ShoppingBag, Gamepad2,
  HeartPulse, Plane, Repeat, MoreHorizontal, Briefcase, Wallet, Gift,
  PlusCircle, TrendingUp, LineChart, Landmark, Coins, PiggyBank, Tag,
  Coffee, Fuel, Smartphone, GraduationCap, PawPrint, Shield, Laptop,
  type LucideIcon,
} from 'lucide-react';

export const ICON_MAP: Record<string, LucideIcon> = {
  Home,
  ShoppingCart,
  Utensils,
  Zap,
  Car,
  ShoppingBag,
  Gamepad2,
  HeartPulse,
  Plane,
  Repeat,
  MoreHorizontal,
  Briefcase,
  Wallet,
  Gift,
  PlusCircle,
  TrendingUp,
  LineChart,
  Landmark,
  Coins,
  PiggyBank,
  Tag,
  Coffee,
  Fuel,
  Smartphone,
  GraduationCap,
  PawPrint,
  Shield,
  Laptop,
};

export const ICON_NAMES = Object.keys(ICON_MAP);

export function CategoryIcon({
  name,
  className = 'w-5 h-5',
  style,
}: {
  name: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const Icon = ICON_MAP[name] ?? Tag;
  return <Icon className={className} style={style} />;
}