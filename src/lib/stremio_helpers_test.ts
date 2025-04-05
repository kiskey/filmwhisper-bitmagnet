import { assertEquals } from "jsr:@std/assert";
import { stub } from "jsr:@std/testing/mock"; // Keep for console stubbing

// Import the function to test and necessary types
import {
    parseStremioId,
    fetchAndSearchTorrents,
    createStreamsFromTorrents,
    type ParsedId,
} from "./stremio_helpers.ts";
// Import functions/types to be mocked/used
import * as tmdb from "./tmdb/api.ts";
import * as bitmagnet from "./bitmagnet/functions.ts";
import type { TorrentInfo } from "./bitmagnet/functions.ts";
import type { TmdbDetails } from "./tmdb/api.ts";
import * as premiumize from "./premiumize/premiumize.ts";
import type { PremiumizeCacheStatus } from "./premiumize/premiumize.ts";
import * as torrentHelpers from "./torrent.ts";
import * as trackerHelper from "./trackers.ts";

// --- Tests for parseStremioId ---
// (These tests don't need mocking, keep as is)
Deno.test("parseStremioId - valid movie ID", () => {
    const args = { type: "movie", id: "tt1234567" };
    const expected: ParsedId = {
        imdbId: "tt1234567",
        season: undefined,
        episode: undefined,
        searchType: "movie",
    };
    const result = parseStremioId(args);
    assertEquals(result, expected);
});

Deno.test("parseStremioId - valid series ID (top level)", () => {
    const args = { type: "series", id: "tt7654321" };
    const expected: ParsedId = {
        imdbId: "tt7654321",
        season: undefined,
        episode: undefined,
        searchType: "series",
    };
    const result = parseStremioId(args);
    assertEquals(result, expected);
});

Deno.test("parseStremioId - valid series ID (with season/episode)", () => {
    const args = { type: "series", id: "tt7654321:5:12" };
    const expected: ParsedId = {
        imdbId: "tt7654321",
        season: 5,
        episode: 12,
        searchType: "series",
    };
    const result = parseStremioId(args);
    assertEquals(result, expected);
});

Deno.test("parseStremioId - invalid type", () => {
    const args = { type: "channel", id: "tt1234567" };
    const result = parseStremioId(args);
    assertEquals(result, null);
});

Deno.test("parseStremioId - invalid ID format (not tt)", () => {
    const args = { type: "movie", id: "1234567" };
    const result = parseStremioId(args);
    assertEquals(result, null);
});

Deno.test("parseStremioId - invalid series ID format (too few parts)", () => {
    const args = { type: "series", id: "tt7654321:5" };
    const result = parseStremioId(args);
    assertEquals(result, null);
});

Deno.test("parseStremioId - invalid series ID format (non-numeric season/episode)", () => {
    const args = { type: "series", id: "tt7654321:S1:E2" };
    const result = parseStremioId(args);
    assertEquals(result, null);
});

Deno.test("parseStremioId - invalid series ID format (non-tt prefix)", () => {
    const args = { type: "series", id: "abc:1:2" };
    const result = parseStremioId(args);
    assertEquals(result, null);
});


// --- Tests for fetchAndSearchTorrents ---

// Mock data
const MOCK_TMDB_API_KEY = "mockTmdbKey";
const MOCK_MOVIE_ID: ParsedId = { imdbId: "tt123", searchType: "movie" };
const MOCK_SERIES_ID: ParsedId = { imdbId: "tt456", searchType: "series", season: 1, episode: 2 };
const MOCK_TMDB_MOVIE_DETAILS: TmdbDetails = { title: "Mock Movie", year: 2022 };
const MOCK_TMDB_SERIES_DETAILS: TmdbDetails = { title: "Mock Series", year: 2021 };
const MOCK_TORRENT_1: TorrentInfo = { title: "Torrent 1", seeders: 10, peers: 2, resolution: "1080p", languages: [] };
const MOCK_TORRENT_2: TorrentInfo = { title: "Torrent 2", seeders: 5, peers: 1, resolution: "720p", languages: [] };

