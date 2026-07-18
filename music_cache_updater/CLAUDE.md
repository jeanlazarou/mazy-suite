# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Music Cache Updater is a Python CLI tool that updates JSON cache files for a music web player. It fetches album metadata from a remote server and updates a local cache with audio file metadata (duration, lastModified, id). The tool solves performance issues with browser-based cache updates by using async HTTP requests.

## Key Commands

**Installation & Setup:**
```bash
poetry install              # Install dependencies
pre-commit install          # Install git hooks
```

**Running the Tool:**
```bash
# Update cache from remote server
poetry run cache-updater http://alef1.org/music/data --cache-file ../data/albums_cache.json

# Preview changes without writing (dry-run)
poetry run cache-updater --dry-run --cache-file albums_cache.json http://example.com/music/data
```

**Code Quality:**
```bash
poetry run black .          # Format code
poetry run isort .          # Sort imports
poetry run mypy .           # Type checking
pre-commit run --all-files  # Run all pre-commit hooks
```

**Testing:**
```bash
poetry run pytest           # Run all tests (when tests exist)
poetry run pytest -v        # Verbose output
```

## Architecture

### Module Organization

- **cli.py**: Command-line interface and argument parsing. Entry point is the `main()` function.
- **core.py**: Core async logic for fetching data, processing albums, and updating cache. Main entry function is `update_cache(config)`.
- **models.py**: Data classes for `AudioFile` and `Album`.
- **config.py**: Configuration dataclass that handles URL construction and path management.

### Data Flow

1. Load remote cache from `<data_url>/albums_cache.json` (fallback to empty if not found)
2. Fetch albums list from `<data_url>/albums.json`
3. For each album, fetch `<data_url>/<album_name>.json` to get playlist
4. For each audio file in playlists:
   - Perform HEAD request to get `Last-Modified` header
   - If file is new, modified, or has duration=0, perform full GET to download file and extract duration using mutagen
   - Otherwise, reuse existing duration from cache
5. Generate change report (new/updated/removed files)
6. Save updated cache to local file (unless `--dry-run`)

### Important Implementation Details

**Rate Limiting & Retry Logic:**
- All HTTP requests include 300ms delay for rate limiting
- Retry logic: 3 attempts with exponential backoff for 429 (rate limit) errors
- Other client errors retry after 1 second

**URL Construction:**
- JSON data files (albums.json, album_name.json, albums_cache.json): fetched from `data_url`
- Audio files (MP3s): fetched from domain root using `base_url` (extracted from `data_url`)
- Example: If `data_url` is `http://example.com/music/data`, audio file `/music/files/song.mp3` is fetched from `http://example.com/music/files/song.mp3`

**Optimization:**
- Only fetches full audio metadata (duration) for new files, modified files, or files with `duration: 0`
- HEAD requests used first to check modification status before downloading
- Full file download required for accurate duration calculation (mutagen needs complete file)

**Rich Console UI:**
- Progress bars for album and file processing
- Color-coded output: cyan (info), yellow (warning), red (error), green (success)
- Changes report displayed in panel at end

## Cache File Format

The cache file is a JSON object where keys are file paths and values contain:
```json
{
  "/music/files/Album/song.mp3": {
    "id": "/music/files/Album/song.mp3",
    "isNew": false,
    "duration": 205.10666666666665,
    "lastModified": "Thu, 26 Oct 2023 14:12:38 GMT"
  }
}
```

## Development Notes

- Python 3.8+ required
- Uses Poetry for dependency management (not pip/requirements.txt)
- Type hints used throughout - mypy configured for type checking
- Pre-commit hooks enforce black formatting and isort import ordering
- Async/await pattern used extensively - be mindful of event loop context
- No test suite currently exists, but pytest is configured in pyproject.toml if tests are added
