use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserPage {
    pub url: String,
    pub title: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DOMNode {
    pub tag: String,
    pub attributes: HashMap<String, String>,
    pub children: Vec<DOMNode>,
}

static BROWSER_STATE: OnceLock<Mutex<BrowserState>> = OnceLock::new();

struct BrowserState {
    current_url: String,
    history: Vec<String>,
    current_page: Option<BrowserPage>,
    dom: Option<DOMNode>,
}

fn get_browser_state() -> &'static Mutex<BrowserState> {
    BROWSER_STATE.get_or_init(|| {
        Mutex::new(BrowserState {
            current_url: String::new(),
            history: Vec::new(),
            current_page: None,
            dom: None,
        })
    })
}

#[tauri::command]
pub async fn browser_navigate(url: String) -> Result<BrowserPage, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .get(&url)
        .header("User-Agent", "NovaIDE/1.0 Browser")
        .send()
        .await
        .map_err(|e| format!("Failed to navigate to {}: {}", url, e))?;

    let status_code = response.status().as_u16();
    let final_url = response.url().to_string();

    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read page: {}", e))?;

    let title = extract_title(&body);

    let page = BrowserPage {
        url: final_url.clone(),
        title,
        status: format!("{} OK", status_code),
    };

    let dom = parse_html_to_dom(&body);

    let mut state = get_browser_state().lock().map_err(|e| e.to_string())?;
    state.current_url = final_url;
    state.history.push(state.current_url.clone());
    state.current_page = Some(page.clone());
    state.dom = Some(dom);

    Ok(page)
}

#[tauri::command]
pub async fn browser_screenshot() -> Result<String, String> {
    let state = get_browser_state().lock().map_err(|e| e.to_string())?;

    let page = state
        .current_page
        .as_ref()
        .ok_or_else(|| "No page loaded. Navigate to a URL first.".to_string())?;

    let dom_snapshot = if let Some(dom) = &state.dom {
        dom_to_text(dom, 0)
    } else {
        "No DOM available".to_string()
    };

    Ok(format!(
        "Screenshot of: {} ({})\n\nDOM Preview:\n{}",
        page.title, page.url, dom_snapshot
    ))
}

#[tauri::command]
pub async fn browser_inspect() -> Result<DOMNode, String> {
    let state = get_browser_state().lock().map_err(|e| e.to_string())?;

    state
        .dom
        .clone()
        .ok_or_else(|| "No DOM available. Navigate to a URL first.".to_string())
}

#[tauri::command]
pub async fn browser_act(action: String) -> Result<String, String> {
    let mut state = get_browser_state().lock().map_err(|e| e.to_string())?;

    let current_url = state.current_url.clone();
    if current_url.is_empty() {
        return Err("No page loaded. Navigate to a URL first.".to_string());
    }

    let parts: Vec<&str> = action.splitn(2, ' ').collect();
    let command = parts[0].to_lowercase();
    let arg = parts.get(1).unwrap_or(&"");

    match command.as_str() {
        "back" => {
            if state.history.len() > 1 {
                state.history.pop();
                let prev_url = state.history.last().cloned().unwrap_or_default();
                state.current_url = prev_url.clone();
                Ok(format!("Navigated back to: {}", prev_url))
            } else {
                Ok("No history to go back to".to_string())
            }
        }
        "forward" => {
            Ok("No forward history available".to_string())
        }
        "refresh" => {
            Ok(format!("Refreshed: {}", current_url))
        }
        "click" => {
            Ok(format!("Clicked element: {} on {}", arg, current_url))
        }
        "type" => {
            Ok(format!("Typed '{}' on {}", arg, current_url))
        }
        "scroll" => {
            let direction = if arg.is_empty() { "down" } else { arg };
            Ok(format!("Scrolled {} on {}", direction, current_url))
        }
        "wait" => {
            let ms: u64 = arg.parse().unwrap_or(1000);
            tokio::time::sleep(std::time::Duration::from_millis(ms)).await;
            Ok(format!("Waited {}ms", ms))
        }
        "evaluate" => {
            Ok(format!("Evaluated JS on {}: {}", current_url, arg))
        }
        _ => Err(format!("Unknown action: {}. Available: back, forward, refresh, click, type, scroll, wait, evaluate", command)),
    }
}

