import { padEpisode } from "./episode";

export interface RenderNameOptions {
  template: string;
  season: string;
  episode?: string;
  fallbackEpisode?: string;
}

export function renderTargetName(options: RenderNameOptions): string {
  const { template } = options;
  const effectiveSeason = options.season || "01";
  const effectiveEpisode = options.episode || "";

  const season2 = padEpisode(effectiveSeason, 2);
  const episode2 = effectiveEpisode ? padEpisode(effectiveEpisode, 2) : "";

  const withSeason = template
    .replace(/\{season:(\d+)\}/gi, (_, width) => padEpisode(effectiveSeason, Number(width)))
    .replace(/\{season\}/gi, season2)
    .replace(/\{季\}/g, season2);

  const withEpisode = withSeason.replace(/\{episode:(\d+)\}/gi, (_, width) => {
    if (!effectiveEpisode) {
      return "";
    }
    return padEpisode(effectiveEpisode, Number(width));
  });

  const withEpisodeAliases = withEpisode.replace(/\{episode\}/gi, episode2).replace(/\{集\}/g, episode2);

  return withEpisodeAliases.replace(/&&/g, options.fallbackEpisode || "").replace(/\s+/g, " ").trim();
}

export function splitFileName(input: string): { base: string; ext: string } {
  const dotIndex = input.lastIndexOf(".");
  if (dotIndex <= 0) {
    return { base: input, ext: "" };
  }
  return {
    base: input.slice(0, dotIndex),
    ext: input.slice(dotIndex)
  };
}

export function ensureUniqueName(name: string, occupied: Set<string>): { finalName: string; collided: boolean } {
  if (!occupied.has(name)) {
    occupied.add(name);
    return { finalName: name, collided: false };
  }

  const { base, ext } = splitFileName(name);
  let index = 1;
  while (true) {
    const candidate = `${base} (${index})${ext}`;
    if (!occupied.has(candidate)) {
      occupied.add(candidate);
      return { finalName: candidate, collided: true };
    }
    index += 1;
  }
}

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001F]/g;
const TRAILING_DOT_SPACE = /[. ]+$/g;
const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export function sanitizeFileBaseName(input: string): string {
  const normalized = input
    .normalize("NFKC")
    .replace(INVALID_FILENAME_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(TRAILING_DOT_SPACE, "");

  let output = normalized || "subtitle";
  if (WINDOWS_RESERVED_NAME.test(output)) {
    output = `_${output}`;
  }
  return output;
}

