const TRACKER_URL = "https://raw.githubusercontent.com/ngosang/trackerslist/refs/heads/master/trackers_best.txt";

let cachedTrackers: string[] | null = null;
let isFetching = false;
let fetchPromise: Promise<string[] | null> | null = null;

// Assuming 'withTimeout' from functions.ts is available or copied here for self-containment.
const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error(`Fetch timed out after ${ms} ms`));
        }, ms);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => {
        clearTimeout(timeoutId);
    });
};

/**
 * Fetches the tracker list from the predefined URL, caches it, and returns it.
 * Handles concurrent requests to avoid multiple fetches.
 * Ensures state is properly managed on completion or error.
 */
async function fetchAndCacheTrackers(): Promise<string[] | null> {
    // If a fetch is already in progress, return the existing promise.
    if (isFetching && fetchPromise) {
        console.log("[Trackers] Fetch already in progress, awaiting result...");
        return fetchPromise;
    }
    // If trackers are already cached, return them immediately.
    if (cachedTrackers) {
        console.log(`[Trackers] Returning cached trackers (${cachedTrackers.length} available).`);
        return Promise.resolve(cachedTrackers);
    }

    // Start a new fetch
    isFetching = true;
    
    // Assign the promise of the new fetch immediately
    fetchPromise = (async () => {
        console.log(`[Trackers] Initiating fetch from ${TRACKER_URL}...`);
        try {
            // Apply a timeout to the fetch operation
            const response = await withTimeout(
                fetch(TRACKER_URL),
                5000 // 5 seconds timeout, adjust as needed
            );

            if (!response.ok) {
                throw new Error(`Failed to fetch trackers: ${response.status} ${response.statusText}`);
            }

            const text = await response.text();
            const trackers = text
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0 && (line.startsWith('udp://') || line.startsWith('http://') || line.startsWith('https://')));

            if (trackers.length > 0) {
                console.log(`[Trackers] Successfully fetched and cached ${trackers.length} trackers.`);
                // **NEW LOGGING ADDED HERE**
                trackers.forEach(tracker => console.log(`  - ${tracker}`)); 
                cachedTrackers = trackers; // Cache the successful result
                return trackers;
            } else {
                console.warn("[Trackers] Fetched list, but it contained no valid trackers. Returning null.");
                return null; 
            }
        } catch (error) {
            console.error("[Trackers] Error fetching tracker list:", error instanceof Error ? error.message : error);
            return null; // On error, return null
        } finally {
            // Ensure state is reset regardless of success or failure
            isFetching = false;
            fetchPromise = null; // Clear the promise reference once it's settled (resolved or rejected)
        }
    })(); // Immediately invoke the async IIFE

    return fetchPromise; // Return the promise of the new fetch
}

/**
 * Returns the cached list of trackers. Fetches them if not already cached.
 */
async function _getTrackers(): Promise<string[]> {
    const trackers = await fetchAndCacheTrackers(); // Await the result of fetchAndCacheTrackers
    return trackers || [];
}

// Export function within an object
export const trackerSource = {
    getTrackers: _getTrackers,
};

// Initial fetch attempt (can run in background, but its state management is crucial)
fetchAndCacheTrackers();
