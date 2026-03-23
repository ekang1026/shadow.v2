import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// Force dynamic — never cache this route
export const dynamic = "force-dynamic";

// GET: Fetch pending companies that have been evaluated by the pipeline
export async function GET() {
  try {
    const supabase = await createClient();

    // Query snapshots that have been evaluated — use neq to filter out nulls
    // Fetch in two passes: those that passed HC and those that failed HC
    const { data: passedSnapshots, error: passedError } = await supabase
      .from("company_snapshots")
      .select("*")
      .eq("is_latest", true)
      .eq("passed_headcount_filter", true)
      .limit(1000);

    if (passedError) {
      console.error("[Review API] Passed query error:", passedError);
      return NextResponse.json({ error: passedError.message }, { status: 500 });
    }

    const { data: failedSnapshots, error: failedError } = await supabase
      .from("company_snapshots")
      .select("*")
      .eq("is_latest", true)
      .eq("passed_headcount_filter", false)
      .limit(1000);

    if (failedError) {
      console.error("[Review API] Failed query error:", failedError);
      return NextResponse.json({ error: failedError.message }, { status: 500 });
    }

    const allSnapshots = [...(passedSnapshots || []), ...(failedSnapshots || [])];

    if (allSnapshots.length === 0) {
      return NextResponse.json([]);
    }

    // Fetch only the pending companies for these snapshots
    // Use small batches (100) to avoid URL length / headers overflow with UUIDs
    const companyIds = [...new Set(allSnapshots.map((s) => s.company_id as string))];
    const allCompanies: Record<string, unknown>[] = [];

    for (let i = 0; i < companyIds.length; i += 100) {
      const batchIds = companyIds.slice(i, i + 100);
      const { data: companies, error: companiesError } = await supabase
        .from("companies")
        .select("*")
        .in("id", batchIds)
        .eq("status", "pending");

      if (companiesError) {
        console.error("[Review API] Companies query error:", companiesError);
        return NextResponse.json({ error: companiesError.message }, { status: 500 });
      }

      if (companies) allCompanies.push(...companies);
    }

    // Join companies with their snapshots
    const snapshotMap = new Map(
      allSnapshots.map((s) => [s.company_id as string, s])
    );

    const result = allCompanies.map((company) => ({
      ...company,
      snapshot: snapshotMap.get(company.id as string) || null,
    }));

    return NextResponse.json(result);
  } catch (err) {
    console.error("[Review API] Unhandled error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST: Classify a company
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { companyId, classification } = await request.json();

  const validClassifications = ["HVT", "PM", "PS", "PT", "PL"];
  if (!validClassifications.includes(classification)) {
    return NextResponse.json({ error: "Invalid classification" }, { status: 400 });
  }

  // Update company status
  const { error: updateError } = await supabase
    .from("companies")
    .update({
      status: classification,
      review_count: undefined, // We'll increment via SQL
    })
    .eq("id", companyId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Increment review count
  const { error: rpcError } = await supabase.rpc("increment_review_count", {
    company_id_input: companyId,
  });

  // If RPC doesn't exist yet, just update manually
  if (rpcError) {
    // Fallback: fetch current count and increment
    const { data: company } = await supabase
      .from("companies")
      .select("review_count")
      .eq("id", companyId)
      .single();

    if (company) {
      await supabase
        .from("companies")
        .update({ review_count: (company.review_count || 0) + 1 })
        .eq("id", companyId);
    }
  }

  // Calculate requeue date for PS and PT (3 months out)
  let requeueDate: string | null = null;
  if (classification === "PS" || classification === "PT") {
    const date = new Date();
    date.setMonth(date.getMonth() + 3);
    requeueDate = date.toISOString().split("T")[0];
  }

  // Insert review history record
  const { error: historyError } = await supabase
    .from("review_history")
    .insert({
      company_id: companyId,
      classification,
      requeue_date: requeueDate,
    });

  if (historyError) {
    return NextResponse.json({ error: historyError.message }, { status: 500 });
  }

  // If classified as HVT, trigger email draft creation
  let emailDraft = null;
  if (classification === "HVT") {
    try {
      const baseUrl = request.nextUrl.origin;
      const draftRes = await fetch(`${baseUrl}/api/draft-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: request.headers.get("cookie") || "",
        },
        body: JSON.stringify({ companyId }),
      });
      if (draftRes.ok) {
        emailDraft = await draftRes.json();
      } else {
        const err = await draftRes.json();
        console.error("Email draft failed:", err);
        emailDraft = { error: err.error || "Draft creation failed" };
      }
    } catch (err) {
      console.error("Email draft error:", err);
      emailDraft = { error: "Draft creation failed" };
    }
  }

  return NextResponse.json({ success: true, classification, requeueDate, emailDraft });
}
