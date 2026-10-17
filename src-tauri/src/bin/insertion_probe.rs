//! Verification probe for the real insertion path.
//!
//! This is not a test double: it calls the same [`miro_lib::insertion::insert`]
//! the application calls, against a real external application, and then reads
//! the result back out of that application's window to check what actually
//! arrived. It exists so the compatibility matrix in `docs/COMPATIBILITY.md`
//! can contain results rather than intentions.
//!
//! Usage:
//!   insertion_probe.exe --self-test
//!   insertion_probe.exe --launch notepad --text "hello from miro"
//!   insertion_probe.exe --text "into the current window"
//!
//! Exit code 0 means the text arrived intact, 2 means it did not, 1 means the
//! probe could not run (no target, no window, and so on). It never claims more
//! than it observed: if the text cannot be read back, it says so and exits 1.

use std::process::Command;
use std::time::{Duration, Instant};

use windows::core::{BOOL, PWSTR};
use windows::Win32::Foundation::{HWND, LPARAM};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP,
    VK_MENU,
};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumChildWindows, EnumWindows, GetClassNameW, GetForegroundWindow, GetWindowTextLengthW,
    GetWindowTextW, IsWindowVisible, SetForegroundWindow,
};

use miro_lib::insertion::{self, Target};

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let mut launch: Option<String> = None;
    let mut text = "miro insertion probe: the quick brown fox jumps over the lazy dog 1234567890".to_string();
    let mut settle_ms = 400u64;
    let mut force = false;

    let mut index = 1;
    while index < args.len() {
        match args[index].as_str() {
            "--self-test" => {
                run_self_test();
                return;
            }
            "--launch" => {
                index += 1;
                launch = args.get(index).cloned();
            }
            "--text" => {
                index += 1;
                if let Some(value) = args.get(index) {
                    text = value.clone();
                }
            }
            "--settle-ms" => {
                index += 1;
                if let Some(value) = args.get(index).and_then(|v| v.parse::<u64>().ok()) {
                    settle_ms = value;
                }
            }
            "--force-foreground" => force = true,
            other => {
                eprintln!("unknown argument: {other}");
                std::process::exit(1);
            }
        }
        index += 1;
    }

    let child = match launch.as_deref() {
        Some("notepad") => match Command::new("notepad.exe").spawn() {
            Ok(child) => Some(child),
            Err(error) => {
                eprintln!("FAIL: notepad could not be started: {error}");
                std::process::exit(1);
            }
        },
        // A self-hosted Win32 EDIT control: dependable on Windows 11 where the
        // store Notepad is single-instance and its XAML editor cannot be read
        // back with window text.
        Some("textbox") => {
            let script = r#"
Add-Type -AssemblyName System.Windows.Forms
$f = New-Object System.Windows.Forms.Form
$f.Text = 'MiroProbeTarget'
$f.Width = 400
$f.Height = 200
$t = New-Object System.Windows.Forms.TextBox
$t.Multiline = $true
$t.TabIndex = 0
$t.Dock = 'Fill'
$f.Controls.Add($t)
$f.ActiveControl = $t
$f.Add_Shown({ $f.Activate(); $t.Focus(); $t.SelectAll() })
$state = Join-Path $env:LOCALAPPDATA 'Temp\opencode\textbox_state.txt'
Remove-Item $state -ErrorAction SilentlyContinue
$ticker = New-Object System.Windows.Forms.Timer
$ticker.Interval = 7000
$ticker.add_Tick({
  [System.IO.File]::WriteAllText($state, "focused=$($t.Focused) formsare=$FALSE text=[$($t.Text)]")
  $f.Close()
})
$ticker.Start()
[void]$f.ShowDialog()
"#;
            match Command::new("powershell")
                .args(["-NoProfile", "-WindowStyle", "Hidden", "-STA", "-Command", script])
                .spawn()
            {
                Ok(child) => Some(child),
                Err(error) => {
                    eprintln!("FAIL: the textbox target could not be started: {error}");
                    std::process::exit(1);
                }
            }
        }
        Some(other) => {
            eprintln!("FAIL: unknown launcher {other}");
            std::process::exit(1);
        }
        None => None,
    };

    // Give the application time to create its window, then find and focus it.
    let target_window = if child.is_some() {
        let deadline = Instant::now() + Duration::from_secs(10);
        loop {
            if let Some(window) = find_window_of_process(child.as_ref().map(|c| c.id())) {
                break Some(window);
            }
            if Instant::now() > deadline {
                break None;
            }
            std::thread::sleep(Duration::from_millis(200));
        }
    } else {
        let hwnd = unsafe { GetForegroundWindow() };
        (!hwnd.0.is_null()).then_some(hwnd)
    };

    let Some(target_window) = target_window else {
        eprintln!("FAIL: no target window was found");
        let _ = child.map(|mut c| c.kill());
        std::process::exit(1);
    };

    if force || child.is_some() {
        let mut brought = unsafe { GetForegroundWindow() }.0 as isize == target_window.0 as isize;
        // Foreground acquisition is refused to background processes; the first
        // AttachThreadInput/SetWindowPos attempt usually earns permission and a
        // retry then succeeds. Try for ~5 s before giving up with a diagnostic.
        for _ in 0..33 {
            if brought {
                break;
            }
            brought = bring_to_foreground(target_window);
            std::thread::sleep(Duration::from_millis(150));
        }
        if !brought {
            eprintln!(
                "WARN: the target window could not be brought to the foreground; foreground is class {}",
                class_name(unsafe { GetForegroundWindow() })
            );
        }
        std::thread::sleep(Duration::from_millis(300));
    }

    println!("target window class: {}", class_name(target_window));
    println!("expected text: {text:?} ({} characters)", text.chars().count());

    let target = match Target::capture_foreground() {
        Ok(target) => target,
        Err(error) => {
            eprintln!("FAIL: no foreground window: {error}");
            let _ = child.map(|mut c| c.kill());
            std::process::exit(1);
        }
    };
    if target.hwnd != target_window.0 as isize {
        eprintln!(
            "WARN: the foreground window is not the one the probe prepared (class {})",
            class_name(HWND(target.hwnd as _))
        );
    }

    let insertion = insertion::insert(&text, target);

    match insertion {
        Ok(outcome) => {
            println!(
                "insertion: ok via {:?}, {} characters, clipboard restored: {}",
                outcome.method, outcome.characters, outcome.clipboard_restored
            );
        }
        Err(error) => {
            println!("insertion: FAILED (code {:?})", error.code());
            // Even a failure is useful here: the matrix records it.
            let _ = child.map(|mut c| c.kill());
            std::process::exit(2);
        }
    }

    std::thread::sleep(Duration::from_millis(settle_ms));

    match read_back(target_window) {
        Some(observed) => {
            let normalised_expected = normalise(&text);
            let normalised_observed = normalise(&observed);
            if normalised_observed.contains(&normalised_expected) {
                println!("read back: MATCH ({} characters observed)", observed.chars().count());
                let _ = child.map(|mut c| c.kill());
                std::process::exit(0);
            }
            println!(
                "read back: MISMATCH\nexpected: {normalised_expected:?}\nobserved: {normalised_observed:?}"
            );
            let _ = child.map(|mut c| c.kill());
            std::process::exit(2);
        }
        None => {
            println!(
                "read back: UNAVAILABLE - the text was sent but this probe cannot read that window"
            );
            let _ = child.map(|mut c| c.kill());
            std::process::exit(1);
        }
    }
}

