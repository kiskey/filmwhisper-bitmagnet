import { type Stream } from '../deps.ts';
import { bitmagnetFunctions, type TorrentInfo } from './bitmagnet/functions.ts'; 
import { tmdbApi } from './tmdb/api.ts';
import { torrentUtils, type ParsedMagnetUri } from './torrent.ts'; 
import { trackerSource } from './trackers.ts'; 

import { premiumizeApi, type PremiumizeCacheStatus } from './premiumize/premiumize.ts'; 
import { type Config } from "../types.ts";

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
    config: Config 
): Promise<SearchResult | null> {
    const { imdbId, season, episode, searchType } = parsedId;
    let searchQuery = imdbId;
    let title: string | undefined;
    let year: number | undefined;

    if (config.tmdbApiKey) { 
        const tmdbDetails = await tmdbApi.getTmdbDetails(imdbId, config.tmdbApiKey, searchType);
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

    let searchResults = await bitmagnetFunctions.bitmagnetSearch(searchQuery, searchType, config);
    console.log(`Found ${searchResults.length} potential streams from Bitmagnet for query: "${searchQuery}"`);

    if (searchResults.length === 0 && searchType === 'series' && season !== undefined && title) {
        const seasonPad = String(season).padStart(2, '0');
        const seasonQuery = `${title}${year ? ` ${year}` : ''} S${seasonPad}`;
        console.log(`Specific episode query yielded no results. Falling back to season search: "${seasonQuery}"`);
        searchResults = await bitmagnetFunctions.bitmagnetSearch(seasonQuery, searchType, config);
        console.log(`Found ${searchResults.length} potential streams from Bitmagnet for season query: "${seasonQuery}"`);
    }

    if (!searchResults || searchResults.length === 0) {
        console.log(`No streams found for ${searchType} ${imdbId} after fallback.`);
        return null;
    }

    return { torrents: searchResults, title };
}

async function processPremiumizeCandidate(
    config: Config,
    torrent: TorrentInfo,
    cacheStatus: PremiumizeCacheStatus,
    parsedId: ParsedId,
    tmdbTitle?: string
): Promise<Stream | null> {
    const infoHash = torrentUtils.parseMagnetUri(torrent.magnetUrl)?.infoHash; 
    if (!infoHash || !torrent.magnetUrl) {
         console.warn(`[Premiumize] Skipping candidate due to missing infoHash or magnetUrl: ${torrent.title}`);
         return null;
    }

    let localSearchQuery: string | undefined = tmdbTitle || torrent.title;
    if (parsedId.searchType === 'series' && parsedId.season !== undefined && parsedId.episode !== undefined) {
        const seasonPad = String(parsedId.season).padStart(2, '0');
        const episodePad = String(parsedId.episode).padStart(2, '0');
        localSearchQuery = `${localSearchQuery} S${seasonPad}E${episodePad}`;
    }

    const directLink = await premiumizeApi.getPremiumizeDirectDownloadLink(config.premiumizeApiKey!, torrent.magnetUrl, localSearchQuery);

    if (directLink) {
        const details = [
            `💾 ${torrentUtils.formatBytes(torrent.size || 0)}`, `⚡ Premiumize`, `📺 ${torrent.resolution || 'N/A'}`,
            torrent.videoCodec ? `🎬 ${torrent.videoCodec}` : null, torrent.videoSource ? `💿 ${torrent.videoSource}` : null,
            torrent.languages.length > 0 ? `🗣️ ${torrent.languages.join(', ')}` : null,
        ].filter(Boolean).join(' | ');
        const streamTitle = `${cacheStatus.filename}\n${details}`;

        const stream: Stream = {
            name: `[PM] FW Bitmagnet`, title: streamTitle, url: directLink,
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
    tmdbTitle: string | undefined,
    config: Config 
): Promise<Stream[]> {
    const { season, episode } = parsedId;
    const premiumizeApiKey = config.premiumizeApiKey;
    const additionalTrackers = await trackerSource.getTrackers(); 

    let premiumizeResultsMap: Record<string, PremiumizeCacheStatus> = {};
    if (premiumizeApiKey) {
        const infoHashesToCheck = searchResults
            .map(torrent => torrentUtils.parseMagnetUri(torrent.magnetUrl)?.infoHash)
            .filter((hash): hash is string => !!hash);
        if (infoHashesToCheck.length > 0) {
            premiumizeResultsMap = await premiumizeApi.checkPremiumizeCacheBulk(premiumizeApiKey, infoHashesToCheck);
        }
    }

    const premiumizeCandidates: { torrent: TorrentInfo; cacheStatus: PremiumizeCacheStatus }[] = [];
    const fallbackTorrents: TorrentInfo[] = []; 

    for (const torrent of searchResults) {
        const infoHash = torrentUtils.parseMagnetUri(torrent.magnetUrl)?.infoHash;

        if (!premiumizeApiKey || !infoHash) {
            fallbackTorrents.push(torrent);
            continue;
        }

        const cacheStatus = premiumizeResultsMap[infoHash];
        if (cacheStatus?.isCached && cacheStatus.filename) {
            premiumizeCandidates.push({ torrent, cacheStatus });
        } else {
            fallbackTorrents.push(torrent);
        }
    }

    const premiumizeStreamPromises = premiumizeCandidates.map(async ({ torrent, cacheStatus }) => {
        const stream = await processPremiumizeCandidate(config, torrent, cacheStatus, parsedId, tmdbTitle);
        if (!stream) {
            fallbackTorrents.push(torrent);
        }
        return stream;
    });

    const premiumizeStreams = (await Promise.all(premiumizeStreamPromises))
                                .filter((s: Stream | null): s is Stream => s !== null); 

    const fallbackStreams = fallbackTorrents.map((torrent): Stream | null => {
        let parsedMagnet: ParsedMagnetUri | null = null;
        let infoHash: string | undefined = undefined; 

        if (torrent.magnetUrl) { 
            parsedMagnet = torrentUtils.parseMagnetUri(torrent.magnetUrl); 
            if (!parsedMagnet) {
                console.warn(`Skipping fallback stream creation for torrent with unparseable magnet: ${torrent.title || torrent.magnetUrl}`);
                return null; 
            }
            infoHash = parsedMagnet.infoHash;
        } else {
             // If magnetUrl was missing, proceed without infoHash/sources.
             // console.log(`Creating fallback stream for torrent with missing magnetUrl: ${torrent.title}`);
        }

        if (!torrent.title && !infoHash) {
             console.warn(`Skipping fallback stream creation for torrent with no title and no valid magnet/infoHash.`);
             return null;
        }

        const fileIndex = torrentUtils.findBestFileIndex(torrent.files, season, episode); // Call via object
        const details = [
            `💾 ${torrentUtils.formatBytes(torrent.size || 0)}`, `👤 ${torrent.seeders}`, `📺 ${torrent.resolution || 'N/A'}`, // Call via object
            torrent.videoCodec ? `🎬 ${torrent.videoCodec}` : null, torrent.videoSource ? `💿 ${torrent.videoSource}` : null,
            torrent.languages.length > 0 ? `🗣️ ${torrent.languages.join(', ')}` : null,
        ].filter(Boolean).join(' | ');
        const streamTitle = `${torrent.title || infoHash}\n${details}`;

        const stream: Stream = {
             name: '[TORRENT] FW Bitmagnet',
             title: streamTitle,
             // infoHash is added conditionally below
        };

        if (infoHash) { stream.infoHash = infoHash; }

        if (fileIndex !== undefined) {
            stream.fileIdx = fileIndex;
        } else if (parsedId.searchType === 'series' && torrent.files && torrent.files.length > 0) {
            console.warn(`Could not find specific file for S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')} in torrent ${infoHash || torrent.title}, fileIdx omitted.`);
        }

        const existingTrackers = parsedMagnet?.sources.map((s: string) => `tracker:${s}`) || []; 
        const fetchedTrackers = additionalTrackers.map((t: string) => `tracker:${t}`);
        const allTrackers = [...new Set([...existingTrackers, ...fetchedTrackers])];

        if (allTrackers.length > 0) {
            stream.sources = allTrackers;
        }
        return stream;
    }).filter((s): s is Stream => s !== null); 

    const uniqueFallbackStreams = [...new Map(fallbackStreams.map(s => [s.infoHash, s])).values()];

    const allStreams = [...premiumizeStreams, ...uniqueFallbackStreams];

    return allStreams.filter((stream): stream is Stream => {
        if (stream.url) return true; 
        if (stream.name === '[TORRENT] FW Bitmagnet' && stream.infoHash && stream.title) return true;
        console.warn(`Filtering out invalid stream: Name=${stream.name}, Title=${stream.title}, URL=${stream.url}, InfoHash=${stream.infoHash}`);
        return false; 
    });
}