// 桌面版入口：Tauri 负责托管 Next.js 静态产物(out/，构建期内嵌进 exe)，
// 本进程在启动期拉起内嵌的 Node AI 服务(apps/server)，前端通过
// http://127.0.0.1:8787 调用在线 AI。未配置 Key 时 AI 能力自动降级为离线内容。
// 资源(server/dist、bin/node、server/package.json)由 tauri.conf.json 的
// bundle.resources 注入到 exe 同级目录。
//
// 系统托盘（tray）：
//   - 托盘菜单：显示主界面 / 在浏览器打开 / 打开日志 / 退出
//   - 左键单击托盘图标唤出主窗口
//   - 点击窗口关闭按钮 = 最小化到托盘（不退出），退出请走托盘菜单「退出」
//
// 安装版注意事项：
//   - AI 服务日志写到用户级目录而非安装目录 —— 装到 Program Files 时普通用户
//     无权写安装目录，且日志残留会让 NSIS 卸载器无法删除目录（见 resolve_log_path）。
//   - 拉起服务前先探活 8787，复用上次强杀/崩溃遗留的孤儿服务，避免 EADDRINUSE
//     （见 probe_ai_server）。
//
// ============================================================
// Windows 子系统（这一行务必保留）
// ============================================================
// 不写 `#![windows_subsystem = "windows"]` 时，rustc 默认按 **console** 子系统
// 链接，双击 exe 会额外弹出一个黑色控制台窗口（里面是 [desktop] 日志），
// 用户看到的就是"多了一个窗口、而且卡住不动"。
// 声明 windows 子系统后控制台消失，副作用是 println!/eprintln! 的输出被操作系统
// 直接丢弃——因此所有排障信息改走 dlog() 写日志文件（与 AI 服务日志同一个文件，
// 托盘菜单「打开运行日志」即可看到全部）。
#![windows_subsystem = "windows"]

use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::Duration;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, WindowEvent};

const AI_PORT: u16 = 8787;
/// 是否正在走「退出」流程（退出时不再拦截窗口关闭事件）
static QUITTING: AtomicBool = AtomicBool::new(false);

/// 日志文件路径。在 setup() 最开始写入，之后 dlog() 才能生效。
static LOG_PATH: OnceLock<PathBuf> = OnceLock::new();

/// Windows：CREATE_NO_WINDOW —— 子进程不分配控制台窗口。
///
/// GUI 进程（windows 子系统）直接 spawn 控制台程序（node.exe / cmd）时，
/// Windows 默认会给子进程**新建一个黑色控制台窗口**（就是那个标题为
/// `...\bin\node.exe` 的黑窗）。加上 0x08000000 后子进程照常运行，
/// 但不会弹出任何窗口。
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// 构造「安静」的子进程命令：Windows 上加 CREATE_NO_WINDOW，其余平台等价于
/// `Command::new`。所有 spawn 都走这里，避免任何黑窗弹出。
#[cfg(windows)]
fn quiet_command(program: impl AsRef<std::ffi::OsStr>) -> Command {
    use std::os::windows::process::CommandExt;
    let mut cmd = Command::new(program);
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

#[cfg(not(windows))]
fn quiet_command(program: impl AsRef<std::ffi::OsStr>) -> Command {
    Command::new(program)
}

/// 追加一行排障日志到用户日志文件。
///
/// 桌面版是 windows 子系统、没有控制台，`println!` 的输出会被操作系统丢弃，
/// 所以统一走这里；与 AI 服务的 stdout/stderr 复用同一文件，方便一处看全。
fn dlog(msg: &str) {
    if let Some(p) = LOG_PATH.get() {
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(p) {
            let _ = writeln!(f, "{}", msg);
        }
    }
}

/// 全局状态：持有内嵌 AI 服务的子进程句柄，退出时统一回收
struct AppState {
    ai_child: Mutex<Option<Child>>,
}

/// 去掉 Windows 扩展长度路径前缀 `\\?\`。
/// Tauri 的 resource_dir() 常返回带该前缀的路径，直接交给 Node 会被误解析
/// （Node 会把 `\\?\E:\...` 当成 `E:`，报 EISDIR）。本项目路径较短，去前缀安全。
fn strip_verbatim(p: &Path) -> PathBuf {
    let s = p.to_string_lossy();
    if let Some(rest) = s.strip_prefix(r"\\?\") {
        PathBuf::from(rest)
    } else {
        p.to_path_buf()
    }
}

/// 用户级日志目录（各平台惯例位置，始终可写）。
fn user_log_dir() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        std::env::var_os("LOCALAPPDATA")
            .map(|d| PathBuf::from(d).join("ChinaStudyFree").join("logs"))
    }
    #[cfg(target_os = "macos")]
    {
        std::env::var_os("HOME").map(|h| PathBuf::from(h).join("Library/Logs/ChinaStudyFree"))
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        if let Some(state) = std::env::var_os("XDG_STATE_HOME") {
            Some(PathBuf::from(state).join("chinastudyfree"))
        } else {
            std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local/state/chinastudyfree"))
        }
    }
}

