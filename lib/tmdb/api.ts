export interface TmdbDetails {
    title: string;
    year?: number;
}

export async function getTmdbDetails(imdbId: string, apiKey: string, type: 'movie' | 'series'): Promise<TmdbDetails | null> {
    if (!apiKey) {
        console.warn("TMDB_API_KEY is not provided. Skipping TMDB lookup.");
        return null;
    }

    const url = `https://api.themoviedb.org/3/find/${imdbId}?api_key=${apiKey}&external_source=imdb_id`;
    console.log(`Fetching TMDB details from: ${url}`);
    try {
        const response = await fetch(url);
        if (!response.ok) {
            let errorBody = '';
            try {
                errorBody = await response.text();
            } catch { /* ignore */ }
            throw new Error(`TMDB API responded with status ${response.status}. Body: ${errorBody}`);
        }
        const data = await response.json();

        const results = type === 'movie' ? data.movie_results : data.tv_results;

        if (results && results.length > 0) {
            const firstResult = results[0];
            const title = firstResult.title || firstResult.name; 
            const releaseDate = firstResult.release_date || firstResult.first_air_date; 
            const year = releaseDate ? new Date(releaseDate).getFullYear() : undefined;

            if (title) {
                console.log(`Found TMDB details: Title=${title}, Year=${year}`);
                return { title, year };
            }
        }
        console.warn(`No TMDB ${type} results found for ${imdbId}`);
        return null;
    } catch (error) {
        console.error("Error fetching TMDB details:", error instanceof Error ? error.message : error);
        return null;
    }
}