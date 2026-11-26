#[cfg(windows)]
mod windows {
    use base64::{Engine, engine::general_purpose::STANDARD};
    use std::{
        collections::BTreeMap,
        io::{Cursor, Write},
        os::windows::process::CommandExt,
        path::Path,
        process::{Command, Stdio},
    };
    use tauri::Manager;
    use wow_blp::{convert::blp_to_image, parser::load_blp_from_buf};

    use super::{Catalog, CatalogRequest};

    pub(super) fn read(
        app: tauri::AppHandle,
        dir: &Path,
        request: CatalogRequest,
    ) -> Result<Catalog, String> {
        let executable = std::env::current_exe()
            .map_err(|err| err.to_string())?
            .with_file_name("wtfsync-clientdata.exe");
        let resource = app.path().resource_dir().map_err(|err| err.to_string())?;
        let dll = resource.join("CascLib.dll");
        let input = serde_json::to_vec(&request).map_err(|err| err.to_string())?;
        let mut command = Command::new(executable);
        command.arg(dir).arg(dll);
        if let Ok(cache) = app.path().app_cache_dir() {
            command.arg(cache.join("dbd"));
        }
        let mut child = command
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|err| err.to_string())?;
        let wrote = child.stdin.take().expect("piped stdin").write_all(&input);
        let output = child.wait_with_output().map_err(|err| err.to_string())?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_owned());
        }
        wrote.map_err(|err| err.to_string())?;
        let mut catalog: Catalog =
            serde_json::from_slice(&output.stdout).map_err(|err| err.to_string())?;
        let icons: BTreeMap<_, _> = catalog
            .icons
            .into_iter()
            .filter_map(|(id, blp)| decode_icon(&blp).map(|image| (id, image)))
            .collect();
        catalog.icons = icons;
        catalog.socket_frames = crop_socket_frames(
            std::mem::take(&mut catalog.socket_atlases),
            std::mem::take(&mut catalog.socket_regions),
        );
        Ok(catalog)
    }

    fn decode_icon(encoded: &str) -> Option<String> {
        let image = decode_blp(encoded, 512)?;
        encode_icon(&image)
    }

    fn encode_icon(image: &image::DynamicImage) -> Option<String> {
        if image.color().has_alpha() && image.to_rgba8().pixels().any(|pixel| pixel.0[3] != 255) {
            return encode_png(image);
        }
        let mut jpeg = Vec::new();
        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg, 80)
            .encode_image(&image.to_rgb8())
            .ok()?;
        Some(format!("data:image/jpeg;base64,{}", STANDARD.encode(jpeg)))
    }

    fn crop_socket_frames(
        atlases: BTreeMap<u32, String>,
        regions: BTreeMap<u32, super::SocketRegion>,
    ) -> BTreeMap<u32, String> {
        let images: BTreeMap<_, _> = atlases
            .into_iter()
            .filter_map(|(id, blp)| decode_blp(&blp, 2048).map(|image| (id, image)))
            .collect();
        regions
            .into_iter()
            .filter_map(|(socket, region)| {
                let image = images.get(&region.file)?;
                if region.width == 0
                    || region.height == 0
                    || region.left.checked_add(region.width)? > image.width()
                    || region.top.checked_add(region.height)? > image.height()
                {
                    return None;
                }
                let frame = image.crop_imm(region.left, region.top, region.width, region.height);
                encode_png(&frame).map(|png| (socket, png))
            })
            .collect()
    }

    fn decode_blp(encoded: &str, max_size: u32) -> Option<image::DynamicImage> {
        let data = STANDARD.decode(encoded).ok()?;
        if data.get(..4)? != b"BLP2" && data.get(..4)? != b"BLP1" {
            return None;
        }
        // Bound allocations before passing archive data to the texture decoder.
        for offset in [12, 16] {
            let dimension = u32::from_le_bytes(data.get(offset..offset + 4)?.try_into().ok()?);
            if !(1..=max_size).contains(&dimension) {
                return None;
            }
        }
        let blp = load_blp_from_buf(&data).ok()?;
        blp_to_image(&blp, 0).ok()
    }

    fn encode_png(image: &image::DynamicImage) -> Option<String> {
        let mut png = Cursor::new(Vec::new());
        image.write_to(&mut png, image::ImageFormat::Png).ok()?;
        Some(format!(
            "data:image/png;base64,{}",
            STANDARD.encode(png.into_inner())
        ))
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use image::{DynamicImage, Rgba, RgbaImage};

        #[test]
        fn opaque_icons_use_jpeg() {
            let image = DynamicImage::ImageRgba8(RgbaImage::from_pixel(4, 4, Rgba([1, 2, 3, 255])));
            let url = encode_icon(&image).expect("encode image");
            let data = url.strip_prefix("data:image/jpeg;base64,").expect("JPEG");
            let encoded = STANDARD.decode(data).expect("base64");
            let decoded = image::load_from_memory(&encoded).expect("decode JPEG");
            assert_eq!((decoded.width(), decoded.height()), (4, 4));
        }

        #[test]
        fn transparent_icons_keep_the_alpha_channel() {
            let image = DynamicImage::ImageRgba8(RgbaImage::from_pixel(4, 4, Rgba([1, 2, 3, 64])));
            let url = encode_icon(&image).expect("encode image");
            let data = url.strip_prefix("data:image/png;base64,").expect("PNG");
            let encoded = STANDARD.decode(data).expect("base64");
            let decoded = image::load_from_memory(&encoded).expect("decode PNG");
            assert_eq!(decoded.to_rgba8(), image.to_rgba8());
        }
    }
}

