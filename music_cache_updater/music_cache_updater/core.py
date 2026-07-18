import json
from pathlib import Path
from typing import Dict, Set, Tuple
import asyncio
import io
import mutagen

import aiohttp
from aiohttp import ClientError
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TaskProgressColumn
from rich.console import Console
from rich.theme import Theme
from rich.panel import Panel

from .config import Config
from .models import Album, AudioFile

# Set up Rich console with custom theme
console = Console(theme=Theme({
    "info": "cyan",
    "warning": "yellow",
    "error": "red",
    "success": "green"
}))

async def fetch_json(session: aiohttp.ClientSession, url: str) -> dict:
    """Fetch and parse JSON from a URL."""
    for attempt in range(3):
        await asyncio.sleep(0.3)  # Rate limiting: 300ms delay
        try:
            async with session.get(url) as response:
                if response.status == 429:
                    await asyncio.sleep(2 ** attempt)
                    continue
                response.raise_for_status()
                return await response.json()
        except ClientError as e:
            if attempt == 2:
                raise
            await asyncio.sleep(1)
    raise Exception(f"Failed to fetch {url} after 3 attempts")

async def get_last_modified(session: aiohttp.ClientSession, config: Config, file_path: str) -> dict:
    """Get last modified date for an audio file."""
    full_url = config.get_audio_url(file_path)
    
    for attempt in range(3):
        await asyncio.sleep(0.3)  # Rate limiting: 300ms delay
        try:
            async with session.head(full_url) as response:
                if response.status == 429:
                    await asyncio.sleep(2 ** attempt)
                    continue
                response.raise_for_status()
                basic_metadata = {
                    "lastModified": response.headers.get('Last-Modified'),
                    "size": int(response.headers.get('Content-Length', 0))
                }
                return basic_metadata
        except ClientError as e:
            if attempt == 2:
                raise
            await asyncio.sleep(1)
    raise Exception(f"Failed to fetch metadata for {full_url} after 3 attempts")

async def get_audio_metadata(session: aiohttp.ClientSession, config: Config, file_path: str) -> dict:
    """Get metadata including duration for an audio file."""
    full_url = config.get_audio_url(file_path)

    for attempt in range(3):
        await asyncio.sleep(0.3)  # Rate limiting: 300ms delay
        try:
            async with session.get(full_url) as response:
                if response.status == 429:
                    await asyncio.sleep(2 ** attempt)
                    continue
                response.raise_for_status()
                data = await response.read()

                try:
                    audio = mutagen.File(io.BytesIO(data))
                    if audio is not None and hasattr(audio, 'info'):
                        duration = audio.info.length
                    else:
                        duration = 0
                except Exception as e:
                    duration = 0

                return {
                    "duration": duration
                }
        except ClientError as e:
            if attempt == 2:
                raise
            await asyncio.sleep(1)
    raise Exception(f"Failed to fetch audio metadata for {full_url} after 3 attempts")

async def process_album(
    session: aiohttp.ClientSession,
    config: Config,
    album_name: str,
    progress: Progress,
    task_id: int
) -> Album:
    """Process a single album and return its data."""
    album_url = config.get_url(f"{album_name}.json")
    album_data = await fetch_json(session, album_url)
    
    files = [
        AudioFile(
            file_path=track["url"],
            title=track["title"]
        )
        for track in album_data.get("playlist", [])
    ]
    
    progress.update(task_id, advance=1)
    return Album(
        name=album_name,
        color=album_data.get("color"),
        files=files
    )

async def load_remote_cache(session: aiohttp.ClientSession, config: Config) -> Dict:
    """Load the cache from the remote server."""
    try:
        with console.status("[info]Fetching remote cache...", spinner="dots"):
            cache_url = config.get_url("albums_cache.json")
            cache_data = await fetch_json(session, cache_url)
            console.print("[success]Remote cache loaded successfully")
            return cache_data
    except ClientError as e:
        console.print("[warning]Remote cache not found or couldn't be fetched, starting fresh")
        return {}

def save_cache(cache_file: Path, cache_data: Dict) -> None:
    """Save the cache data to file."""
    cache_file.write_text(json.dumps(cache_data, indent=2))
    console.print(f"[success]Cache saved to {cache_file}")

