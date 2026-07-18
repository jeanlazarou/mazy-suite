import argparse
import asyncio
import sys
from typing import List

from .core import update_cache
from .config import Config

def parse_args(args: List[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Update music cache file")
    parser.add_argument("data_url", 
                       help="URL to the data folder (e.g., https://example.com/music/data or http://localhost/data)")
    parser.add_argument("--dry-run", action="store_true", 
                       help="Show changes without updating cache file")
    parser.add_argument("--cache-file", default="albums_cache.json",
                       help="Path to cache file (default: albums_cache.json)")
    return parser.parse_args(args)

def main() -> int:
    args = parse_args(sys.argv[1:])
    config = Config(
        data_url=args.data_url,
        cache_file=args.cache_file,
        dry_run=args.dry_run
    )
    
    try:
        asyncio.run(update_cache(config))
        return 0
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

if __name__ == "__main__":
    sys.exit(main())