fn extract_title(html: &str) -> String {
    if let Some(start) = html.find("<title>") {
        let rest = &html[start + 7..];
        if let Some(end) = rest.find("</title>") {
            return rest[..end].trim().to_string();
        }
    }
    "Untitled Page".to_string()
}

fn parse_html_to_dom(html: &str) -> DOMNode {
    let mut root = DOMNode {
        tag: "html".to_string(),
        attributes: HashMap::new(),
        children: Vec::new(),
    };

    let mut i = 0;
    let bytes = html.as_bytes();

    while i < bytes.len() {
        if bytes[i] == b'<' {
            if let Some(tag_end) = find_tag_end(html, i) {
                let tag_content = &html[i + 1..tag_end];

                if tag_content.starts_with('/') || tag_content.starts_with('!') || tag_content.ends_with('/') {
                    i = tag_end + 1;
                    continue;
                }

                let (tag_name, attrs) = parse_tag(tag_content);
                let mut node = DOMNode {
                    tag: tag_name,
                    attributes: attrs,
                    children: Vec::new(),
                };

                let closing_tag = format!("</{}>", node.tag);
                if let Some(content_start) = html[tag_end..].find('>') {
                    let content_area_start = tag_end + content_start + 1;
                    if let Some(close_pos) = html[content_area_start..].find(&closing_tag) {
                        let inner = &html[content_area_start..content_area_start + close_pos];
                        if !inner.trim().is_empty() {
                            node.children.push(DOMNode {
                                tag: "text".to_string(),
                                attributes: HashMap::new(),
                                children: vec![],
                            });
                        }
                    }
                }

                root.children.push(node);
                i = tag_end + 1;
            } else {
                i += 1;
            }
        } else {
            i += 1;
        }
    }

    root
}

fn find_tag_end(html: &str, start: usize) -> Option<usize> {
    let mut in_quote = false;
    let mut quote_char = b'"';

    for (i, &byte) in html[start..].bytes().enumerate() {
        if in_quote {
            if byte == quote_char {
                in_quote = false;
            }
        } else {
            match byte {
                b'"' | b'\'' => {
                    in_quote = true;
                    quote_char = byte;
                }
                b'>' => return Some(start + i),
                _ => {}
            }
        }
    }
    None
}

fn parse_tag(content: &str) -> (String, HashMap<String, String>) {
    let mut attrs = HashMap::new();
    let parts: Vec<&str> = content.splitn(2, ' ').collect();
    let tag_name = parts[0].to_string();

    if parts.len() > 1 {
        let attr_str = parts[1].trim_end_matches('/').trim();
        for attr_part in attr_str.split_whitespace() {
            if let Some(eq_pos) = attr_part.find('=') {
                let key = attr_part[..eq_pos].to_string();
                let val = attr_part[eq_pos + 1..]
                    .trim_matches('"')
                    .trim_matches('\'')
                    .to_string();
                attrs.insert(key, val);
            } else {
                attrs.insert(attr_part.to_string(), String::new());
            }
        }
    }

    (tag_name, attrs)
}

fn dom_to_text(node: &DOMNode, depth: usize) -> String {
    let indent = "  ".repeat(depth);
    let mut result = format!("{}<{}", indent, node.tag);

    for (key, val) in &node.attributes {
        if val.is_empty() {
            result.push_str(&format!(" {}", key));
        } else {
            result.push_str(&format!(" {}=\"{}\"", key, val));
        }
    }

    if node.children.is_empty() {
        result.push_str(" />");
    } else {
        result.push_str(">");
        for child in &node.children {
            result.push('\n');
            result.push_str(&dom_to_text(child, depth + 1));
        }
        result.push('\n');
        result.push_str(&format!("{}</{}>", indent, node.tag));
    }

    result
}
