import { createClient } from "@supabase/supabase-js";
import type { SchedulerDatabase } from "../_shared/scheduler-database.types.ts";
import { createSchedule, normalizeBatchSize } from "../_shared/scheduler.mjs";

interface SourceSchedule {
  id: string;
  interval_seconds: number;
  next_fetch_at: string;
}

function backendClient(req: Request) {
  const projectUrl = Deno.env.get("SUPABASE_URL");
  const secretKey = req.headers.get("apikey");
  if (!projectUrl || !secretKey?.startsWith("sb_secret_")) return null;
  return createClient<SchedulerDatabase>(projectUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export default {
  async fetch(req: Request) {
    if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: { Allow: "POST" } });

    const supabaseAdmin = backendClient(req);
    if (!supabaseAdmin) return Response.json({ message: "Invalid credentials", code: "INVALID_CREDENTIALS" }, { status: 401 });
    const requestBody = await req.json().catch(() => ({})) as { limit?: unknown };
    const limit = normalizeBatchSize(requestBody.limit);
    const now = new Date();
    const { data, error } = await supabaseAdmin
      .from("sources")
      .select("id, interval_seconds, next_fetch_at")
      .eq("enabled", true)
      .lte("next_fetch_at", now.toISOString())
      .order("next_fetch_at", { ascending: true })
      .limit(limit);

    if (error) {
      if (error.code === "PGRST301" || error.code === "PGRST302") return Response.json({ message: "Invalid credentials", code: "INVALID_CREDENTIALS" }, { status: 401 });
      console.error("dispatcher_due_sources_failed", { code: error.code });
      return Response.json({ error: "Не удалось получить список источников" }, { status: 500 });
    }

    const queued: string[] = [];
    const failed: string[] = [];
    for (const source of (data ?? []) as SourceSchedule[]) {
      try {
        const schedule = createSchedule(source, now);
        const { error: jobError } = await supabaseAdmin
          .from("ingestion_jobs")
          .upsert({ source_id: schedule.sourceId, scheduled_for: schedule.scheduledFor, status: "queued", updated_at: now.toISOString() }, {
            onConflict: "source_id,scheduled_for",
            ignoreDuplicates: true,
          });
        if (jobError) throw jobError;

        const { error: sourceError } = await supabaseAdmin
          .from("sources")
          .update({ next_fetch_at: schedule.nextFetchAt, updated_at: now.toISOString() })
          .eq("id", source.id)
          .lte("next_fetch_at", now.toISOString());
        if (sourceError) throw sourceError;
        queued.push(source.id);
      } catch (sourceError) {
        console.error("dispatcher_source_failed", { sourceId: source.id, code: typeof sourceError === "object" && sourceError && "code" in sourceError ? sourceError.code : "unknown" });
        failed.push(source.id);
      }
    }

    return Response.json({
      ok: failed.length === 0,
      checkedAt: now.toISOString(),
      queued,
      failed,
    });
  },
};
