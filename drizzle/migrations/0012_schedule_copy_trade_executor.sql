-- lovable-cron-fallback-reviewed: 288 runs/day; copy trades must mirror a followed trader within the 1.5% price-drift window, and signals expire after 45 minutes, so a 5-minute poll is the least frequent cadence that still copies live moves.
select cron.unschedule('copy-trade-executor-every-5-min')
where exists (select 1 from cron.job where jobname = 'copy-trade-executor-every-5-min');

select cron.schedule(
  'copy-trade-executor-every-5-min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url:='https://obtfgoktgigulszrfzvp.supabase.co/functions/v1/copy-trade-executor',
    headers:='{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9idGZnb2t0Z2lndWxzenJmenZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyMDExOTksImV4cCI6MjA4MDc3NzE5OX0.g5aEVRcDHFLDVqBOmkr6CRuc95cdOV1MoicCdcwH8Zk"}'::jsonb,
    body:=concat('{"time": "', now(), '"}')::jsonb
  ) as request_id;
  $$
);

-- Retire the backlog so the first run cannot fire days-old ideas.
update public.copy_trade_signals
set status = 'expired'
where status = 'pending'
  and created_at < now() - interval '45 minutes';
