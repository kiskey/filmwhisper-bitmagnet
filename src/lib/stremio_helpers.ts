import { type Stream } from '../deps.ts';
import { bitmagnetFunctions, type TorrentInfo } from './bitmagnet/functions.ts'; 
import { tmdbApi } from './tmdb/api.ts';
import { torrentUtils, type ParsedMagnetUri } from './torrent.ts'; 
import { trackerSource } from './trackers.ts'; 

import { premiumizeApi, type PremiumizeCacheStatus } from './premiumize/premiumize.ts'; 

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

// Removed module-level PREMIUMIZE_API_KEY constant

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
        const tmdbDetails = await tmdbApi.getTmdbDetails(imdbId, apiKey, searchType); // Call method on object
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
    let searchResults = await bitmagnetFunctions.bitmagnetSearch(searchQuery, searchType); // Call via object
    console.log(`Found ${searchResults.length} potential streams from Bitmagnet for query: "${searchQuery}"`);

    if (searchResults.length === 0 && searchType === 'series' && season !== undefined && title) {
        const seasonPad = String(season).padStart(2, '0');
        const seasonQuery = `${title}${year ? ` ${year}` : ''} S${seasonPad}`;
        console.log(`Specific episode query yielded no results. Falling back to season search: "${seasonQuery}"`);
        searchResults = await bitmagnetFunctions.bitmagnetSearch(seasonQuery, searchType); // Call via object
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
    const infoHash = torrentUtils.parseMagnetUri(torrent.magnetUrl)?.infoHash; // Call via object
    // Need infoHash and magnetUrl to proceed with Premiumize
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

    const directLink = await premiumizeApi.getPremiumizeDirectDownloadLink(apiKey, torrent.magnetUrl, localSearchQuery); // Call via object

    if (directLink) {
        const details = [
            `💾 ${torrentUtils.formatBytes(torrent.size || 0)}`, `⚡ Premiumize`, `📺 ${torrent.resolution || 'N/A'}`, // Call via object
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
    const apiKey = Deno.env.get('PREMIUMIZE_API_KEY');
    const additionalTrackers = await trackerSource.getTrackers(); // Call via object

    let premiumizeResultsMap: Record<string, PremiumizeCacheStatus> = {};
    if (apiKey) {
        const infoHashesToCheck = searchResults
            .map(torrent => torrentUtils.parseMagnetUri(torrent.magnetUrl)?.infoHash) // Call via object
            .filter((hash): hash is string => !!hash);
        if (infoHashesToCheck.length > 0) {
            console.log(`[Premiumize Debug] Sending ${infoHashesToCheck.length} hashes to bulk check:`, infoHashesToCheck);
            premiumizeResultsMap = await premiumizeApi.checkPremiumizeCacheBulk(apiKey, infoHashesToCheck); // Call via object
        }
    }

    const premiumizeCandidates: { torrent: TorrentInfo; cacheStatus: PremiumizeCacheStatus }[] = [];
    const fallbackTorrents: TorrentInfo[] = []; // Initialize list for torrents needing fallback processing

    // First pass: Identify Premiumize candidates and initial fallbacks
    for (const torrent of searchResults) {
        const infoHash = torrentUtils.parseMagnetUri(torrent.magnetUrl)?.infoHash; // Call via object

        // If no API key or no valid infoHash, it's definitely a fallback
        if (!apiKey || !infoHash) {
            fallbackTorrents.push(torrent);
            continue;
        }

        const cacheStatus = premiumizeResultsMap[infoHash];
        // If cached with filename, try Premiumize processing
        if (cacheStatus?.isCached && cacheStatus.filename) {
            premiumizeCandidates.push({ torrent, cacheStatus });
        } else {
            // Otherwise, add to fallback list
            fallbackTorrents.push(torrent);
        }
    }

    // Process Premiumize candidates concurrently
    const premiumizeStreamPromises = premiumizeCandidates.map(async ({ torrent, cacheStatus }) => {
        // Assert apiKey as string here since we checked it exists before adding to candidates
        const stream = await processPremiumizeCandidate(apiKey as string, torrent, cacheStatus, parsedId, tmdbTitle);
        if (!stream) {
            // If Premiumize processing failed (e.g., direct link error), add the torrent back to the fallback list
            fallbackTorrents.push(torrent);
        }
        return stream;
    });

    // Wait for all Premiumize processing to complete
    const premiumizeStreams = (await Promise.all(premiumizeStreamPromises))
                                .filter((s: Stream | null): s is Stream => s !== null); // Filter out nulls from failed PM processing

    // Now process the final list of fallback torrents
    const fallbackStreams = fallbackTorrents.map((torrent): Stream | null => {
        let parsedMagnet: ParsedMagnetUri | null = null; // Use imported type
        let infoHash: string | undefined = undefined; // Initialize infoHash as undefined

        if (torrent.magnetUrl) { // Check if magnetUrl exists first
            parsedMagnet = torrentUtils.parseMagnetUri(torrent.magnetUrl); // Call via object
            // If magnetUrl existed but was unparseable (parseMagnetUri returned null)
            if (!parsedMagnet) {
                console.warn(`Skipping fallback stream creation for torrent with unparseable magnet: ${torrent.title || torrent.magnetUrl}`);
                return null; // Skip this torrent
            }
            // If parseMagnetUri succeeded, assign the infoHash (which might still be undefined)
            infoHash = parsedMagnet.infoHash;
        } else {
             // If magnetUrl was missing, proceed without infoHash/sources.
             // console.log(`Creating fallback stream for torrent with missing magnetUrl: ${torrent.title}`);
        }

        // If we reach here, either magnet was parsed OR it was missing.
        // We need at least a title OR a valid infoHash to create a somewhat useful stream.
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
        // Use torrent title if available, otherwise fallback to infoHash for the title line
        const streamTitle = `${torrent.title || infoHash}\n${details}`;

        const stream: Stream = {
             name: '[FW] Bitmagnet',
             title: streamTitle,
             // infoHash is added conditionally below
        };

        // Add infoHash only if it exists
        if (infoHash) { stream.infoHash = infoHash; }

        if (fileIndex !== undefined) {
            stream.fileIdx = fileIndex;
        } else if (parsedId.searchType === 'series' && torrent.files && torrent.files.length > 0) {
            // Log warning if specific file index couldn't be found for series
            console.warn(`Could not find specific file for S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')} in torrent ${infoHash || torrent.title}, fileIdx omitted.`);
        }

        // Combine magnet trackers and fetched trackers, ensuring uniqueness
        // Only add magnet sources if parsedMagnet exists
        const existingTrackers = parsedMagnet?.sources.map((s: string) => `tracker:${s}`) || []; // Use optional chaining
        const fetchedTrackers = additionalTrackers.map((t: string) => `tracker:${t}`);
        const allTrackers = [...new Set([...existingTrackers, ...fetchedTrackers])];

        if (allTrackers.length > 0) {
            stream.sources = allTrackers;
        }
        return stream;
    }).filter((s): s is Stream => s !== null); // Filter out nulls from failed magnet parsing

    // Deduplicate fallback streams based on infoHash. If a torrent was processed by PM and failed,
    // and was also in the initial fallback list, this ensures we only have one copy.
    const uniqueFallbackStreams = [...new Map(fallbackStreams.map(s => [s.infoHash, s])).values()];

    // Combine the successful Premiumize streams and the unique fallback streams
    const allStreams = [...premiumizeStreams, ...uniqueFallbackStreams];

    // Final filter: PM streams need a URL. Fallback streams need a name and title (infoHash is optional for fallback).
    return allStreams.filter((stream): stream is Stream => {
        if (stream.url) return true; // Premiumize streams are valid if they have a URL
        // Fallback streams MUST have an infoHash to be valid for Stremio
        if (stream.name === '[FW] Bitmagnet' && stream.infoHash && stream.title) return true;
        console.warn(`Filtering out invalid stream: Name=${stream.name}, Title=${stream.title}, URL=${stream.url}, InfoHash=${stream.infoHash}`);
        return false; // Otherwise, invalid stream
    });
}