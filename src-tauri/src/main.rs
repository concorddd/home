// Evita abrir console no release do Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    concord_desktop_lib::run();
}