fn normalise(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Prints what the probe can verify without touching another application.
fn run_self_test() {
    use miro_lib::insertion::win::plan_batches;

    let units: Vec<u16> = "hi \u{1F600}".encode_utf16().collect();
    let ranges = plan_batches(&units, 2);
    let covered: usize = ranges.iter().map(|(a, b)| b - a).sum();
    assert_eq!(covered, units.len());

    for (start, end) in &ranges {
        let first = units[*start];
        let last = units[end - 1];
        assert!(
            !(0xD800..=0xDBFF).contains(&last),
            "a batch must not end on an unpaired high surrogate"
        );
        assert!(
            !(0xDC00..=0xDFFF).contains(&first),
            "a batch must not start on an unpaired low surrogate"
        );
    }

    println!("self-test: ok ({} units in {} batches)", units.len(), ranges.len());
}

fn find_window_of_process(pid: Option<u32>) -> Option<HWND> {
    let Some(pid) = pid else {
        return None;
    };
    let mut found: HWND = HWND::default();
    let mut search = SearchState { pid, result: None };

    unsafe {
        let _ = EnumWindows(Some(enum_windows_proc), LPARAM(&mut search as *mut _ as isize));
    }
    if let Some(hwnd) = search.result {
        found = hwnd;
    }
    if found.0.is_null() {
        None
    } else {
        Some(found)
    }
}

struct SearchState {
    pid: u32,
    result: Option<HWND>,
}

unsafe extern "system" fn enum_windows_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let state = unsafe { &mut *(lparam.0 as *mut SearchState) };
    if !unsafe { IsWindowVisible(hwnd) }.as_bool() {
        return BOOL(1);
    }
    let name = class_name(hwnd);
    // Hidden console windows of child processes are of no interest here.
    if name == "ConsoleWindowClass" {
        return BOOL(1);
    }
    let mut window_pid = 0u32;
    unsafe { windows::Win32::UI::WindowsAndMessaging::GetWindowThreadProcessId(hwnd, Some(&mut window_pid)) };
    if window_pid == state.pid {
        state.result = Some(hwnd);
        return BOOL(0);
    }
    BOOL(1)
}

