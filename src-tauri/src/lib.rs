use serde::Serialize;
use std::{
  collections::HashMap,
  env, fs,
  io::{BufRead, BufReader, Read, Write},
  net::{TcpListener, TcpStream},
  path::{Path, PathBuf},
  sync::{
    atomic::{AtomicU64, Ordering},
    Arc, Mutex,
  },
  thread,
  time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager, State};

const FILE_OPEN_EVENT: &str = "file-open";

struct AppState {
  local_http_streams: Arc<Mutex<HashMap<u64, LocalHttpStreamSession>>>,
  local_http_server: LocalHttpServer,
  pending_launch_file: Mutex<Option<OpenFilePayload>>,
}

impl AppState {
  fn new() -> std::io::Result<Self> {
    let local_http_streams = Arc::new(Mutex::new(HashMap::new()));
    let local_http_server = LocalHttpServer::start(local_http_streams.clone())?;

    Ok(Self {
      local_http_streams,
      local_http_server,
      pending_launch_file: Mutex::new(None),
    })
  }
}

struct LocalHttpServer {
  base_url: String,
  next_session_id: AtomicU64,
  session_token: String,
}

struct LocalHttpStreamSession {
  content_type: &'static str,
  path: PathBuf,
  size_bytes: u64,
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
struct LocalHttpStreamOpenPayload {
  session_id: u64,
  stream_url: String,
  size_bytes: u64,
}

impl LocalHttpServer {
  fn start(
    streams: Arc<Mutex<HashMap<u64, LocalHttpStreamSession>>>,
  ) -> std::io::Result<Self> {
    let listener = TcpListener::bind(("127.0.0.1", 0))?;
    listener.set_nonblocking(false)?;
    let port = listener.local_addr()?.port();
    let session_token = format!(
      "{:x}-{:x}-{}",
      SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos(),
      std::process::id(),
      port
    );
    let server_token = session_token.clone();

    thread::spawn(move || {
      for incoming in listener.incoming() {
        match incoming {
          Ok(stream) => {
            let token = server_token.clone();
            let request_streams = streams.clone();
            thread::spawn(move || {
              let _ = handle_local_http_client(stream, request_streams, &token);
            });
          }
          Err(error) => {
            eprintln!("local http accept error: {error}");
            thread::sleep(Duration::from_millis(50));
          }
        }
      }
    });

    Ok(Self {
      base_url: format!("http://127.0.0.1:{port}"),
      next_session_id: AtomicU64::new(0),
      session_token,
    })
  }

  fn register_stream(
    &self,
    streams: &Arc<Mutex<HashMap<u64, LocalHttpStreamSession>>>,
    payload: &OpenFilePayload,
  ) -> Option<LocalHttpStreamOpenPayload> {
    let session_id = self.next_session_id.fetch_add(1, Ordering::Relaxed) + 1;
    let stream = LocalHttpStreamSession {
      content_type: get_content_type_for_name(&payload.name),
      path: PathBuf::from(&payload.path),
      size_bytes: payload.size_bytes,
    };

    streams.lock().ok()?.insert(session_id, stream);

    Some(LocalHttpStreamOpenPayload {
      session_id,
      stream_url: format!(
        "{}/scene/{}/{}/{}",
        self.base_url,
        session_id,
        self.session_token,
        encode_path_segment(&payload.name)
      ),
      size_bytes: payload.size_bytes,
    })
  }
}

fn get_content_type_for_name(file_name: &str) -> &'static str {
  let normalized = file_name.replace('\\', "/").to_lowercase();
  if normalized.ends_with(".ply") {
    "application/octet-stream"
  } else if normalized.ends_with(".sog") {
    "application/octet-stream"
  } else if normalized.ends_with(".meta.json") || normalized.ends_with(".lod-meta.json") {
    "application/json"
  } else {
    "application/octet-stream"
  }
}

fn encode_path_segment(value: &str) -> String {
  let mut encoded = String::with_capacity(value.len());
  for byte in value.as_bytes() {
    let ch = *byte as char;
    if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.' | '~') {
      encoded.push(ch);
    } else {
      encoded.push_str(&format!("%{:02X}", byte));
    }
  }
  encoded
}

fn write_http_response(
  stream: &mut TcpStream,
  status: &str,
  content_type: &str,
  content_length: Option<u64>,
  body: &[u8],
) -> std::io::Result<()> {
  let mut headers = format!(
    "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, OPTIONS\r\nAccess-Control-Allow-Headers: *\r\nCache-Control: no-store\r\nConnection: close\r\n"
  );

  if let Some(length) = content_length {
    headers.push_str(&format!("Content-Length: {length}\r\n"));
  }

  headers.push_str("\r\n");
  stream.write_all(headers.as_bytes())?;
  if !body.is_empty() {
    stream.write_all(body)?;
  }
  stream.flush()
}

