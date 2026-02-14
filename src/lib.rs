use wasm_bindgen::prelude::*;
use serde::{Deserialize};

#[derive(Deserialize)]
pub struct Room {
    name: String,
    x: f32,
    y: f32,
    width: f32,
    height: f32,
}

#[derive(Deserialize)]
pub struct Blueprint {
    rooms: Vec<Room>,
}

#[wasm_bindgen]
pub fn render_blueprint(json_data: &str) -> String {
    let blueprint: Blueprint =
        serde_json::from_str(json_data).expect("Invalid JSON");

    let mut svg = String::from(
        r#"<svg width="1000" height="800" xmlns="http://www.w3.org/2000/svg">"#
    );

    for room in blueprint.rooms {
        svg.push_str(&format!(
            r#"<rect x="{}" y="{}" width="{}" height="{}"
               fill="none" stroke="black" stroke-width="2"/>"#,
            room.x, room.y, room.width, room.height
        ));

        svg.push_str(&format!(
            r#"<text x="{}" y="{}" font-size="14">{}</text>"#,
            room.x + 10.0,
            room.y + 20.0,
            room.name
        ));
    }

    svg.push_str("</svg>");
    svg
}
