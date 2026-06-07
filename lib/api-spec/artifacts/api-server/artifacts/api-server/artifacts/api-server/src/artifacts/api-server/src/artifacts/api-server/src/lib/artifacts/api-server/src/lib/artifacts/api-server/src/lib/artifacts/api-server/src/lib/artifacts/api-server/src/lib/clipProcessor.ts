import { spawn } from "child_process";
import path from "path";
import fs from "fs/promises";
import { existsSync, mkdirSync } from "fs";

const workspaceRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();

const CLIPS_DIR = path.resolve(workspaceRoot, "artifacts/api-server/clips");
if (!existsSync(CLIPS_DIR)) mkdirSync(CLIPS_DIR, { recursive: true });

function getYtDlpPath() {
  return process.env.YT_DLP_PATH || "/home/runner/workspace/.pythonlibs/bin/yt-dlp";
}

function formatSeconds(s: number): string {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
}

export async function downloadVideoSegment(
  url: string, startSeconds: number, endSeconds: number,
  jobId: string, clipIndex: number
): Promise<string> {
  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const execFileAsync = promisify(execFile);

  const rawPath = path.join(CLIPS_DIR, `${jobId}_${clipIndex}_raw.mp4`);
  const outputPath = path.join(CLIPS_DIR, `${jobId}_${clipIndex}.mp4`);

  await fs.rm(rawPath, { force: true });
  await fs.rm(outputPath, { force: true });

  await execFileAsync(getYtDlpPath(), [
    "--format", "bestvideo[ext=mp4][height<=720]+bestaudio[ext=m4a]/best[ext=mp4][height<=720]/best",
    "--merge-output-format", "mp4",
    "--output", rawPath,
    "--no-playlist", "--socket-timeout", "60",
    "--download-sections", `*${formatSeconds(startSeconds)}-${formatSeconds(endSeconds)}`,
    "--force-keyframes-at-cuts", url,
  ]);

  await convertToVertical(rawPath, outputPath, endSeconds - startSeconds);
  await fs.rm(rawPath, { force: true });
  return outputPath;
}

async function convertToVertical(inputPath: string, outputPath: string, maxDuration: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn("ffmpeg", [
      "-i", inputPath,
      "-t", String(maxDuration),
      "-vf", "scale=w=1080:h=1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,setsar=1",
      "-c:v", "libx264", "-preset", "fast", "-crf", "23",
      "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart", "-y", outputPath,
    ]);
    let stderr = "";
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", (code) => code === 0 ? resolve() : reject(new Error(`FFmpeg code ${code}: ${stderr.slice(-300)}`)));
    proc.on("error", reject);
  });
}

export async function getClipPath(jobId: string, clipIndex: number): Promise<string | null> {
  const p = path.join(CLIPS_DIR, `${jobId}_${clipIndex}.mp4`);
  try { await fs.access(p); return p; } catch { return null; }
}
