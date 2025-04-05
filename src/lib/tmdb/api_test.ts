import { assertEquals } from "jsr:@std/assert";
import { stub, type Stub } from "jsr:@std/testing/mock";
import { tmdbApi, type TmdbDetails } from "./api.ts"; // Import the exported object

const TEST_API_KEY = "testTmdbApiKey";
const TEST_IMDB_ID = "tt1234567";

// Helper to create mock fetch responses
type MockFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function createMockFetch(expectedUrl: string, responseData: object | string, status: number): Stub<typeof fetch> {
    const mockImplementation: MockFetch = (url, options) => {
        assertEquals(url, expectedUrl);
        assertEquals(options, undefined); // GET request, no options expected
        const body = typeof responseData === 'string' ? responseData : JSON.stringify(responseData);
        return Promise.resolve(new Response(body, { status }));
    };
    // @ts-ignore - Workaround for complex fetch signature mismatch with stub
    return stub(globalThis, "fetch", mockImplementation);
}

// Helper to create mock fetch that rejects
function createMockFetchError(expectedUrl: string, error: Error): Stub<typeof fetch> {
    const mockImplementation: MockFetch = (url, options) => {
        assertEquals(url, expectedUrl);
        assertEquals(options, undefined);
        return Promise.reject(error);
    };
    // @ts-ignore - Workaround for complex fetch signature mismatch with stub
    return stub(globalThis, "fetch", mockImplementation);
}

// --- Test Cases ---

Deno.test("getTmdbDetails - missing API key", async () => {
    const consoleWarnStub = stub(console, "warn");
    try {
        const result = await tmdbApi.getTmdbDetails(TEST_IMDB_ID, "", "movie"); // Call method on object
        assertEquals(result, null);
        assertEquals(consoleWarnStub.calls.length, 1);
        assertEquals(consoleWarnStub.calls[0].args[0], "TMDB_API_KEY is not provided. Skipping TMDB lookup.");
    } finally {
        consoleWarnStub.restore();
    }
});

Deno.test("getTmdbDetails - successful movie lookup", async () => {
    const expectedUrl = `https://api.themoviedb.org/3/find/${TEST_IMDB_ID}?api_key=${TEST_API_KEY}&external_source=imdb_id`;
    const mockResponse = {
        movie_results: [{ title: "Test Movie", release_date: "2023-05-15" }],
        tv_results: [],
    };
    const mockFetch = createMockFetch(expectedUrl, mockResponse, 200);
    try {
        const expectedDetails: TmdbDetails = { title: "Test Movie", year: 2023 };
        const result = await tmdbApi.getTmdbDetails(TEST_IMDB_ID, TEST_API_KEY, "movie"); // Call method on object
        assertEquals(result, expectedDetails);
    } finally {
        mockFetch.restore();
    }
});

Deno.test("getTmdbDetails - successful series lookup", async () => {
    const expectedUrl = `https://api.themoviedb.org/3/find/${TEST_IMDB_ID}?api_key=${TEST_API_KEY}&external_source=imdb_id`;
    const mockResponse = {
        movie_results: [],
        tv_results: [{ name: "Test Series", first_air_date: "2022-01-10" }],
    };
    const mockFetch = createMockFetch(expectedUrl, mockResponse, 200);
    try {
        const expectedDetails: TmdbDetails = { title: "Test Series", year: 2022 };
        const result = await tmdbApi.getTmdbDetails(TEST_IMDB_ID, TEST_API_KEY, "series"); // Call method on object
        assertEquals(result, expectedDetails);
    } finally {
        mockFetch.restore();
    }
});

Deno.test("getTmdbDetails - successful movie lookup (no year)", async () => {
    const expectedUrl = `https://api.themoviedb.org/3/find/${TEST_IMDB_ID}?api_key=${TEST_API_KEY}&external_source=imdb_id`;
    const mockResponse = {
        movie_results: [{ title: "Timeless Movie", release_date: null }], // No date
        tv_results: [],
    };
    const mockFetch = createMockFetch(expectedUrl, mockResponse, 200);
    try {
        const expectedDetails: TmdbDetails = { title: "Timeless Movie", year: undefined };
        const result = await tmdbApi.getTmdbDetails(TEST_IMDB_ID, TEST_API_KEY, "movie"); // Call method on object
        assertEquals(result, expectedDetails);
    } finally {
        mockFetch.restore();
    }
});

