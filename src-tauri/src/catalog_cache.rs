use base64::{Engine, engine::general_purpose::STANDARD};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    fmt::Write as _,
    fs, io,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

const RECORD_BUDGET: usize = 32 * 1024 * 1024;
const IMAGE_BUDGET: usize = 64 * 1024 * 1024;
const MAX_ENTRIES: usize = 16_384;
const FRAME_IDS: [u32; 6] = [1, 2, 3, 4, 6, 7];
static CACHE_IO: Mutex<()> = Mutex::new(());

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Entry {
    file: String,
    size: usize,
    used: u64,
    expires: Option<u64>,
}

struct Cache {
    dir: PathBuf,
    entries: BTreeMap<String, Entry>,
    now: u64,
    dirty: bool,
}

fn hash(data: &[u8]) -> String {
    let mut text = String::with_capacity(64);
    for byte in Sha256::digest(data) {
        write!(text, "{byte:02x}").expect("write to string");
    }
    text
}

fn atomic_write(path: &Path, content: &[u8]) -> io::Result<()> {
    let temp = path.with_extension("tmp");
    fs::write(&temp, content)?;
    fs::rename(temp, path)
}

impl Cache {
    fn open(dir: PathBuf) -> Self {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;
        let mut entries: BTreeMap<String, Entry> = fs::read(dir.join("index.json"))
            .ok()
            .and_then(|data| serde_json::from_slice(&data).ok())
            .unwrap_or_default();
        let count = entries.len();
        entries.retain(|_, entry| {
            entry.expires.is_none_or(|expires| expires > now)
                && (entry.file.is_empty()
                    || (entry.file.len() == 64
                        && entry.file.as_bytes().iter().all(u8::is_ascii_hexdigit)))
        });
        let dirty = count != entries.len();
        Self {
            dir,
            entries,
            now,
            dirty,
        }
    }

    fn read(&mut self, key: &str) -> Option<Vec<u8>> {
        let entry = self.entries.get_mut(key)?;
        let bytes = if entry.file.is_empty() {
            Ok(Vec::new())
        } else {
            fs::read(self.dir.join(&entry.file))
        };
        self.dirty = true;
        match bytes {
            Ok(data) if data.len() == entry.size => {
                entry.used = self.now;
                Some(data)
            }
            _ => {
                self.entries.remove(key);
                None
            }
        }
    }

    fn trim(&mut self, budget: usize) {
        let mut references = HashMap::new();
        let mut size = 2;
        for (key, entry) in &self.entries {
            // Reserve room for the on-disk index, including each separate image alias.
            size += key.len() + 180;
            let count = references.entry(entry.file.clone()).or_insert(0);
            if *count == 0 {
                size += entry.size;
            }
            *count += 1;
        }
        if size <= budget && self.entries.len() <= MAX_ENTRIES {
            return;
        }
        let mut keys: Vec<_> = self
            .entries
            .iter()
            .map(|(k, e)| (e.used, k.clone()))
            .collect();
        keys.sort_unstable();
        for (_, key) in keys {
            if size <= budget && self.entries.len() <= MAX_ENTRIES {
                break;
            }
            let entry = self.entries.remove(&key).unwrap();
            size -= key.len() + 180;
            let count = references.get_mut(&entry.file).unwrap();
            *count -= 1;
            if *count == 0 {
                size -= entry.size;
            }
        }
    }

    fn commit(&self) -> io::Result<()> {
        if !self.dirty {
            return Ok(());
        }
        fs::create_dir_all(&self.dir)?;
        atomic_write(
            &self.dir.join("index.json"),
            &serde_json::to_vec(&self.entries)?,
        )
    }

    fn store(
        &mut self,
        values: impl IntoIterator<Item = (String, String, Vec<u8>, bool)>,
        budget: usize,
    ) -> io::Result<()> {
        let mut files = HashMap::new();
        for (key, file, bytes, temporary) in values {
            if bytes.len() > budget {
                continue;
            }
            let entry = Entry {
                file: file.clone(),
                size: bytes.len(),
                used: self.now,
                expires: temporary.then_some(self.now + 30_000),
            };
            if !file.is_empty() {
                files.insert(file, bytes);
            }
            self.entries.insert(key, entry);
            self.dirty = true;
        }
        if !self.dirty {
            return Ok(());
        }
        self.trim(budget);
        fs::create_dir_all(&self.dir)?;
        let keep: HashSet<_> = self
            .entries
            .values()
            .map(|entry| entry.file.as_str())
            .collect();
        // The index is swapped atomically. An interrupted write leaves at most disposable
        // misses or unreferenced files; the next write reclaims those files.
        for entry in fs::read_dir(&self.dir)?.flatten() {
            let name = entry.file_name();
            if let Some(name) = name.to_str()
                && name != "index.json"
                && !keep.contains(name)
                && entry.file_type().is_ok_and(|kind| kind.is_file())
            {
                let _ = fs::remove_file(entry.path());
            }
        }
        for (file, bytes) in files {
            if keep.contains(file.as_str()) {
                let path = self.dir.join(file);
                if !path.is_file() || self.dir.ends_with("records") {
                    atomic_write(&path, &bytes)?;
                }
            }
        }
        self.commit()
    }
}