Deno.test("fetchAndSearchTorrents - Movie - TMDB success, Bitmagnet success", async () => {
    const tmdbStub = stub(tmdb.tmdbApi, "getTmdbDetails", () => Promise.resolve(MOCK_TMDB_MOVIE_DETAILS));
    // Corrected: Stub the function within the exported object, accepting both args
    const bitmagnetStub = stub(bitmagnet.bitmagnetFunctions, "bitmagnetSearch", (query: string, type: 'movie' | 'series') => {
        assertEquals(type, "movie"); // Add assertion for type if needed
        assertEquals(query, "Mock Movie 2022");
        return Promise.resolve([MOCK_TORRENT_1]);
    });

    try {
        const result = await fetchAndSearchTorrents(MOCK_MOVIE_ID, MOCK_TMDB_API_KEY);
        assertEquals(result?.torrents, [MOCK_TORRENT_1]);
        assertEquals(result?.title, "Mock Movie");
    } finally {
        tmdbStub?.restore();
        bitmagnetStub?.restore();
    }
});

Deno.test("fetchAndSearchTorrents - Series Episode - TMDB success, Bitmagnet success", async () => {
    const tmdbStub = stub(tmdb.tmdbApi, "getTmdbDetails", () => Promise.resolve(MOCK_TMDB_SERIES_DETAILS));
    // Corrected: Stub the function within the exported object, accepting both args
    const bitmagnetStub = stub(bitmagnet.bitmagnetFunctions, "bitmagnetSearch", (query: string, type: 'movie' | 'series') => {
        assertEquals(type, "series"); // Add assertion for type if needed
        assertEquals(query, "Mock Series 2021 S01E02");
        return Promise.resolve([MOCK_TORRENT_2]);
    });

    try {
        const result = await fetchAndSearchTorrents(MOCK_SERIES_ID, MOCK_TMDB_API_KEY);
        assertEquals(result?.torrents, [MOCK_TORRENT_2]);
        assertEquals(result?.title, "Mock Series");
    } finally {
        tmdbStub?.restore();
        bitmagnetStub?.restore();
    }
});

Deno.test("fetchAndSearchTorrents - TMDB fails, Bitmagnet success (using ID)", async () => {
    const consoleWarnStub = stub(console, "warn");

    const tmdbStub = stub(tmdb.tmdbApi, "getTmdbDetails", () => Promise.resolve(null));
    // Corrected: Stub the function within the exported object, accepting both args
    const bitmagnetStub = stub(bitmagnet.bitmagnetFunctions, "bitmagnetSearch", (query: string, type: 'movie' | 'series') => {
        assertEquals(type, "movie"); // Add assertion for type if needed
        assertEquals(query, MOCK_MOVIE_ID.imdbId); // Expect search with IMDb ID
        return Promise.resolve([MOCK_TORRENT_1]);
    });

    try {
        const result = await fetchAndSearchTorrents(MOCK_MOVIE_ID, MOCK_TMDB_API_KEY);
        assertEquals(result?.torrents, [MOCK_TORRENT_1]);
        assertEquals(result?.title, undefined); // No title from TMDB
        assertEquals(consoleWarnStub.calls.length, 1);
        assertEquals(consoleWarnStub.calls[0].args[0], `Could not fetch TMDB details for ${MOCK_MOVIE_ID.imdbId}, falling back to searching by ID.`);
    } finally {
        tmdbStub?.restore();
        bitmagnetStub?.restore();
        consoleWarnStub.restore();
    }
});

Deno.test("fetchAndSearchTorrents - No TMDB key, Bitmagnet success (using ID)", async () => {
    // No need to stub TMDB as it shouldn't be called
    // Corrected: Stub the function within the exported object, accepting both args
    const bitmagnetStub = stub(bitmagnet.bitmagnetFunctions, "bitmagnetSearch", (query: string, type: 'movie' | 'series') => {
        assertEquals(type, "movie"); // Add assertion for type if needed
        assertEquals(query, MOCK_MOVIE_ID.imdbId); // Expect search with IMDb ID
        return Promise.resolve([MOCK_TORRENT_1]);
    });
     const consoleWarnStub = stub(console, "warn");

    try {
        const result = await fetchAndSearchTorrents(MOCK_MOVIE_ID, undefined); // No API key
        assertEquals(result?.torrents, [MOCK_TORRENT_1]);
        assertEquals(result?.title, undefined);
        assertEquals(consoleWarnStub.calls.length, 1);
        assertEquals(consoleWarnStub.calls[0].args[0], "TMDB_API_KEY not set, falling back to searching by ID.");
    } finally {
        bitmagnetStub.restore();
        consoleWarnStub.restore();
    }
});

