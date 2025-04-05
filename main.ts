import { addonBuilder, serveHTTP, Stream } from './src/deps.ts';
import "https://deno.land/std@0.219.0/dotenv/load.ts"; 

import { parseStremioId, fetchAndSearchTorrents, createStreamsFromTorrents } from './src/lib/stremio_helpers.ts';

const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');
if (!TMDB_API_KEY) console.warn("TMDB_API_KEY environment variable not set. Title/Year lookup will be skipped.");

const builder = new addonBuilder({
    id: 'org.stremio.bitmagnet',
    version: '1.0.0',
    name: 'FW:Bitmagnet',
    description: 'Provides movie and series streams from a Bitmagnet instance',
    catalogs: [],
    resources: ['stream'],
    types: ['movie', 'series'],
    idPrefixes: ['tt']
});

builder.defineStreamHandler(async (args: { type: string; id: string }): Promise<{ streams: Stream[] }> => {
    console.log("Stream handler invoked with args:", args);

    const parsedId = parseStremioId(args);
    if (!parsedId) return Promise.resolve({ streams: [] });

    try {
        const searchResult = await fetchAndSearchTorrents(parsedId, TMDB_API_KEY);
        if (!searchResult || searchResult.torrents.length === 0) return Promise.resolve({ streams: [] });

        const streams = await createStreamsFromTorrents(searchResult.torrents, parsedId, searchResult.title);

        console.log(`Returning ${streams.length} streams for ${args.type} ${args.id}`);
        return Promise.resolve({ streams });

    } catch (error) {
        console.error(`Unexpected error processing stream request for ${args.type} ${args.id}:`, error instanceof Error ? error.message : error);
        return Promise.resolve({ streams: [] });
    }
});

const port = parseInt(Deno.env.get('PORT') || '7000', 10);
console.log(`Addon server starting on http://localhost:${port}`);
serveHTTP(builder.getInterface(), { port });