Deno.test("getTmdbDetails - successful series lookup (no year)", async () => {
    const expectedUrl = `https://api.themoviedb.org/3/find/${TEST_IMDB_ID}?api_key=${TEST_API_KEY}&external_source=imdb_id`;
    const mockResponse = {
        movie_results: [],
        tv_results: [{ name: "Ongoing Series", first_air_date: "" }], // Empty date string
    };
    const mockFetch = createMockFetch(expectedUrl, mockResponse, 200);
    try {
        const expectedDetails: TmdbDetails = { title: "Ongoing Series", year: undefined };
        const result = await tmdbApi.getTmdbDetails(TEST_IMDB_ID, TEST_API_KEY, "series"); // Call method on object
        assertEquals(result, expectedDetails);
    } finally {
        mockFetch.restore();
    }
});

Deno.test("getTmdbDetails - successful lookup (no title/name)", async () => {
    const expectedUrl = `https://api.themoviedb.org/3/find/${TEST_IMDB_ID}?api_key=${TEST_API_KEY}&external_source=imdb_id`;
    const mockResponse = {
        movie_results: [{ release_date: "2023-01-01" }], // Missing title
        tv_results: [],
    };
    const mockFetch = createMockFetch(expectedUrl, mockResponse, 200);
    const consoleWarnStub = stub(console, "warn");
    try {
        const result = await tmdbApi.getTmdbDetails(TEST_IMDB_ID, TEST_API_KEY, "movie"); // Call method on object
        assertEquals(result, null);
        assertEquals(consoleWarnStub.calls.length, 1); // Should warn about no results found
    } finally {
        mockFetch.restore();
        consoleWarnStub.restore();
    }
});

Deno.test("getTmdbDetails - API returns no results", async () => {
    const expectedUrl = `https://api.themoviedb.org/3/find/${TEST_IMDB_ID}?api_key=${TEST_API_KEY}&external_source=imdb_id`;
    const mockResponse = { movie_results: [], tv_results: [] }; // Empty results
    const mockFetch = createMockFetch(expectedUrl, mockResponse, 200);
    const consoleWarnStub = stub(console, "warn");
    try {
        const result = await tmdbApi.getTmdbDetails(TEST_IMDB_ID, TEST_API_KEY, "movie"); // Call method on object
        assertEquals(result, null);
        assertEquals(consoleWarnStub.calls.length, 1);
        assertEquals(consoleWarnStub.calls[0].args[0], `No TMDB movie results found for ${TEST_IMDB_ID}`);
    } finally {
        mockFetch.restore();
        consoleWarnStub.restore();
    }
});

Deno.test("getTmdbDetails - API error (non-200)", async () => {
    const expectedUrl = `https://api.themoviedb.org/3/find/${TEST_IMDB_ID}?api_key=${TEST_API_KEY}&external_source=imdb_id`;
    const mockFetch = createMockFetch(expectedUrl, "Unauthorized", 401);
    const consoleErrorStub = stub(console, "error");
    try {
        const result = await tmdbApi.getTmdbDetails(TEST_IMDB_ID, TEST_API_KEY, "movie"); // Call method on object
        assertEquals(result, null);
        assertEquals(consoleErrorStub.calls.length, 1);
        assertEquals(consoleErrorStub.calls[0].args[0], "Error fetching TMDB details:");
        assertEquals(consoleErrorStub.calls[0].args[1], "TMDB API responded with status 401. Body: Unauthorized");
    } finally {
        mockFetch.restore();
        consoleErrorStub.restore();
    }
});

Deno.test("getTmdbDetails - Network error", async () => {
    const expectedUrl = `https://api.themoviedb.org/3/find/${TEST_IMDB_ID}?api_key=${TEST_API_KEY}&external_source=imdb_id`;
    const mockFetch = createMockFetchError(expectedUrl, new Error("Network Failed"));
    const consoleErrorStub = stub(console, "error");
    try {
        const result = await tmdbApi.getTmdbDetails(TEST_IMDB_ID, TEST_API_KEY, "movie"); // Call method on object
        assertEquals(result, null);
        assertEquals(consoleErrorStub.calls.length, 1);
        assertEquals(consoleErrorStub.calls[0].args[0], "Error fetching TMDB details:");
        assertEquals(consoleErrorStub.calls[0].args[1], "Network Failed");
    } finally {
        mockFetch.restore();
        consoleErrorStub.restore();
    }
});