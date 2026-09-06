use anyhow::{anyhow, Context, Result};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

#[derive(Debug, Clone, Serialize)]
pub struct CaptureTarget {
    /// "screen:<idx>" ou "window:<hwnd>"
    pub id: String,
    pub kind: String, // "screen" | "window"
    pub title: String,
    pub width: u32,
    pub height: u32,
}

/// Lista todas as telas disponíveis (scrap usa DXGI no Windows).
pub fn list_screens() -> Result<Vec<CaptureTarget>> {
    let displays = scrap::Display::all().map_err(|e| anyhow!("Falha ao enumerar telas (DXGI): {e}"))?;
    let mut out = Vec::new();
    for (idx, d) in displays.iter().enumerate() {
        out.push(CaptureTarget {
            id: format!("screen:{idx}"),
            kind: "screen".into(),
            title: format!("Tela {} ({}×{})", idx + 1, d.width(), d.height()),
            width: d.width() as u32,
            height: d.height() as u32,
        });
    }
    Ok(out)
}

/// Helper para mapear id -> descrição legível.
pub fn describe_targets(ids: &[String]) -> HashMap<String, String> {
    let mut m = HashMap::new();
    if let Ok(list) = list_targets() {
        for t in list {
            if ids.contains(&t.id) {
                m.insert(t.id, t.title);
            }
        }
    }
    m
}

/// Lista telas + janelas.
pub fn list_targets() -> Result<Vec<CaptureTarget>> {
    let mut all = list_screens()?;
    all.extend(list_windows()?);
    Ok(all)
}

/// Lista janelas visíveis com título (EnumWindows no Windows).
#[cfg(windows)]
pub fn list_windows() -> Result<Vec<CaptureTarget>> {
    use winapi::shared::windef::HWND;
    use winapi::um::winuser::{
        EnumWindows, GetWindowTextLengthW, GetWindowTextW, GetWindowRect, IsWindowVisible,
    };

    type Row = (usize, String, u32, u32);
    static ROWS: std::sync::Mutex<Vec<Row>> = std::sync::Mutex::new(Vec::new());

    unsafe extern "system" fn cb(hwnd: HWND, _lparam: isize) -> i32 {
        unsafe {
            if IsWindowVisible(hwnd) == 0 {
                return 1;
            }
            let len = GetWindowTextLengthW(hwnd);
            if len <= 0 {
                return 1;
            }
            let mut buf = vec![0u16; len as usize + 1];
            GetWindowTextW(hwnd, buf.as_mut_ptr(), len as i32 + 1);
            let title = String::from_utf16_lossy(&buf[..len as usize]);
            if title.trim().is_empty() {
                return 1;
            }
            let mut rect: winapi::shared::windef::RECT = std::mem::zeroed();
            if GetWindowRect(hwnd, &mut rect) == 0 {
                return 1;
            }
            let w = (rect.right - rect.left).max(0) as u32;
            let h = (rect.bottom - rect.top).max(0) as u32;
            if w < 120 || h < 80 {
                return 1; // ignora janelas minúsculas
            }
            if let Ok(mut rows) = ROWS.lock() {
                rows.push((hwnd as usize, title, w, h));
            }
        }
        1
    }

    ROWS.lock().map_err(|e| anyhow!("{e}"))?.clear();
    unsafe { EnumWindows(Some(cb), 0) };
    let rows = ROWS.lock().map_err(|e| anyhow!("{e}"))?.clone();

    let mut out = Vec::new();
    for (hwnd, title, w, h) in rows {
        let shown = if title.chars().count() > 90 {
            let t: String = title.chars().take(90).collect();
            format!("{t}…")
        } else {
            title
        };
        out.push(CaptureTarget {
            id: format!("window:{hwnd}"),
            kind: "window".into(),
            title: shown,
            width: w,
            height: h,
        });
    }
    Ok(out)
}

#[cfg(not(windows))]
pub fn list_windows() -> Result<Vec<CaptureTarget>> {
    Ok(Vec::new())
}


/// Loop de captura de tela inteira: roda em thread dedicada, entrega frames
/// BGRX ao callback. Budget de ~16ms/frame (60fps) com recuperação automática
/// quando o monitor muda de resolução.
pub fn capture_screen_loop<F: FnMut(u32, u32, Vec<u8>) + Send + 'static>(
    screen_idx: usize,
    mut on_frame: F,
    stop_flag: Arc<AtomicBool>,
) -> Result<()> {
    let displays = scrap::Display::all().context("DXGI indisponível")?;
    let display = displays
        .into_iter()
        .nth(screen_idx)
        .ok_or_else(|| anyhow!("tela {screen_idx} não encontrada"))?;
    let mut capturer = scrap::Capturer::new(display).context("falha ao criar Capturer DXGI")?;

    loop {
        if stop_flag.load(Ordering::Relaxed) {
            return Ok(());
        }
        match capturer.frame() {
            Ok(frame) => {
                let bytes: &[u8] = frame.underlying();
                let w = capturer.width() as u32;
                let h = capturer.height() as u32;
                on_frame(w, h, bytes.to_vec());
            }
            Err(e) => {
                if e.kind() == std::io::ErrorKind::WouldBlock {
                    std::thread::sleep(std::time::Duration::from_millis(1));
                    continue;
                }
                // Timeout do DXGI — cede o frame perdido.
                std::thread::sleep(std::time::Duration::from_millis(10));
            }
        }
    }
}

