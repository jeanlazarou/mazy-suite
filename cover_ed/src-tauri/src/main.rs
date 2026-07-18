// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use id3::frame::{Picture, PictureType};
use id3::{ErrorKind, Tag, TagLike, Version};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Serialize, Deserialize)]
struct Mp3File {
    path: String,
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    year: Option<i32>,
    cover_art: Option<Vec<u8>>,
}

#[tauri::command]
fn read_directory(path: String) -> Result<Vec<Mp3File>, String> {
    let mut mp3_files = Vec::new();

    for entry in std::fs::read_dir(path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();

        if path.is_file() && path.extension().map_or(false, |ext| ext == "mp3") {
            let tag = match Tag::read_from_path(&path) {
                Ok(tag) => tag,
                Err(_) => Tag::new(),
            };

            let default_title = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("Unknown")
                .to_string();

            let cover_art = tag.pictures().next().map(|pic| pic.data.clone());

            mp3_files.push(Mp3File {
                path: path.to_string_lossy().into_owned(),
                // Use the filename as the default title if no title exists
                title: tag.title().map(String::from).or(Some(default_title)),
                artist: tag.artist().map(String::from),
                album: tag.album().map(String::from),
                year: tag.year(),
                cover_art,
            });
        }
    }

    Ok(mp3_files)
}

#[tauri::command]
async fn update_metadata(
    file_path: String,
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    year: Option<i32>,
) -> Result<(), String> {
    let path = Path::new(&file_path);

    let mut tag = match Tag::read_from_path(path) {
        Ok(tag) => tag,
        Err(err) => match err.kind {
            ErrorKind::NoTag => Tag::new(),
            _ => return Err(format!("Error reading file metadata: {}", err)),
        },
    };

    if let Some(title) = title {
        tag.set_title(title);
    }
    if let Some(artist) = artist {
        tag.set_artist(artist);
    }
    if let Some(album) = album {
        tag.set_album(album);
    }
    if let Some(year) = year {
        tag.set_year(year);
    }

    match tag.write_to_path(path, Version::Id3v24) {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Failed to write metadata: {}", e)),
    }
}

#[tauri::command]
async fn update_cover_art(file_path: String, image_data: Vec<u8>) -> Result<(), String> {
    let path = Path::new(&file_path);

    let mut tag = match Tag::read_from_path(path) {
        Ok(tag) => tag,
        Err(err) => match err.kind {
            ErrorKind::NoTag => Tag::new(),
            _ => return Err(format!("Error reading file metadata: {}", err)),
        },
    };

    let picture = Picture {
        mime_type: "image/jpeg".to_string(),
        picture_type: PictureType::CoverFront,
        description: "Cover".to_string(),
        data: image_data,
    };

    // Remove existing cover art if any
    tag.remove_picture_by_type(PictureType::CoverFront);
    tag.add_frame(picture);

    match tag.write_to_path(path, Version::Id3v24) {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Failed to write cover art: {}", e)),
    }
}

#[tauri::command]
fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

fn main() {
    // mp3_metadata_updater_lib::run()
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            read_directory,
            update_metadata,
            update_cover_art,
            get_version
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
