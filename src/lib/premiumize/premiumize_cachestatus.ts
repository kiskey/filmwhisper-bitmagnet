/**
 * Checks Premiumize cache status for multiple info hashes in a single API call.
 * Returns a map where keys are info hashes and values indicate cache status and filename.
 */
export interface PremiumizeCacheStatus {
    isCached: boolean;
    filename: string | null;
}
export async function checkPremiumizeCacheBulk( // Export directly
    apiKey: string,
    infoHashes: string[]
): Promise<Record<string, PremiumizeCacheStatus>> {
    if (infoHashes.length === 0) {
        return {};
    }

    console.log(`[Premiumize] Bulk checking cache for ${infoHashes.length} info_hashes.`);
    const itemsQuery = infoHashes.map(hash => `items[]=${hash}`).join('&');
    const apiUrl = `https://premiumize.me/api/cache/check?apikey=${apiKey}&${itemsQuery}`;
    console.log(`[Premiumize Debug] Calling Cache Check API URL: ${apiUrl}`); // DEBUG LOG

    const results: Record<string, PremiumizeCacheStatus> = {};
    infoHashes.forEach(hash => results[hash] = { isCached: false, filename: null });

    try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
            console.error(`[Premiumize] Bulk API request failed with status ${response.status}: ${await response.text()}`);
            return results;
        }

        const rawResponseText = await response.text();
        const data = JSON.parse(rawResponseText);

        if (data.status !== 'success' || !Array.isArray(data.response) || data.response.length !== infoHashes.length) {
            console.error(`[Premiumize] Bulk cache check failed or returned unexpected data structure:`, data);
            return results;
        }

        for (let i = 0; i < infoHashes.length; i++) {
            const hash = infoHashes[i];
            const isCached = data.response[i] === true;
            const filename = (Array.isArray(data.filename) && data.filename.length > i && data.filename[i]) ? data.filename[i] : null;

            results[hash] = { isCached: isCached, filename: filename };

            if (isCached) {
                console.log(`[Premiumize] Bulk Cache hit for ${hash}. Filename: ${filename}`);
            } else {
                 console.log(`[Premiumize] Bulk Cache miss for ${hash}.`);
            }
        }

    } catch (error) {
        console.error(`[Premiumize] Error during bulk cache check API call:`, error instanceof Error ? error.message : error);
    }

    return results;
}