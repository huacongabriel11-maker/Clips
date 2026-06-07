import { v4 as uuidv4 } from "uuid";

export type JobStatus = "pending" | "processing" | "done" | "error";

export interface ClipMoment {
  index: number;
  startTime: string;
  endTime: string;
  startSeconds: number;
  endSeconds: number;
  score: number;
  reason: string;
  title: string;
  downloadUrl: string | null;
  ready: boolean;
}

export interface Job {
  id: string;
  status: JobStatus;
  url: string;
  videoTitle: string | null;
  videoThumbnail: string | null;
  videoDuration: number | null;
  createdAt: string;
  completedAt: string | null;
  progress: number;
  step: string;
  clips: ClipMoment[];
  error: string | null;
}

const jobs = new Map<string, Job>();

export function createJob(url: string): Job {
  const job: Job = {
    id: uuidv4(),
    status: "pending",
    url,
    videoTitle: null,
    videoThumbnail: null,
    videoDuration: null,
    createdAt: new Date().toISOString(),
    completedAt: null,
    progress: 0,
    step: "Iniciando...",
    clips: [],
    error: null,
  };
  jobs.set(job.id, job);
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function getAllJobs(): Job[] {
  return Array.from(jobs.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function updateJob(id: string, updates: Partial<Job>): Job | undefined {
  const job = jobs.get(id);
  if (!job) return undefined;
  Object.assign(job, updates);
  return job;
}
