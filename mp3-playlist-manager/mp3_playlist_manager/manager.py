from pathlib import Path
from typing import List, Optional

from mutagen.mp3 import MP3
from mutagen.id3 import ID3, TIT2, TALB, TPE1, TRCK, TYER, APIC

from .exceptions import PlaylistManagerError

class PlaylistManager:
    """Manages MP3 playlist operations including metadata and cover art updates."""
    
    def __init__(self, input_dir: str, output_dir: str, playlist_file: Optional[str] = None):
        self.input_dir = Path(input_dir)
        self.output_dir = Path(output_dir)
        self.playlist_file = Path(playlist_file) if playlist_file else None
        
        self._validate_dirs()
        if playlist_file:
            self._validate_playlist_file()

    def _validate_dirs(self) -> None:
        """Validate input and output directories exist and are different."""
        if not self.input_dir.is_dir():
            raise PlaylistManagerError(f"Input directory not found: {self.input_dir}")
        if not self.output_dir.is_dir():
            raise PlaylistManagerError(f"Output directory not found: {self.output_dir}")
        if self.input_dir.resolve() == self.output_dir.resolve():
            raise PlaylistManagerError("Input and output directories cannot be the same")

    def _validate_playlist_file(self) -> None:
        """Validate playlist file exists."""
        if not self.playlist_file or not self.playlist_file.is_file():
            raise PlaylistManagerError(f"Playlist file not found: {self.playlist_file}")

    def _write_metadata(
        self, 
        file_path: Path, 
        album: str, 
        title: str, 
        track_num: int, 
        year: int, 
        artists: List[str]
    ) -> None:
        """Write metadata to MP3 file."""
        try:
            audio = MP3(file_path)
            if not audio.tags:
                audio.tags = ID3()
            
            audio.tags.add(TIT2(encoding=3, text=title))
            audio.tags.add(TALB(encoding=3, text=album))
            audio.tags.add(TPE1(encoding=3, text=", ".join(artists)))
            audio.tags.add(TRCK(encoding=3, text=str(track_num)))
            audio.tags.add(TYER(encoding=3, text=str(year)))
            
            audio.save()
        except Exception as e:
            raise PlaylistManagerError(f"Failed to write metadata: {e}")

    def _add_cover_art(self, file_path: Path, cover_path: Path) -> None:
        """Add cover art to MP3 file."""
        try:
            audio = MP3(file_path)
            if not audio.tags:
                audio.tags = ID3()
            
            with open(cover_path, 'rb') as cover_file:
                mime_type = 'image/jpeg' if cover_path.suffix.lower() == '.jpg' else 'image/png'
                audio.tags.add(
                    APIC(
                        encoding=3,
                        mime=mime_type,
                        type=3,  # Front cover
                        desc='Cover',
                        data=cover_file.read()
                    )
                )
            
            audio.save()
        except Exception as e:
            raise PlaylistManagerError(f"Failed to add cover art: {e}")

    def process_track(
        self,
        source: Path,
        target: Path,
        track_data: dict,
        album: str,
        track_num: int,
        cover_path: Optional[Path] = None
    ) -> None:
        """Process a single track, updating its metadata and optionally adding cover art."""
        try:
            import shutil
            shutil.copy2(source, target)
            
            self._write_metadata(
                target,
                album=album,
                title=track_data["title"],
                track_num=track_num,
                year=int(track_data["creationDate"][:4]),
                artists=track_data["authors"]
            )
            
            if cover_path:
                self._add_cover_art(target, cover_path)
                
        except Exception as e:
            raise PlaylistManagerError(f"Failed to process track {source.name}: {e}")

    def process_playlist(self, cover_path: Optional[Path] = None, verbose: bool = False) -> List[Path]:
        """Process the entire playlist, copying files and updating metadata."""
        import json
        try:
            with open(self.playlist_file) as f:
                data = json.load(f)
        except Exception as e:
            raise PlaylistManagerError(f"Failed to read playlist file: {e}")
            
        album = data["title"]
        tracks = data["playlist"]
        processed_files = []

        for i, track in enumerate(tracks, 1):
            filename = Path(track["url"]).name
            source = self.input_dir / filename
            target = self.output_dir / filename

            if not source.is_file():
                print(f"Warning: Source file not found: {source}")
                continue

            self.process_track(source, target, track, album, i, cover_path)
            processed_files.append(target)
            
            if verbose:
                print(f"Processed: {filename}")
            else:
                print(".", end="", flush=True)

        if not verbose:
            print()  # New line after progress dots
            
        return processed_files