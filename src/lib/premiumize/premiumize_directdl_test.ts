import { assertEquals } from "jsr:@std/assert";
import { stub, type Stub } from "jsr:@std/testing/mock";
import { getPremiumizeDirectDownloadLink } from "./premiumize_directdl.ts"; // Import function directly

const TEST_API_KEY = "testApiKey";
const TEST_MAGNET_URL = "magnet:?xt=urn:btih:dummyhash";
const API_URL = `https://www.premiumize.me/api/transfer/directdl?apikey=${TEST_API_KEY}`;

// Helper to create mock fetch responses
// Define the expected signature for our mock fetch
type MockFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function createMockFetch(responseData: object | string, status: number): Stub<typeof fetch> {
    const mockImplementation: MockFetch = (url, options) => {
        assertEquals(url, API_URL);
        assertEquals(options?.method?.toUpperCase(), "POST");
        const headers = new Headers(options?.headers); // Create Headers object
        assertEquals(headers.get('Content-Type'), 'application/x-www-form-urlencoded');
        // Optionally check body: assertEquals(options?.body?.toString(), `src=${encodeURIComponent(TEST_MAGNET_URL)}`);
        const body = typeof responseData === 'string' ? responseData : JSON.stringify(responseData);
        return Promise.resolve(new Response(body, { status }));
    };
    // Use the defined type in the stub
    // @ts-ignore - Workaround for complex fetch signature mismatch with stub
    return stub(globalThis, "fetch", mockImplementation);
}

// Helper to create mock fetch that rejects
function createMockFetchError(error: Error): Stub<typeof fetch> {
    const mockImplementation: MockFetch = (_url, _options) => {
        return Promise.reject(error);
    };
    // Use the defined type in the stub
    // @ts-ignore - Workaround for complex fetch signature mismatch with stub
    return stub(globalThis, "fetch", mockImplementation);
}

// --- Test Cases ---

Deno.test("getPremiumizeDirectDownloadLink - missing API key", async () => {
    const result = await getPremiumizeDirectDownloadLink(undefined, TEST_MAGNET_URL); // Call function directly
    assertEquals(result, null);
});

Deno.test("getPremiumizeDirectDownloadLink - success (no query, largest file)", async () => {
    const mockResponse = {
        status: "success",
        content: [
            { path: "small_file.mkv", stream_link: "link1", size: 100 },
            { path: "large_file.mp4", stream_link: "link2", size: 500 },
            { path: "medium_file.avi", stream_link: "link3", size: 300 },
        ],
    };
    const mockFetch = createMockFetch(mockResponse, 200);
    try {
        const result = await getPremiumizeDirectDownloadLink(TEST_API_KEY, TEST_MAGNET_URL); // Call function directly
        assertEquals(result, "link2"); // Link of the largest file
    } finally {
        mockFetch.restore();
    }
});

Deno.test("getPremiumizeDirectDownloadLink - success (SxxExx query match)", async () => {
    const mockResponse = {
        status: "success",
        content: [
            { path: "Show.Name.S01E01.mkv", stream_link: "link1", size: 300 },
            { path: "Show.Name.S01E02.1080p.x265.mp4", stream_link: "link_episode", size: 500 },
            { path: "Show.Name.S01E03.avi", stream_link: "link3", size: 200 },
            { path: "largest_other_file.mkv", stream_link: "link_large", size: 600 },
        ],
    };
    const mockFetch = createMockFetch(mockResponse, 200);
    try {
        const result = await getPremiumizeDirectDownloadLink(TEST_API_KEY, TEST_MAGNET_URL, "Show Name S01E02"); // Call function directly
        assertEquals(result, "link_episode"); // Specific episode link
    } finally {
        mockFetch.restore();
    }
});

Deno.test("getPremiumizeDirectDownloadLink - success (NxMx query match)", async () => {
    const mockResponse = {
        status: "success",
        content: [
            { path: "Show.Name.1x01.mkv", stream_link: "link1", size: 300 },
            { path: "Show.Name.1x02.HDTV.mp4", stream_link: "link_episode", size: 500 },
            { path: "Show.Name.1x03.avi", stream_link: "link3", size: 200 },
        ],
    };
    const mockFetch = createMockFetch(mockResponse, 200);
    try {
        const result = await getPremiumizeDirectDownloadLink(TEST_API_KEY, TEST_MAGNET_URL, "Show S01E02"); // Call function directly
        assertEquals(result, "link_episode");
    } finally {
        mockFetch.restore();
    }
});


