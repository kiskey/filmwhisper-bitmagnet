export interface TorrentInfo {
    title: string;
    magnetUrl?: string;
    size?: number;
    resolution: string;
    seeders: number;
    peers: number;
    videoCodec?: string | null;
    videoSource?: string | null;
    languages: string[];
    files?: { path: string; size: number; index: number }[];
}

export interface GraphQLTorrentItem { // Exported for testing/typing
    title: string;
    torrent?: {
        magnetUri?: string;
        size?: number;
        seeders?: number;
        leechers?: number;
        files?: {
            path: string;
            size: number;
            index: number;
            __typename?: string;
        }[];
    };
    videoResolution?: string;
    videoCodec?: string | null;
    videoSource?: string | null;
    languages?: { name: string; __typename?: string }[] | null;
}

export interface GraphQLSearchResponse { // Exported for testing/typing
    data?: {
        torrentContent?: {
            search?: {
                items?: GraphQLTorrentItem[];
            };
        };
    };
    errors?: { message: string }[];
}

export interface ContentCount { // Export if needed elsewhere, or keep internal
    label: string;
    count: number;
}

export interface ContentCounts { // Export this type
    [key: string]: ContentCount;
}

export interface GraphQLContentAggregation { // Exported for testing/typing
    value: string;
    label: string;
    count?: number;
}

export interface GraphQLCountResponse { // Exported for testing/typing
    data?: {
        torrentContent?: {
            search?: {
                aggregations?: {
                    contentType?: GraphQLContentAggregation[];
                };
            };
        };
    };
    errors?: { message: string }[];
}

const TIMEOUT_TIME = Number(Deno.env.get('BITMAGNET_TIMEOUT')) || 5;

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const timeoutPromise = new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error(`Promise timed out after ${ms} ms`));
        }, ms);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => {
        clearTimeout(timeoutId);
    });
};

export const parseGraphQLResults = (data: GraphQLSearchResponse): TorrentInfo[] => { // Export for testing
    const items = data?.data?.torrentContent?.search?.items || [];

    const torrents = items
        .filter((item: GraphQLTorrentItem): item is GraphQLTorrentItem & { torrent: Required<Pick<NonNullable<GraphQLTorrentItem['torrent']>, 'seeders'>> } =>
            (item.torrent?.seeders ?? 0) > 0
        )
        .map((item): TorrentInfo => {
            const title = item.title;
            const magnetUrl = item.torrent?.magnetUri;
            const size = item.torrent?.size;
            const resolution = item.videoResolution ? item.videoResolution.replace(/^V/, '') : 'Unknown';
            const seeders = item.torrent.seeders;
            const peers = item.torrent?.leechers ?? 0;
            const videoCodec = item.videoCodec;
            const videoSource = item.videoSource;
            const languages = item.languages?.map(lang => lang.name) || [];
            const files = item.torrent?.files?.map(f => ({ path: f.path, size: f.size, index: f.index }));

            return {
                title,
                magnetUrl,
                size,
                resolution,
                seeders,
                peers,
                videoCodec,
                videoSource,
                languages,
                files,
            };
        });

    return torrents;
};

export const parseContentCounts = (data: GraphQLCountResponse): ContentCounts => { // Export for testing
    const contentTypeAggs = data?.data?.torrentContent?.search?.aggregations?.contentType || [];
    const counts: ContentCounts = {};

    contentTypeAggs.forEach((agg: GraphQLContentAggregation) => {
        if (agg.value) {
            counts[agg.value] = {
                label: agg.label || 'Unknown Label',
                count: agg.count ?? 0,
            };
        }
    });

    return counts;
};

const validTypes: { [key in 'movie' | 'series']: string } = { movie: 'movie', series: 'tv_show' };

enum TorrentContentOrderBy {
    Relevance = 'Relevance',
    PublishedAt = 'PublishedAt',
    UpdatedAt = 'UpdatedAt',
    Size = 'Size',
    Files = 'Files',
    Seeders = 'Seeders',
    Leechers = 'Leechers',
    Name = 'Name',
    InfoHash = 'InfoHash',
}


