export interface EpisodeDetection {
  season?: string;
  episode?: string;
  fallbackEpisode?: string;
}

const sxePattern = /S(\d{1,2})E(\d{1,3})/i;
const ePattern = /(?:^|[^A-Z0-9])EP?(\d{1,3})(?:[^A-Z0-9]|$)/i;
const numberPattern = /(?:^|[^\d])(\d{1,3})(?:[^\d]|$)/g;

export function detectEpisodeFromName(fileName: string): EpisodeDetection {
  const withoutExt = fileName.replace(/\.[^.]+$/, "");

  const sxe = withoutExt.match(sxePattern);
  if (sxe) {
    return {
      season: sxe[1],
      episode: sxe[2],
      fallbackEpisode: sxe[2]
    };
  }

  const eOnly = withoutExt.match(ePattern);
  if (eOnly) {
    return {
      episode: eOnly[1],
      fallbackEpisode: eOnly[1]
    };
  }

  let firstNumber: string | undefined;
  for (const match of withoutExt.matchAll(numberPattern)) {
    if (!match[1]) {
      continue;
    }
    firstNumber = match[1];
    break;
  }

  if (firstNumber) {
    return {
      episode: firstNumber,
      fallbackEpisode: firstNumber
    };
  }

  return {};
}

export function padEpisode(value: string, width = 2): string {
  const normalized = value.replace(/^0+/, "") || "0";
  return normalized.padStart(width, "0");
}

