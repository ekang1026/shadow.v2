import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { config } from "dotenv";
import { join } from "path";

config({ path: join(process.cwd(), ".env.local"), override: true });

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min timeout

// POST: Run LLM evaluation on selected company IDs
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  // Verify auth
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { companyIds } = await request.json();
  if (!companyIds || !Array.isArray(companyIds) || companyIds.length === 0) {
    return NextResponse.json({ error: "No company IDs provided" }, { status: 400 });
  }

  // Limit to 20 at a time
  const ids = companyIds.slice(0, 20);

  // Stream results back
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });

      // Load email prompt as sourcing prompt
      const fs = await import("fs");
      const path = await import("path");
      let sourcingPrompt = "";
      try {
        sourcingPrompt = fs.readFileSync(
          path.join(process.cwd(), "pipeline", "prompts", "sourcing_prompt.txt"),
          "utf-8"
        );
      } catch {
        send({ type: "error", message: "Could not load sourcing prompt" });
        controller.close();
        return;
      }

      send({ type: "start", total: ids.length });

      let passed = 0;
      let failed = 0;
      let errors = 0;

      for (let i = 0; i < ids.length; i++) {
        const companyId = ids[i];
        try {
          // Get snapshot
          const { data: snapshots } = await supabase
            .from("company_snapshots")
            .select("*")
            .eq("company_id", companyId)
            .eq("is_latest", true)
            .limit(1);

          const snapshot = snapshots?.[0];
          if (!snapshot) {
            send({ type: "skip", index: i, name: "Unknown", reason: "No snapshot found" });
            errors++;
            continue;
          }

          const name = snapshot.name || "Unknown";
          send({ type: "processing", index: i, name });

          // Scrape website
          let websiteContent = "";
          const websiteUrl = snapshot.website;
          if (websiteUrl) {
            try {
              const url = websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`;
              const res = await fetch(url, {
                signal: AbortSignal.timeout(10000),
                headers: { "User-Agent": "Mozilla/5.0 (compatible; ShadowBot/1.0)" },
              });
              if (res.ok) {
                const html = await res.text();
                // Strip HTML tags, keep text
                websiteContent = html
                  .replace(/<script[\s\S]*?<\/script>/gi, "")
                  .replace(/<style[\s\S]*?<\/style>/gi, "")
                  .replace(/<nav[\s\S]*?<\/nav>/gi, "")
                  .replace(/<footer[\s\S]*?<\/footer>/gi, "")
                  .replace(/<[^>]+>/g, " ")
                  .replace(/\s+/g, " ")
                  .trim()
                  .slice(0, 10000);
              }
            } catch {
              // Website scrape failed, continue with what we have
            }
          }

          if (!websiteContent) {
            // Use PB description as fallback
            websiteContent = snapshot.pb_description || snapshot.what_they_do || "";
          }

          if (!websiteContent) {
            send({ type: "skip", index: i, name, reason: "No website content available" });
            // Still mark as evaluated so it doesn't stay in pending
            await supabase
              .from("company_snapshots")
              .update({ passed_llm_filter: false })
              .eq("id", snapshot.id);
            failed++;
            continue;
          }

          // Run LLM survey
          const message = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 2000,
            temperature: 0,
            messages: [
              {
                role: "user",
                content: `${sourcingPrompt}\n\nCompany: ${name}\nWebsite: ${websiteUrl || "N/A"}\n\n<website-content>\n${websiteContent}\n</website-content>`,
              },
            ],
          });

          const responseText = message.content
            .filter((block): block is Anthropic.TextBlock => block.type === "text")
            .map((block) => block.text)
            .join("");

          // Parse the JSON response
          let survey: Record<string, unknown> = {};
          try {
            // Handle markdown code blocks
            const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
            const jsonStr = jsonMatch ? jsonMatch[1].trim() : responseText.trim();
            survey = JSON.parse(jsonStr);
          } catch {
            send({ type: "error", index: i, name, reason: "Failed to parse LLM response" });
            errors++;
            continue;
          }

          // Determine pass/fail
          const offeringType = (survey.offering_type as string[]) || [];
          const customerType = (survey.customer_type as string[]) || [];
          const isSoftware = offeringType.includes("Software");
          const isB2B = customerType.includes("Business");
          const isSubsidiary = survey.is_subsidiary === true;
          const hasDisfavored = !!survey.disfavored_vertical;
          const isServicesOnly = offeringType.length === 1 && offeringType[0] === "Services";
          const isMarketplaceOnly = offeringType.length === 1 && offeringType[0] === "Marketplace";

          const passedLlm = isSoftware && isB2B && !isSubsidiary && !hasDisfavored && !isServicesOnly && !isMarketplaceOnly;

          // Update snapshot with survey results
          const updateData: Record<string, unknown> = {
            passed_llm_filter: passedLlm,
            what_they_do: (survey.offering_type_evidence as string) || snapshot.what_they_do,
            offering_type: survey.offering_type,
            customer_type: survey.customer_type,
            market_focus: survey.market_focus,
            vertical_type: survey.vertical_type,
            naics_3digit_code: survey.NAICS_3digit_code,
            naics_3digit_name: survey.NAICS_3digit_name,
            product_category: survey.product_category,
            revenue_model: survey.revenue_model,
            is_subsidiary: survey.is_subsidiary,
            disfavored_vertical: survey.disfavored_vertical,
            customers_listed: survey.customers_listed,
            customers_named: survey.customers_named,
            success_indicators_present: survey.success_indicators_present === "Yes",
            success_indicators: survey.success_indicators,
            agentic_features_present: survey.agentic_features_present === "Yes",
            agentic_feature_types: survey.agentic_feature_types,
            multi_vertical_type: survey.multi_vertical_type,
          };

          // Also set headcount filter if not set (assume pass since user selected it)
          if (snapshot.passed_headcount_filter === null) {
            updateData.passed_headcount_filter = true;
          }

          await supabase
            .from("company_snapshots")
            .update(updateData)
            .eq("id", snapshot.id);

          if (passedLlm) {
            passed++;
            send({ type: "passed", index: i, name, market: survey.market_focus, vertical: survey.vertical_type });
          } else {
            failed++;
            const reasons: string[] = [];
            if (!isSoftware) reasons.push("Not software");
            if (!isB2B) reasons.push("Not B2B");
            if (isSubsidiary) reasons.push("Subsidiary");
            if (hasDisfavored) reasons.push("Disfavored vertical");
            if (isServicesOnly) reasons.push("Services-only");
            if (isMarketplaceOnly) reasons.push("Marketplace");
            send({ type: "failed", index: i, name, reasons });
          }
        } catch (err) {
          send({ type: "error", index: i, name: ids[i], reason: String(err) });
          errors++;
        }
      }

      send({ type: "complete", passed, failed, errors, total: ids.length });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
