import type { Manifest } from '../deps.ts';
import type { Config, ManifestConfigItem } from '../types.ts';
import { encryptConfig, isKeyInitialized } from '../lib/crypto.ts';

export async function handleGenerateTokenRequest(request: Request, manifest: Manifest): Promise<Response> {
    if (!isKeyInitialized()) {
        return new Response('Server configuration error: Key not initialized.', { status: 500 });
    }
    try {
        const formData = await request.formData();
        const getConfigDefault = (key: string, fallback: string): string => {
            return manifest.config?.find((c: ManifestConfigItem) => c.key === key)?.default || fallback;
        };
        const bitmagnetUrlFromEnv = Deno.env.get("BITMAGNET_URL");
        const config: Config = {
            // Prioritize environment variable, then form data, then empty string
            bitmagnetUrl: bitmagnetUrlFromEnv || formData.get('bitmagnetUrl')?.toString() || '',
            tmdbApiKey: formData.get('tmdbApiKey')?.toString() || undefined,
            premiumizeApiKey: formData.get('premiumizeApiKey')?.toString() || undefined,
            bitmagnetTimeout: parseInt(formData.get('bitmagnetTimeout')?.toString() || getConfigDefault('bitmagnetTimeout', '30'), 10),
            bitmagnetSortField: formData.get('bitmagnetSortField')?.toString() || getConfigDefault('bitmagnetSortField', 'Seeders'),
            bitmagnetSortDescending: formData.get('bitmagnetSortDescending') === 'on', // Checkbox sends 'on' if checked
            bitmagnetSearchLimit: parseInt(formData.get('bitmagnetSearchLimit')?.toString() || getConfigDefault('bitmagnetSearchLimit', '30'), 10),
        };

        // Validate the final bitmagnetUrl, whether from env or form
        if (!config.bitmagnetUrl || !config.bitmagnetUrl.startsWith('http')) {
            const source = bitmagnetUrlFromEnv ? 'environment variable' : 'form';
            return new Response(`Invalid or missing Bitmagnet URL provided (from ${source}). Must start with http:// or https://.`, { status: 400 });
        }
        if (isNaN(config.bitmagnetTimeout) || config.bitmagnetTimeout < 5) config.bitmagnetTimeout = 30;
        if (isNaN(config.bitmagnetSearchLimit) || config.bitmagnetSearchLimit < 1 || config.bitmagnetSearchLimit > 100) config.bitmagnetSearchLimit = 30;

        const jweToken = await encryptConfig(config);
        console.log(`Generated JWE token for config starting with URL: ${config.bitmagnetUrl}`);
        return new Response(JSON.stringify({ token: jweToken }), { headers: { 'Content-Type': 'application/json' } });

    } catch (error) {
        console.error("Error processing token generation request:", error);
        return new Response(`Internal Server Error: ${error instanceof Error ? error.message : error}`, { status: 500 });
    }
}