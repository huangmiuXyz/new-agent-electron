use anyhow::Result;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::Deserialize;
use std::io::{Read, Write};
use std::thread;

#[derive(Deserialize)]
#[serde(tag = "type")]
enum Msg {
    Input { data: String },
    Resize { cols: u16, rows: u16 },
}

fn main() -> Result<()> {
    let pty_system = native_pty_system();

    let pair = pty_system.openpty(PtySize {
        rows: 24,
        cols: 80,
        pixel_width: 0,
        pixel_height: 0,
    })?;

    let shell = std::env::var("SHELL").unwrap_or("/bin/zsh".to_string());

    let mut cmd = CommandBuilder::new(shell);
    cmd.arg("-i");
    cmd.set_controlling_tty(true);

    let _child = pair.slave.spawn_command(cmd)?;

    let mut reader = pair.master.try_clone_reader()?;
    let mut writer = pair.master.take_writer()?;

    thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let _ = std::io::stdout().write_all(&buf[..n]);
                    let _ = std::io::stdout().flush();
                }
            }
        }
    });

    let mut stdin = std::io::stdin();
    let mut buf = String::new();

    loop {
        buf.clear();
        if stdin.read_line(&mut buf)? == 0 {
            break;
        }

        if let Ok(msg) = serde_json::from_str::<Msg>(&buf) {
            match msg {
                Msg::Input { data } => {
                    let _ = writer.write_all(data.as_bytes());
                    let _ = writer.flush();
                }
                Msg::Resize { cols, rows } => {
                    let _ = pair.master.resize(PtySize {
                        rows,
                        cols,
                        pixel_width: 0,
                        pixel_height: 0,
                    });
                }
            }
        }
    }

    Ok(())
}
