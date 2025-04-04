export interface ParsedMagnetUri {
    infoHash?: string;
    sources: string[]; 
}

export function parseMagnetUri(magnetUri?: string): ParsedMagnetUri | null {
    if (!magnetUri || !magnetUri.startsWith('magnet:?')) {
        return null;
    }

    try {
        const params = new URLSearchParams(magnetUri.substring(magnetUri.indexOf('?') + 1));
        const infoHash = params.get('xt')?.match(/urn:btih:([a-fA-F0-9]{40})/)?.[1];
        const sources = params.getAll('tr'); 

        if (!infoHash) {
            console.warn("Could not extract infoHash from magnet URI:", magnetUri);
            return null; 
        }

        return {
            infoHash: infoHash.toLowerCase(), 
            sources: sources.filter(Boolean)
        };
    } catch (error) {
        console.error("Error parsing magnet URI:", magnetUri, error);
        return null;
    }
}

export function findBestFileIndex(
    files?: { path: string; size: number; index: number }[],
    season?: number,
    episode?: number
): number | undefined {
    if (!files || files.length === 0) {
        return undefined;
    }

    const videoExtensions = ['.mkv', '.mp4', '.avi', '.mov', '.wmv', '.flv'];
    let largestVideoFile: { index: number; size: number; path: string } | null = null;
    let specificEpisodeFile: { index: number; size: number; path: string } | null = null;
    let regexPatterns: RegExp[] | null = null;

    // Prepare regex patterns only if it's a series episode search
    if (season !== undefined && episode !== undefined) {
        const seasonPad = String(season).padStart(2, '0');
        const episodePad = String(episode).padStart(2, '0');
        const seasonNoPad = String(season);
        const episodeNoPad = String(episode);

        // Fuck sake. sort this shit based on all the scene. Is there a module that does this shit?
        regexPatterns = [
            new RegExp(`(?:[._\\-\\s]|\\b)S${seasonPad}E${episodePad}(?:[._\\-\\s]|\\b)`, 'i'),
            new RegExp(`(?:[._\\-\\s]|\\b)S${seasonNoPad}E${episodePad}(?:[._\\-\\s]|\\b)`, 'i'),
            new RegExp(`(?:[._\\-\\s]|\\b)S${seasonPad}E${episodeNoPad}(?:[._\\-\\s]|\\b)`, 'i'),
            new RegExp(`(?:[._\\-\\s]|\\b)S${seasonNoPad}E${episodeNoPad}(?:[._\\-\\s]|\\b)`, 'i'),
            new RegExp(`(?:[._\\-\\s]|\\b)${seasonNoPad}x${episodePad}(?:[._\\-\\s]|\\b)`, 'i'),
            new RegExp(`(?:[._\\-\\s]|\\b)${seasonNoPad}x${episodeNoPad}(?:[._\\-\\s]|\\b)`, 'i'),
        ];
    }

    for (const file of files) {
        const extension = file.path.substring(file.path.lastIndexOf('.')).toLowerCase();
        if (videoExtensions.includes(extension)) {
            
            if (regexPatterns && regexPatterns.some(regex => regex.test(file.path))) {
                
                if (!specificEpisodeFile || file.size > specificEpisodeFile.size) {
                    specificEpisodeFile = { index: file.index, size: file.size, path: file.path };
                }
            }

            // Always track the largest video file overall
            if (!largestVideoFile || file.size > largestVideoFile.size) {
                largestVideoFile = { index: file.index, size: file.size, path: file.path };
            }
        }
    }

    if (specificEpisodeFile) {
        console.log(`Found specific file for S${season}E${episode}: Index ${specificEpisodeFile.index} (${specificEpisodeFile.path})`);
        return specificEpisodeFile.index;
    }

    if (largestVideoFile) {
        if (season !== undefined && episode !== undefined) {
             console.warn(`Could not find specific file match for S${season}E${episode}, falling back to largest video file.`);
        }
        console.log(`Selected largest video file: Index ${largestVideoFile.index} (${largestVideoFile.path})`);
        return largestVideoFile.index;
    }

    if (files.length === 1) {
        console.log("Only one file found, assuming it's the video file.");
        return files[0].index;
    }
    console.warn("Could not determine the best video file index.");
    return undefined;
}

export function formatBytes(bytes: number, decimals = 2): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    const size = bytes / Math.pow(k, i);
    return (isNaN(size) ? 0 : parseFloat(size.toFixed(dm))) + ' ' + sizes[i];
}