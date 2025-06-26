import { serve } from 'https://deno.land/std@0.131.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))

serve(async () => {
  const now = new Date();
  const graceCutoff = new Date(now);
  graceCutoff.setDate(graceCutoff.getDate() - 3); // 3-day grace

  const { data: memberships, error } = await supabase
    .from('memberships')
    .select('id, expires_at')
    .is('expired_on', null)
    .lte('expires_at', graceCutoff.toISOString());

  if (error) {
    console.error('Error fetching expired memberships:', error.message);
    return new Response('Error fetching memberships', { status: 500 });
  }

  for (const membership of memberships) {
    const { error: updateError } = await supabase
      .from('memberships')
      .update({ expired_on: membership.expires_at })
      .eq('id', membership.id);

    if (updateError) {
      console.error(`Failed to update membership ${membership.id}:`, updateError.message);
    } else {
      console.log(`✅ Marked membership ${membership.id} as expired`);
    }
  }

  return new Response('Expired memberships marked', { status: 200 });
})