import { Router, type IRouter } from "express";
import { createJob, getJob, getAllJobs } from "../../lib/jobStore";
import { processJob } from "../../lib/jobRunner";
import { getClipPath } from "../../lib/clipProcessor";
import { AnalyzeVideoBody, GetJobStatusParams } from "@workspace/api-zod";
import fs from "fs";

const router: IRouter = Router();

router.post("/clips/analyze", async (req, res): Promise<void> => {
  const parsed = AnalyzeVideoBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { url } = parsed.data;
  if (!/^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+/.test(url)) {
    res.status(400).json({ error: "URL de YouTube inválida." }); return;
  }

  const job = createJob(url);
  processJob(job.id).catch(() => {});
  res.status(202).json({ jobId: job.id });
});

router.get("/clips/jobs", async (_req, res): Promise<void> => {
  res.json(getAllJobs());
});

router.get("/clips/jobs/:jobId", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;
  const params = GetJobStatusParams.safeParse({ jobId: raw });
  if (!params.success) { res.status(400).json({ error: "Invalid job ID" }); return; }

  const job = getJob(params.data.jobId);
  if (!job) { res.status(404).json({ error: "Job no encontrado" }); return; }
  res.json(job);
});

router.get("/clips/download/:jobId/:clipIndex", async (req, res): Promise<void> => {
  const jobId = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;
  const clipIndex = parseInt(Array.isArray(req.params.clipIndex) ? req.params.clipIndex[0] : req.params.clipIndex, 10);

  if (isNaN(clipIndex)) { res.status(400).json({ error: "Índice inválido" }); return; }

  const job = getJob(jobId);
  if (!job) { res.status(404).json({ error: "Job no encontrado" }); return; }

  const clipPath = await getClipPath(jobId, clipIndex);
  if (!clipPath) { res.status(404).json({ error: "Clip no encontrado" }); return; }

  const clip = job.clips[clipIndex];
  res.setHeader("Content-Type", "video/mp4");
  res.setHeader("Content-Disposition", `attachment; filename="clip_${clipIndex + 1}_${clip?.startTime?.replace(":", "m") || clipIndex}s.mp4"`);
  res.setHeader("Content-Length", fs.statSync(clipPath).size);
  fs.createReadStream(clipPath).pipe(res);
});

export default router;