Deno.test("fetchAndSearchTorrents - Series Episode - Initial search fails, Season fallback success", async () => {
    let callCount = 0;

    const tmdbStub = stub(tmdb.tmdbApi, "getTmdbDetails", () => Promise.resolve(MOCK_TMDB_SERIES_DETAILS));
    // Corrected: Stub the function within the exported object, accepting both args
    const bitmagnetStub = stub(bitmagnet.bitmagnetFunctions, "bitmagnetSearch", (query: string, type: 'movie' | 'series'): Promise<TorrentInfo[]> => {
        callCount++;
        assertEquals(type, "series"); // Should always be series in this test
        if (callCount === 1) {
            assertEquals(query, "Mock Series 2021 S01E02");
            return Promise.resolve([]); // First call (episode) returns empty
        } else if (callCount === 2) {
            assertEquals(query, "Mock Series 2021 S01");
            return Promise.resolve([MOCK_TORRENT_1]); // Second call (season) returns results
        }
        return Promise.reject(new Error("Unexpected call to bitmagnetSearch")); // Fail test if called more
    });

    try {
        const result = await fetchAndSearchTorrents(MOCK_SERIES_ID, MOCK_TMDB_API_KEY);
        assertEquals(result?.torrents, [MOCK_TORRENT_1]); // Should have fallback results
        assertEquals(result?.title, "Mock Series");
        assertEquals(callCount, 2); // Ensure both calls were made
    } finally {
        tmdbStub?.restore();
        bitmagnetStub?.restore();
    }
});

Deno.test("fetchAndSearchTorrents - Series Episode - Initial and fallback searches fail", async () => {
    let callCount = 0;

    const tmdbStub = stub(tmdb.tmdbApi, "getTmdbDetails", () => Promise.resolve(MOCK_TMDB_SERIES_DETAILS));
    // Corrected: Stub the function within the exported object, accepting both args
    const bitmagnetStub = stub(bitmagnet.bitmagnetFunctions, "bitmagnetSearch", (_query: string, type: 'movie' | 'series'): Promise<TorrentInfo[]> => {
        callCount++;
        assertEquals(type, "series"); // Should always be series in this test
        return Promise.resolve([]);
    });

    try {
        const result = await fetchAndSearchTorrents(MOCK_SERIES_ID, MOCK_TMDB_API_KEY);
        assertEquals(result, null); // Expect null when no results found
        assertEquals(callCount, 2);
    } finally {
        tmdbStub?.restore();
        bitmagnetStub?.restore();
    }
});

Deno.test("fetchAndSearchTorrents - Movie - Bitmagnet search fails", async () => {
    let callCount = 0;

    const tmdbStub = stub(tmdb.tmdbApi, "getTmdbDetails", () => Promise.resolve(MOCK_TMDB_MOVIE_DETAILS));
    // Corrected: Stub the function within the exported object, accepting both args
    const bitmagnetStub = stub(bitmagnet.bitmagnetFunctions, "bitmagnetSearch", (_query: string, type: 'movie' | 'series'): Promise<TorrentInfo[]> => {
        callCount++;
        assertEquals(type, "movie"); // Should be movie in this test
        return Promise.resolve([]);
    });

    try {
        const result = await fetchAndSearchTorrents(MOCK_MOVIE_ID, MOCK_TMDB_API_KEY);
        assertEquals(result, null);
        assertEquals(callCount, 1); // Only one call for movies
    } finally {
        tmdbStub?.restore();
        bitmagnetStub?.restore();
    }
});


// --- Tests for createStreamsFromTorrents ---

