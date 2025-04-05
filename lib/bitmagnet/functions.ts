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

interface GraphQLTorrentItem {
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

interface GraphQLSearchResponse {
    data?: {
        torrentContent?: {
            search?: {
                items?: GraphQLTorrentItem[];
            };
        };
    };
    errors?: { message: string }[];
}

interface ContentCount {
    label: string;
    count: number;
}

interface ContentCounts {
    [key: string]: ContentCount;
}

interface GraphQLContentAggregation {
    value: string;
    label: string;
    count?: number;
}

interface GraphQLCountResponse {
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

const parseGraphQLResults = (data: GraphQLSearchResponse): TorrentInfo[] => {
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

const parseContentCounts = (data: GraphQLCountResponse): ContentCounts => {
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


export const bitmagnetSearch = async (queryString: string, type: 'movie' | 'series'): Promise<TorrentInfo[]> => {
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

        const results = parseGraphQLResults(responseData);
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



export const getContentCounts = async (): Promise<ContentCounts> => {
    const baseUrl = Deno.env.get('BITMAGNET_URL');

    if (!baseUrl) throw new Error('BITMAGNET_GRAPHQL_URL is not set in environment variables.');

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

    const requestOptions: RequestInit = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        body: JSON.stringify({ query }), 
    };

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
};
