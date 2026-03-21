import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// GET: Fetch all pending companies with their latest snapshots
export async function GET() {
  const supabase = await createClient();

  // Get companies that are pending (in the review queue)
  const { data: companies, error: companiesError } = await supabase
    .from("companies")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (companiesError) {
    return NextResponse.json({ error: companiesError.message }, { status: 500 });
  }

  if (!companies || companies.length === 0) {
    return NextResponse.json([]);
  }

  // Get latest snapshots for these companies
  const companyIds = companies.map((c) => c.id);
  const { data: snapshots, error: snapshotsError } = await supabase
    .from("company_snapshots")
    .select("*")
    .in("company_id", companyIds)
    .eq("is_latest", true);

  if (snapshotsError) {
    return NextResponse.json({ error: snapshotsError.message }, { status: 500 });
  }

  // Join companies with their snapshots
  const snapshotMap = new Map(
    (snapshots || []).map((s) => [s.company_id, s])
  );

  const result = companies.map((company) => ({
    ...company,
    snapshot: snapshotMap.get(company.id) || null,
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

  return NextResponse.json({ success: true, classification, requeueDate });
}
