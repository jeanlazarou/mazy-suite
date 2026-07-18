import { audioDataStore } from "./AudioDataStore";
import { retryWithBackoff, fetchWithTimeout } from "./RetryHelper";

function FileLoader() {
  const self = {};

  self.loadMetadata = async (url, audiCache, processData, notFound) => {
    const cacheMetadata = audiCache[url];

    const entry = await audioDataStore.getMetadata(url);
    const isNew = entry ? false : true;

    try {
      const response = await retryWithBackoff(
        () => fetchWithTimeout(url, { method: "HEAD" }, 10000),
        { maxRetries: 2, timeout: 10000 }
      );

      if (response.status === 404) {
        notFound(url);
        return;
      }

      const lastModified = response.headers.get("last-modified");

      const insert = async () => {
        await audioDataStore.addMetadata({ id: url, lastModified, isNew });
      };

      insert();

      const data = entry ? entry : {};

      if (data.lastModified !== lastModified || !data.duration) {
        if (cacheMetadata && cacheMetadata.lastModified === lastModified && cacheMetadata.duration) {
          processData(url, cacheMetadata);
          return;
        }

        const newVersion = async () => {
          await audioDataStore.updateMetadata({ id: url, isNew: true });
        };

        newVersion();

        self.load(url, processData, notFound);
      } else {
        processData(url, data);
      }
    } catch (error) {
      console.warn(`Failed to load metadata for ${url}:`, error.message);
      notFound(url);
    }
  };

  self.load = (url, processData, notFound, onRetry = null) => {
    return self.fetch(url, processData, notFound, onRetry);
  };

  self.fetch = (url, processData, notFound, onRetry = null) => {
    retryWithBackoff(
      () => fetchWithTimeout(url, {}, 15000),
      {
        maxRetries: 3,
        timeout: 15000,
        onRetry: (attempt, error, delay) => {
          console.log(
            `Retrying ${url} (attempt ${attempt}/3) after ${delay}ms. Error: ${error.message}`
          );
          if (onRetry) {
            onRetry(url, attempt, delay);
          }
        },
      }
    )
      .then((response) => {
        if (!response.ok) {
          notFound(url);
          return null;
        }

        return response.arrayBuffer();
      })
      .then((data) => {
        if (data) processData(url, data);
      })
      .catch((error) => {
        console.error(`Failed to load ${url} after all retries:`, error.message);
        notFound(url);
      });
  };

  return self;
}

export const loader = new FileLoader();
