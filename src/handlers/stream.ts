import type { Stream } from '../deps.ts';
import { decryptConfig, isKeyInitialized } from '../lib/crypto.ts';
import { parseStremioId, fetchAndSearchTorrents, createStreamsFromTorrents } from '../lib/stremio_helpers.ts';
import { getKv } from "../lib/kv_store.ts"; 

const CACHE_PREFIX_STREAM = "stream_";
const CACHE_TTL_STREAM_SECONDS = 60 * 60; 
const CACHE_TTL_EMPTY_SECONDS = 5 * 60;  

// Handles stream requests: /<jwe>/stream/:type/:id.json
export async function handleStreamRequest(jwe: string, type: string, rawId: string): Promise<Response> {
    if (!isKeyInitialized()) {
        console.error("Cannot process stream request: Encryption key not initialized.");
        return new Response('Server configuration error: Key not initialized.', { status: 500 });
    }

    const config = await decryptConfig(jwe);
    if (!config) {
        console.warn(`Invalid or undecryptable JWE token received for stream request.`);
        return new Response('Invalid or expired configuration token.', { status: 400 });
    }

    const id = decodeURIComponent(rawId);
    console.log(`Decoded stream request: type=${type}, id=${id}`);

    const parsedId = parseStremioId({ type, id });
    if (!parsedId) {
        console.error(`Could not parse stream ID: type=${type}, id=${id}`);
        return new Response('Invalid stream ID format.', { status: 400 });
    }

    // --- BEGIN: Override with Env Var ---
    const bitmagnetUrlFromEnv = Deno.env.get("BITMAGNET_URL");
    if (config && bitmagnetUrlFromEnv) {
        console.log(`Stream Request: Overriding Bitmagnet URL from token with environment variable: ${bitmagnetUrlFromEnv}`);
        config.bitmagnetUrl = bitmagnetUrlFromEnv;
    }
    // --- END: Override with Env Var ---

    const cacheKey = [
        CACHE_PREFIX_STREAM + parsedId.imdbId,
        parsedId.season ?? "nosn", // Use "nosn" if season is null/undefined
        parsedId.episode ?? "noep" // Use "noep" if episode is null/undefined
    ];
    const logIdentifier = `${type} ${id} (${parsedId.imdbId} S${parsedId.season ?? '-'}E${parsedId.episode ?? '-'})`; 

    try {
        const kv = await getKv(); 
        const cachedResult = await kv.get<Stream[]>(cacheKey);

        if (cachedResult.value !== null) {
            console.log(`Cache hit for ${logIdentifier}. Returning ${cachedResult.value.length} cached streams.`);
            const responseBody = JSON.stringify({ streams: cachedResult.value });
            return new Response(responseBody, { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
        }

        console.log(`Cache miss for ${logIdentifier}. Fetching torrents...`);
        const searchResult = await fetchAndSearchTorrents(parsedId, config);

        let streams: Stream[] = [];
        if (searchResult && searchResult.torrents.length > 0) {
            streams = await createStreamsFromTorrents(searchResult.torrents, parsedId, searchResult.title, config);
            console.log(`Found ${streams.length} streams for ${logIdentifier}. Caching result.`);
            await kv.set(cacheKey, streams, { expireIn: CACHE_TTL_STREAM_SECONDS * 1000 }); 
        } else {
            console.log(`No torrents found by fetchAndSearchTorrents for ${logIdentifier}`);
            await kv.set(cacheKey, [], { expireIn: CACHE_TTL_EMPTY_SECONDS * 1000 });
        }

        console.log(`Returning ${streams.length} streams for ${logIdentifier}`);
        const responseBody = JSON.stringify({ streams: streams });
        return new Response(responseBody, { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });

    } catch (err) {
        console.error(`Error processing stream request for ${logIdentifier}:`, err);
        return new Response("Internal server error during stream processing.", { status: 500 });
    }
}