Deno.test("getPremiumizeDirectDownloadLink - success (query no match, fallback largest)", async () => {
    const mockResponse = {
        status: "success",
        content: [
            { path: "Show.Name.S01E01.mkv", stream_link: "link1", size: 300 },
            { path: "Show.Name.S01E03.avi", stream_link: "link3", size: 200 },
            { path: "largest_other_file.mkv", stream_link: "link_large", size: 600 },
        ],
    };
    const mockFetch = createMockFetch(mockResponse, 200);
    try {
        const result = await getPremiumizeDirectDownloadLink(TEST_API_KEY, TEST_MAGNET_URL, "Show Name S01E02"); // Call function directly
        assertEquals(result, "link_large"); // Fallback to largest
    } finally {
        mockFetch.restore();
    }
});

Deno.test("getPremiumizeDirectDownloadLink - success (empty content)", async () => {
    const mockResponse = { status: "success", content: [] };
    const mockFetch = createMockFetch(mockResponse, 200);
    try {
        const result = await getPremiumizeDirectDownloadLink(TEST_API_KEY, TEST_MAGNET_URL); // Call function directly
        assertEquals(result, null);
    } finally {
        mockFetch.restore();
    }
});

Deno.test("getPremiumizeDirectDownloadLink - success (no stream links)", async () => {
    const mockResponse = {
        status: "success",
        content: [
            { path: "file1.mkv", stream_link: null, size: 500 },
            { path: "file2.mp4", size: 300 }, // stream_link missing
        ],
    };
    const mockFetch = createMockFetch(mockResponse, 200);
    try {
        const result = await getPremiumizeDirectDownloadLink(TEST_API_KEY, TEST_MAGNET_URL); // Call function directly
        assertEquals(result, null);
    } finally {
        mockFetch.restore();
    }
});

Deno.test("getPremiumizeDirectDownloadLink - API error (non-200)", async () => {
    const mockFetch = createMockFetch("Server Error", 500);
    const consoleErrorStub = stub(console, "error");
    try {
        const result = await getPremiumizeDirectDownloadLink(TEST_API_KEY, TEST_MAGNET_URL); // Call function directly
        assertEquals(result, null);
        // Optional: Check console.error was called
        assertEquals(consoleErrorStub.calls.length, 1);
    } finally {
        mockFetch.restore();
        consoleErrorStub.restore();
    }
});

Deno.test("getPremiumizeDirectDownloadLink - API logic error (status != success)", async () => {
    const mockResponse = { status: "error", message: "Invalid request" };
    const mockFetch = createMockFetch(mockResponse, 200);
    const consoleLogStub = stub(console, "log"); // Function logs status in this case
    try {
        const result = await getPremiumizeDirectDownloadLink(TEST_API_KEY, TEST_MAGNET_URL); // Call function directly
        assertEquals(result, null);
        // Optional: Check console.log was called
        assertEquals(consoleLogStub.calls.length, 1);
        assertEquals(consoleLogStub.calls[0].args[0], `[Premiumize] DirectDL link not found in response or status not success. Status: error`);
    } finally {
        mockFetch.restore();
        consoleLogStub.restore();
    }
});

Deno.test("getPremiumizeDirectDownloadLink - Network error", async () => {
    const mockFetch = createMockFetchError(new Error("Network Failed"));
    const consoleErrorStub = stub(console, "error");
    try {
        const result = await getPremiumizeDirectDownloadLink(TEST_API_KEY, TEST_MAGNET_URL); // Call function directly
        assertEquals(result, null);
        assertEquals(consoleErrorStub.calls.length, 1);
        assertEquals(consoleErrorStub.calls[0].args[0], `[Premiumize] Error during fetch DirectDL API call:`);
    } finally {
        mockFetch.restore();
        consoleErrorStub.restore();
    }
});