'use client';

import { useAuth } from '../../lib/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import type { ReactNode } from 'react';

export function AdminGuard({ children }: { children: ReactNode }) {
  const { user, loading, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.replace('/admin/login');
    }
  }, [loading, isAuthenticated, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-panel-base">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-3 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
          <p className="text-panel-muted text-sm tracking-wider uppercase">Loading</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}