fn bring_to_foreground(hwnd: HWND) -> bool {
    // A background process cannot normally take the foreground; tapping ALT
    // while typing is undetectable to the modifier state of the target and the
    // documented allowance for taking focus then applies.
    tap_alt();
    unsafe {
        let foreground = GetForegroundWindow();
        let mut foreground_pid = 0u32;
        let mut target_pid = 0u32;
        windows::Win32::UI::WindowsAndMessaging::GetWindowThreadProcessId(
            foreground,
            Some(&mut foreground_pid),
        );
        windows::Win32::UI::WindowsAndMessaging::GetWindowThreadProcessId(hwnd, Some(&mut target_pid));

        let current = windows::Win32::System::Threading::GetCurrentThreadId();
        let mut attached = Vec::new();
        for thread in [foreground_pid, target_pid] {
            if thread != 0 && thread != current {
                if unsafe {
                    windows::Win32::System::Threading::AttachThreadInput(current, thread, true)
                }
                .as_bool()
                {
                    attached.push(thread);
                }
            }
        }

        let _ = windows::Win32::UI::WindowsAndMessaging::SetWindowPos(
            hwnd,
            Some(windows::Win32::UI::WindowsAndMessaging::HWND_TOP),
            0,
            0,
            0,
            0,
            windows::Win32::UI::WindowsAndMessaging::SWP_NOMOVE
                | windows::Win32::UI::WindowsAndMessaging::SWP_NOSIZE
                | windows::Win32::UI::WindowsAndMessaging::SWP_SHOWWINDOW,
        );
        let focused = SetForegroundWindow(hwnd).as_bool();

        for thread in attached {
            let _ = unsafe {
                windows::Win32::System::Threading::AttachThreadInput(current, thread, false)
            };
        }
        focused
    }
}

fn class_name(hwnd: HWND) -> String {
    let mut buffer = [0u16; 128];
    let length = unsafe { GetClassNameW(hwnd, &mut buffer) };
    if length <= 0 {
        return String::new();
    }
    String::from_utf16_lossy(&buffer[..length as usize])
}

fn window_text(hwnd: HWND) -> Option<String> {
    let length = unsafe { GetWindowTextLengthW(hwnd) };
    if length <= 0 {
        return None;
    }
    let mut buffer = vec![0u16; length as usize + 1];
    let written = unsafe { GetWindowTextW(hwnd, &mut buffer) };
    if written <= 0 {
        return None;
    }
    Some(String::from_utf16_lossy(&buffer[..written as usize]))
}

/// A synthetic ALT tap earns a background process the right to take the
/// foreground for one window (the focus-stealing allowance).
fn tap_alt() {
    let press = INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: VK_MENU,
                wScan: 0,
                dwFlags: KEYBD_EVENT_FLAGS(0),
                time: 0,
                dwExtraInfo: 0,
            },
        },
    };
    let mut release = press;
    release.Anonymous.ki.dwFlags = KEYEVENTF_KEYUP;
    unsafe {
        SendInput(&[press, release], std::mem::size_of::<INPUT>() as i32);
    }
}

/// Reads the window's own text, and the text of its children: editors that keep
/// their content in a child control (Notepad included) report it there.
fn read_back(hwnd: HWND) -> Option<String> {
    let mut collected = Vec::new();
    if let Some(text) = window_text(hwnd) {
        if !text.trim().is_empty() {
            collected.push(text);
        }
    }

    let mut children = ChildSearch {
        texts: Vec::new(),
        visited: 0,
    };
    unsafe {
        let _ = EnumChildWindows(
            Some(hwnd),
            Some(enum_child_proc),
            LPARAM(&mut children as *mut _ as isize),
        );
    }
    collected.extend(children.texts);

    if collected.is_empty() {
        None
    } else {
        Some(collected.join("\n"))
    }
}

struct ChildSearch {
    texts: Vec<String>,
    visited: usize,
}

unsafe extern "system" fn enum_child_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let state = unsafe { &mut *(lparam.0 as *mut ChildSearch) };
    state.visited += 1;
    if state.visited > 200 {
        return BOOL(0);
    }
    if let Some(text) = window_text(hwnd) {
        if !text.trim().is_empty() {
            state.texts.push(text);
        }
    }
    BOOL(1)
}

#[allow(dead_code)]
fn keep_imports_visible(pointer: PWSTR) {
    let _ = pointer;
}
