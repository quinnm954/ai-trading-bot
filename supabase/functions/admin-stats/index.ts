import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const REPORT_TZ = "America/New_York";

function getPartsInTimeZone(date: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = dtf.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
  };
}

function getStartOfDayUtcForTZ(year: number, month: number, day: number, timeZone: string) {
  // Start with UTC midnight for the given Y-M-D, then shift back by the local time
  // that instant represents in the requested timezone.
  const utcMidnight = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const p1 = getPartsInTimeZone(utcMidnight, timeZone);
  const delta1 = (((p1.hour % 24) * 60 + p1.minute) * 60 + p1.second) * 1000;
  const candidate = new Date(utcMidnight.getTime() - delta1);

  // One more normalization pass (DST / hour=24 edge cases)
  const p2 = getPartsInTimeZone(candidate, timeZone);
  if (p2.hour !== 0 || p2.minute !== 0 || p2.second !== 0) {
    const delta2 = (((p2.hour % 24) * 60 + p2.minute) * 60 + p2.second) * 1000;
    return new Date(candidate.getTime() - delta2);
  }

  return candidate;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create client with user's token to verify they're authenticated
    const supabaseClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use service role client to check admin status
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data: isAdmin } = await supabaseAdmin.rpc('is_admin', { _user_id: user.id });
    
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch user statistics using service role
    const { data: users, error: usersError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (usersError) {
      throw usersError;
    }

    const now = new Date();

    // Report "today/this week/this month" in a single consistent business timezone (REPORT_TZ)
    // so the admin dashboard matches what humans expect, not UTC midnight boundaries.
    const { year, month, day } = getPartsInTimeZone(now, REPORT_TZ);
    const todayStartUTC = getStartOfDayUtcForTZ(year, month, day, REPORT_TZ);
    const weekAgoUTC = new Date(todayStartUTC.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgoUTC = new Date(todayStartUTC.getTime() - 30 * 24 * 60 * 60 * 1000);

    const userStats = users.users.map(u => ({
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      email_confirmed_at: u.email_confirmed_at,
    }));

    const signupsToday = userStats.filter(u => new Date(u.created_at).getTime() >= todayStartUTC.getTime()).length;
    const signupsThisWeek = userStats.filter(u => new Date(u.created_at).getTime() >= weekAgoUTC.getTime()).length;
    const signupsThisMonth = userStats.filter(u => new Date(u.created_at).getTime() >= monthAgoUTC.getTime()).length;

    const activeToday = userStats.filter(u => u.last_sign_in_at && new Date(u.last_sign_in_at).getTime() >= todayStartUTC.getTime()).length;
    const activeThisWeek = userStats.filter(u => u.last_sign_in_at && new Date(u.last_sign_in_at).getTime() >= weekAgoUTC.getTime()).length;

    // Get trading activity stats
    const { data: tradesCount } = await supabaseAdmin
      .from('trades')
      .select('user_id', { count: 'exact' });

    const { data: positionsCount } = await supabaseAdmin
      .from('positions')
      .select('user_id', { count: 'exact' });

    return new Response(JSON.stringify({
      totalUsers: userStats.length,
      signupsToday,
      signupsThisWeek,
      signupsThisMonth,
      activeToday,
      activeThisWeek,
      totalTrades: tradesCount?.length || 0,
      totalPositions: positionsCount?.length || 0,
      recentUsers: userStats
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 10),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Admin stats error:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