// Mock data for createStreamsFromTorrents
const MOCK_TORRENT_PM_HIT: TorrentInfo = { title: "PM Hit Torrent", magnetUrl: "magnet:?xt=urn:btih:pmhit", seeders: 20, peers: 5, resolution: "1080p", size: 1000, languages: ["en"], files: [{ path: "pmhit.mkv", size: 1000, index: 0 }] };
const MOCK_TORRENT_PM_MISS: TorrentInfo = { title: "PM Miss Torrent", magnetUrl: "magnet:?xt=urn:btih:pmmiss", seeders: 15, peers: 3, resolution: "1080p", size: 2000, languages: ["es"], files: [{ path: "pmmiss.mkv", size: 2000, index: 0 }] };
const MOCK_TORRENT_NO_MAGNET: TorrentInfo = { title: "No Magnet Torrent", seeders: 10, peers: 1, resolution: "720p", size: 500, languages: [] }; // Missing magnetUrl
const MOCK_TORRENT_SERIES_FILE: TorrentInfo = { title: "Series File Torrent", magnetUrl: "magnet:?xt=urn:btih:seriesfile", seeders: 8, peers: 2, resolution: "1080p", size: 1500, languages: [], files: [{ path: "series.s01e02.mkv", size: 1500, index: 0 }] };
const MOCK_PARSED_MOVIE_ID: ParsedId = { imdbId: "tt111", searchType: "movie" };
const MOCK_PARSED_SERIES_ID: ParsedId = { imdbId: "tt222", searchType: "series", season: 1, episode: 2 };
const MOCK_PREMIUMIZE_API_KEY = "mockPmKey";
const MOCK_TRACKERS = ["udp://tracker1", "http://tracker2"];

// Helper to reset stubs - not needed with manual mocking

Deno.test("createStreamsFromTorrents - No Premiumize Key", async () => {
    const envStub = stub(Deno.env, "get", (key): string | undefined => key === 'PREMIUMIZE_API_KEY' ? undefined : undefined);
    // Corrected: Stub functions within the exported object
    const parseMagnetStub = stub(torrentHelpers.torrentUtils, "parseMagnetUri", (uri?: string) => uri ? ({ infoHash: uri.split(':')[3], sources: [] }) : null);
    const findFileStub = stub(torrentHelpers.torrentUtils, "findBestFileIndex", () => undefined);
    const formatBytesStub = stub(torrentHelpers.torrentUtils, "formatBytes", (bytes = 0) => `${bytes} B`);
    // Corrected: Stub function within the exported object
    const getTrackersStub = stub(trackerHelper.trackerSource, "getTrackers", () => Promise.resolve(MOCK_TRACKERS));
    // Corrected: Stub function within the exported object
    const checkCacheStub = stub(premiumize.premiumizeApi, "checkPremiumizeCacheBulk", () => {
        return Promise.resolve({});
    });
    // Removed redundant spy, will check calls on checkCacheStub


    const searchResults = [MOCK_TORRENT_PM_MISS, MOCK_TORRENT_SERIES_FILE];

    try {
        const streams = await createStreamsFromTorrents(searchResults, MOCK_PARSED_MOVIE_ID);
        assertEquals(streams.length, 2);
        assertEquals(streams[0].name, "[FW] Bitmagnet");
        assertEquals(streams[0].infoHash, "pmmiss");
        assertEquals(streams[0].title, "PM Miss Torrent\n💾 2000 B | 👤 15 | 📺 1080p | 🗣️ es");
        assertEquals(streams[0].fileIdx, undefined);
        assertEquals(streams[0].sources?.includes("tracker:udp://tracker1"), true);
        assertEquals(streams[1].name, "[FW] Bitmagnet");
        assertEquals(streams[1].infoHash, "seriesfile");
        assertEquals(streams[1].title, "Series File Torrent\n💾 1500 B | 👤 8 | 📺 1080p");
        assertEquals(streams[1].fileIdx, undefined);
        assertEquals(checkCacheStub.calls.length, 0); // Verify checkPremiumizeCacheBulk was not called using the stub
   } finally {
       envStub.restore();
       parseMagnetStub.restore();
       findFileStub.restore();
       formatBytesStub.restore();
       getTrackersStub.restore();
       checkCacheStub.restore(); // Restore the actual stub
       // Removed spy restore
    }
});


