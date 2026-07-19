import argparse
from pathlib import Path
import sys
from typing import Optional

from .exceptions import PlaylistManagerError
from .manager import PlaylistManager

def create_parser() -> argparse.ArgumentParser:
    """Create the command line argument parser with detailed help messages."""
    # Main parser
    parser = argparse.ArgumentParser(
        description="MP3 Playlist Manager - Update MP3 metadata and cover art based on JSON playlist files",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Update metadata without cover art:
  %(prog)s -d input_dir -o output_dir -l playlist.json list
  
  # Update metadata and add cover art:
  %(prog)s -d input_dir -o output_dir -l playlist.json cover -c cover.jpg
        """
    )

    # Global options
    parser.add_argument(
        "-d", "--dir",
        required=True,
        help="Directory containing the source MP3 files"
    )
    parser.add_argument(
        "-o", "--output-dir",
        required=True,
        help="Directory where processed MP3 files will be saved (must be different from input)"
    )
    parser.add_argument(
        "-l", "--playlist",
        required=True,
        help="JSON playlist file containing track metadata"
    )
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Display detailed progress information"
    )
    
    # Subcommands
    subparsers = parser.add_subparsers(
        dest="command",
        title="commands",
        description="Available operations (use '%(prog)s <command> -h' for detailed help)"
    )
    
    # List command
    list_parser = subparsers.add_parser(
        "list",
        help="Process playlist and update metadata without cover art",
        description="""
Process the playlist file and update MP3 metadata without adding cover art.
This command will:
1. Read the JSON playlist file
2. Copy MP3 files from input to output directory
3. Update metadata (title, album, artists, year) for each track
        """,
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    
    # Cover command
    cover_parser = subparsers.add_parser(
        "cover",
        help="Process playlist, update metadata, and add cover art",
        description="""
Process the playlist file, update MP3 metadata, and add cover art to each track.
This command will:
1. Read the JSON playlist file
2. Copy MP3 files from input to output directory
3. Update metadata (title, album, artists, year) for each track
4. Add the specified cover image to each track

The cover image can be either JPEG or PNG format.
        """,
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    cover_parser.add_argument(
        "-c", "--cover",
        required=True,
        help="Cover image file (JPEG or PNG) to add to the MP3 files"
    )
    
    return parser

def main() -> int:
    """Main entry point for the command line interface."""
    parser = create_parser()
    args = parser.parse_args()
    
    # Show help if no command specified
    if not args.command:
        parser.print_help()
        return 1
    
    try:
        manager = PlaylistManager(args.dir, args.output_dir, args.playlist)
        cover_path: Optional[Path] = None
        
        if args.command == "cover":
            cover_path = Path(args.cover)
            if not cover_path.is_file():
                raise PlaylistManagerError(f"Cover image not found: {cover_path}")
        
        manager.process_playlist(
            cover_path=cover_path,
            verbose=args.verbose
        )
            
    except PlaylistManagerError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"Unexpected error: {e}", file=sys.stderr)
        return 1
    
    return 0

if __name__ == "__main__":
    sys.exit(main())