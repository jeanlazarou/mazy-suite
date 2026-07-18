import { useState, useEffect } from 'react';

/**
 * Checks if the response is valid albums JSON data
 * This is needed because some dev servers return index.html for non-existent files
 */
const isValidAlbumsJson = async (response: Response): Promise<boolean> => {
    try {
        const text = await response.text();
        // Quick check to see if it's likely HTML (index.html) instead of JSON
        if (text.includes('<!DOCTYPE html>') || text.includes('<html>')) {
            return false;
        }

        // Try to parse as JSON and validate it's an array (albums should be an array)
        const data = JSON.parse(text);
        return Array.isArray(data);
    } catch (err) {
        return false;
    }
};

/**
 * Custom hook to detect the correct path to data files
 * It checks which path is valid by attempting to load the albums.json file
 */
export const useDataPath = () => {
    const [dataPath, setDataPath] = useState<string>('./data');
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [useFilteredAlbums, setUseFilteredAlbums] = useState<boolean>(false);

    useEffect(() => {
        const detectPath = async () => {
            setIsLoading(true);
            setError(null);

            // First, check if there's a filtered albums.json file at root level
            try {
                const response = await fetch('../albums.json');
                if (response.ok && await isValidAlbumsJson(response.clone())) {
                    // Use filtered albums but still point to the data folder
                    setUseFilteredAlbums(true);

                    // Need to determine where the data folder is
                    try {
                        const dataResponse = await fetch('./data/albums.json');
                        if (dataResponse.ok && await isValidAlbumsJson(dataResponse.clone())) {
                            setDataPath('./data');
                            setIsLoading(false);
                            return;
                        }
                    } catch (err) {
                        // Try the next path
                    }

                    try {
                        const dataResponse = await fetch('../data/albums.json');
                        if (dataResponse.ok && await isValidAlbumsJson(dataResponse.clone())) {
                            setDataPath('../data');
                            setIsLoading(false);
                            return;
                        }
                    } catch (err) {
                        // Try the next path
                    }

                    try {
                        const dataResponse = await fetch('/data/albums.json');
                        if (dataResponse.ok && await isValidAlbumsJson(dataResponse.clone())) {
                            setDataPath('/data');
                            setIsLoading(false);
                            return;
                        }
                    } catch (err) {
                        // Continue to regular paths
                    }
                }
            } catch (err) {
                // No filtered albums file, continue to regular paths
            }

            // Try the local path first (./data)
            try {
                const response = await fetch('./data/albums.json');
                if (response.ok && await isValidAlbumsJson(response.clone())) {
                    setDataPath('./data');
                    setIsLoading(false);
                    return;
                }
            } catch (err) {
                // Continue to try the next path
            }

            // Try the parent path (../data)
            try {
                const response = await fetch('../data/albums.json');
                if (response.ok && await isValidAlbumsJson(response.clone())) {
                    setDataPath('../data');
                    setIsLoading(false);
                    return;
                }
            } catch (err) {
                // Continue to try fallback options
            }

            // If we're here, both paths failed, try one more option (just /data)
            try {
                const response = await fetch('/data/albums.json');
                if (response.ok && await isValidAlbumsJson(response.clone())) {
                    setDataPath('/data');
                    setIsLoading(false);
                    return;
                }
            } catch (err) {
                // All attempts failed
            }

            // If we reach here, all paths failed
            setError('Could not locate data folder. Please check your deployment.');
            setIsLoading(false);
        };

        detectPath();
    }, []);

    return { dataPath, isLoading, error, useFilteredAlbums };
};

/**
 * Utility function to resolve a data file path based on the detected data path
 */
export const resolveDataPath = (dataPath: string, fileName: string, useFilteredAlbums: boolean = false): string => {
    // Special case for albums.json when using filtered version
    if (useFilteredAlbums && fileName === 'albums.json') {
        return '../albums.json';
    }
    return `${dataPath}/${fileName}`;
};

/**
 * Utility function to resolve a lyrics file path based on the detected data path
 */
export const resolveLyricsPath = (dataPath: string, fileName: string): string => {
    return `${dataPath}/lyrics/${fileName}.srt`;
};