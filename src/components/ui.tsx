import type { ReactNode } from 'react';
import { cn } from '../utils/cn';

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-white/10 bg-[#0d1117]/80 shadow-[0_18px_50px_-20px_rgba(0,0,0,.95)] backdrop-blur-xl',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function IconToggle({
  active,
  onClick,
  icon,
  label,
  title,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title ?? label}
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] font-medium transition',
        active
          ? 'border-amber-300/60 bg-amber-300/15 text-amber-100'
          : 'border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/20 hover:text-slate-200',
      )}
    >
      <span className="text-[13px] leading-none">{icon}</span>
      {label}
    </button>
  );
}

export function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-white/5 py-1.5 last:border-0">
      <span className="text-[11px] text-slate-500">{label}</span>
      <span className="font-mono text-[11px] text-slate-200">{value}</span>
    </div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h3 className="text-[11px] font-semibold tracking-[0.18em] text-slate-500 uppercase">{children}</h3>
      {right}
    </div>
  );
}

export function Btn({
  children,
  onClick,
  variant = 'ghost',
  className,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'ghost' | 'gold' | 'dark';
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition active:scale-[.97]',
        variant === 'gold' &&
          'bg-gradient-to-b from-amber-300 to-amber-500 text-[#2a1c04] shadow-lg shadow-amber-500/20 hover:from-amber-200 hover:to-amber-400',
        variant === 'ghost' && 'border border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/25 hover:text-white',
        variant === 'dark' && 'bg-black/40 text-slate-300 hover:bg-black/60',
        className,
      )}
    >
      {children}
    </button>
  );
}
