import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import os from "os";
import { exec } from "child_process";

export const dynamic = "force-dynamic";

// POST: Parse file and return a preview of what will happen before ingesting
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
      return NextResponse.json({ error: "Unsupported file format" }, { status: 400 });
    }

    // Save to temp
    const tmpDir = os.tmpdir();
    const tmpPath = path.join(tmpDir, `pitchbook_preview_${Date.now()}${ext}`);
    const bytes = await file.arrayBuffer();
    fs.writeFileSync(tmpPath, Buffer.from(bytes));

    const pipelinePath = path.resolve(process.cwd(), "pipeline");
    const venvPython = path.join(pipelinePath, ".venv", "bin", "python3");

    // Python script to parse file and check DB
    const pyScript = `
import json, sys
sys.path.insert(0, '.')
from script1_pitchbook import read_excel, read_csv_content, clean_value
from config import get_supabase
from pathlib import Path

file_path = sys.argv[1]
ext = Path(file_path).suffix.lower()

if ext in ('.xlsx', '.xls'):
    rows = read_excel(file_path)
elif ext == '.csv':
    with open(file_path, 'r') as f:
        rows = read_csv_content(f.read())
else:
    print(json.dumps({'error': 'Unsupported format'}))
    sys.exit(0)

pb_ids = []
name_map = {}
for row in rows:
    pb_id = clean_value(row.get('PBId')) or clean_value(row.get('Company ID'))
    name = clean_value(row.get('Companies')) or 'Unknown'
    if pb_id:
        pb_ids.append(pb_id)
        name_map[pb_id] = name

sb = get_supabase()
existing = {}
for i in range(0, len(pb_ids), 500):
    batch = pb_ids[i:i+500]
    r = sb.table('companies').select('pitchbook_id,status').in_('pitchbook_id', batch).execute()
    for c in r.data:
        existing[c['pitchbook_id']] = c['status']

new_companies = []
pending = []
hvt = []
classified = []

for pb_id in pb_ids:
    name = name_map.get(pb_id, 'Unknown')
    status = existing.get(pb_id)
    if status is None:
        new_companies.append({'name': name, 'pb_id': pb_id})
    elif status == 'pending':
        pending.append({'name': name, 'pb_id': pb_id})
    elif status == 'HVT':
        hvt.append({'name': name, 'pb_id': pb_id})
    else:
        classified.append({'name': name, 'pb_id': pb_id, 'status': status})

print(json.dumps({
    'total_rows': len(rows),
    'new': len(new_companies),
    'pending': len(pending),
    'hvt': len(hvt),
    'classified': len(classified),
    'new_sample': new_companies[:20],
    'pending_sample': pending[:10],
    'hvt_sample': hvt[:10],
    'classified_sample': classified[:10],
}))
`;

    const pyPath = path.join(tmpDir, `preview_script_${Date.now()}.py`);
    fs.writeFileSync(pyPath, pyScript);

    const result = await new Promise<string>((resolve, reject) => {
      exec(
        `cd "${pipelinePath}" && "${venvPython}" "${pyPath}" "${tmpPath}"`,
        {
          timeout: 30000,
          maxBuffer: 5 * 1024 * 1024,
          env: { ...process.env, PYTHONPATH: pipelinePath },
        },
        (error, stdout, stderr) => {
          try { fs.unlinkSync(pyPath); } catch {}
          if (error) {
            reject(new Error(stderr?.slice(-500) || error.message));
            return;
          }
          resolve(stdout.trim());
        }
      );
    });

    const preview = JSON.parse(result);
    preview.tmp_path = tmpPath;
    preview.file_name = fileName;

    return NextResponse.json(preview);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Preview failed" },
      { status: 500 }
    );
  }
}
