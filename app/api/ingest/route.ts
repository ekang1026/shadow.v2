import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exec } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";

// GET: Return last ingest metadata
export async function GET() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("pipeline_metadata")
    .select("*")
    .eq("key", "pitchbook_last_ingest")
    .single();

  if (error) {
    return NextResponse.json({ last_run_at: null, stats: null });
  }

  return NextResponse.json(data?.value || { last_run_at: null, stats: null });
}

// POST: Upload a PitchBook Excel/CSV file and run ingest
export async function POST(request: Request) {
  console.log("[Ingest] POST request received");
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    console.log("[Ingest] File:", file?.name, "Size:", file?.size);

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const fileName = file.name;
    const ext = path.extname(fileName).toLowerCase();

    if (![".xlsx", ".xls", ".csv"].includes(ext)) {
      return NextResponse.json(
        { error: "Unsupported file format. Use .xlsx or .csv" },
        { status: 400 }
      );
    }

    // Save uploaded file to temp directory
    const tmpDir = os.tmpdir();
    const tmpPath = path.join(tmpDir, `pitchbook_upload_${Date.now()}${ext}`);
    const bytes = await file.arrayBuffer();
    fs.writeFileSync(tmpPath, Buffer.from(bytes));

    const pipelinePath = path.resolve(process.cwd(), "pipeline");
    const venvPython = path.join(pipelinePath, ".venv", "bin", "python3");
    const scriptPath = path.join(pipelinePath, "script1_pitchbook.py");
    const startedAt = new Date();

    console.log("[Ingest] Saved to:", tmpPath, "Running script...");

    const result = await new Promise<{
      new: number;
      updated: number;
      skipped: number;
      errors: number;
      logs: string[];
    }>((resolve, reject) => {
      exec(
        `cd "${pipelinePath}" && "${venvPython}" -u "${scriptPath}" "${tmpPath}"`,
        {
          timeout: 300000,
          env: { ...process.env, PYTHONPATH: pipelinePath, PYTHONUNBUFFERED: "1" },
        },
        (error, stdout, stderr) => {
          try { fs.unlinkSync(tmpPath); } catch {}

          // Parse log lines
          const allOutput = stdout + stderr;
          const logLines = allOutput
            .split("\n")
            .filter((l: string) => l.includes("[PitchBook]"))
            .map((l: string) => l.replace(/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2},\d+\s+\[PitchBook\]\s*/, ""))
            .filter((l: string) => l.trim());

          if (error) {
            console.error("[Ingest] Script error:", stderr);
            reject(new Error(logLines.join("\n") || stderr || error.message));
            return;
          }

          const match = allOutput.match(
            /ingestion complete:\s*(\d+)\s*new,\s*(\d+)\s*updated,\s*(\d+)\s*skipped,\s*(\d+)\s*errors/
          );

          resolve({
            new: match ? parseInt(match[1]) : 0,
            updated: match ? parseInt(match[2]) : 0,
            skipped: match ? parseInt(match[3]) : 0,
            errors: match ? parseInt(match[4]) : 0,
            logs: logLines,
          });
        }
      );
    });

    const completedAt = new Date();
    const durationSeconds = Math.round((completedAt.getTime() - startedAt.getTime()) / 1000);

    // Save to pipeline_runs and pipeline_metadata
    const supabase = await createClient();

    await supabase.from("pipeline_runs").insert({
      run_type: "pitchbook_ingest",
      file_name: fileName,
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      duration_seconds: durationSeconds,
      status: "completed",
      stats: { new: result.new, updated: result.updated, skipped: result.skipped, errors: result.errors },
    });

    await supabase.from("pipeline_metadata").upsert(
      {
        key: "pitchbook_last_ingest",
        value: {
          last_run_at: completedAt.toISOString(),
          stats: { new: result.new, updated: result.updated, skipped: result.skipped, errors: result.errors },
          file_name: fileName,
          duration_seconds: durationSeconds,
        },
        updated_at: completedAt.toISOString(),
      },
      { onConflict: "key" }
    );

    return NextResponse.json({
      success: true,
      stats: { new: result.new, updated: result.updated, skipped: result.skipped, errors: result.errors },
      logs: result.logs,
      file_name: fileName,
      duration_seconds: durationSeconds,
    });
  } catch (error) {
    console.error("[Ingest] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
