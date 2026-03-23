import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// GET: Fetch all pending companies with their latest snapshots
export async function GET() {
  const supabase = await createClient();

  // Fetch pending companies with pagination (Supabase default limit is 1000)
  const allCompanies: Record<string, unknown>[] = [];
  let page = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("companies")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data || data.length === 0) break;
    allCompanies.push(...data);
    if (data.length < pageSize) break;
    page++;
  }

  if (allCompanies.length === 0) {
    return NextResponse.json([]);
  }

  // Fetch snapshots in batches of 500 IDs (URL length limit)
  const allSnapshots: Record<string, unknown>[] = [];
  const companyIds = allCompanies.map((c) => c.id as string);

  for (let i = 0; i < companyIds.length; i += 500) {
    const batchIds = companyIds.slice(i, i + 500);
    const { data: snapshots, error: snapshotsError } = await supabase
      .from("company_snapshots")
      .select("*")
      .in("company_id", batchIds)
      .eq("is_latest", true);

    if (snapshotsError) {
      return NextResponse.json({ error: snapshotsError.message }, { status: 500 });
    }

    if (snapshots) allSnapshots.push(...snapshots);
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
