import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { spawn } from "child_process";
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

// POST: Upload a PitchBook Excel/CSV file and run ingest with streaming progress
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

    const pipelinePath = path.resolve(process.cwd(), "pipeline");
    const venvPython = path.join(pipelinePath, ".venv", "bin", "python3");
    const scriptPath = path.join(pipelinePath, "script1_pitchbook.py");
    const startedAt = new Date();

    // Create a streaming response using SSE
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();

        const sendEvent = (type: string, data: unknown) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type, ...((typeof data === 'object' && data !== null) ? data : { message: data }) })}\n\n`)
          );
        };

        sendEvent("start", { message: `Starting ingest of ${fileName}...`, file_name: fileName });

        // Spawn Python process
        const proc = spawn(venvPython, [scriptPath, tmpPath], {
          cwd: pipelinePath,
          env: { ...process.env, PYTHONPATH: pipelinePath },
        });

        let fullOutput = "";
        let lineCount = 0;

        // Stream stdout line by line
        proc.stdout.on("data", (chunk: Buffer) => {
          const text = chunk.toString();
          fullOutput += text;

          const lines = text.split("\n").filter((l: string) => l.trim());
          for (const line of lines) {
            lineCount++;
            // Extract meaningful log messages
            const cleanLine = line.replace(/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2},\d+\s+\[PitchBook\]\s*/, "");
            if (cleanLine) {
              sendEvent("log", { message: cleanLine, line: lineCount });
            }
          }
        });

        proc.stderr.on("data", (chunk: Buffer) => {
          const text = chunk.toString();
          fullOutput += text;
          // Only send actual errors, not HTTP request logs
          if (text.includes("Error") || text.includes("error") || text.includes("Traceback")) {
            sendEvent("error", { message: text.trim() });
          }
        });

        proc.on("close", async (code) => {
          // Clean up temp file
          try { fs.unlinkSync(tmpPath); } catch {}

          const completedAt = new Date();
          const durationSeconds = Math.round((completedAt.getTime() - startedAt.getTime()) / 1000);

          // Parse final stats
          const match = fullOutput.match(
            /ingestion complete:\s*(\d+)\s*new,\s*(\d+)\s*updated,\s*(\d+)\s*skipped,\s*(\d+)\s*errors/
          );

          const stats = match
            ? {
                new: parseInt(match[1]),
                updated: parseInt(match[2]),
                skipped: parseInt(match[3]),
                errors: parseInt(match[4]),
              }
            : { new: 0, updated: 0, skipped: 0, errors: 0 };

          const status = code === 0 ? "completed" : "failed";

          // Save to pipeline_runs and pipeline_metadata
          try {
            const supabase = await createClient();

            await supabase.from("pipeline_runs").insert({
              run_type: "pitchbook_ingest",
              file_name: fileName,
              started_at: startedAt.toISOString(),
              completed_at: completedAt.toISOString(),
              duration_seconds: durationSeconds,
              status,
              stats,
              error_message: code !== 0 ? fullOutput.slice(-500) : null,
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

          // Send final completion event
          sendEvent("complete", {
            status,
            stats,
            file_name: fileName,
            duration_seconds: durationSeconds,
          });

          controller.close();
        });

        proc.on("error", (err) => {
          try { fs.unlinkSync(tmpPath); } catch {}
          sendEvent("error", { message: `Process error: ${err.message}` });
          controller.close();
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("[Ingest] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
