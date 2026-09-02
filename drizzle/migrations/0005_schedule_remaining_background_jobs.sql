do $$
declare
  v_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9idGZnb2t0Z2lndWxzenJmenZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyMDExOTksImV4cCI6MjA4MDc3NzE5OX0.g5aEVRcDHFLDVqBOmkr6CRuc95cdOV1MoicCdcwH8Zk';
  v_base text := 'https://obtfgoktgigulszrfzvp.supabase.co/functions/v1/';
  j record;
begin
  for j in
    select * from (values
      ('agent-orchestrator-every-30-min', 'agent-orchestrator', '*/30 * * * *'),
      ('titan-fusion-engine-every-15-min', 'titan-fusion-engine', '*/15 * * * *'),
      ('sync-broker-balances-every-5-min', 'sync-broker-balances', '*/5 * * * *'),
      ('crypto-signals-scanner-every-15-min', 'crypto-signals-scanner', '*/15 * * * *'),
      ('liquidation-map-scanner-every-15-min', 'liquidation-map-scanner', '*/15 * * * *'),
      ('ai-learning-engine-hourly', 'ai-learning-engine', '7 * * * *')
    ) as t(jobname, fn, sched)
  loop
    perform cron.unschedule(j.jobname) where exists (select 1 from cron.job where jobname = j.jobname);
    perform cron.schedule(
      j.jobname,
      j.sched,
      format($f$select net.http_post(url:=%L, headers:=%L::jsonb, body:=concat('{"time": "', now(), '"}')::jsonb) as request_id;$f$,
             v_base || j.fn,
             json_build_object('Content-Type','application/json','apikey',v_key)::text)
    );
  end loop;
end $$;