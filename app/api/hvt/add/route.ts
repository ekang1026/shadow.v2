import { NextResponse } from "next/server";
import { exec } from "child_process";
import path from "path";

// POST: Manually add a company to HVT by website URL
// Calls the Python pipeline script which handles:
// - Website scraping
// - LinkedIn pre-paywall scraping
// - LLM survey
// - Competitor research
// - Saving as HVT
//
// TODO (future enhancements):
// - When PitchBook login is configured, also pull all PitchBook data for the company
// - When Crust Data API key is provided, enrich with Crust Data (CEO info, LinkedIn posts, headcount history)
export async function POST(request: Request) {
  try {
    const { url } = await request.json();

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "URL is required" },
        { status: 400 }
      );
    }

    // Normalize URL
    const normalizedUrl = url.startsWith("http") ? url : `https://${url}`;

    // Call Python script
    const pipelinePath = path.resolve(process.cwd(), "pipeline");
    const venvPython = path.join(pipelinePath, ".venv", "bin", "python3");
    const scriptPath = path.join(pipelinePath, "add_manual_hvt.py");

    const result = await new Promise<{ success: boolean; error?: string; [key: string]: unknown }>((resolve, reject) => {
      exec(
        `cd "${pipelinePath}" && "${venvPython}" "${scriptPath}" "${normalizedUrl}"`,
        {
          timeout: 120000, // 2 minute timeout for full pipeline
          env: {
            ...process.env,
            PYTHONPATH: pipelinePath,
          },
        },
        (error, stdout, stderr) => {
          if (error) {
            console.error("[HVT Add] Script error:", stderr);
            reject(new Error(stderr || error.message));
            return;
          }

          // Parse the JSON output from the script
          try {
            // Find the last JSON object in stdout (script may log before it)
            const lines = stdout.trim().split("\n");
            let jsonStr = "";
            let braceCount = 0;
            let inJson = false;

            for (const line of lines) {
              if (line.trim().startsWith("{")) {
                inJson = true;
                jsonStr = "";
              }
              if (inJson) {
                jsonStr += line + "\n";
                braceCount += (line.match(/{/g) || []).length;
                braceCount -= (line.match(/}/g) || []).length;
                if (braceCount === 0) {
                  break;
                }
              }
            }

            const result = JSON.parse(jsonStr);
            resolve(result);
          } catch {
            console.error("[HVT Add] Failed to parse script output:", stdout);
            reject(new Error("Failed to parse pipeline output"));
          }
        }
      );
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Pipeline failed" },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[HVT Add] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
