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
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

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

    // Call Python script to ingest the file
    const pipelinePath = path.resolve(process.cwd(), "pipeline");
    const venvPython = path.join(pipelinePath, ".venv", "bin", "python3");
    const scriptPath = path.join(pipelinePath, "script1_pitchbook.py");

    const result = await new Promise<{
      new: number;
      updated: number;
      skipped: number;
      errors: number;
    }>((resolve, reject) => {
      exec(
        `cd "${pipelinePath}" && "${venvPython}" "${scriptPath}" "${tmpPath}"`,
        {
          timeout: 300000, // 5 minute timeout for large files
          env: {
            ...process.env,
            PYTHONPATH: pipelinePath,
          },
        },
        (error, stdout, stderr) => {
          // Clean up temp file
          try { fs.unlinkSync(tmpPath); } catch {}

          if (error) {
            console.error("[Ingest] Script error:", stderr);
            reject(new Error(stderr || error.message));
            return;
          }

          // Parse stats from the log output
          // Expected: "PitchBook ingestion complete: X new, Y updated, Z skipped, W errors"
          const match = stdout.match(
            /ingestion complete:\s*(\d+)\s*new,\s*(\d+)\s*updated,\s*(\d+)\s*skipped,\s*(\d+)\s*errors/
          );

          if (match) {
            resolve({
              new: parseInt(match[1]),
              updated: parseInt(match[2]),
              skipped: parseInt(match[3]),
              errors: parseInt(match[4]),
            });
          } else {
            console.error("[Ingest] Could not parse stats from:", stdout);
            resolve({ new: 0, updated: 0, skipped: 0, errors: 0 });
          }
        }
      );
    });

    // Update pipeline metadata with last run time
    const supabase = await createClient();
    await supabase.from("pipeline_metadata").upsert({
      key: "pitchbook_last_ingest",
      value: {
        last_run_at: new Date().toISOString(),
        stats: result,
        file_name: fileName,
      },
      updated_at: new Date().toISOString(),
    }, { onConflict: "key" });

    return NextResponse.json({
      success: true,
      stats: result,
      file_name: fileName,
    });
  } catch (error) {
    console.error("[Ingest] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
