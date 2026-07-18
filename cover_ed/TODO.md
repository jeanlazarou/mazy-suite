# To do

1. preview and be able to crop the image :ok_hand:
2. crop image to width 500 before saving :ok_hand:
3. bulk update problem: should not contain track title, not sure about authors, but missing cover :ok_hand:
4. year issue, saved as "unkown text information" but id3 crate source code uses the correct tag
5. version display :ok_hand:
6. refactor code  :ok_hand:
7. improve card display  :ok_hand:
8. default to dark mode :ok_hand:
9.  bulk save to test (is `BulkEditOptions` necessary?) :ok_hand:

## No urgent

1. drop image for cover art does not work (on ubuntu)

## Errors/warnings

1. Playback not working:
    The current implementation seems correct. Make sure that the file paths are correctly formatted for your operating system. 
    You might need to use the Tauri API to convert the file path:

    import { convertFileSrc } from '@tauri-apps/api/tauri';

    // In the handlePlayPause function:
    if (audioRef.current) {
    audioRef.current.src = convertFileSrc(file.path);
    audioRef.current.play();
    }

    [Error] Not allowed to load local resource: file:///tmp/test-tmp/song.mp3
2. use of deprecated method `id3::TagLike::add_picture`: Use add_frame(frame::Picture{ .. }) --> src/main.rs:88:9