#[derive(Deserialize)]
pub struct Scopes {
    records: String,
    images: String,
}

#[derive(Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedData {
    records: BTreeMap<String, Value>,
    icons: BTreeMap<u32, String>,
    socket_frames: BTreeMap<u32, String>,
    #[serde(default)]
    known_icons: Vec<u32>,
}

// External tags preserve JSON's numeric-key decoding for the image maps.
#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CacheRequest {
    Read {
        scopes: Scopes,
        items: Vec<u32>,
        enchants: Vec<u32>,
        icon_ids: Vec<u32>,
        frames: bool,
    },
    Write {
        scopes: Scopes,
        data: CachedData,
    },
}

fn encode_image(data: &[u8]) -> Option<String> {
    if data.is_empty() {
        return Some(String::new());
    }
    let format = if data.starts_with(b"\x89PNG\r\n\x1a\n") {
        "png"
    } else if data.starts_with(b"\xff\xd8") {
        "jpeg"
    } else {
        return None;
    };
    Some(format!(
        "data:image/{format};base64,{}",
        STANDARD.encode(data)
    ))
}

fn image_values(
    scope: &str,
    kind: &str,
    values: BTreeMap<u32, String>,
) -> impl Iterator<Item = (String, String, Vec<u8>, bool)> {
    values.into_iter().filter_map(move |(id, url)| {
        let key = format!("{scope}:{kind}:{id}");
        if url.is_empty() {
            return Some((key, String::new(), Vec::new(), true));
        }
        let (_, data) = url.split_once(";base64,")?;
        let bytes = STANDARD.decode(data).ok()?;
        Some((key, hash(&bytes), bytes, false))
    })
}

fn exchange(root: &Path, request: CacheRequest) -> io::Result<CachedData> {
    let _guard = CACHE_IO.lock().unwrap_or_else(|err| err.into_inner());
    let mut records = Cache::open(root.join("records"));
    let mut images = Cache::open(root.join("images"));
    let mut result = CachedData::default();
    match request {
        CacheRequest::Read {
            scopes,
            items,
            enchants,
            icon_ids,
            frames,
        } if items.len() <= 2048 && enchants.len() <= 2048 && icon_ids.len() <= 4096 => {
            let record_scope = hash(scopes.records.as_bytes());
            let scope = hash(scopes.images.as_bytes());
            let mut requested: HashSet<_> = icon_ids.into_iter().collect();
            for (kind, ids) in [("item", items), ("enchant", enchants)] {
                for id in ids {
                    let key = format!("{kind}:{id}");
                    if let Some(data) = records.read(&format!("{record_scope}:{key}"))
                        && let Ok(data) = serde_json::from_slice::<Value>(&data)
                    {
                        if kind == "item"
                            && let Some(texture) =
                                data["tables"]["Item"][id.to_string()]["IconFileDataID"]
                                    .as_u64()
                                    .and_then(|v| u32::try_from(v).ok())
                        {
                            requested.insert(texture);
                        }
                        result.records.insert(key, data);
                    }
                }
            }
            let prefix = format!("{scope}:icon:");
            for id in requested {
                if let Some(url) = images
                    .read(&format!("{prefix}{id}"))
                    .and_then(|data| encode_image(&data))
                {
                    result.icons.insert(id, url);
                }
            }
            if frames {
                for id in FRAME_IDS {
                    if let Some(url) = images
                        .read(&format!("{scope}:frame:{id}"))
                        .and_then(|data| encode_image(&data))
                    {
                        result.socket_frames.insert(id, url);
                    }
                }
                result.known_icons.extend(
                    images
                        .entries
                        .keys()
                        .filter_map(|key| key.strip_prefix(&prefix)?.parse::<u32>().ok()),
                );
            }
            let _ = records.commit();
            let _ = images.commit();
        }
        CacheRequest::Write { scopes, data }
            if data.records.len() <= 4096
                && data.icons.len() <= 4096
                && data.socket_frames.len() <= 6 =>
        {
            let record_scope = hash(scopes.records.as_bytes());
            let scope = hash(scopes.images.as_bytes());
            records.store(
                data.records.into_iter().filter_map(|(key, value)| {
                    if key.len() > 20 {
                        return None;
                    }
                    let key = format!("{record_scope}:{key}");
                    let file = hash(key.as_bytes());
                    let temporary = value["incomplete"].as_bool().unwrap_or(true);
                    Some((key, file, serde_json::to_vec(&value).ok()?, temporary))
                }),
                RECORD_BUDGET,
            )?;
            let image_entries = image_values(&scope, "icon", data.icons).chain(image_values(
                &scope,
                "frame",
                data.socket_frames,
            ));
            images.store(image_entries, IMAGE_BUDGET)?;
        }
        _ => {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "invalid catalog cache request",
            ));
        }
    }
    Ok(result)
}

