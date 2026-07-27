//! 笔记解析:拆 frontmatter、取标题、提取 wikilink。
//!
//! 纯函数、IO-free、零依赖。TDD:测试先行(见模块末 `#[cfg(test)]`)。
//! frontmatter 此处只拆出原始 YAML 文本;YAML→map 的解析放到后续 `index` 切片(届时引入 serde_yaml)。

/// 一条 wikilink。解析阶段只产出"原始文本目标";解析为具体 VaultPath 的工作在 `graph` 模块
/// (那里才知道全 vault 有哪些标题/路径可匹配)。
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct Link {
    /// `[[target]]` 里的 target(已 trim)。如 "Alpha"、"projects/beta"。
    pub target: String,
    /// `[[target|display]]` 里的 display,无则 None。
    pub display: Option<String>,
    /// `[[target#anchor]]` 里的 anchor(小标题),无则 None。
    pub anchor: Option<String>,
}

/// 解析后的笔记(IO-free 数据载体)。
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct ParsedNote {
    pub path: String,
    pub title: String,
    /// frontmatter 的原始 YAML 文本(未解析);无 frontmatter 则 None。
    pub frontmatter: Option<String>,
    /// 去掉 frontmatter 块后的正文。
    pub body: String,
    /// 从正文中提取的 wikilink。
    pub links: Vec<Link>,
}

/// 拆分 frontmatter。
///
/// frontmatter 是文件**开头**的 `---\n ... \n---` 块。返回 (原始 YAML 文本, 去块后的正文)。
/// 非文件开头的 `---`(如正文里的分隔线)、或开头但无闭合 `---` 的,都视为**无** frontmatter。
pub fn split_frontmatter(content: &str) -> (Option<String>, String) {
    // 按行(保留行尾 \n)切;首行必须是 "---"。
    let lines: Vec<&str> = content.split_inclusive('\n').collect();
    if lines.is_empty() || strip_eol(lines[0]) != "---" {
        return (None, content.to_string());
    }
    // 找闭合的 "---" 行。
    for i in 1..lines.len() {
        if strip_eol(lines[i]) == "---" {
            let yaml = (1..i)
                .map(|j| strip_eol(lines[j]).to_string())
                .collect::<Vec<_>>()
                .join("\n");
            let body: String = lines[i + 1..].concat();
            return (Some(yaml), body);
        }
    }
    // 开头有 "---" 但无闭合 → 视为无 frontmatter,整篇当正文。
    (None, content.to_string())
}

/// 取笔记标题:正文里第一个 H1(`# 标题`);无则用路径的文件名(去扩展名)。
pub fn extract_title(body: &str, path: &str) -> String {
    for line in body.lines() {
        // CommonMark 的 H1:"# " 后跟文本。trim_start 容许缩进。
        if let Some(rest) = line.trim_start().strip_prefix("# ") {
            let t = rest.trim();
            if !t.is_empty() {
                return t.to_string();
            }
        }
    }
    // 回退:路径最后一段,去扩展名。
    let filename = path.rsplit('/').next().unwrap_or(path);
    match filename.rsplit_once('.') {
        Some((stem, _)) => stem.to_string(),
        None => filename.to_string(),
    }
}

/// 从文本提取所有 `[[...]]` wikilink。
///
/// - 支持 `[[target]]`、`[[target|显示]]`、`[[target#节]]`、`[[target#节|显示]]`。
/// - **忽略**围栏代码块(``` ``` ``` 内)与行内代码(`` ` `` 内)的 `[[...]]`。
/// - 空 target(`[[ ]]`)跳过。
pub fn extract_wikilinks(text: &str) -> Vec<Link> {
    let mut out = Vec::new();
    let mut in_fence = false;
    for line in text.lines() {
        // 围栏代码块:行首(去空白)以 ``` 开头则翻转状态。
        if line.trim_start().starts_with("```") {
            in_fence = !in_fence;
            continue;
        }
        if in_fence {
            continue;
        }
        extract_links_in_line(line, &mut out);
    }
    out
}

// 行尾换行裁剪(兼容 \n 与 \r\n)。注意 shadowing,让第二个默认值承接上一步结果,而非原始入参。
fn strip_eol(s: &str) -> &str {
    let s = s.strip_suffix('\n').unwrap_or(s);
    s.strip_suffix('\r').unwrap_or(s)
}

