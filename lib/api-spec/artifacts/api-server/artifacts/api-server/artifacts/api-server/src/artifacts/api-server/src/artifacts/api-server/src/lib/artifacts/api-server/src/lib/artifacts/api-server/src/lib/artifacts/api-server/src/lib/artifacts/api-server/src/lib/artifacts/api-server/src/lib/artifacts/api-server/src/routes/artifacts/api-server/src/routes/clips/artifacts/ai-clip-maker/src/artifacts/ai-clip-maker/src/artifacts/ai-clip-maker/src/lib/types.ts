export interface ClipMoment {
  index: number;
  startTime: string;
  endTime: string;
  startSeconds: number;
  endSeconds: number;
  score: number;
  reason: string;
  title: string;
  downloadUrl?: string | null;
  ready?: boolean;
}

export interface Job {
  id: string;
  status: "pending" | "processing" | "done" | "error";
  url: string;
  videoTitle?: string | null;
  videoThumbnail?: string | null;
  videoDuration?: number | null;
  createdAt: string;
  completedAt?: string | null;
  progress: number;
  step: string;
  clips?: ClipMoment[];
  error?: string | null;
}
