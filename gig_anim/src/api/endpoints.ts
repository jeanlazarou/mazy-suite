import { PerformanceData, Lyric, Album, Track } from "../types";
import { fileFromTitle } from "../utils/fileUtils";
import { parseSRT } from "../utils/lyricsUtils";

const API_BASE_URL = "/data";

export const fetchPerformanceData = async (
  performanceFile: string
): Promise<PerformanceData> => {
  try {
    const response = await fetch(`${API_BASE_URL}/${performanceFile}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data: PerformanceData = await response.json();
    const tracks = data.tracks.map((t) => ({ ...t, id: t.url }));

    data.tracks = tracks;

    return data;
  } catch (error) {
    console.error("Error fetching performance data:", error);
    throw error;
  }
};

export const fetchLyrics = async (trackTitle: string): Promise<Lyric[]> => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/lyrics/${fileFromTitle(trackTitle)}.srt`
    );
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const text = await response.text();
    return parseSRT(text);
  } catch (error) {
    console.error("Error fetching lyrics:", error);
    throw error;
  }
};

export const savePerformanceData = (
  performanceFile: string,
  data: PerformanceData
): void => {
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = performanceFile;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const fetchAlbums = async (): Promise<Album[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/albums.json`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const albumsList = await response.json();
    const albumsWithDetails = await Promise.all(
      albumsList.map(async (album: any) => {
        const detailsResponse = await fetch(
          `${API_BASE_URL}/${album.name}.json`
        );
        const details = await detailsResponse.json();
        return {
          id: album.name,
          name: details.title, // Use the title from the album JSON file
          color: album.color,
          image: album.image,
          displayColor: album.displayColor,
          coverImage: `${album.name}.${album.image || "jpg"}`,
        };
      })
    );
    return albumsWithDetails;
  } catch (error) {
    console.error("Error fetching albums:", error);
    throw error;
  }
};

export const fetchAlbumTracks = async (albumName: string): Promise<Track[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/${albumName}.json`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.playlist.map((track: any) => ({
      ...track,
      id: track.url,
      albumId: albumName,
    }));
  } catch (error) {
    console.error(`Error fetching album tracks for ${albumName}:`, error);
    throw error;
  }
};