// 单行内扫描 [[...]],跳过行内代码(`...`)。
fn extract_links_in_line(line: &str, out: &mut Vec<Link>) {
    let chars: Vec<char> = line.chars().collect();
    let mut i = 0;
    let mut in_code = false;
    while i < chars.len() {
        let c = chars[i];
        if c == '`' {
            in_code = !in_code;
            i += 1;
            continue;
        }
        if !in_code && c == '[' && i + 1 < chars.len() && chars[i + 1] == '[' {
            // 找闭合 "]]"
            if let Some(close) = find_substring(&chars, i + 2, "]]") {
                let inner: String = chars[i + 2..close].iter().collect();
                if let Some(link) = parse_link_inner(&inner) {
                    out.push(link);
                }
                i = close + 2; // 跳过 "]]"
                continue;
            } else {
                return; // 本行无闭合,放弃剩余
            }
        }
        i += 1;
    }
}

// 在 chars[from..] 里找 needle 的起始下标。
fn find_substring(chars: &[char], from: usize, needle: &str) -> Option<usize> {
    let needle: Vec<char> = needle.chars().collect();
    if needle.is_empty() || from >= chars.len() {
        return None;
    }
    'outer: for start in from..=chars.len().saturating_sub(needle.len()) {
        for (k, nc) in needle.iter().enumerate() {
            if chars[start + k] != *nc {
                continue 'outer;
            }
        }
        return Some(start);
    }
    None
}

// 解析 `[[ ]]` 内部文本 → Link。
fn parse_link_inner(inner: &str) -> Option<Link> {
    let inner = inner.trim();
    if inner.is_empty() {
        return None;
    }
    // 先按首个 '|' 拆出 display。
    let (main, display) = match inner.split_once('|') {
        Some((m, d)) => (m, Some(d.trim().to_string())),
        None => (inner, None),
    };
    // main 按首个 '#' 拆出 anchor。
    let (target, anchor) = match main.split_once('#') {
        Some((t, a)) => (t, Some(a.to_string())),
        None => (main, None),
    };
    let target = target.trim().to_string();
    if target.is_empty() {
        return None;
    }
    Some(Link {
        target,
        display,
        anchor,
    })
}

/// 完整解析一篇笔记。
pub fn parse_note(content: &str, path: &str) -> ParsedNote {
    let (frontmatter, body) = split_frontmatter(content);
    let title = extract_title(&body, path);
    let links = extract_wikilinks(&body);
    ParsedNote {
        path: path.to_string(),
        title,
        frontmatter,
        body,
        links,
    }
}

