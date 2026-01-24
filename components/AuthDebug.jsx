'use client';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function AuthDebug() {
  useEffect(() => {
    console.debug('[AuthDebug] mounting auth listener');
    const { data: sub } = supabase.auth.onAuthStateChange((evt, sess) => {
      console.debug('[AuthDebug]', evt, !!sess, sess?.user?.id);
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  return null;
}