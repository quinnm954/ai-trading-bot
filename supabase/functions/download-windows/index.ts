import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Public download endpoint: redirects to a short-lived signed URL for the
// Windows installer stored in the private "downloads" bucket.
Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data, error } = await supabase.storage
    .from("downloads")
    .createSignedUrl("windows/TitanAITrader-Setup.exe", 600, {
      download: "TitanAITrader-Setup.exe",
    });
  if (error || !data) {
    return new Response("Installer unavailable", { status: 500 });
  }
  return new Response(null, { status: 302, headers: { Location: data.signedUrl } });
});
