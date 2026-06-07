export interface TranscriptSegment {
  text: string;
  start: number;
  duration: number;
}

export interface ScoredMoment {
  startSeconds: number;
  endSeconds: number;
  score: number;
  reason: string;
  title: string;
  text: string;
}

const EMOTIONAL_WORDS = [
  "increíble","impresionante","sorprendente","inimaginable","jamás","nunca","siempre",
  "brutal","bestial","espectacular","alucinante","flipante","wow","amazing",
  "incredible","unbelievable","shocking","mind-blowing","insane","crazy","impossible",
  "never","always","best","worst","ever","first time","last time","secret",
  "revealed","exposed","truth","lie","viral","trending","breaking",
  "omg","wtf","no way","stop","wait","listen","watch","look",
  "pero","sin embargo","aunque","imagina","piensa","recuerda",
  "literally","honestly","actually","basically","definitely",
  "mira","escucha","espera","atención","cuidado","importante",
];

const HOOK_PATTERNS = [
  /\?$/m, /!\s*$/m,
  /^(mira|escucha|espera|atención|cuidado|imagina|recuerda)/im,
  /^(but|however|wait|stop|look|listen|think about|imagine|remember)/im,
  /\d+\s*(tips?|ways?|reasons?|steps?|things?|secrets?)/i,
  /\d+\s*(consejos?|formas?|razones?|pasos?|cosas?|secretos?)/i,
  /(número|number)\s*\d+/i,
  /(primero|segundo|tercero|first|second|third)/i,
  /(el problema es|the problem is|here's the thing|resulta que)/i,
  /(todo el mundo|everyone|nadie|nobody|alguna vez|have you ever)/i,
];

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function scoreSegmentGroup(segments: TranscriptSegment[]): { score: number; reasons: string[] } {
  const fullText = segments.map((s) => s.text).join(" ");
  const words = fullText.split(/\s+/).filter(Boolean);
  const reasons: string[] = [];
  let score = 0;

  const emotionalHits = EMOTIONAL_WORDS.filter((w) => fullText.toLowerCase().includes(w.toLowerCase()));
  if (emotionalHits.length > 0) {
    score += Math.min(emotionalHits.length * 15, 40);
    reasons.push("Lenguaje emocional de alto impacto");
  }

  const hookHits = HOOK_PATTERNS.filter((p) => p.test(fullText));
  if (hookHits.length > 0) {
    score += hookHits.length * 12;
    reasons.push("Estructura de hook viral detectada");
  }

  const totalDuration = segments.reduce((sum, s) => sum + s.duration, 0);
  if (totalDuration > 0) {
    const wps = words.length / totalDuration;
    if (wps > 2.5) { score += 20; reasons.push("Ritmo de habla muy alto (energía)"); }
    else if (wps > 1.8) { score += 10; reasons.push("Ritmo dinámico"); }
  }

  const exclamations = (fullText.match(/!/g) || []).length;
  const questions = (fullText.match(/\?/g) || []).length;
  if (exclamations > 0) { score += exclamations * 8; reasons.push("Alta intensidad emocional"); }
  if (questions > 0)   { score += questions * 10;   reasons.push("Genera curiosidad o tensión"); }

  const upperWords = words.filter((w) => w === w.toUpperCase() && w.length > 2);
  if (upperWords.length > 2) { score += Math.min(upperWords.length * 5, 20); reasons.push("Énfasis marcado"); }

  if (/\d+/.test(fullText)) { score += 8; reasons.push("Datos o estadísticas concretas"); }

  const shortSentences = fullText.split(/[.!?]/).filter((s) => {
    const w = s.trim().split(/\s+/);
    return w.length >= 2 && w.length <= 8;
  });
  if (shortSentences.length > 3) { score += 12; reasons.push("Frases cortas y directas (alta retención)"); }

  score += Math.random() * 5;
  return { score, reasons };
}

function generateTitle(text: string, score: number): string {
  const sentences = text.split(/[.!?]/).filter((s) => s.trim().length > 10);
  if (sentences.length > 0) {
    const first = sentences[0].trim();
    return first.length > 60 ? first.substring(0, 57) + "..." : first;
  }
  return `Momento viral (score: ${Math.round(score)})`;
}

export function detectViralMoments(
  segments: TranscriptSegment[],
  videoDuration: number,
  count = 5
): ScoredMoment[] {
  const CLIP_MIN = 20;
  const CLIP_MAX = 35;
  const WINDOW_STEP = 5;

  if (segments.length === 0) return [];

  const scored: ScoredMoment[] = [];

  for (let startIdx = 0; startIdx < segments.length; startIdx++) {
    const startSec = segments[startIdx].start;
    let endIdx = startIdx;
    let totalDur = 0;
    while (endIdx < segments.length) {
      totalDur += segments[endIdx].duration;
      if (totalDur >= CLIP_MAX) break;
      endIdx++;
    }
    if (totalDur < CLIP_MIN) continue;

    const windowSegs = segments.slice(startIdx, endIdx + 1);
    const actualEnd = Math.min(startSec + totalDur, videoDuration);
    if (actualEnd - startSec < CLIP_MIN) continue;

    const { score, reasons } = scoreSegmentGroup(windowSegs);
    const text = windowSegs.map((s) => s.text).join(" ");

    scored.push({
      startSeconds: startSec,
      endSeconds: Math.min(startSec + Math.min(totalDur, CLIP_MAX), videoDuration),
      score,
      reason: reasons.slice(0, 2).join(" · ") || "Momento destacado",
      title: generateTitle(text, score),
      text,
    });

    let nextStart = startSec + WINDOW_STEP;
    while (startIdx + 1 < segments.length && segments[startIdx + 1].start < nextStart) {
      startIdx++;
    }
  }

  scored.sort((a, b) => b.score - a.score);

  const selected: ScoredMoment[] = [];
  for (const candidate of scored) {
    if (!selected.some((s) => Math.abs(s.startSeconds - candidate.startSeconds) < 30)) {
      selected.push(candidate);
      if (selected.length >= count) break;
    }
  }

  selected.sort((a, b) => a.startSeconds - b.startSeconds);
  return selected.map((m) => ({
    ...m,
    endSeconds: Math.min(m.startSeconds + CLIP_MAX, m.endSeconds, videoDuration - 1),
  }));
}

export { formatTime };