async def process_changes(
    session: aiohttp.ClientSession,
    config: Config,
    albums: list[Album],
    existing_cache: Dict
) -> Tuple[Dict, Set[str], Set[str], Set[str]]:
    """Process all files and track changes."""
    new_cache = {}
    new_file_paths = set()
    updated_file_paths = set()
    removed_file_paths = set(existing_cache.keys())
    
    total_files = sum(len(album.files) for album in albums)
    
    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TaskProgressColumn(),
        console=console
    ) as progress:
        process_task = progress.add_task("Processing files", total=total_files)
        
        files_to_process = []
        for album in albums:
            for audio_file in album.files:
                file_path = audio_file.file_path
                removed_file_paths.discard(file_path)
                files_to_process.append(file_path)
        
        for file_path in files_to_process:
            try:
                modification_info = await get_last_modified(session, config, file_path)
                
                is_new = file_path not in existing_cache

                if is_new:
                    new_file_paths.add(file_path)
                    metadata = await get_audio_metadata(session, config, file_path)
                elif existing_cache[file_path]["lastModified"] != modification_info["lastModified"]:
                    updated_file_paths.add(file_path)
                    metadata = await get_audio_metadata(session, config, file_path)
                else:
                    existing_duration = existing_cache[file_path]["duration"]

                    if existing_duration == 0:
                        updated_file_paths.add(file_path)
                        metadata = await get_audio_metadata(session, config, file_path)
                    else:
                        metadata = {"duration": existing_duration}
                
                new_cache[file_path] = {
                    "id": file_path,
                    "isNew": False,
                    "lastModified": modification_info["lastModified"],
                    "duration": metadata["duration"],
                }
                
                progress.advance(process_task)
                
            except ClientError as e:
                full_url = config.get_audio_url(file_path)
                console.print(f"[error]Error processing {full_url}: {e}")
    
    return new_cache, new_file_paths, updated_file_paths, removed_file_paths

def print_changes_report(
    new_file_paths: Set[str],
    updated_file_paths: Set[str],
    removed_file_paths: Set[str]
) -> None:
    """Print a report of all changes."""
    report = []
    report.append(f"New files: {len(new_file_paths)}")
    report.append(f"Updated files: {len(updated_file_paths)}")
    report.append(f"Removed files: {len(removed_file_paths)}")
    
    if new_file_paths:
        report.append("\nNew files:")
        report.extend(f"  {path}" for path in sorted(new_file_paths))
    
    if updated_file_paths:
        report.append("\nUpdated files:")
        report.extend(f"  {path}" for path in sorted(updated_file_paths))
    
    if removed_file_paths:
        report.append("\nRemoved files:")
        report.extend(f"  {path}" for path in sorted(removed_file_paths))
    
    console.print(Panel(
        "\n".join(report),
        title="Changes Report",
        border_style="cyan"
    ))

async def update_cache(config: Config) -> None:
    """Main function to update the cache."""
    async with aiohttp.ClientSession() as session:
        # Load remote cache first
        existing_cache = await load_remote_cache(session, config)
        
        # Fetch albums list
        with console.status("[info]Fetching albums list...", spinner="dots"):
            albums_url = config.get_url("albums.json")
            albums_data = await fetch_json(session, albums_url)
        
        # Process all albums concurrently
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            TaskProgressColumn(),
            console=console
        ) as progress:
            albums_task = progress.add_task("Processing albums", total=len(albums_data))
            albums = []
            for album_data in albums_data:
                album = await process_album(
                    session,
                    config,
                    album_data["name"],
                    progress,
                    albums_task
                )
                albums.append(album)
        
        # Process changes
        new_cache, new_entries, updated_entries, removed_entries = (
            await process_changes(session, config, albums, existing_cache)
        )
        
        # Print report
        print_changes_report(new_entries, updated_entries, removed_entries)
        
        # Save changes if not dry run
        if not config.dry_run:
            save_cache(config.cache_file, new_cache)
            console.print("\n[success]Cache file updated successfully!")
        else:
            console.print("\n[warning]Dry run - no changes made to cache file")