// Keep original function name internal
async function _bitmagnetSearch(queryString: string, type: 'movie' | 'series'): Promise<TorrentInfo[]> {
    console.log(`Entering Bitmagnet GraphQL search with query: "${queryString}", Type: ${type}`);
    const baseUrl = Deno.env.get('BITMAGNET_URL');

    if (!baseUrl) throw new Error('BITMAGNET_URL is not set in environment variables.');

    const contentType = validTypes[type];
    if (!contentType) throw new Error('Invalid type. Must be "movie" or "tv".');

    const defaultSortField = TorrentContentOrderBy.Seeders;
    const defaultSortDescending = true;

    const sortFieldInput = Deno.env.get('BITMAGNET_SORT_FIELD') || defaultSortField;
    const sortField = Object.values(TorrentContentOrderBy).includes(sortFieldInput as TorrentContentOrderBy)
        ? sortFieldInput as TorrentContentOrderBy
        : defaultSortField;
    const sortDescending = (Deno.env.get('BITMAGNET_SORT_DESCENDING')?.toLowerCase() ?? String(defaultSortDescending)) === 'true';
    console.log(`Sorting by: ${sortField}, Descending: ${sortDescending}`);

    const searchLimit = parseInt(Deno.env.get('BITMAGNET_SEARCH_LIMIT') || '20', 10);
    console.log(`Search Limit: ${searchLimit}, Using Cache: true`);
    const query = `
        query TorrentContentSearch($query: SearchQueryInput, $facets: TorrentContentFacetsInput, $orderBy: [TorrentContentOrderByInput!]) {
          torrentContent {
            search(query: $query, facets: $facets, orderBy: $orderBy) {
              items {
                title
                torrent {
                  magnetUri
                  size
                  seeders
                  leechers
                  files {
                    path
                    size
                    index
                  }
                }
                videoResolution
                videoCodec # Request video codec
                videoSource # Request video source
                languages { # Request languages
                  name
                }
              }
            }
          }
        }
    `;

    const variables = {
        query: {
            queryString: queryString,
            limit: searchLimit,
            offset: 0,
            cached: true,
        },
        facets: {
            contentType: {
                filter: [contentType],
            },
        },
        orderBy: [
            { field: sortField, descending: sortDescending },
        ],
    };

    const requestOptions: RequestInit = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
    };

    try {
        const response = await withTimeout(
            fetch(`${baseUrl}/graphql`, requestOptions),
            (TIMEOUT_TIME * 1000) // seconds timeout
        );

        if (!response.ok) {
            let errorBody = 'Could not read error body';
            try {
                errorBody = await response.text();
            } catch (e) {
                // deno-lint-ignore no-explicit-any
                console.error("Failed to read error response body:", (e as any)?.message || e);
            }
            throw new Error(`GraphQL API responded with status ${response.status}: ${errorBody}`);
        }

        const responseData: GraphQLSearchResponse = await response.json();

        if (responseData.errors && responseData.errors.length > 0) {
            const errorMessages = responseData.errors.map(e => e.message).join(', ');
            throw new Error(`GraphQL query errors: ${errorMessages}`);
        }

        const results = parseGraphQLResults(responseData); // Use internal function
        console.log(`Found ${results.length} torrents for query: "${queryString}"`);
        return results;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('timed out')) {
            console.error(`Bitmagnet GraphQL request timed out for query: "${queryString}"`);
            throw new Error(`Bitmagnet GraphQL request timed out: ${errorMessage}`);
        } else {
            console.error(`Error searching Bitmagnet GraphQL API for query "${queryString}":`, errorMessage);
            throw new Error(`Failed to search Bitmagnet GraphQL API: ${errorMessage}`);
        }
    }
};



// Keep original function name internal
async function _getContentCounts(): Promise<ContentCounts> {
    const baseUrl = Deno.env.get('BITMAGNET_URL'); // Ensure baseUrl is defined inside

    if (!baseUrl) throw new Error('BITMAGNET_URL is not set in environment variables.');

    const query = `
        query GetContentCounts {
          torrentContent {
            search(query: { limit: 0 }, facets: { contentType: { aggregate: true } }) {
              aggregations {
                contentType {
                  value
                  label
                  count
                }
              }
            }
          }
        }
    `;

    const requestOptions: RequestInit = { // Ensure requestOptions is defined inside
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        body: JSON.stringify({ query }),
    };

    // The try/catch block below handles the actual fetch and return/throw
    try {
        const response = await fetch(`${baseUrl}/graphql`, requestOptions);

        if (!response.ok) {
            let errorBody = 'Could not read error body';
            try {
                errorBody = await response.text();
            } catch (e) {
                // deno-lint-ignore no-explicit-any
                console.error("Failed to read error response body:", (e as any)?.message || e);
            }
            throw new Error(`GraphQL API responded with status ${response.status}: ${errorBody}`);
        }

        const responseData: GraphQLCountResponse = await response.json();

        if (responseData.errors && responseData.errors.length > 0) {
            const errorMessages = responseData.errors.map(e => e.message).join(', ');
            throw new Error(`GraphQL query errors: ${errorMessages}`);
        }

        const counts = parseContentCounts(responseData);
        return counts;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Error fetching content counts from Bitmagnet:', errorMessage);
        throw new Error(`Failed to fetch content counts from Bitmagnet: ${errorMessage}`);
    }
} // End of _getContentCounts function

// Export functions within an object - Defined at top level
const bitmagnetFunctions = {
    bitmagnetSearch: _bitmagnetSearch,
    getContentCounts: _getContentCounts,
};

// Export the object correctly - At top level
export { bitmagnetFunctions };

// Removed the misplaced try/catch block and export definition from here