// ─────────────────────────── 测试(TDD:先行)───────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ---- split_frontmatter ----

    #[test]
    fn split_frontmatter_present() {
        let (fm, body) =
            split_frontmatter("---\ntype: Concept\nstatus: active\n---\n# Title\nbody\n");
        assert_eq!(fm.as_deref(), Some("type: Concept\nstatus: active"));
        assert_eq!(body, "# Title\nbody\n");
    }

    #[test]
    fn split_frontmatter_absent() {
        let (fm, body) = split_frontmatter("# Just a note\nno fm here\n");
        assert_eq!(fm, None);
        assert_eq!(body, "# Just a note\nno fm here\n");
    }

    #[test]
    fn split_frontmatter_marker_not_at_start_is_body() {
        // 正文里的 --- 分隔线不算 frontmatter
        let (fm, body) = split_frontmatter("# Title\n\n---\n\nnot fm\n");
        assert_eq!(fm, None);
        assert_eq!(body, "# Title\n\n---\n\nnot fm\n");
    }

    #[test]
    fn split_frontmatter_open_but_unclosed_is_none() {
        let (fm, _body) = split_frontmatter("---\nkey: val\nbody continues\n");
        assert_eq!(fm, None);
    }

    #[test]
    fn split_frontmatter_empty_block() {
        let (fm, body) = split_frontmatter("---\n---\nbody\n");
        assert_eq!(fm.as_deref(), Some(""));
        assert_eq!(body, "body\n");
    }

    // ---- extract_title ----

    #[test]
    fn title_from_first_h1() {
        assert_eq!(
            extract_title("intro\n# My Title\nmore", "x/y.md"),
            "My Title"
        );
    }

    #[test]
    fn title_uses_first_h1_when_multiple() {
        assert_eq!(extract_title("# First\n# Second\n", "x.md"), "First");
    }

    #[test]
    fn title_fallback_to_filename_stem() {
        assert_eq!(
            extract_title("no heading here", "projects/alpha.md"),
            "alpha"
        );
    }

    #[test]
    fn title_fallback_no_extension() {
        assert_eq!(extract_title("no heading", "notes/README"), "README");
    }

    #[test]
    fn title_h1_trimmed() {
        assert_eq!(extract_title("#   Spaced   \n", "x.md"), "Spaced");
    }

    // ---- extract_wikilinks ----

    #[test]
    fn wikilink_plain() {
        assert_eq!(
            extract_wikilinks("see [[Alpha]]"),
            vec![Link {
                target: "Alpha".into(),
                display: None,
                anchor: None
            }]
        );
    }

    #[test]
    fn wikilink_display() {
        assert_eq!(
            extract_wikilinks("[[Alpha|the first]]"),
            vec![Link {
                target: "Alpha".into(),
                display: Some("the first".into()),
                anchor: None
            }]
        );
    }

    #[test]
    fn wikilink_anchor() {
        assert_eq!(
            extract_wikilinks("[[Alpha#Section]]"),
            vec![Link {
                target: "Alpha".into(),
                display: None,
                anchor: Some("Section".into())
            }]
        );
    }

    #[test]
    fn wikilink_anchor_and_display() {
        assert_eq!(
            extract_wikilinks("[[Alpha#Section|see]]"),
            vec![Link {
                target: "Alpha".into(),
                display: Some("see".into()),
                anchor: Some("Section".into())
            }]
        );
    }

    #[test]
    fn wikilink_multiple_and_trimmed() {
        let links = extract_wikilinks("a [[ One ]] b\n[[Two#x|two]] c");
        assert_eq!(links.len(), 2);
        assert_eq!(links[0].target, "One");
        assert_eq!(links[1].target, "Two");
        assert_eq!(links[1].anchor.as_deref(), Some("x"));
    }

    #[test]
    fn wikilink_ignored_in_inline_code() {
        assert!(extract_wikilinks("run `[[NotALink]]` now").is_empty());
    }

    #[test]
    fn wikilink_ignored_in_code_fence() {
        assert!(extract_wikilinks("```\n[[NotALink]]\n```").is_empty());
        // 围栏之后恢复正常
        let links = extract_wikilinks("```\n[[Inside]]\n```\n[[Outside]]");
        assert_eq!(links.len(), 1);
        assert_eq!(links[0].target, "Outside");
    }

    #[test]
    fn wikilink_empty_target_skipped() {
        assert!(extract_wikilinks("[[ ]] and [[]]").is_empty());
    }

    // ---- parse_note (集成) ----

    #[test]
    fn parse_note_end_to_end() {
        let content =
            "---\ntype: Concept\n---\n# Capitalism\n\nsee [[Marx]] and [[Marx#labor|work]].\n";
        let n = parse_note(content, "ideas/cap.md");
        assert_eq!(n.path, "ideas/cap.md");
        assert_eq!(n.title, "Capitalism");
        assert_eq!(n.frontmatter.as_deref(), Some("type: Concept"));
        assert!(n.body.starts_with("# Capitalism"));
        assert_eq!(n.links.len(), 2);
        assert_eq!(n.links[0].target, "Marx");
        assert_eq!(n.links[1].anchor.as_deref(), Some("labor"));
    }

    #[test]
    fn parse_note_no_frontmatter() {
        let n = parse_note("# Hello\n[[World]]", "a.md");
        assert_eq!(n.frontmatter, None);
        assert_eq!(n.title, "Hello");
        assert_eq!(n.links.len(), 1);
    }
}

// ─────────────────────────── 属性测试(proptest)───────────────────────────

#[cfg(test)]
mod props {
    use super::*;
    use proptest::prelude::*;

    proptest! {
        /// 解析器对任意输入不得 panic。
        #[test]
        fn parse_note_never_panics(content in ".{0,300}", path in "[a-z0-9/_.\\-]{0,40}") {
            let _ = parse_note(&content, &path);
        }

        /// 任意文本里提取出的 wikilink,target 必非空(trim 后)。
        #[test]
        fn wikilink_targets_nonempty(text in ".{0,500}") {
            for l in extract_wikilinks(&text) {
                prop_assert!(!l.target.trim().is_empty());
            }
        }

        /// 若首行不是 "---",则无 frontmatter、且 body 原样返回。
        #[test]
        fn no_marker_means_passthrough(content in ".{0,300}") {
            let (fm, body) = split_frontmatter(&content);
            let first_line_is_marker = content
                .lines()
                .next()
                .map(|l| l.trim_end().trim_end_matches('\r') == "---")
                .unwrap_or(false);
            if !first_line_is_marker {
                prop_assert!(fm.is_none());
                prop_assert_eq!(&body, &content);
            }
        }

        /// split_frontmatter 产出的原始 YAML 文本不含行尾换行(每行已 join('\n'))。
        #[test]
        fn fm_text_has_no_trailing_eol_per_line(content in ".{0,300}") {
            let (fm, _body) = split_frontmatter(&content);
            if let Some(yaml) = fm {
                for line in yaml.split('\n') {
                    prop_assert!(!line.ends_with('\r') && !line.ends_with('\n'));
                }
            }
        }
    }
}