use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, path::PathBuf};
use tauri_plugin_fs::FsExt;

#[derive(Deserialize, Serialize)]
pub struct CatalogRequest {
    items: Vec<u32>,
    enchants: Vec<u32>,
    #[serde(default)]
    icon_ids: Vec<u32>,
    #[serde(default)]
    known_icons: Vec<u32>,
    #[serde(default)]
    known_socket_frames: Vec<u32>,
    #[serde(default)]
    socket_art: bool,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Catalog {
    #[serde(default, skip_serializing)]
    socket_atlases: BTreeMap<u32, String>,
    #[serde(default, skip_serializing)]
    socket_regions: BTreeMap<u32, SocketRegion>,
    #[serde(default)]
    socket_frames: BTreeMap<u32, String>,
    tables: serde_json::Value,
    icons: BTreeMap<u32, String>,
    incomplete: bool,
}

#[derive(Deserialize)]
struct SocketRegion {
    file: u32,
    left: u32,
    top: u32,
    width: u32,
    height: u32,
}

#[tauri::command]
pub async fn inventory_catalog(
    app: tauri::AppHandle,
    game_dir: PathBuf,
    request: CatalogRequest,
) -> Result<Catalog, String> {
    if !game_dir.is_absolute()
        || request.items.len() > 2_048
        || request.enchants.len() > 2_048
        || request.icon_ids.len() > 2_048
        || request.known_icons.len() > 16_384
        || request.known_socket_frames.len() > 7
    {
        return Err("invalid local item catalog request".into());
    }
    let dir = game_dir.canonicalize().map_err(|err| err.to_string())?;
    let root = dir.parent().ok_or("missing game installation root")?;
    let scope = app.fs_scope();
    if !scope.is_allowed(dir.join(".flavor.info"))
        || !scope.is_allowed(root.join(".build.info"))
        || !scope.is_allowed(root.join("Data"))
    {
        return Err("game directory is outside the filesystem scope".into());
    }
    #[cfg(windows)]
    {
        tauri::async_runtime::spawn_blocking(move || windows::read(app, &game_dir, request))
            .await
            .map_err(|err| err.to_string())?
    }
    #[cfg(not(windows))]
    Err("local client assets are supported on Windows".into())
}
