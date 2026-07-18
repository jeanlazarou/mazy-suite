from dataclasses import dataclass
from typing import List, Optional

@dataclass
class AudioFile:
    file_path: str
    title: str

@dataclass
class Album:
    name: str
    color: Optional[str]
    files: List[AudioFile]
