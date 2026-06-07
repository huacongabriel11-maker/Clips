import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";

const execFileAsync = promisify(execFile);

export interface TranscriptSegment { text: string; start: number; duration: number; }
export interface VideoInfo { title: string; thumbnail: string; duration: number; videoId: string; }

function getYtDlpPath(): string {
  return process.env.YT_DLP_PATH || "/home/runner/workspace/.pythonlibs/bin/yt-dlp";
}

function extractVideoId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

export async function getVideoInfo(url: string): Promise<VideoInfo> {
  const { stdout } = await execFileAsync(getYtDlpPath(), [
    "--dump-json", "--no-playlist", "--socket-timeout", "30", url,
  ]);
  const info = JSON.parse(stdout);
  return {
    title: info.title || "Video sin título",
    thumbnail: info.thumbnail || "",
    duration: info.duration || 0,
    videoId: info.id || extractVideoId(url) || "",
  };
}

export async function getTranscript(url: string): Promise<TranscriptSegment[]> {
  const videoId = extractVideoId(url);
  if (!videoId) throw new Error("No se pudo extraer el ID del video");

  await execFileAsync(getYtDlpPath(), [
    "--write-auto-subs", "--write-subs",
    "--sub-langs", "es,en,es-419,en-US",
    "--skip-download", "--sub-format", "json3",
    "--output", `/tmp/yt_transcript_%(id)s.%(ext)s`,
    "--no-playlist", "--socket-timeout", "30", url,
  ]).catch(() => {});

  const { readdir, readFile, unlink } = await import("fs/promises");
  const tmpFiles = await readdir("/tmp");
  const subFile = tmpFiles.find((f) => f.startsWith(`yt_transcript_${videoId}`) && f.endsWith(".json3"));

  if (!subFile) return getFallbackTranscript(url, videoId);

  const raw = await readFile(path.join("/tmp", subFile), "utf-8");
  await unlink(path.join("/tmp", subFile)).catch(() => {});
  return parseJson3Subtitles(raw);
}

function parseJson3Subtitles(raw: string): TranscriptSegment[] {
  const data = JSON.parse(raw);
  return (data.events || [])
    .filter((e: { segs?: unknown[] }) => e.segs)
    .map((e: { segs: Array<{ utf8: string }>; tStartMs?: number; dDurationMs?: number }) => ({
      text: e.segs.map((s) => s.utf8 || "").join("").replace(/\n/g, " ").trim(),
      start: (e.tStartMs || 0) / 1000,
      duration: (e.dDurationMs || 2000) / 1000,
    }))
    .filter((s: TranscriptSegment) => s.text.length > 2);
}

async function getFallbackTranscript(url: string, videoId: string): Promise<TranscriptSegment[]> {
  await execFileAsync(getYtDlpPath(), [
    "--write-auto-subs", "--write-subs", "--sub-langs", "es,en",
    "--skip-download", "--sub-format", "vtt",
    "--output", `/tmp/yt_vtt_${videoId}.%(ext)s`,
    "--no-playlist", "--socket-timeout", "30", url,
  ]).catch(() => {});

  const { readdir, readFile, unlink } = await import("fs/promises");
  const tmpFiles = await readdir("/tmp");
  const vttFile = tmpFiles.find((f) => f.startsWith(`yt_vtt_${videoId}`) && f.endsWith(".vtt"));
  if (!vttFile) throw new Error("No se pudieron obtener subtítulos. El video debe tener subtítulos automáticos activados.");

  const raw = await readFile(path.join("/tmp", vttFile), "utf-8");
  await unlink(path.join("/tmp", vttFile)).catch(() => {});
  return parseVtt(raw);
}

function parseVtt(raw: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const lines = raw.split("\n");
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].trim().match(/(\d{2}:\d{2}:\d{2}\.\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2}\.\d{3})/);
    if (m) {
      const start = parseVttTime(m[1]);
      const end = parseVttTime(m[2]);
      i++;
      const textLines: string[] = [];
      while (i < lines.length && lines[i].trim() !== "") {
        const t = lines[i].trim().replace(/<[^>]+>/g, "");
        if (t) textLines.push(t);
        i++;
      }
      const text = textLines.join(" ").trim();
      if (text) segments.push({ text, start, duration: end - start });
    } else { i++; }
  }
  return segments;
}

function parseVttTime(t: string): number {
  const [h, m, s] = t.split(":");
  return parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s);
}