Deno.test("createStreamsFromTorrents - Premiumize Hit, DirectDL Success", async () => {
    // Added missing envStub for this test
    const envStub = stub(Deno.env, "get", (key): string | undefined => key === 'PREMIUMIZE_API_KEY' ? MOCK_PREMIUMIZE_API_KEY : undefined);
    // Corrected: Stub functions within the exported object
    const parseMagnetStub = stub(torrentHelpers.torrentUtils, "parseMagnetUri", (uri?: string) => uri ? ({ infoHash: uri.split(':')[3], sources: [] }) : null);
    const findFileStub = stub(torrentHelpers.torrentUtils, "findBestFileIndex", () => undefined);
    const formatBytesStub = stub(torrentHelpers.torrentUtils, "formatBytes", (bytes = 0) => `${bytes} B`);
    // Corrected: Stub function within the exported object
    const getTrackersStub = stub(trackerHelper.trackerSource, "getTrackers", () => Promise.resolve([]));
    // Corrected: Stub function within the exported object
    const checkCacheStub = stub(premiumize.premiumizeApi, "checkPremiumizeCacheBulk", (): Promise<Record<string, PremiumizeCacheStatus>> => Promise.resolve({
        "pmhit": { isCached: true, filename: "pmhit.mkv" },
        "pmmiss": { isCached: false, filename: null },
    }));
    // Corrected: Stub function within the exported object
    const getDirectLinkStub = stub(premiumize.premiumizeApi, "getPremiumizeDirectDownloadLink", (apiKey: string | undefined, magnetUrl: string) => {
         assertEquals(apiKey, MOCK_PREMIUMIZE_API_KEY);
         assertEquals(magnetUrl, MOCK_TORRENT_PM_HIT.magnetUrl);
         return Promise.resolve("http://direct.link/pmhit.mkv"); // Success
    });

    const searchResults = [MOCK_TORRENT_PM_HIT, MOCK_TORRENT_PM_MISS];

    try {
        const streams = await createStreamsFromTorrents(searchResults, MOCK_PARSED_MOVIE_ID, "Movie Title");
        assertEquals(streams.length, 2);

        // Premiumize Stream
        assertEquals(streams[0].name, "[PM] FW:Bitmagnet");
        assertEquals(streams[0].url, "http://direct.link/pmhit.mkv");
        assertEquals(streams[0].title, "pmhit.mkv\n💾 1000 B | ⚡ Premiumize | 📺 1080p | 🗣️ en");
        assertEquals(streams[0].behaviorHints?.bingeGroup, "premiumize-pmhit");
        assertEquals(streams[0].infoHash, undefined);

        // Fallback Stream
        assertEquals(streams[1].name, "[FW] Bitmagnet");
        assertEquals(streams[1].infoHash, "pmmiss");
        assertEquals(streams[1].title, "PM Miss Torrent\n💾 2000 B | 👤 15 | 📺 1080p | 🗣️ es");

        assertEquals(getDirectLinkStub.calls.length, 1);
    } finally {
        envStub.restore();
        parseMagnetStub.restore();
        findFileStub.restore();
        formatBytesStub.restore();
        getTrackersStub.restore();
        checkCacheStub.restore();
        getDirectLinkStub.restore();
    }
});

Deno.test("createStreamsFromTorrents - Premiumize Hit, DirectDL Fails (Fallback)", async () => {
    // Added missing envStub for this test
    const envStub = stub(Deno.env, "get", (key): string | undefined => key === 'PREMIUMIZE_API_KEY' ? MOCK_PREMIUMIZE_API_KEY : undefined);
    // Corrected: Stub functions within the exported object
    const parseMagnetStub = stub(torrentHelpers.torrentUtils, "parseMagnetUri", (uri?: string) => uri ? ({ infoHash: uri.split(':')[3], sources: [] }) : null);
    const findFileStub = stub(torrentHelpers.torrentUtils, "findBestFileIndex", () => undefined);
    const formatBytesStub = stub(torrentHelpers.torrentUtils, "formatBytes", (bytes = 0) => `${bytes} B`);
    // Corrected: Stub function within the exported object
    const getTrackersStub = stub(trackerHelper.trackerSource, "getTrackers", () => Promise.resolve([]));
    // Corrected: Stub function within the exported object
    const checkCacheStub = stub(premiumize.premiumizeApi, "checkPremiumizeCacheBulk", (): Promise<Record<string, PremiumizeCacheStatus>> => Promise.resolve({
        "pmhit": { isCached: true, filename: "pmhit.mkv" },
    }));
    // Corrected: Stub function within the exported object
    const getDirectLinkStub = stub(premiumize.premiumizeApi, "getPremiumizeDirectDownloadLink", () => Promise.resolve(null)); // Direct link fails

    const searchResults = [MOCK_TORRENT_PM_HIT];

    try {
        const streams = await createStreamsFromTorrents(searchResults, MOCK_PARSED_MOVIE_ID);
        assertEquals(streams.length, 1);
        assertEquals(streams[0].name, "[FW] Bitmagnet");
        assertEquals(streams[0].infoHash, "pmhit");
        assertEquals(streams[0].title, "PM Hit Torrent\n💾 1000 B | 👤 20 | 📺 1080p | 🗣️ en");
        assertEquals(getDirectLinkStub.calls.length, 1);
    } finally {
        envStub.restore();
        parseMagnetStub.restore();
        findFileStub.restore();
        formatBytesStub.restore();
        getTrackersStub.restore();
        checkCacheStub.restore();
        getDirectLinkStub.restore();
    }
});

