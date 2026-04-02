use serde::Serialize;
use std::{
  collections::HashMap,
  env, fs,
  io::Read,
  path::{Path, PathBuf},
  sync::{atomic::{AtomicU64, Ordering}, Mutex},
};
use tauri::{AppHandle, Emitter, Manager, State};

const FILE_OPEN_EVENT: &str = "file-open";

#[derive(Default)]
struct AppState {
  file_streams: Mutex<HashMap<u64, FileStreamSession>>,
  next_stream_id: AtomicU64,
  pending_launch_file: Mutex<Option<OpenFilePayload>>,
}

struct FileStreamSession {
  file: fs::File,
  remaining_bytes: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenFilePayload {
  directory: String,
  name: String,
  path: String,
  size_bytes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FileStreamOpenPayload {
  session_id: u64,
  size_bytes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FileStreamChunkPayload {
  bytes: Vec<u8>,
  done: bool,
}

fn normalize_display_path(path: PathBuf) -> PathBuf {
  #[cfg(windows)]
  {
    let raw = path.to_string_lossy();
    if let Some(stripped) = raw.strip_prefix(r"\\?\UNC\") {
      return PathBuf::from(format!(r"\\{stripped}"));
    }

    if let Some(stripped) = raw.strip_prefix(r"\\?\") {
      return PathBuf::from(stripped);
    }
  }

  path
}

fn is_supported_file(path: &Path) -> bool {
  let normalized = path.to_string_lossy().replace('\\', "/").to_lowercase();
  normalized.ends_with(".ply")
    || normalized.ends_with(".sog")
    || normalized.ends_with(".meta.json")
    || normalized.ends_with(".lod-meta.json")
}

fn allow_scene_scope<R: tauri::Runtime>(app: &AppHandle<R>, file_path: &Path) -> tauri::Result<()> {
  let scope = app.asset_protocol_scope();
  if let Some(directory) = file_path.parent() {
    scope.allow_directory(directory, true)?;
  }
  scope.allow_file(file_path)?;
  Ok(())
}

fn create_open_file_payload<R: tauri::Runtime>(
  app: &AppHandle<R>,
  input_path: impl AsRef<Path>,
) -> Option<OpenFilePayload> {
  let canonical = fs::canonicalize(input_path.as_ref()).ok()?;
  let resolved = normalize_display_path(canonical);

  if !resolved.is_file() || !is_supported_file(&resolved) {
    return None;
  }

  allow_scene_scope(app, &resolved).ok()?;

  Some(OpenFilePayload {
    directory: resolved.parent()?.display().to_string(),
    name: resolved.file_name()?.to_string_lossy().into_owned(),
    path: resolved.display().to_string(),
    size_bytes: fs::metadata(&resolved).ok()?.len(),
  })
}

fn resolve_candidate_path(candidate: &str, cwd: Option<&Path>) -> PathBuf {
  let candidate_path = PathBuf::from(candidate);
  if candidate_path.is_absolute() {
    candidate_path
  } else if let Some(base_dir) = cwd {
    base_dir.join(candidate_path)
  } else {
    candidate_path
  }
}

fn get_launch_file_from_args<R: tauri::Runtime>(
  app: &AppHandle<R>,
  argv: impl IntoIterator<Item = String>,
  cwd: Option<&Path>,
) -> Option<OpenFilePayload> {
  for candidate in argv {
    if candidate.is_empty() || candidate.starts_with('-') {
      continue;
    }

    let resolved_path = resolve_candidate_path(&candidate, cwd);
    if let Some(payload) = create_open_file_payload(app, resolved_path) {
      return Some(payload);
    }
  }

  None
}

#[tauri::command]
fn get_launch_file(state: State<'_, AppState>) -> Option<OpenFilePayload> {
  state.pending_launch_file.lock().ok()?.take()
}

#[tauri::command]
fn resolve_file_path(app: AppHandle, file_path: String) -> Option<OpenFilePayload> {
  create_open_file_payload(&app, file_path)
}

#[tauri::command]
fn open_file_stream(
  app: AppHandle,
  state: State<'_, AppState>,
  file_path: String,
) -> Option<FileStreamOpenPayload> {
  let payload = create_open_file_payload(&app, &file_path)?;
  let file = fs::File::open(&payload.path).ok()?;
  let session_id = state.next_stream_id.fetch_add(1, Ordering::Relaxed) + 1;

  state.file_streams.lock().ok()?.insert(
    session_id,
    FileStreamSession {
      file,
      remaining_bytes: payload.size_bytes,
    },
  );

  Some(FileStreamOpenPayload {
    session_id,
    size_bytes: payload.size_bytes,
  })
}

#[tauri::command]
fn read_file_stream_chunk(
  state: State<'_, AppState>,
  session_id: u64,
  chunk_size: usize,
) -> Option<FileStreamChunkPayload> {
  let mut sessions = state.file_streams.lock().ok()?;
  let session = sessions.get_mut(&session_id)?;

  let safe_chunk_size = chunk_size.clamp(16 * 1024, 512 * 1024);
  if session.remaining_bytes == 0 {
    sessions.remove(&session_id);
    return Some(FileStreamChunkPayload {
      bytes: Vec::new(),
      done: true,
    });
  }

  let requested = usize::try_from(session.remaining_bytes.min(safe_chunk_size as u64)).ok()?;
  let mut buffer = vec![0_u8; requested];
  let bytes_read = session.file.read(&mut buffer).ok()?;
  buffer.truncate(bytes_read);
  session.remaining_bytes = session.remaining_bytes.saturating_sub(bytes_read as u64);

  let done = session.remaining_bytes == 0 || bytes_read == 0;
  if done {
    sessions.remove(&session_id);
  }

  Some(FileStreamChunkPayload {
    bytes: buffer,
    done,
  })
}

#[tauri::command]
fn close_file_stream(state: State<'_, AppState>, session_id: u64) -> bool {
  state
    .file_streams
    .lock()
    .map(|mut sessions| sessions.remove(&session_id).is_some())
    .unwrap_or(false)
}

#[tauri::command]
fn report_renderer_error(message: String) {
  eprintln!("renderer error: {message}");
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
      let launch_cwd = PathBuf::from(cwd);
      if let Some(payload) =
        get_launch_file_from_args(app, argv.into_iter().skip(1), Some(launch_cwd.as_path()))
      {
        let _ = app.emit(FILE_OPEN_EVENT, payload);
      } else if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
      }
    }))
    .plugin(tauri_plugin_dialog::init())
    .manage(AppState::default())
    .setup(|app| {
      let launch_cwd = env::current_dir().ok();
      if let Some(payload) =
        get_launch_file_from_args(app.handle(), env::args().skip(1), launch_cwd.as_deref())
      {
        if let Ok(mut pending) = app.state::<AppState>().pending_launch_file.lock() {
          *pending = Some(payload);
        }
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      close_file_stream,
      get_launch_file,
      open_file_stream,
      read_file_stream_chunk,
      resolve_file_path,
      report_renderer_error
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
