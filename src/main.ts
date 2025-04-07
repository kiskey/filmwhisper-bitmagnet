import type { Manifest } from './deps.ts';
import "https://deno.land/std@0.219.0/dotenv/load.ts";

import { initializeSecretKey, decryptConfig, isKeyInitialized } from './lib/crypto.ts';
import { serveConfigPage } from './handlers/configure.ts';
import { handleGenerateTokenRequest } from './handlers/api.ts';
import { handleStreamRequest } from './handlers/stream.ts';
import { closeKv } from "./lib/kv_store.ts";
import type { Config } from './types.ts';

const manifest: Manifest = {
    id: 'org.filmwhisper.bitmagnet',
    version: '1.4.0', 
    name: 'FilmWhisper: Bitmagnet',
    description: 'Provides movie/series streams from Bitmagnet. Requires configuration.',
    catalogs: [], resources: ['stream'], types: ['movie', 'series'], idPrefixes: ['tt'],
    config: [
        { key: 'bitmagnetUrl', type: 'text', title: 'Bitmagnet URL (e.g., http://192.168.1.10:3333)', required: true },
        { key: 'tmdbApiKey', type: 'password', title: 'TMDB API Key', required: false },
        { key: 'premiumizeApiKey', type: 'password', title: 'Premiumize API Key', required: false },
        { key: 'bitmagnetTimeout', type: 'number', title: 'Advanced: Bitmagnet Timeout (seconds)', default: '30', required: false },
        { key: 'bitmagnetSortField', type: 'select', title: 'Advanced: Bitmagnet Sort Field', default: 'Seeders', options: ['Seeders', 'Leechers', 'Size', 'PublishedAt', 'Relevance', 'Name'], required: false },
        { key: 'bitmagnetSortDescending', type: 'checkbox', title: 'Advanced: Sort Descending', default: 'checked', required: false },
        { key: 'bitmagnetSearchLimit', type: 'number', title: 'Advanced: Bitmagnet Search Limit (1-100)', default: '30', required: false },
    ],
    behaviorHints: { configurable: true }
};

interface RouteHandler {
    (request: Request, params?: Record<string, string | undefined>): Promise<Response> | Response;
}

const routes: { pattern: URLPattern; method: string; handler: RouteHandler }[] = [
    {
        // Match /configure or /<jwe>/configure
        pattern: new URLPattern({ pathname: '/:jwe?/configure' }),
        method: 'GET',
        handler: async (request, params) => {
            const url = new URL(request.url);
            const jwe = params?.jwe; 
            let existingConfig: Config | null = null;

            if (jwe && isKeyInitialized()) { 
                
                existingConfig = await decryptConfig(jwe);
                if (!existingConfig) {
                    console.warn("Failed to decrypt token for pre-filling config page, serving blank form.");
                } else {
                    console.log("Successfully decrypted token, attempting to pre-fill form.");
                    const bitmagnetUrlFromEnv = Deno.env.get("BITMAGNET_URL");
                    if (bitmagnetUrlFromEnv) {
                        console.log(`Overriding Bitmagnet URL from token with environment variable: ${bitmagnetUrlFromEnv}`);
                        existingConfig.bitmagnetUrl = bitmagnetUrlFromEnv;
                    }
                }
            } else if (jwe) {
                 console.warn("Key not initialized or JWE missing, cannot pre-fill config page.");
            }
            return serveConfigPage(url, manifest, existingConfig);
        },
    },
    {
        pattern: new URLPattern({ pathname: '/api/generate-config-token' }),
        method: 'POST',
        handler: (request) => handleGenerateTokenRequest(request, manifest),
    },
    {
        pattern: new URLPattern({ pathname: '/' }),
        method: 'GET',
        handler: (request) => Response.redirect(`${new URL(request.url).origin}/configure`, 302),
    },
    {
        // Match /manifest.json OR /<jwe>/manifest.json
        // Optional :jwe parameter
        pattern: new URLPattern({ pathname: '/:jwe?/manifest.json' }),
        method: 'GET',
        handler: () => { 
            try {
                const manifestJson = JSON.stringify(manifest);
                return new Response(manifestJson, {
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*', 
                    },
                });
            } catch (err) {
                console.error(`Error stringifying manifest:`, err);
                return new Response('Internal server error generating manifest.', { status: 500 });
            }
        },
    },
    {
        // Match /<jwe>/stream/<type>/<id>.json
        pattern: new URLPattern({ pathname: '/:jwe/stream/:type/:id.json' }),
        method: 'GET',
        handler: (_request, params) => {
            if (!params?.jwe || !params?.type || !params?.id) {
                 console.error('Missing parameters in stream request path');
                 return new Response('Bad Request: Malformed stream request path. Expected /<jwe>/stream/<type>/<id>.json', { status: 400 });
            }
            return handleStreamRequest(params.jwe, params.type, params.id);
        },
    },
];

async function requestHandler(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;
    console.log(`Incoming request: ${method} ${url.pathname}`);

    for (const route of routes) {
        if (request.method === route.method) {
            const match = route.pattern.exec(request.url);
            if (match) {
                const params = match.pathname.groups;
                console.log(`Matched route: ${route.pattern.pathname} with params:`, params);
                try {
                    return await route.handler(request, params);
                } catch (error) {
                     console.error(`Error in handler for ${method} ${url.pathname}:`, error);
                     return new Response('Internal Server Error', { status: 500 });
                }
            }
        }
    }

    console.log(`Request path "${url.pathname}" with method "${method}" did not match any known patterns.`);
    return new Response('Not Found', { status: 404 });
}

const port = parseInt(Deno.env.get('PORT') || '7000', 10);

initializeSecretKey().then((keyInitialized) => {
    if (!keyInitialized) {
        console.error("Server cannot start: Failed to initialize encryption key.");
        Deno.exit(1); 
    }
    console.log(`Addon server starting. Configure at: http://localhost:${port}/configure`);
    Deno.serve({ handler: requestHandler, port: port });
}).catch(err => {
    console.error("Failed to initialize server:", err);
    Deno.exit(1);
});

// Gracefully close the KV store on shutdown signals.
const handleShutdown = async () => {
    try {
      await closeKv();
      console.log('Closed Kv.');
      console.log('Closing Application');
      Deno.exit(1);
    } catch (error) {
      console.error("Error during shutdown:", error);
    }
  };
  
  Deno.addSignalListener('SIGTERM', handleShutdown);
  Deno.addSignalListener('SIGINT', handleShutdown);