// trackers.ts (or the relevant section in functions.ts)

// NOTE: You might remove these 'assert' imports if you're not keeping the unit tests in this file.
// If you are keeping tests, make sure they are conditional (e.g., wrapped in if (Deno.test))
// import { assertEquals, assert, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";

const TRACKER_URL = "https://raw.githubusercontent.com/ngosang/trackerslist/refs/heads/master/trackers_best.txt";

let cachedTrackers: string[] | null = null;
let isFetching = false;
let fetchPromise: Promise<string[] | null> | null = null;

// Assuming 'withTimeout' from functions.ts is available or copied here for self-containment.
const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error(`Operation timed out after ${ms} ms`)); // Changed message for clarity
        }, ms);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => {
        clearTimeout(timeoutId);
    });
};

/**
 * NEW FUNCTION: Checks basic internet connectivity by fetching a common URL.
 */
async function checkInternetConnectivity(): Promise<boolean> {
    console.log("[Connectivity Check] Checking internet connectivity...");
    try {
        const testUrl = "https://www.google.com/"; // A highly reliable URL for a quick check
        const response = await withTimeout(fetch(testUrl, { method: 'HEAD' }), 3000); // HEAD request is faster, 3 sec timeout

        if (response.ok) {
            console.log("[Connectivity Check] Internet connectivity confirmed.");
            return true;
        } else {
            console.warn(`[Connectivity Check] Failed to reach ${testUrl}: HTTP ${response.status}`);
            return false;
        }
    } catch (error) {
        console.error("[Connectivity Check] Internet connectivity test failed:", error instanceof Error ? error.message : error);
        return false;
    }
}

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
            const response = await withTimeout(
                fetch(TRACKER_URL),
                30000 // 30 seconds timeout
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
// This entire block should be executed at application startup.
if (import.meta.main) {
    // Perform connectivity check first
    checkInternetConnectivity().then(isConnected => {
        if (isConnected) {
            console.log("[Startup] Proceeding with tracker fetch...");
            fetchAndCacheTrackers(); // Then proceed with tracker fetch
        } else {
            console.warn("[Startup] Internet connectivity not confirmed. Tracker fetch might fail.");
            // You might still call fetchAndCacheTrackers here if you want it to attempt anyway,
            // or explicitly skip it if you want to prevent unnecessary timeouts.
            // For now, let's still call it to get its specific error message if it fails.
            fetchAndCacheTrackers();
        }
    });
}

// --- Test Section (Keep or remove as per your project structure) ---
// ... (Your unit tests for fetchAndCacheTrackers would go here,
//      making sure to mock the new checkInternetConnectivity if needed for those tests.)