/// 解析 AI 服务的日志文件路径。
///
/// 优先写入用户目录（`<LOCALAPPDATA>\ChinaStudyFree\logs` 等）：
///   1. 安装到 `C:\Program Files\聪聪学堂` 时，非管理员账户**无权写入安装目录**，
///      旧实现把日志写在 exe 同级，导致普通用户下排障日志为空。
///   2. 日志写在安装目录会让 NSIS 卸载器的 `RMDir`（只能删空目录）失败，
///      卸载后残留 `聪聪学堂\ai-server.log` 与空目录。
/// 仅在用户目录不可用时，才回退到资源目录（便携/绿色版自解压场景）。
fn resolve_log_path(resources: &Path) -> PathBuf {
    if let Some(dir) = user_log_dir() {
        if std::fs::create_dir_all(&dir).is_ok() {
            return dir.join("ai-server.log");
        }
    }
    resources.join("ai-server.log")
}

/// 探活：判断 `127.0.0.1:port` 上是否已有**本项目的** AI 服务在运行。
///
/// 场景：上次以「任务管理器强杀 / 崩溃」方式结束时，Node 子进程会成为孤儿并
/// 继续占用 8787。此时若再次 `spawn`，新进程会 `EADDRINUSE` 启动失败（旧实现
/// 的日志表现为端口冲突）。这里在拉起前先探一次 `/api/health`，命中则直接复用
/// 已有服务，既避免端口冲突，也不会出现两个服务争抢。响应体需含 `"ok":true`，
/// 以免误判占用同一端口的无关程序。
fn probe_ai_server(port: u16) -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(600)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(900)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(900)));
    let req =
        format!("GET /api/health HTTP/1.0\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n");
    if stream.write_all(req.as_bytes()).is_err() {
        return false;
    }
    let mut buf = String::new();
    let _ = stream.read_to_string(&mut buf);
    buf.contains("\"ok\":true")
}

/// 拉起内嵌的 Node AI 服务，返回子进程句柄（失败 / 复用已有服务返回 None）。
fn spawn_ai_server(resource_dir: &PathBuf) -> Option<Child> {
    let resources = strip_verbatim(resource_dir);
    let server_js = resources.join("server").join("dist").join("index.js");

    // 已有可用服务（含上次异常退出遗留的孤儿进程）→ 直接复用，不重复拉起
    if probe_ai_server(AI_PORT) {
        dlog(&format!(
            "[desktop] 127.0.0.1:{AI_PORT} 已有 AI 服务在运行，直接复用（跳过拉起）"
        ));
        return None;
    }

    // 优先使用打包进 resources/bin/ 的 node，其次回退到系统 PATH 中的 node（开发环境）
    let node_candidate = resources
        .join("bin")
        .join(if cfg!(windows) { "node.exe" } else { "node" });
    let node_bin: PathBuf = if node_candidate.exists() {
        node_candidate
    } else {
        PathBuf::from("node")
    };

    dlog(&format!("[desktop] resource_dir = {}", resources.display()));
    dlog(&format!(
        "[desktop] node_bin = {} (exists={})",
        node_bin.display(),
        node_bin.exists()
    ));
    dlog(&format!(
        "[desktop] server_js = {} (exists={})",
        server_js.display(),
        server_js.exists()
    ));

    if !server_js.exists() {
        dlog("[desktop] 未找到 AI 服务端 dist，跳过（仅支持离线内容）");
        return None;
    }

    // 把子进程的 stdout/stderr 落到用户级日志文件，便于排障（见 resolve_log_path）
    let log_path = resolve_log_path(&resources);
    dlog(&format!("[desktop] ai-server 日志 = {}", log_path.display()));
    let out = std::fs::File::create(&log_path).ok();
    let err = out.as_ref().and_then(|f| f.try_clone().ok());

    match quiet_command(&node_bin)
        .arg(&server_js)
        .current_dir(&resources)
        .env("PORT", AI_PORT.to_string())
        .env("HOST", "127.0.0.1")
        .env("STATIC_DIR", resources.join("web").join("out"))
        .env("CORS_ORIGIN", "*")
        .stdout(out.map(Stdio::from).unwrap_or_else(Stdio::null))
        .stderr(err.map(Stdio::from).unwrap_or_else(Stdio::null))
        .spawn()
    {
        Ok(child) => {
            dlog(&format!(
                "[desktop] AI 服务已拉起 (pid={}, port={})",
                child.id(),
                AI_PORT
            ));
            Some(child)
        }
        Err(e) => {
            dlog(&format!(
                "[desktop] 启动 AI 服务失败: {e}（前端将降级为离线内容）"
            ));
            None
        }
    }
}

/// 结束内嵌 AI 服务（幂等）
fn kill_ai_server(app: &AppHandle) {
    if let Some(state) = app.try_state::<AppState>() {
        if let Ok(mut guard) = state.ai_child.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
                let _ = child.wait();
                dlog("[desktop] AI 服务已结束");
            }
        }
    }
}

