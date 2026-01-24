import { supabase } from '@/lib/supabaseClient';

export async function getAllUsers() {
  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, email')
    .order('full_name', { ascending: true });

  if (error) throw new Error('Failed to fetch users');
  return data;
}