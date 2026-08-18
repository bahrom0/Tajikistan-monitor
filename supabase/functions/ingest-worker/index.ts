import { createClient } from "@supabase/supabase-js";
import { createArticleIdentity, retryDelaySeconds, safeError } from "../_shared/ingestion.mjs";
import {
  buildRuleEnrichment,
  enrichArticle,
  ENRICHMENT_PROMPT_VERSION,
} from "../_shared/article-enrichment.mjs";
import { fetchSourceAdapter } from "../_shared/source-adapters.mjs";

interface ClaimedJob {
  job_id: string;
  source_id: string;
  attempt_count: number;
  source_name: string;
  source_kind: string;
  source_adapter: string;
  source_url: string;
  source_language: "ru" | "tg" | "multi";
}

function backendClient(req: Request) {
  const projectUrl = Deno.env.get("SUPABASE_URL");
  const secretKey = req.headers.get("apikey");
  if (!projectUrl || !secretKey?.startsWith("sb_secret_")) return null;
  return createClient<any>(projectUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function processJob(supabase: any, job: ClaimedJob, workerId: string) {
  const startedAt = new Date();
  try {
    const { error: startRunError } = await supabase.from("source_fetch_runs").upsert({
      job_id: job.job_id, source_id: job.source_id, status: "running",
      started_at: startedAt.toISOString(), updated_at: startedAt.toISOString(),
    }, { onConflict: "job_id" });
    if (startRunError) throw startRunError;

    const payload = await fetchSourceAdapter({
      id: job.source_id, name: job.source_name, kind: job.source_kind,
      adapter: job.source_adapter, url: job.source_url,
    }) as {
      items?: Record<string, unknown>[];
      weather?: { alerts?: Record<string, unknown>[]; forecasts?: Record<string, unknown>[] };
      rates?: Record<string, unknown>[];
    };
    const now = new Date().toISOString();
    const articles = await Promise.all((payload.items ?? []).map(async (item: Record<string, unknown>) => {
      const title = String(item.title || "Без заголовка").slice(0, 1000);
      const description = String(item.description || "").slice(0, 5000);
      const content = String(item.content || description).slice(0, 12_000);
      const url = String(item.url || "");
      const enrichmentInput = {
        title, description, content, url,
        sourceId: job.source_id,
        sourceKind: job.source_kind,
        language: job.source_language,
        severity: item.severity === "alert" ? "alert" : "normal",
        category: String(item.category || job.source_kind || "Другое"),
      };
      const rules = buildRuleEnrichment(enrichmentInput);
      const identity = await createArticleIdentity({
        title,
        description,
        url,
        locations: rules.locations.map((location: { location_id: string }) => location.location_id),
      });
      return {
        enrichment_input: enrichmentInput,
        source_id: job.source_id,
        external_id: String(item.externalId || `${job.source_id}-${identity.canonicalUrl || identity.contentHash}`),
        url,
        canonical_url: identity.canonicalUrl,
        title,
        description,
        normalized_title: identity.normalizedTitle,
        normalized_text: identity.normalizedText,
        title_tokens: identity.titleTokens,
        text_tokens: identity.textTokens,
        location_ids: identity.locationIds,
        language: job.source_language,
        category: rules.category,
        severity: rules.importance === "warning" || rules.importance === "critical" ? "alert" : "normal",
        content_hash: identity.contentHash,
        dedupe_hash: identity.contentHash,
        published_at: String(item.publishedAt || now),
      };
    }));
    for (let offset = 0; offset < articles.length; offset += 2) {
      await Promise.all(articles.slice(offset, offset + 2).map(async (article) => {
      const { data, error } = await supabase.rpc("ingest_article_source", {
        p_source_id: article.source_id,
        p_external_id: article.external_id,
        p_url: article.url,
        p_canonical_url: article.canonical_url,
        p_title: article.title,
        p_description: article.description,
        p_normalized_title: article.normalized_title,
        p_normalized_text: article.normalized_text,
        p_title_tokens: article.title_tokens,
        p_text_tokens: article.text_tokens,
        p_location_ids: article.location_ids,
        p_language: article.language,
        p_category: article.category,
        p_severity: article.severity,
        p_content_hash: article.content_hash,
        p_dedupe_hash: article.dedupe_hash,
        p_published_at: article.published_at,
      });
      if (error) throw error;
      const articleId = data?.[0]?.result_article_id;
      if (!articleId) throw new Error("Deduplication RPC did not return article id");

      const aiEnabled = Deno.env.get("AI_ENRICHMENT_ENABLED") === "true";
      const apiKey = Deno.env.get("OPENAI_API_KEY");
      const baseUrl = Deno.env.get("OPENAI_BASE_URL");
      const aiModel = Deno.env.get("OPENAI_MODEL");
      const targetModel = aiEnabled && apiKey && baseUrl && aiModel ? aiModel : "deterministic-v1";
      const { data: cached, error: cacheError } = await supabase
        .from("article_enrichments")
        .select("content_hash,model,prompt_version,status,updated_at")
        .eq("article_id", articleId)
        .maybeSingle();
      if (cacheError) throw cacheError;
      const recentFailure = cached?.status === "failed"
        && Date.parse(cached.updated_at) > Date.now() - 30 * 60 * 1000;
      const cacheHit = cached?.content_hash === article.content_hash
        && cached?.model === targetModel
        && cached?.prompt_version === ENRICHMENT_PROMPT_VERSION
        && (cached?.status !== "failed" || recentFailure);
      if (cacheHit) return;

      const enrichment = await enrichArticle(article.enrichment_input, {
        enabled: aiEnabled,
        apiKey,
        baseUrl,
        model: aiModel,
      });
      const { error: enrichmentError } = await supabase.rpc("store_article_enrichment", {
        p_article_id: articleId,
        p_content_hash: article.content_hash,
        p_status: enrichment.status,
        p_provider: enrichment.provider,
        p_model: enrichment.model,
        p_prompt_version: enrichment.promptVersion,
        p_category: enrichment.category,
        p_category_confidence: enrichment.categoryConfidence,
        p_category_method: enrichment.categoryMethod,
        p_importance: enrichment.importance,
        p_importance_confidence: enrichment.importanceConfidence,
        p_importance_factors: enrichment.importanceFactors,
        p_context_summary: enrichment.contextSummary,
        p_key_facts: enrichment.keyFacts,
        p_uncertainties: enrichment.uncertainties,
        p_locations: enrichment.locations,
        p_error_code: "errorCode" in enrichment ? enrichment.errorCode : null,
        p_error_message: "errorMessage" in enrichment ? enrichment.errorMessage : null,
      });
        if (enrichmentError) throw enrichmentError;
      }));
    }

    const alerts = (payload.weather?.alerts ?? []).map((alert: Record<string, unknown>) => ({
      source_id: job.source_id,
      external_id: String(alert.externalId || `${job.source_id}-${alert.publishedAt}`),
      text: String(alert.text || "").slice(0, 5000),
      severity: alert.severity === "normal" ? "normal" : "alert",
      published_at: String(alert.publishedAt || now),
      source_url: String(alert.sourceUrl || job.source_url),
      updated_at: now,
    }));
    if (alerts.length) {
      const { error } = await supabase.from("weather_alerts").upsert(alerts, { onConflict: "source_id,external_id" });
      if (error) throw error;
    }

    const forecasts = (payload.weather?.forecasts ?? []).map((forecast: Record<string, unknown>) => ({
      source_id: job.source_id,
      city: String(forecast.city || "").slice(0, 200),
      temperature: String(forecast.temperature || "").slice(0, 100),
      observed_at: String(forecast.observedAt || now),
      source_url: String(forecast.sourceUrl || job.source_url),
      updated_at: now,
    }));
    if (forecasts.length) {
      const { error } = await supabase.from("weather_forecasts").upsert(forecasts, { onConflict: "source_id,city" });
      if (error) throw error;
    }

    const rates = (payload.rates ?? []).map((rate: Record<string, unknown>) => ({
      source_id: job.source_id,
      numeric_code: String(rate.numericCode || ""),
      code: String(rate.code || ""),
      unit: Number(rate.unit),
      name_ru: String(rate.nameRu || "").slice(0, 300),
      rate_tjs: Number(rate.rateTjs),
      effective_at: String(rate.effectiveAt || now),
      source_url: String(rate.sourceUrl || job.source_url),
      updated_at: now,
    }));
    if (rates.length) {
      const { error } = await supabase.from("exchange_rates").upsert(rates, { onConflict: "source_id,code,effective_at" });
      if (error) throw error;
    }

    const finishedAt = new Date();
    const { error: runError } = await supabase.from("source_fetch_runs").update({
      status: "succeeded", finished_at: finishedAt.toISOString(),
      duration_ms: finishedAt.valueOf() - startedAt.valueOf(),
      article_count: articles.length, weather_count: alerts.length + forecasts.length,
      rate_count: rates.length, error_code: null, error_message: null,
      updated_at: finishedAt.toISOString(),
    }).eq("job_id", job.job_id);
    if (runError) throw runError;
    const sourceResult = await supabase.from("sources").update({ last_success_at: finishedAt.toISOString(), updated_at: finishedAt.toISOString() }).eq("id", job.source_id);
    if (sourceResult.error) throw sourceResult.error;
    const jobResult = await supabase.from("ingestion_jobs").update({ status: "succeeded", finished_at: finishedAt.toISOString(), locked_at: null, locked_by: null, retry_at: null, last_error: null, updated_at: finishedAt.toISOString() }).eq("id", job.job_id).eq("locked_by", workerId);
    if (jobResult.error) throw jobResult.error;
    return { jobId: job.job_id, sourceId: job.source_id, status: "succeeded", articles: articles.length, weather: alerts.length + forecasts.length, rates: rates.length };
  } catch (error) {
    const failure = safeError(error);
    const finishedAt = new Date();
    const terminal = job.attempt_count >= 3;
    const status = terminal ? "dead_letter" : "failed";
    const retryAt = terminal ? null : new Date(finishedAt.valueOf() + retryDelaySeconds(job.attempt_count) * 1000).toISOString();
    await Promise.all([
      supabase.from("source_fetch_runs").update({ status, finished_at: finishedAt.toISOString(), duration_ms: finishedAt.valueOf() - startedAt.valueOf(), error_code: failure.code, error_message: failure.message, updated_at: finishedAt.toISOString() }).eq("job_id", job.job_id),
      supabase.from("ingestion_jobs").update({ status, finished_at: finishedAt.toISOString(), locked_at: null, locked_by: null, retry_at: retryAt, last_error: failure.message, updated_at: finishedAt.toISOString() }).eq("id", job.job_id).eq("locked_by", workerId),
      supabase.from("sources").update({ last_error_at: finishedAt.toISOString(), updated_at: finishedAt.toISOString() }).eq("id", job.source_id),
    ]);
    return { jobId: job.job_id, sourceId: job.source_id, status, error: failure.code };
  }
}

export default {
  async fetch(req: Request) {
    if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: { Allow: "POST" } });
    const supabase = backendClient(req);
    if (!supabase) return Response.json({ message: "Invalid credentials", code: "INVALID_CREDENTIALS" }, { status: 401 });
    const workerId = crypto.randomUUID();
    const { data, error } = await supabase.rpc("claim_ingestion_jobs", { p_limit: 2, p_worker_id: workerId });
    if (error) {
      const unauthorized = error.code === "PGRST301" || error.code === "PGRST302";
      return Response.json(unauthorized ? { message: "Invalid credentials", code: "INVALID_CREDENTIALS" } : { error: "Не удалось захватить очередь", code: error.code }, { status: unauthorized ? 401 : 500 });
    }
    const jobs = (data ?? []) as ClaimedJob[];
    const results = await Promise.all(jobs.map((job) => processJob(supabase, job, workerId)));
    return Response.json({ ok: results.every((item) => item.status === "succeeded"), workerId, claimed: jobs.length, results });
  },
};
