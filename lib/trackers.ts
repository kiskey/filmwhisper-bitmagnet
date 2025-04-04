const TRACKER_URL = "https://raw.githubusercontent.com/ngosang/trackerslist/refs/heads/master/trackers_best.txt";

let cachedTrackers: string[] | null = null;
let isFetching = false;
let fetchPromise: Promise<string[] | null> | null = null;

/**
 * Fetches the tracker list from the predefined URL, caches it, and returns it.
 * Handles concurrent requests to avoid multiple fetches.
 */
// deno-lint-ignore require-await
async function fetchAndCacheTrackers(): Promise<string[] | null> {
    if (isFetching && fetchPromise) {
        console.log("[Trackers] Fetch already in progress, awaiting result...");
        return fetchPromise;
    }
    if (cachedTrackers) return Promise.resolve(cachedTrackers); 

    isFetching = true;
    fetchPromise = (async () => {
        console.log(`[Trackers] Fetching tracker list from ${TRACKER_URL}...`);
        try {
            const response = await fetch(TRACKER_URL);
            if (!response.ok) throw new Error(`Failed to fetch trackers: ${response.status} ${response.statusText}`);
        
            const text = await response.text();
            const trackers = text
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0 && (line.startsWith('udp://') || line.startsWith('http://') || line.startsWith('https://'))); // Basic validation

            if (trackers.length > 0) {
                console.log(`[Trackers] Successfully fetched and cached ${trackers.length} trackers.`);
                cachedTrackers = trackers;
                return trackers;
            } else {
                console.warn("[Trackers] Fetched list, but it contained no valid trackers.");
                return null;
            }
        } catch (error) {
            console.error("[Trackers] Error fetching tracker list:", error instanceof Error ? error.message : error);
            return null; 
        } finally {
            isFetching = false;
        }
    })();

    return fetchPromise;
}

/**
 * Returns the cached list of trackers. Fetches them if not already cached.
 */
export async function getTrackers(): Promise<string[]> {
    const trackers = await fetchAndCacheTrackers();
    return trackers || [];
}

fetchAndCacheTrackers();