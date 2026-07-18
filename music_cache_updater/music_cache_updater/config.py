from dataclasses import dataclass
from pathlib import Path
from typing import Union
from urllib.parse import urljoin, urlparse

@dataclass
class Config:
    data_url: str  # URL to the data folder
    cache_file: Union[str, Path]
    dry_run: bool = False

    def __post_init__(self):
        if isinstance(self.cache_file, str):
            self.cache_file = Path(self.cache_file)
        # Ensure data_url ends with a trailing slash
        if not self.data_url.endswith('/'):
            self.data_url += '/'
        
        # Parse the data URL to extract scheme and domain
        parsed = urlparse(self.data_url)
        self.base_url = f"{parsed.scheme}://{parsed.netloc}"

    def get_url(self, path: str) -> str:
        """Generate a complete URL for JSON data files."""
        return urljoin(self.data_url, path)

    def get_audio_url(self, path: str) -> str:
        """Generate a complete URL for audio files.
        
        Audio files are served from the domain root, not the data folder.
        """
        return urljoin(self.base_url, path.lstrip('/'))
