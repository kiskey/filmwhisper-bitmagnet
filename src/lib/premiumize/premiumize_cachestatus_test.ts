import { assertEquals } from "jsr:@std/assert";
import { stub } from "jsr:@std/testing/mock";
import { checkPremiumizeCacheBulk, type PremiumizeCacheStatus } from "./premiumize_cachestatus.ts"; // Import function directly

Deno.test("checkPremiumizeCacheBulk - successful response with mixed results", async () => {
    const apiKey = "testApiKey";
    const infoHashes = ["hash1", "hash2", "hash3"];
    const expectedUrl = `https://premiumize.me/api/cache/check?apikey=${apiKey}&items[]=hash1&items[]=hash2&items[]=hash3`;

    // Mock the fetch function
    const mockResponseData = {
        status: "success",
        response: [true, false, true], // hash1 cached, hash2 not, hash3 cached
        filename: ["file1.mkv", null, "file3.mp4"], // Filenames corresponding to response
        // Premiumize might include other fields, but these are the core ones we parse
    };
    const mockFetch = stub(globalThis, "fetch", (url: string | URL | Request): Promise<Response> => {
        assertEquals(url, expectedUrl); // Verify the correct URL is called
        return Promise.resolve(new Response(JSON.stringify(mockResponseData), { status: 200 }));
    });

    try {
        const expectedResult: Record<string, PremiumizeCacheStatus> = {
            "hash1": { isCached: true, filename: "file1.mkv" },
            "hash2": { isCached: false, filename: null },
            "hash3": { isCached: true, filename: "file3.mp4" },
        };
        const actualResult = await checkPremiumizeCacheBulk(apiKey, infoHashes); // Call function directly
        assertEquals(actualResult, expectedResult);
    } finally {
        // Restore the original fetch function
        mockFetch.restore();
    }
});

// --- More tests will be added below ---

Deno.test("checkPremiumizeCacheBulk - empty input array", async () => {
    const apiKey = "testApiKey";
    const infoHashes: string[] = [];
    const mockFetch = stub(globalThis, "fetch"); // Should not be called

    try {
        const result = await checkPremiumizeCacheBulk(apiKey, infoHashes); // Call function directly
        assertEquals(result, {}); // Expect an empty object
        assertEquals(mockFetch.calls.length, 0); // Ensure fetch was not called
    } finally {
        mockFetch.restore();
    }
});

Deno.test("checkPremiumizeCacheBulk - API error (non-200 status)", async () => {
    const apiKey = "testApiKey";
    const infoHashes = ["hash1"];
    const expectedUrl = `https://premiumize.me/api/cache/check?apikey=${apiKey}&items[]=hash1`;

    // Mock fetch to return a 500 error
    const mockFetch = stub(globalThis, "fetch", (url: string | URL | Request): Promise<Response> => {
        assertEquals(url, expectedUrl);
        return Promise.resolve(new Response("Internal Server Error", { status: 500 }));
    });

    // Mock console.error to check if it's called
    const consoleErrorStub = stub(console, "error");

    try {
        const expectedResult: Record<string, PremiumizeCacheStatus> = {
            "hash1": { isCached: false, filename: null }, // Expect default non-cached result
        };
        const actualResult = await checkPremiumizeCacheBulk(apiKey, infoHashes); // Call function directly
        assertEquals(actualResult, expectedResult);
        // Check if console.error was called (optional, but good practice)
        assertEquals(consoleErrorStub.calls.length, 1);
        assertEquals(consoleErrorStub.calls[0].args[0], `[Premiumize] Bulk API request failed with status 500: Internal Server Error`);
    } finally {
        mockFetch.restore();
        consoleErrorStub.restore();
    }
});


Deno.test("checkPremiumizeCacheBulk - API logic error (status != 'success')", async () => {
    const apiKey = "testApiKey";
    const infoHashes = ["hash1"];
    const expectedUrl = `https://premiumize.me/api/cache/check?apikey=${apiKey}&items[]=hash1`;

    const mockResponseData = {
        status: "error",
        message: "Invalid API key",
    };
    const mockFetch = stub(globalThis, "fetch", (url: string | URL | Request): Promise<Response> => {
        assertEquals(url, expectedUrl);
        return Promise.resolve(new Response(JSON.stringify(mockResponseData), { status: 200 }));
    });
    const consoleErrorStub = stub(console, "error");

    try {
        const expectedResult: Record<string, PremiumizeCacheStatus> = {
            "hash1": { isCached: false, filename: null }, // Expect default non-cached result
        };
        const actualResult = await checkPremiumizeCacheBulk(apiKey, infoHashes); // Call function directly
        assertEquals(actualResult, expectedResult);
        assertEquals(consoleErrorStub.calls.length, 1);
        assertEquals(consoleErrorStub.calls[0].args[0], `[Premiumize] Bulk cache check failed or returned unexpected data structure:`);
    } finally {
        mockFetch.restore();
        consoleErrorStub.restore();
    }
});

Deno.test("checkPremiumizeCacheBulk - Malformed API response (response not array)", async () => {
    const apiKey = "testApiKey";
    const infoHashes = ["hash1"];
    const expectedUrl = `https://premiumize.me/api/cache/check?apikey=${apiKey}&items[]=hash1`;

    const mockResponseData = {
        status: "success",
        response: "not an array", // Incorrect structure
        filename: ["file1.mkv"]
    };
    const mockFetch = stub(globalThis, "fetch", (url: string | URL | Request): Promise<Response> => {
        assertEquals(url, expectedUrl);
        return Promise.resolve(new Response(JSON.stringify(mockResponseData), { status: 200 }));
    });
    const consoleErrorStub = stub(console, "error");

    try {
        const expectedResult: Record<string, PremiumizeCacheStatus> = {
            "hash1": { isCached: false, filename: null }, // Expect default non-cached result
        };
        const actualResult = await checkPremiumizeCacheBulk(apiKey, infoHashes); // Call function directly
        assertEquals(actualResult, expectedResult);
        assertEquals(consoleErrorStub.calls.length, 1);
        assertEquals(consoleErrorStub.calls[0].args[0], `[Premiumize] Bulk cache check failed or returned unexpected data structure:`);
    } finally {
        mockFetch.restore();
        consoleErrorStub.restore();
    }
});


Deno.test("checkPremiumizeCacheBulk - Network error during fetch", async () => {
    const apiKey = "testApiKey";
    const infoHashes = ["hash1"];
    const expectedUrl = `https://premiumize.me/api/cache/check?apikey=${apiKey}&items[]=hash1`;

    // Mock fetch to throw an error
    const mockFetch = stub(globalThis, "fetch", (url: string | URL | Request): Promise<Response> => {
        assertEquals(url, expectedUrl);
        return Promise.reject(new Error("Network Failed"));
    });
    const consoleErrorStub = stub(console, "error");

    try {
        const expectedResult: Record<string, PremiumizeCacheStatus> = {
            "hash1": { isCached: false, filename: null }, // Expect default non-cached result
        };
        const actualResult = await checkPremiumizeCacheBulk(apiKey, infoHashes); // Call function directly
        assertEquals(actualResult, expectedResult);
        assertEquals(consoleErrorStub.calls.length, 1);
        assertEquals(consoleErrorStub.calls[0].args[0], `[Premiumize] Error during bulk cache check API call:`);
        assertEquals(consoleErrorStub.calls[0].args[1], "Network Failed");
    } finally {
        mockFetch.restore();
        consoleErrorStub.restore();
    }
});