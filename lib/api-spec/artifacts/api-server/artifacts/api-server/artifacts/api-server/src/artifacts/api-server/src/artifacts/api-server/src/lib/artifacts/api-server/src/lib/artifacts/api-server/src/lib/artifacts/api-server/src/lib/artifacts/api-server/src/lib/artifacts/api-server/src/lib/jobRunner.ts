import { getJob, updateJob, type ClipMoment } from "./jobStore";
import { getVideoInfo, getTranscript } from "./transcriptFetcher";
import { detectViralMoments, formatTime } from "./viralDetector";
import { downloadVideoSegment } from "./clipProcessor";
import { logger } from "./logger";

export async function processJob(jobId: string): Promise<void> {
  const job = getJob(jobId);
  if (!job) return;

  try {
    updateJob(jobId, { status: "processing", progress: 5, step: "Obteniendo información del video..." });

    const info = await getVideoInfo(job.url);
    updateJob(jobId, {
      videoTitle: info.title, videoThumbnail: info.thumbnail, videoDuration: info.duration,
      progress: 15, step: "Descargando transcripción / subtítulos...",
    });

    const segments = await getTranscript(job.url);
    if (segments.length < 5) {
      throw new Error("El video no tiene suficientes subtítulos automáticos. Prueba con un video en español o inglés que tenga subtítulos habilitados.");
    }

    updateJob(jobId, { progress: 35, step: `Analizando ${segments.length} segmentos de transcripción...` });

    const moments = detectViralMoments(segments, info.duration, 5);
    if (moments.length === 0) {
      throw new Error("No se detectaron momentos virales. Prueba con un video más largo.");
    }

    const clips: ClipMoment[] = moments.map((m, i) => ({
      index: i,
      startTime: formatTime(m.startSeconds),
      endTime: formatTime(m.endSeconds),
      startSeconds: m.startSeconds,
      endSeconds: m.endSeconds,
      score: Math.round(m.score),
      reason: m.reason,
      title: m.title,
      downloadUrl: null as string | null,
      ready: false,
    }));

    updateJob(jobId, { clips, progress: 40, step: "Recortando y convirtiendo clips a formato vertical 9:16..." });

    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      const pct = 40 + Math.round(((i + 1) / clips.length) * 55);
      updateJob(jobId, { progress: pct, step: `Generando clip ${i + 1} de ${clips.length}: ${clip.startTime} - ${clip.endTime}` });

      try {
        await downloadVideoSegment(job.url, clip.startSeconds, clip.endSeconds, jobId, i);
        clip.downloadUrl = `/api/clips/download/${jobId}/${i}`;
        clip.ready = true;
      } catch (err) {
        logger.warn({ err, clipIndex: i }, "Failed to generate clip");
        clip.ready = false;
      }
      updateJob(jobId, { clips: [...clips] });
    }

    updateJob(jobId, { status: "done", progress: 100, step: "¡Clips generados con éxito!", completedAt: new Date().toISOString(), clips });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    logger.error({ err, jobId }, "Job failed");
    updateJob(jobId, { status: "error", error: message, progress: 0, step: "Error" });
  }
}
