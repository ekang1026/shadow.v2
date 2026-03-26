import { createClient } from "@/lib/supabase/server";

export async function logApiUsage(params: {
  api_name: string;
  endpoint?: string;
  company_name?: string;
  input_tokens?: number;
  output_tokens?: number;
  estimated_cost_usd?: number;
  credits_used?: number;
  success?: boolean;
  error_message?: string;
}) {
  try {
    const supabase = await createClient();

    let cost = params.estimated_cost_usd;
    if (cost === undefined) {
      if (params.api_name === "anthropic" && params.input_tokens && params.output_tokens) {
        cost = (params.input_tokens / 1_000_000) * 3.0 + (params.output_tokens / 1_000_000) * 15.0;
      } else if (params.api_name === "crustdata") {
        cost = (params.credits_used || 1) * 0.05;
      } else if (params.api_name === "apollo") {
        cost = (params.credits_used || 1) * 0.03;
      } else {
        cost = 0;
      }
    }

    await supabase.from("api_usage").insert({
      api_name: params.api_name,
      endpoint: params.endpoint || null,
      company_name: params.company_name || null,
      input_tokens: params.input_tokens || null,
      output_tokens: params.output_tokens || null,
      estimated_cost_usd: Math.round(cost * 1_000_000) / 1_000_000,
      credits_used: params.credits_used || 1,
      success: params.success !== false,
      error_message: params.error_message || null,
    });
  } catch (e) {
    // Don't let logging failures break the app
    console.warn("[Usage Logger] Failed to log:", e);
  }
}