Deno.test("createStreamsFromTorrents - Series Episode File Index", async () => {
    const envStub = stub(Deno.env, "get", () => undefined); // No PM key
    // Corrected: Stub functions within the exported object
    const parseMagnetStub = stub(torrentHelpers.torrentUtils, "parseMagnetUri", (uri?: string) => uri ? ({ infoHash: uri.split(':')[3], sources: [] }) : null);
    const findFileStub = stub(torrentHelpers.torrentUtils, "findBestFileIndex", (files?: { path: string; size: number; index: number }[], season?: number, episode?: number) => {
        assertEquals(season, 1);
        assertEquals(episode, 2);
        // Simulate finding the file at index 0
        return files?.[0]?.path === "series.s01e02.mkv" ? 0 : undefined;
    });
    const formatBytesStub = stub(torrentHelpers.torrentUtils, "formatBytes", (bytes = 0) => `${bytes} B`);
    // Corrected: Stub function within the exported object
    const getTrackersStub = stub(trackerHelper.trackerSource, "getTrackers", () => Promise.resolve([]));

    const searchResults = [MOCK_TORRENT_SERIES_FILE];

    try {
        const streams = await createStreamsFromTorrents(searchResults, MOCK_PARSED_SERIES_ID);
        assertEquals(streams.length, 1);
        assertEquals(streams[0].name, "[FW] Bitmagnet");
        assertEquals(streams[0].infoHash, "seriesfile");
        assertEquals(streams[0].fileIdx, 0);
    } finally {
        envStub.restore();
        parseMagnetStub.restore();
        findFileStub.restore();
        formatBytesStub.restore();
        getTrackersStub.restore();
    }
});

Deno.test("createStreamsFromTorrents - Handles unparseable magnet", async () => {
    const envStub = stub(Deno.env, "get", () => undefined); // No PM key
    // Corrected: Stub functions within the exported object
    const parseMagnetStub = stub(torrentHelpers.torrentUtils, "parseMagnetUri", () => null); // Simulate parse failure
    const findFileStub = stub(torrentHelpers.torrentUtils, "findBestFileIndex");
    const formatBytesStub = stub(torrentHelpers.torrentUtils, "formatBytes");
    // Corrected: Stub function within the exported object
    const getTrackersStub = stub(trackerHelper.trackerSource, "getTrackers", () => Promise.resolve([]));

    const searchResults = [MOCK_TORRENT_PM_HIT]; // Use any torrent with a magnet

    try {
        const streams = await createStreamsFromTorrents(searchResults, MOCK_PARSED_MOVIE_ID);
        assertEquals(streams.length, 0); // Stream should be filtered out
    } finally {
        envStub.restore();
        parseMagnetStub.restore();
        findFileStub.restore();
        formatBytesStub.restore();
        getTrackersStub.restore();
    }
});

Deno.test("createStreamsFromTorrents - Handles torrent with no magnet URL", async () => {
    const envStub = stub(Deno.env, "get", () => undefined); // No PM key
    // Corrected: Stub functions within the exported object
    const parseMagnetStub = stub(torrentHelpers.torrentUtils, "parseMagnetUri"); // Should not be called
    const findFileStub = stub(torrentHelpers.torrentUtils, "findBestFileIndex");
    const formatBytesStub = stub(torrentHelpers.torrentUtils, "formatBytes", (bytes = 0) => `${bytes} B`);
    // Corrected: Stub function within the exported object
    const getTrackersStub = stub(trackerHelper.trackerSource, "getTrackers", () => Promise.resolve([]));

    const searchResults = [MOCK_TORRENT_NO_MAGNET]; // Torrent missing magnetUrl

    try {
        const streams = await createStreamsFromTorrents(searchResults, MOCK_PARSED_MOVIE_ID);
        // Expect 0 streams because the torrent has no magnetUrl, thus no infoHash, and is filtered out
        assertEquals(streams.length, 0);
    } finally {
        envStub.restore();
        parseMagnetStub.restore();
        findFileStub.restore();
        formatBytesStub.restore();
        getTrackersStub.restore();
    }
});