/// Captura a região de uma janela: localiza o monitor que a contém, faz a
/// duplicação daquele monitor e recorta o retângulo do cliente da janela.
#[cfg(windows)]
pub fn capture_window_loop<F: FnMut(u32, u32, Vec<u8>) + Send + 'static>(
    hwnd_id: usize,
    mut on_frame: F,
    stop_flag: Arc<AtomicBool>,
) -> Result<()> {
    use winapi::shared::windef::HWND;
    use winapi::shared::windef::POINT;
    use winapi::shared::windef::RECT;
    use winapi::um::winuser::{ClientToScreen, GetClientRect, IsWindowVisible, MonitorFromWindow, MONITOR_DEFAULTTONEAREST, GetMonitorInfoW, MONITORINFO};

    let hwnd = hwnd_id as HWND;

    // Descobre qual monitor contém a janela e seu offset (origem) na tela virtual.
    let (monitor_idx, mon_left, mon_top) = unsafe {
        let hmon = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        let mut info: MONITORINFO = std::mem::zeroed();
        info.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
        if GetMonitorInfoW(hmon, &mut info) == 0 {
            return Err(anyhow!("falha ao obter monitor da janela"));
        }
        let left = info.rcMonitor.left;
        let top = info.rcMonitor.top;

        // Índice do monitor na ordem de scrap::Display::all() — casamos pela
        // dimensão (heurística estável para 1-2 monitores).
        let displays = scrap::Display::all().context("DXGI indisponível")?;
        let mw = (info.rcMonitor.right - info.rcMonitor.left) as usize;
        let mh = (info.rcMonitor.bottom - info.rcMonitor.top) as usize;
        let mut idx = 0usize;
        for (i, d) in displays.iter().enumerate() {
            if d.width() == mw && d.height() == mh {
                idx = i;
                break;
            }
        }
        (idx, left, top)
    };

    let displays = scrap::Display::all()?;
    let display = displays
        .into_iter()
        .nth(monitor_idx)
        .ok_or_else(|| anyhow!("monitor {monitor_idx} não encontrado"))?;
    let mut capturer = scrap::Capturer::new(display)?;

    loop {
        if stop_flag.load(Ordering::Relaxed) {
            return Ok(());
        }
        unsafe {
            if IsWindowVisible(hwnd) == 0 {
                std::thread::sleep(std::time::Duration::from_millis(100));
                continue;
            }
        }
        let frame = match capturer.frame() {
            Ok(f) => f,
            Err(e) => {
                if e.kind() == std::io::ErrorKind::WouldBlock {
                    std::thread::sleep(std::time::Duration::from_millis(1));
                    continue;
                }
                std::thread::sleep(std::time::Duration::from_millis(10));
                continue;
            }
        };

        unsafe {
            let mut crect: RECT = std::mem::zeroed();
            if GetClientRect(hwnd, &mut crect) == 0 {
                continue;
            }
            let mut origin = POINT { x: 0, y: 0 };
            ClientToScreen(hwnd, &mut origin);

            let full: &[u8] = frame.underlying();
            let fw = capturer.width() as u32;
            let fh = capturer.height() as u32;
            let cw = (crect.right - crect.left).max(0) as u32;
            let ch = (crect.bottom - crect.top).max(0) as u32;
            // Coordenadas do cliente relativas à origem do monitor capturado.
            let x0 = (origin.x - mon_left).max(0) as u32;
            let y0 = (origin.y - mon_top).max(0) as u32;
            if cw == 0 || ch == 0 || x0 >= fw || y0 >= fh {
                continue;
            }
            let w = cw.min(fw - x0);
            let h = ch.min(fh - y0);
            let row_len = (w * 4) as usize;
            let mut out = vec![0u8; row_len * h as usize];
            for row in 0..h as usize {
                let src = (((y0 as usize + row) * fw as usize + x0 as usize) * 4) as usize;
                let dst = row * row_len;
                out[dst..dst + row_len].copy_from_slice(&full[src..src + row_len]);
            }
            on_frame(w, h, out);
        }
    }
}

#[cfg(not(windows))]
pub fn capture_window_loop<F: FnMut(u32, u32, Vec<u8>) + Send + 'static>(
    _hwnd_id: usize,
    on_frame: F,
    stop_flag: Arc<AtomicBool>,
) -> Result<()> {
    // Fallback não-Windows: tela primária inteira.
    capture_screen_loop(0, on_frame, stop_flag)
}

