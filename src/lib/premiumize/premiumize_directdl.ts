/**
 * Calls the /transfer/directdl endpoint using axios to get a stream link for a magnet URL.
 * Assumes the item is already cached (should be checked beforehand).
 * Returns the stream URL or null if an error occurs or the link is not found.
 */
export async function getPremiumizeDirectDownloadLink( // Export directly
    apiKey: string | undefined,
    magnetUrl: string,
    searchQuery?: string
): Promise<string | null> {
    if (!apiKey) {
        console.error("[Premiumize] Error: Missing API key.");
        return null;
    }

    const apiUrl = `https://www.premiumize.me/api/transfer/directdl?apikey=${apiKey}`;

    try {
        const bodyParams = new URLSearchParams();
        bodyParams.append('src', magnetUrl);

        const response = await fetch(apiUrl, {
            method: 'post',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: bodyParams.toString(),
        });

        const data = await response.json();

        if (data.status === 'success' && Array.isArray(data.content) && data.content.length > 0) {
            let bestMatch: { path: string, stream_link: string, size: number } | null = null;

            if (searchQuery) {
                const seasonEpisodeMatch = searchQuery.match(/S(\d{1,2})E(\d{1,2})/i);
                if (seasonEpisodeMatch) {
                    const seasonNum = parseInt(seasonEpisodeMatch[1], 10);
                    const episodeNum = parseInt(seasonEpisodeMatch[2], 10);

                    const episodePattern = new RegExp(`S(0?${seasonNum})E(0?${episodeNum})`, 'i');
                    const episodePatternAlt = new RegExp(`${seasonNum}x(0?${episodeNum})`, 'i'); // Common alternative like 1x02

                    for (const item of data.content) {
                        if (item.stream_link && item.path && (episodePattern.test(item.path) || episodePatternAlt.test(item.path))) {
                            console.log(`[Premiumize] Found specific episode match: ${item.path}`);
                            bestMatch = item;
                            break;
                        }
                    }
                }
            }

            if (!bestMatch) {
                const sortedContent = data.content
                    .filter((item: { stream_link?: string | null }) => !!item.stream_link) // Only consider items with stream links
                    .sort((a: { size?: number }, b: { size?: number }) => (b.size || 0) - (a.size || 0)); // Sort by size desc

                if (sortedContent.length > 0) {
                    bestMatch = sortedContent[0];
                    console.log(`[Premiumize] No specific episode match found. Using largest file with stream_link: ${bestMatch?.path}`);
                }
            }

            // 3. Return the result or null
            if (bestMatch && bestMatch.stream_link) {
                return bestMatch.stream_link;
            } else {
                console.log(`[Premiumize] DirectDL response successful, but no suitable stream_link found.`);
                return null;
            }
        } else {
            console.log(`[Premiumize] DirectDL link not found in response or status not success. Status: ${data.status}`);
            return null;
        }

    } catch (error) {
        console.error(`[Premiumize] Error during fetch DirectDL API call:`, error);
        return null;
    }
}