#[tauri::command]
pub async fn inventory_cache(
    app: tauri::AppHandle,
    request: CacheRequest,
) -> Result<CachedData, String> {
    let root = app
        .path()
        .app_cache_dir()
        .map_err(|err| err.to_string())?
        .join("catalog-v1");
    tauri::async_runtime::spawn_blocking(move || exchange(&root, request))
        .await
        .map_err(|err| err.to_string())?
        .map_err(|err| err.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::atomic::{AtomicU32, Ordering};

    #[test]
    fn reads_cache_write_from_ipc_with_numeric_icon_and_socket_keys() {
        let icon = "data:image/jpeg;base64,/9gAAA==";
        let frame = "data:image/png;base64,iVBORw0KGgo=";
        let scopes = || json!({ "records": "test-items", "images": "test-images" });
        let request: CacheRequest = serde_json::from_value(json!({
            "write": {
                "scopes": scopes(),
                "data": { "records": {}, "icons": { "123": icon }, "socketFrames": { "2": frame } }
            }
        }))
        .unwrap();
        let dir = TestDir::new();
        exchange(&dir.0, request).unwrap();
        let request = serde_json::from_value(json!({
            "read": {
                "scopes": scopes(), "items": [], "enchants": [], "icon_ids": [123], "frames": true
            }
        }))
        .unwrap();
        let data = exchange(&dir.0, request).unwrap();
        assert_eq!(data.icons[&123], icon);
        assert_eq!(data.socket_frames[&2], frame);
    }

    struct TestDir(PathBuf);

    impl TestDir {
        fn new() -> Self {
            static NEXT: AtomicU32 = AtomicU32::new(0);
            Self(std::env::temp_dir().join(format!(
                "wtfsync-catalog-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            )))
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn disk_records_are_scoped_and_image_bytes_are_shared() {
        let dir = TestDir::new();
        let scopes = |build: &str, hotfix: &str| Scopes {
            records: format!("{build}:{hotfix}"),
            images: build.to_owned(),
        };
        let url = "data:image/jpeg;base64,/9gAAA==".to_owned();
        for (build, name) in [("retail", "potion"), ("classic", "elixir")] {
            let rows = json!({
                "tables": { "Item": { "30": { "IconFileDataID": 123, "Name": name } } },
                "incomplete": false
            });
            exchange(
                &dir.0,
                CacheRequest::Write {
                    scopes: scopes(build, "old"),
                    data: CachedData {
                        records: BTreeMap::from([("item:30".to_owned(), rows)]),
                        icons: BTreeMap::from([(123, url.clone())]),
                        ..Default::default()
                    },
                },
            )
            .unwrap();
        }
        let read = |build, hotfix| {
            exchange(
                &dir.0,
                CacheRequest::Read {
                    scopes: scopes(build, hotfix),
                    items: vec![30],
                    enchants: vec![],
                    icon_ids: vec![123],
                    frames: true,
                },
            )
            .unwrap()
        };
        for (build, name) in [("retail", "potion"), ("classic", "elixir")] {
            let cached = read(build, "old");
            assert_eq!(
                cached.records["item:30"]["tables"]["Item"]["30"]["Name"],
                name
            );
            assert_eq!(cached.icons[&123], url);
        }
        let updated = read("retail", "new");
        assert!(updated.records.is_empty());
        assert_eq!(updated.icons[&123], url);
        assert!(read("other", "old").icons.is_empty());
        // One image plus its persistent index.
        assert_eq!(fs::read_dir(dir.0.join("images")).unwrap().count(), 2);

        let changed_image = "data:image/jpeg;base64,/9j/AA==".to_owned();
        exchange(
            &dir.0,
            CacheRequest::Write {
                scopes: scopes("other", "old"),
                data: CachedData {
                    icons: BTreeMap::from([(123, changed_image.clone())]),
                    ..Default::default()
                },
            },
        )
        .unwrap();
        assert_eq!(read("other", "old").icons[&123], changed_image);
        assert_eq!(read("retail", "old").icons[&123], url);
        assert_eq!(fs::read_dir(dir.0.join("images")).unwrap().count(), 3);
    }

    #[test]
    fn evicts_old_keys_and_reclaims_unreferenced_payloads() {
        let dir = TestDir::new();
        let mut cache = Cache::open(dir.0.clone());
        let blob_a = hash(b"image-a");
        let blob_b = hash(b"image-b");
        cache.now = 1;
        cache
            .store(
                [
                    ("a".to_owned(), blob_a.clone(), b"image-a".to_vec(), false),
                    ("b".to_owned(), blob_a.clone(), b"image-a".to_vec(), false),
                ],
                400,
            )
            .unwrap();
        cache.now = 2;
        cache.read("b").unwrap();
        cache.now = 3;
        cache
            .store(
                [("c".to_owned(), blob_b.clone(), b"image-b".to_vec(), false)],
                400,
            )
            .unwrap();
        assert!(!cache.entries.contains_key("a"));
        assert!(dir.0.join(&blob_a).is_file());
        cache.now = 4;
        cache
            .store(
                [("d".to_owned(), blob_b.clone(), b"image-b".to_vec(), false)],
                400,
            )
            .unwrap();
        assert!(!dir.0.join(&blob_a).is_file());
        assert!(dir.0.join(&blob_b).is_file());
    }
}
