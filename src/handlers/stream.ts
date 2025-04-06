import type { Stream } from '../deps.ts';
import { decryptConfig, isKeyInitialized } from '../lib/crypto.ts';
import { parseStremioId, fetchAndSearchTorrents, createStreamsFromTorrents } from '../lib/stremio_helpers.ts';

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

    // Decode the ID component from the URL path
    const id = decodeURIComponent(rawId);
    console.log(`Decoded stream request: type=${type}, id=${id}`);

    // Manually call stream logic with the decoded ID
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

    try {
        const searchResult = await fetchAndSearchTorrents(parsedId, config);
        let streams: Stream[] = [];
        if (searchResult && searchResult.torrents.length > 0) {
            streams = await createStreamsFromTorrents(searchResult.torrents, parsedId, searchResult.title, config);
        } else {
             console.log(`No torrents found by fetchAndSearchTorrents for ${parsedId.imdbId}`);
        }
        console.log(`Returning ${streams.length} streams for ${type} ${id}`);
        // Format response according to Stremio spec
        const responseBody = JSON.stringify({ streams: streams });
        // Add CORS header for stream responses
        return new Response(responseBody, { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    } catch (err) {
        console.error(`Error processing stream request for ${type} ${id}:`, err);
        return new Response("Internal server error during stream processing.", { status: 500 });
    }
}