/// 等待 AI 服务就绪。**只允许在后台线程调用**——
/// 它最多会等 20 秒，若放在 setup() 里同步执行会阻塞主线程的消息循环，
/// 期间窗口会被 Windows 标记为"未响应"，且托盘还没建好，用户体验极差。
fn wait_for_server(port: u16) {
    for i in 0..100 {
        if TcpStream::connect(("127.0.0.1", port)).is_ok() {
            dlog(&format!("[desktop] AI 服务就绪 (port={port}, 第 {i} 次探测)"));
            return;
        }
        thread::sleep(Duration::from_millis(200));
    }
    dlog("[desktop] AI 服务未在预期时间内就绪（可能未配置 Key，或 node 启动失败）");
}

/// 用系统默认程序打开 URL / 文件（Windows 用 start，其余平台用 open/xdg-open）
fn open_external(target: &str) {
    #[cfg(windows)]
    {
        let _ = quiet_command("cmd")
            .args(["/C", "start", "", target])
            .spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("open").arg(target).spawn();
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let _ = Command::new("xdg-open").arg(target).spawn();
    }
}

/// 唤出主窗口（隐藏状态则显示并聚焦）
fn show_main(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let was_visible = win.is_visible().unwrap_or(false);
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
        dlog(&format!(
            "[desktop] 托盘唤出主窗口（此前 visible={was_visible}）"
        ));
    } else {
        dlog("[desktop] 托盘唤出主窗口失败：找不到 main 窗口");
    }
}

/// 构建系统托盘：图标 + 菜单 + 事件
fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let show_i = MenuItem::with_id(app, "show", "显示主界面", true, None::<&str>)?;
    let open_i = MenuItem::with_id(
        app,
        "open_browser",
        "在浏览器中打开（127.0.0.1:8787）",
        true,
        None::<&str>,
    )?;
    let log_i = MenuItem::with_id(app, "open_log", "打开运行日志", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let quit_i = MenuItem::with_id(app, "quit", "退出聪聪学堂", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_i, &open_i, &log_i, &sep1, &sep2, &quit_i])?;

    let mut builder = TrayIconBuilder::with_id("main-tray")
        .tooltip("聪聪学堂 · 免费学 · 小学到大学")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_main(app),
            "open_browser" => open_external(&format!("http://127.0.0.1:{AI_PORT}/")),
            "open_log" => {
                // 日志在用户级目录（安装版）或资源目录（便携版），见 resolve_log_path
                if let Ok(res) = app.path().resource_dir() {
                    let log = resolve_log_path(&strip_verbatim(&res));
                    open_external(&log.to_string_lossy());
                }
            }
            "quit" => {
                QUITTING.store(true, Ordering::SeqCst);
                kill_ai_server(app);
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| match event {
            // 左键单击 / 双击托盘图标 → 唤出主界面
            TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            }
            | TrayIconEvent::DoubleClick {
                button: MouseButton::Left,
                ..
            } => show_main(tray.app_handle()),
            _ => {}
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }
    builder.build(app)?;
    dlog("[desktop] 系统托盘已就绪");
    Ok(())
}

fn main() {
    let app = tauri::Builder::default()
        .manage(AppState {
            ai_child: Mutex::new(None),
        })
        .setup(|app| {
            // ---- 启动顺序很关键 ----
            // 1) 先落日志路径 + 建托盘：保证用户一关窗口就有托盘图标可点，
            //    不会出现"窗口关了、托盘还没建、程序凭空消失"。
            // 2) 再在后台线程拉起 AI 服务：spawn + wait_for_server 最多要等 20 秒，
            //    绝不能放在这里同步执行，否则会阻塞主线程消息循环，窗口直接"未响应"。
            let handle = app.handle().clone();
            match app.path().resource_dir() {
                Ok(res) => {
                    let resources = strip_verbatim(&res);

                    let log_path = resolve_log_path(&resources);
                    let _ = LOG_PATH.set(log_path);
                    dlog("[desktop] 桌面版启动中…");

                    if let Err(e) = setup_tray(&handle) {
                        dlog(&format!("[desktop] 托盘创建失败: {e}"));
                    }

                    thread::spawn(move || {
                        if let Some(child) = spawn_ai_server(&resources) {
                            // 只有自己拉起的进程才持有句柄，退出时回收；
                            // 复用已有服务时不持有，避免误杀别人的进程。
                            if let Some(state) = handle.try_state::<AppState>() {
                                if let Ok(mut guard) = state.ai_child.lock() {
                                    guard.replace(child);
                                }
                            }
                            wait_for_server(AI_PORT);
                        }
                    });
                }
                Err(e) => {
                    eprintln!("[desktop] 无法解析资源目录: {e}（前端将降级为离线内容）");
                }
            }
            Ok(())
        })
        // 关闭窗口 → 最小化到托盘（退出请用托盘菜单）
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if QUITTING.load(Ordering::SeqCst) {
                    dlog("[desktop] 退出流程：放行窗口关闭");
                    return;
                }
                api.prevent_close();
                let _ = window.hide();
                dlog("[desktop] 收到窗口关闭请求 → 已隐藏到托盘（未退出）");
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        // 任何退出路径都保证回收 AI 服务子进程
        if matches!(
            event,
            tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit
        ) {
            kill_ai_server(app_handle);
        }
    });
}