fn stream_scene_file(
  stream: &mut TcpStream,
  scene: LocalHttpStreamSession,
) -> std::io::Result<()> {
  let mut file = fs::File::open(&scene.path)?;
  let headers = format!(
    "HTTP/1.1 200 OK\r\nContent-Type: {}\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, OPTIONS\r\nAccess-Control-Allow-Headers: *\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n",
    scene.content_type, scene.size_bytes
  );
  stream.write_all(headers.as_bytes())?;

  let mut buffer = vec![0_u8; 1024 * 1024];
  loop {
    let read = file.read(&mut buffer)?;
    if read == 0 {
      break;
    }
    stream.write_all(&buffer[..read])?;
  }

  stream.flush()
}

fn handle_local_http_client(
  mut stream: TcpStream,
  streams: Arc<Mutex<HashMap<u64, LocalHttpStreamSession>>>,
  session_token: &str,
) -> std::io::Result<()> {
  stream.set_read_timeout(Some(Duration::from_secs(5)))?;
  stream.set_write_timeout(Some(Duration::from_secs(30)))?;

  let mut reader = BufReader::new(stream.try_clone()?);
  let mut request_line = String::new();
  reader.read_line(&mut request_line)?;

  if request_line.trim().is_empty() {
    return Ok(());
  }

  let mut request_parts = request_line.split_whitespace();
  let method = request_parts.next().unwrap_or_default();
  let target = request_parts.next().unwrap_or_default();

  loop {
    let mut line = String::new();
    reader.read_line(&mut line)?;
    if line == "\r\n" || line == "\n" || line.is_empty() {
      break;
    }
  }

  if method.eq_ignore_ascii_case("OPTIONS") {
    return write_http_response(&mut stream, "204 No Content", "text/plain", Some(0), b"");
  }

  if !method.eq_ignore_ascii_case("GET") {
    return write_http_response(
      &mut stream,
      "405 Method Not Allowed",
      "text/plain; charset=utf-8",
      Some(18),
      b"Method Not Allowed",
    );
  }

  let path = target.split('?').next().unwrap_or_default();
  let Some(route) = path.strip_prefix("/scene/") else {
    return write_http_response(
      &mut stream,
      "404 Not Found",
      "text/plain; charset=utf-8",
      Some(9),
      b"Not Found",
    );
  };
  let mut route_parts = route.split('/');
  let Some(session_id_text) = route_parts.next() else {
    return write_http_response(
      &mut stream,
      "400 Bad Request",
      "text/plain; charset=utf-8",
      Some(11),
      b"Bad Request",
    );
  };
  let Some(token) = route_parts.next() else {
    return write_http_response(
      &mut stream,
      "403 Forbidden",
      "text/plain; charset=utf-8",
      Some(9),
      b"Forbidden",
    );
  };

  if token != session_token {
    return write_http_response(
      &mut stream,
      "403 Forbidden",
      "text/plain; charset=utf-8",
      Some(9),
      b"Forbidden",
    );
  }

  let Ok(session_id) = session_id_text.parse::<u64>() else {
    return write_http_response(
      &mut stream,
      "400 Bad Request",
      "text/plain; charset=utf-8",
      Some(11),
      b"Bad Request",
    );
  };

  let scene = match streams.lock() {
    Ok(mut guard) => guard.remove(&session_id),
    Err(_) => None,
  };

  let Some(scene) = scene else {
    return write_http_response(
      &mut stream,
      "404 Not Found",
      "text/plain; charset=utf-8",
      Some(9),
      b"Not Found",
    );
  };

  stream_scene_file(&mut stream, scene)
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
fn open_local_http_stream(
  app: AppHandle,
  state: State<'_, AppState>,
  file_path: String,
) -> Option<LocalHttpStreamOpenPayload> {
  let payload = create_open_file_payload(&app, &file_path)?;
  state
    .local_http_server
    .register_stream(&state.local_http_streams, &payload)
}

#[tauri::command]
fn close_local_http_stream(state: State<'_, AppState>, session_id: u64) -> bool {
  state
    .local_http_streams
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
  let app_state = AppState::new().expect("failed to initialize localhost streaming server");
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
    .manage(app_state)
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
      close_local_http_stream,
      get_launch_file,
      open_local_http_stream,
      resolve_file_path,
      report_renderer_error
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
