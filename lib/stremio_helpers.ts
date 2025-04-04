import { type Stream } from '../deps.ts';
import { bitmagnetSearch, type TorrentInfo } from './bitmagnet/functions.ts';
import { getTmdbDetails } from './tmdb/api.ts';
import { parseMagnetUri, findBestFileIndex, formatBytes } from './torrent.ts';
import { getTrackers } from './trackers.ts';
import { checkPremiumizeCacheBulk, getPremiumizeDirectDownloadLink, type PremiumizeCacheStatus } from './premiumize/premiumize.ts';

export interface ParsedId {
    imdbId: string;
    season?: number;
    episode?: number;
    searchType: 'movie' | 'series';
}

export interface SearchResult {
    torrents: TorrentInfo[];
    title?: string;
}

const PREMIUMIZE_API_KEY = Deno.env.get('PREMIUMIZE_API_KEY');
if (!PREMIUMIZE_API_KEY) console.warn("PREMIUMIZE_API_KEY not set. Premiumize Debrid links will not be generated.");

export function parseStremioId(args: { type: string; id: string }): ParsedId | null {
    let imdbId = args.id;
    let season: number | undefined;
    let episode: number | undefined;

    const searchType = args.type === 'movie' ? 'movie' : args.type === 'series' ? 'series' : null;
    if (!searchType) {
        console.log(`Unsupported type: ${args.type}`);
        return null;
    }

    if (searchType === 'series' && args.id.includes(':')) {
        const parts = args.id.split(':');
        if (parts.length === 3 && parts[0].startsWith('tt')) {
            imdbId = parts[0];
            season = parseInt(parts[1], 10);
            episode = parseInt(parts[2], 10);
            if (isNaN(season) || isNaN(episode)) {
                console.log("Could not parse season/episode from series ID:", args.id);
                return null;
            }
        } else {
            console.log("Invalid series ID format:", args.id);
            return null;
        }
    } else if (!args.id.startsWith('tt')) {
        console.log("Invalid ID format:", args.id);
        return null;
    }

    return { imdbId, season, episode, searchType };
}

export async function fetchAndSearchTorrents(
    parsedId: ParsedId,
    apiKey: string | undefined
): Promise<SearchResult | null> {
    const { imdbId, season, episode, searchType } = parsedId;
    let searchQuery = imdbId;
    let title: string | undefined;
    let year: number | undefined;

    if (apiKey) {
        const tmdbDetails = await getTmdbDetails(imdbId, apiKey, searchType);
        if (tmdbDetails) {
            title = tmdbDetails.title;
            year = tmdbDetails.year;
            const baseQuery = `${title}${year ? ` ${year}` : ''}`;
            if (searchType === 'series' && season !== undefined && episode !== undefined) {
                const seasonPad = String(season).padStart(2, '0');
                const episodePad = String(episode).padStart(2, '0');
                searchQuery = `${baseQuery} S${seasonPad}E${episodePad}`;
                console.log(`Using specific series episode for search: "${searchQuery}"`);
            } else {
                searchQuery = baseQuery;
                console.log(`Using TMDB title/year for search: "${searchQuery}"`);
            }
        } else {
            console.warn(`Could not fetch TMDB details for ${imdbId}, falling back to searching by ID.`);
        }
    } else {
        console.warn("TMDB_API_KEY not set, falling back to searching by ID.");
    }

    console.log(`Searching Bitmagnet for ${searchType} with query: "${searchQuery}"`);
    let searchResults = await bitmagnetSearch(searchQuery, searchType);
    console.log(`Found ${searchResults.length} potential streams from Bitmagnet for query: "${searchQuery}"`);

    if (searchResults.length === 0 && searchType === 'series' && season !== undefined && title) {
        const seasonPad = String(season).padStart(2, '0');
        const seasonQuery = `${title}${year ? ` ${year}` : ''} S${seasonPad}`;
        console.log(`Specific episode query yielded no results. Falling back to season search: "${seasonQuery}"`);
        searchResults = await bitmagnetSearch(seasonQuery, searchType);
        console.log(`Found ${searchResults.length} potential streams from Bitmagnet for season query: "${seasonQuery}"`);
    }

    if (!searchResults || searchResults.length === 0) {
        console.log(`No streams found for ${searchType} ${imdbId} after fallback.`);
        return null;
    }

    return { torrents: searchResults, title };
}

async function processPremiumizeCandidate(
    apiKey: string,
    torrent: TorrentInfo,
    cacheStatus: PremiumizeCacheStatus,
    parsedId: ParsedId,
    tmdbTitle?: string
): Promise<Stream | null> {
    const infoHash = parseMagnetUri(torrent.magnetUrl)?.infoHash;
    if (!infoHash) return null;
    if (!torrent.magnetUrl) return null;

    let localSearchQuery: string | undefined = tmdbTitle || torrent.title;
    if (parsedId.searchType === 'series' && parsedId.season !== undefined && parsedId.episode !== undefined) {
        const seasonPad = String(parsedId.season).padStart(2, '0');
        const episodePad = String(parsedId.episode).padStart(2, '0');
        localSearchQuery = `${localSearchQuery} S${seasonPad}E${episodePad}`;
    }

    const directLink = await getPremiumizeDirectDownloadLink(apiKey, torrent.magnetUrl, localSearchQuery);

    if (directLink) {
        const details = [
            `💾 ${formatBytes(torrent.size || 0)}`, `⚡ Premiumize`, `📺 ${torrent.resolution || 'N/A'}`,
            torrent.videoCodec ? `🎬 ${torrent.videoCodec}` : null, torrent.videoSource ? `💿 ${torrent.videoSource}` : null,
            torrent.languages.length > 0 ? `🗣️ ${torrent.languages.join(', ')}` : null,
        ].filter(Boolean).join(' | ');
        const streamTitle = `${cacheStatus.filename}\n${details}`;

        const stream: Stream = {
            name: `[PM] FW:Bitmagnet`, title: streamTitle, url: directLink,
            behaviorHints: { bingeGroup: `premiumize-${infoHash}` }
        };
        console.log(`[Premiumize] Using direct download link for ${infoHash}`);
        return stream;
    } else {
        console.warn(`[Premiumize] Item ${infoHash} was cached, but failed to get direct download link. Adding to fallback.`);
        return null;
    }
}

