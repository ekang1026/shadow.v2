import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exec } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";

export const dynamic = "force-dynamic";

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

// POST: Upload a PitchBook file and run the full ingest pipeline
// Pipeline: Ingest → LinkedIn HC scrape → Website scrape → LLM survey
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
    const scriptPath = path.join(pipelinePath, "run_ingest_pipeline.py");
    const startedAt = new Date();

    console.log("[Ingest] Saved to:", tmpPath, "Running full pipeline...");

    const result = await new Promise<{
      logs: string[];
      pipelineResult: Record<string, unknown> | null;
    }>((resolve, reject) => {
      exec(
        `cd "${pipelinePath}" && "${venvPython}" -u "${scriptPath}" "${tmpPath}"`,
        {
          timeout: 600000, // 10 minute timeout for full pipeline
          maxBuffer: 10 * 1024 * 1024, // 10MB buffer for logs
          env: { ...process.env, PYTHONPATH: pipelinePath, PYTHONUNBUFFERED: "1" },
        },
        (error, stdout, stderr) => {
          try { fs.unlinkSync(tmpPath); } catch {}

          const allOutput = stdout + stderr;

          // Parse log lines — include all pipeline steps
          const logLines = allOutput
            .split("\n")
            .filter((l: string) => l.match(/\[(Pipeline|PitchBook|LinkedIn|Domain|LLM)\]/))
            .map((l: string) => l.replace(/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2},\d+\s+/, ""))
            .filter((l: string) => l.trim());

          // Parse pipeline result JSON from last line
          let pipelineResult = null;
          const resultLine = allOutput.split("\n").find((l: string) => l.startsWith("PIPELINE_RESULT:"));
          if (resultLine) {
            try {
              pipelineResult = JSON.parse(resultLine.replace("PIPELINE_RESULT:", ""));
            } catch {}
          }

          if (error && !pipelineResult) {
            console.error("[Ingest] Pipeline error:", stderr?.slice(-500));
            reject(new Error(logLines.slice(-5).join("\n") || stderr || error.message));
            return;
          }

          resolve({ logs: logLines, pipelineResult });
        }
      );
    });

    const completedAt = new Date();
    const durationSeconds = Math.round((completedAt.getTime() - startedAt.getTime()) / 1000);

    // Extract stats from pipeline result
    const ingestStats = (result.pipelineResult?.ingest as Record<string, number>) || {};
    const llmStats = ((result.pipelineResult?.llm as Record<string, unknown>)?.stats as Record<string, number>) || {};

    const stats = {
      new: ingestStats.new || 0,
      updated: ingestStats.updated || 0,
      skipped: ingestStats.skipped || 0,
      errors: ingestStats.errors || 0,
      hc_passed: llmStats.processed || 0,
      llm_passed: llmStats.passed || 0,
      llm_failed: llmStats.failed || 0,
    };

    // Save to pipeline_runs and pipeline_metadata
    try {
      const supabase = await createClient();

      await supabase.from("pipeline_runs").insert({
        run_type: "pitchbook_ingest",
        file_name: fileName,
        started_at: startedAt.toISOString(),
        completed_at: completedAt.toISOString(),
        duration_seconds: durationSeconds,
        status: "completed",
        stats,
      });

      await supabase.from("pipeline_metadata").upsert(
        {
          key: "pitchbook_last_ingest",
          value: {
            last_run_at: completedAt.toISOString(),
            stats,
            file_name: fileName,
            duration_seconds: durationSeconds,
          },
          updated_at: completedAt.toISOString(),
        },
        { onConflict: "key" }
      );
    } catch (dbErr) {
      console.error("[Ingest] Failed to save run metadata:", dbErr);
    }

    return NextResponse.json({
      success: true,
      stats,
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
