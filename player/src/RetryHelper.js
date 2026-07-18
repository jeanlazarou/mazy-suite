/**
 * Retry helper with exponential backoff and timeout support.
 *
 * Usage:
 *   const result = await retryWithBackoff(
 *     () => fetch(url),
 *     { maxRetries: 3, timeout: 10000 }
 *   );
 */

const DEFAULT_OPTIONS = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2,
  timeout: 15000, // 15 seconds per attempt
  onRetry: null, // callback(attempt, error, delay)
};

/**
 * Fetches with a timeout by wrapping fetch in AbortController.
 */
export function fetchWithTimeout(url, options = {}, timeout = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  return fetch(url, { ...options, signal: controller.signal })
    .then((response) => {
      clearTimeout(timeoutId);
      return response;
    })
    .catch((error) => {
      clearTimeout(timeoutId);

      // Convert abort error to more descriptive timeout error
      if (error.name === 'AbortError') {
        const timeoutError = new Error(`Request timeout after ${timeout}ms`);
        timeoutError.name = 'TimeoutError';
        throw timeoutError;
      }

      throw error;
    });
}

/**
 * Retries an async operation with exponential backoff.
 *
 * @param {Function} operation - Async function to retry
 * @param {Object} options - Retry configuration
 * @returns {Promise} - Resolves with operation result or rejects after max retries
 */
export async function retryWithBackoff(operation, options = {}) {
  const config = { ...DEFAULT_OPTIONS, ...options };
  let lastError = null;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      // First attempt is immediate, retries have delay
      if (attempt > 0) {
        const delay = Math.min(
          config.initialDelay * Math.pow(config.backoffMultiplier, attempt - 1),
          config.maxDelay
        );

        if (config.onRetry) {
          config.onRetry(attempt, lastError, delay);
        }

        await sleep(delay);
      }

      return await operation();
    } catch (error) {
      lastError = error;

      // If this is the last attempt, don't retry
      if (attempt === config.maxRetries) {
        break;
      }

      // Don't retry on certain permanent errors
      if (shouldNotRetry(error)) {
        break;
      }
    }
  }

  // All retries failed
  throw lastError;
}

/**
 * Determines if an error should not be retried.
 * Don't retry 404s, 403s, etc. - only retry network/timeout errors.
 */
function shouldNotRetry(error) {
  // HTTP errors that shouldn't be retried
  if (error.response) {
    const status = error.response.status;

    // Don't retry 4xx client errors except 408 (timeout) and 429 (rate limit)
    if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
      return true;
    }
  }

  // Don't retry if status is explicitly in error object
  if (error.status) {
    const status = error.status;
    if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
      return true;
    }
  }

  return false;
}

/**
 * Promise-based sleep utility.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const RetryHelper = { retryWithBackoff, fetchWithTimeout };
export default RetryHelper;
