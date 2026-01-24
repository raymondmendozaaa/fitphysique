'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export function WithAuthGuard({ children }) {
  const { user, loading } = useCurrentUser(); // should give { user, loading }
  const router = useRouter();

  useEffect(() => {
    if (loading) return; // don’t redirect until state is known
    if (!user) {
      const returnUrl =
        typeof window !== 'undefined'
          ? window.location.pathname + window.location.search
          : '/';
      router.replace(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
    }
  }, [user, loading, router]);

  if (loading) return null; // or a skeleton
  if (!user) return null;

  return <>{children}</>;
}