export async function createStreamsFromTorrents(
    searchResults: TorrentInfo[],
    parsedId: ParsedId,
    tmdbTitle?: string
): Promise<Stream[]> {
    const { season, episode } = parsedId;
    const apiKey = PREMIUMIZE_API_KEY;
    const additionalTrackers = await getTrackers();

    let premiumizeResultsMap: Record<string, PremiumizeCacheStatus> = {};
    if (apiKey) {
        const infoHashesToCheck = searchResults
            .map(torrent => parseMagnetUri(torrent.magnetUrl)?.infoHash)
            .filter((hash): hash is string => !!hash);
        if (infoHashesToCheck.length > 0) {
            console.log(`[Premiumize Debug] Sending ${infoHashesToCheck.length} hashes to bulk check:`, infoHashesToCheck);
            premiumizeResultsMap = await checkPremiumizeCacheBulk(apiKey, infoHashesToCheck);
        }
    } else {
        console.log("[Premiumize] API Key not found, skipping Premiumize checks.");
    }

    const premiumizeCandidates: { torrent: TorrentInfo; cacheStatus: PremiumizeCacheStatus }[] = [];
    const fallbackTorrents: TorrentInfo[] = [];

    for (const torrent of searchResults) {
        const infoHash = parseMagnetUri(torrent.magnetUrl)?.infoHash;
        if (!infoHash || !apiKey) {
            fallbackTorrents.push(torrent);
            continue;
        }

        const cacheStatus = premiumizeResultsMap[infoHash];
        // Add to candidates only if item is cached with filename
        if (cacheStatus?.isCached && cacheStatus.filename) {
            premiumizeCandidates.push({ torrent, cacheStatus });
        } else {
            fallbackTorrents.push(torrent);
        }
    }

    const premiumizeStreamPromises = premiumizeCandidates.map(async ({ torrent, cacheStatus }) => {
        // Call the helper function. Assert apiKey as string here as TS checker is failing.
        const stream = await processPremiumizeCandidate(apiKey as string, torrent, cacheStatus, parsedId, tmdbTitle);
        if (!stream) fallbackTorrents.push(torrent);
        return stream;
    });

    const fallbackStreams = fallbackTorrents.map((torrent): Stream | null => {
        const parsedMagnet = parseMagnetUri(torrent.magnetUrl);
        if (!parsedMagnet || !parsedMagnet.infoHash) {
            console.warn(`Could not parse infoHash from magnet in fallback: ${torrent.magnetUrl}`);
            return null;
        }

        const infoHash = parsedMagnet.infoHash;
        const fileIndex = findBestFileIndex(torrent.files, season, episode);
        const details = [
            `💾 ${formatBytes(torrent.size || 0)}`, `👤 ${torrent.seeders}`, `📺 ${torrent.resolution || 'N/A'}`,
            torrent.videoCodec ? `🎬 ${torrent.videoCodec}` : null, torrent.videoSource ? `💿 ${torrent.videoSource}` : null,
            torrent.languages.length > 0 ? `🗣️ ${torrent.languages.join(', ')}` : null,
        ].filter(Boolean).join(' | ');
        const streamTitle = `${torrent.title}\n${details}`;

        const stream: Stream = {
            infoHash: infoHash, name: '[FW] Bitmagnet', title: streamTitle,
        };
        if (fileIndex !== undefined) { stream.fileIdx = fileIndex; }
        else if (parsedId.searchType === 'series' && torrent.files && torrent.files.length > 0) {
            console.warn(`Could not find specific file for S${season}E${episode} in torrent ${infoHash}, fileIdx omitted.`);
        }
        // Combine magnet trackers and fetched trackers, ensuring uniqueness
        const existingTrackers = parsedMagnet.sources.map(s => `tracker:${s}`);
        const fetchedTrackers = additionalTrackers.map(t => `tracker:${t}`); 
        const allTrackers = [...new Set([...existingTrackers, ...fetchedTrackers])]; 

        if (allTrackers.length > 0) {
            stream.sources = allTrackers;
        }
        return stream;
    });

    const premiumizeStreams = await Promise.all(premiumizeStreamPromises);
    // Use Set to handle potential duplicates if directdl failed and item was added back to fallback
    const uniqueFallbackStreams = [...new Map(fallbackStreams.map(s => [s?.infoHash, s])).values()];

    const allStreams = [...premiumizeStreams, ...uniqueFallbackStreams];

    return allStreams.filter((stream): stream is Stream => stream !== null && (!!stream.infoHash || !!stream.url));
}