//! Schema-aware enrichment:把零依赖 `parse` 出的 `ParsedNote` 升级为带 frontmatter 结构、
//! 关系边、标签、类型的 `Note`。这是图谱统一边(Wiki + Relation)与查询/聚合的数据源。
//!
//! 分层:`parse`(零依赖分词)→ `index`(本模块,引入 serde_yaml)。

use std::collections::BTreeMap;

use serde_yaml::Value;

use crate::parse::{extract_wikilinks, Link, ParsedNote};

/// frontmatter:有序映射(测试确定性)。非法 YAML → 空 map(降级,不崩溃)。
pub type Frontmatter = BTreeMap<String, Value>;

/// Enriched note:图谱、查询、搜索的统一数据载体。
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct Note {
    pub path: String,
    pub title: String,
    pub frontmatter: Frontmatter,
    pub body: String,
    /// 正文 `[[...]]` wikilink。
    pub body_links: Vec<Link>,
    /// frontmatter 关系:(键名, link)。如 ("mentions", Link{..})。
    pub relation_links: Vec<(String, Link)>,
}

/// 把原始 frontmatter 文本解析为 map。非法 / 缺失 → 空 map。
pub fn parse_frontmatter(raw: Option<&str>) -> Frontmatter {
    match raw {
        Some(s) if !s.trim().is_empty() => {
            serde_yaml::from_str::<Frontmatter>(s).unwrap_or_default()
        }
        _ => Frontmatter::new(),
    }
}

/// enrich:`ParsedNote` → `Note`(解析 frontmatter、提取关系边)。
pub fn enrich(parsed: ParsedNote) -> Note {
    let frontmatter = parse_frontmatter(parsed.frontmatter.as_deref());
    let relation_links = relationship_links(&frontmatter);
    Note {
        path: parsed.path,
        title: parsed.title,
        body: parsed.body,
        body_links: parsed.links,
        frontmatter,
        relation_links,
    }
}

/// 从 frontmatter 提取所有关系边:遍历每个键的值,递归在每个字符串标量里找 `[[...]]`。
pub fn relationship_links(fm: &Frontmatter) -> Vec<(String, Link)> {
    let mut out = Vec::new();
    for (key, value) in fm {
        let key = key.clone();
        walk_strings(value, &mut |s| {
            for link in extract_wikilinks(s) {
                out.push((key.clone(), link));
            }
        });
    }
    out
}

/// 递归访问 YAML 值里的所有字符串标量。
fn walk_strings<F: FnMut(&str)>(value: &Value, f: &mut F) {
    match value {
        Value::String(s) => f(s),
        Value::Sequence(seq) => {
            for v in seq {
                walk_strings(v, f);
            }
        }
        Value::Mapping(m) => {
            for v in m.values() {
                walk_strings(v, f);
            }
        }
        _ => {}
    }
}

/// 软类型:`type:` 字段(字符串值),缺失或非字符串 → None。永不报错。
pub fn type_of(note: &Note) -> Option<String> {
    frontmatter_str(note, "type")
}

/// frontmatter 里某键的字符串标量值(缺失/非字符串 → None)。永不报错。
/// status / created 等投影都走它;`type_of` 是其特例。
pub fn frontmatter_str(note: &Note, key: &str) -> Option<String> {
    match note.frontmatter.get(key)? {
        Value::String(s) => Some(s.clone()),
        _ => None,
    }
}

/// 标签:frontmatter `tags`(列表或单字符串)+ 正文 `#tag`(忽略代码块/行内代码)。
pub fn tags(note: &Note) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    if let Some(t) = note.frontmatter.get("tags") {
        match t {
            Value::String(s) => out.push(s.clone()),
            Value::Sequence(seq) => {
                for v in seq {
                    if let Value::String(s) = v {
                        out.push(s.clone());
                    }
                }
            }
            _ => {}
        }
    }
    out.extend(inline_tags(&note.body));
    out
}

/// 正文行内 `#tag` 提取。规则:`#` 前须是空白/行首(词边界);其后是 字母数字/_/-/`/`。
/// `# 标题`(空格)、`C#`(后随非标签符)、代码块内 均不计。
fn inline_tags(body: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut in_fence = false;
    for line in body.lines() {
        if line.trim_start().starts_with("```") {
            in_fence = !in_fence;
            continue;
        }
        if in_fence {
            continue;
        }
        let chars: Vec<char> = line.chars().collect();
        let mut i = 0;
        let mut in_code = false;
        let mut prev: char = ' ';
        while i < chars.len() {
            let c = chars[i];
            if c == '`' {
                in_code = !in_code;
                prev = c;
                i += 1;
                continue;
            }
            if !in_code && c == '#' && prev.is_whitespace() {
                let mut j = i + 1;
                let mut tag = String::new();
                while j < chars.len() {
                    match chars[j] {
                        ch if ch.is_alphanumeric() || ch == '_' || ch == '-' || ch == '/' => {
                            tag.push(ch);
                            j += 1;
                        }
                        _ => break,
                    }
                }
                if !tag.is_empty() {
                    out.push(tag);
                    i = j;
                    prev = chars[i - 1];
                    continue;
                }
            }
            prev = c;
            i += 1;
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parse::parse_note;

    fn enrich_str(content: &str, path: &str) -> Note {
        enrich(parse_note(content, path))
    }

    // ---- parse_frontmatter ----

    #[test]
    fn fm_basic() {
        let fm = parse_frontmatter(Some("type: Concept\nstatus: active\n"));
        assert_eq!(fm.get("type").and_then(|v| v.as_str()), Some("Concept"));
        assert_eq!(fm.get("status").and_then(|v| v.as_str()), Some("active"));
    }

    #[test]
    fn fm_list_value() {
        let fm = parse_frontmatter(Some("tags:\n  - foo\n  - bar\n"));
        let tags = fm.get("tags").unwrap();
        assert!(matches!(tags, Value::Sequence(_)));
    }

    #[test]
    fn fm_invalid_yields_empty() {
        let fm = parse_frontmatter(Some(":\n : broken\n"));
        assert!(fm.is_empty());
    }

    #[test]
    fn fm_none_yields_empty() {
        assert!(parse_frontmatter(None).is_empty());
        assert!(parse_frontmatter(Some("   ")).is_empty());
    }

    // ---- relationship_links ----

    #[test]
    fn relation_scalar_wikilink() {
        let fm = parse_frontmatter(Some("source: \"[[alpha]]\"\n"));
        let rel = relationship_links(&fm);
        assert_eq!(rel.len(), 1);
        assert_eq!(rel[0].0, "source");
        assert_eq!(rel[0].1.target, "alpha");
    }

    #[test]
    fn relation_list_wikilinks() {
        let fm = parse_frontmatter(Some("mentions:\n  - \"[[a]]\"\n  - \"[[b]]\"\n"));
        let rel = relationship_links(&fm);
        assert_eq!(rel.len(), 2);
        assert_eq!(rel[0].1.target, "a");
        assert_eq!(rel[1].1.target, "b");
    }

    #[test]
    fn relation_plain_value_has_none() {
        let fm = parse_frontmatter(Some("status: active\nn: 3\n"));
        assert!(relationship_links(&fm).is_empty());
    }

    #[test]
    fn enrich_end_to_end() {
        let n = enrich_str("---\ntype: Summary\nsource: \"[[s]]\"\nmentions:\n  - \"[[e]]\"\n---\n# T\nbody [[x]]\n", "t.md");
        assert_eq!(type_of(&n), Some("Summary".into()));
        assert_eq!(n.body_links.len(), 1);
        assert_eq!(n.body_links[0].target, "x");
        assert_eq!(n.relation_links.len(), 2); // source + mentions
        let targets: Vec<&str> = n
            .relation_links
            .iter()
            .map(|(_, l)| l.target.as_str())
            .collect();
        assert!(targets.contains(&"s"));
        assert!(targets.contains(&"e"));
    }

    // ---- type_of ----

    #[test]
    fn type_present_absent_nonstring() {
        assert_eq!(
            type_of(&enrich_str("---\ntype: Concept\n---\n# T", "a.md")),
            Some("Concept".into())
        );
        assert_eq!(type_of(&enrich_str("# T", "a.md")), None);
        assert_eq!(type_of(&enrich_str("---\ntype: 3\n---\n# T", "a.md")), None);
    }

    // ---- frontmatter_str ----

    #[test]
    fn frontmatter_str_status_created_absent_nonstring() {
        let n = enrich_str(
            "---\nstatus: Active\ncreated: 2026-07-25\nn: 3\n---\n# T",
            "a.md",
        );
        assert_eq!(frontmatter_str(&n, "status"), Some("Active".into()));
        assert_eq!(frontmatter_str(&n, "created"), Some("2026-07-25".into()));
        assert_eq!(frontmatter_str(&n, "missing"), None);
        assert_eq!(frontmatter_str(&n, "n"), None); // 数字,非字符串
    }

    // ---- tags ----

    #[test]
    fn tags_from_frontmatter_list() {
        let n = enrich_str("---\ntags:\n  - foo\n  - bar\n---\n# T", "a.md");
        let t = tags(&n);
        assert!(t.contains(&"foo".to_string()) && t.contains(&"bar".to_string()));
    }

    #[test]
    fn tags_inline() {
        let n = enrich_str("# T\nsee #alpha and #beta-2\n", "a.md");
        let t = tags(&n);
        assert!(t.contains(&"alpha".to_string()));
        assert!(t.contains(&"beta-2".to_string()));
    }

    #[test]
    fn tags_heading_not_a_tag() {
        let n = enrich_str("# Title\n## Sub\n", "a.md");
        // '#' followed by space → not a tag
        assert!(!tags(&n).iter().any(|t| t == "Title" || t == "Sub"));
    }

    #[test]
    fn tags_midword_not_a_tag() {
        let n = enrich_str("C# is not a tag\n", "a.md");
        assert!(!tags(&n).iter().any(|t| t.contains("C") || t.is_empty()));
    }

    #[test]
    fn tags_ignored_in_code() {
        let n = enrich_str("```\n#inblock\n```\n`#inline`\nreal #yes\n", "a.md");
        let t = tags(&n);
        assert!(t.contains(&"yes".to_string()));
        assert!(!t.contains(&"inblock".to_string()));
        assert!(!t.contains(&"inline".to_string()));
    }
}

// ─────────────────────────── 属性测试(proptest)───────────────────────────

#[cfg(test)]
mod props {
    use super::*;
    use crate::parse::parse_note;
    use proptest::prelude::*;

    proptest! {
        /// 任意正文 + 路径 → enrich 不 panic;tags / type_of / frontmatter_str 也不 panic。
        /// frontmatter 解析对任意(含非法)YAML 只降级为空 map,绝不崩溃。
        #[test]
        fn enrich_never_panics(content in ".{0,400}", path in "[a-z0-9/_.\\-]{0,40}") {
            let n = enrich(parse_note(&content, &path));
            let _ = tags(&n);
            let _ = type_of(&n);
            let _ = frontmatter_str(&n, "status");
        }

        /// parse_frontmatter 对任意原始字符串不 panic。
        #[test]
        fn parse_frontmatter_never_panics(raw in ".{0,200}") {
            let _ = parse_frontmatter(Some(&raw));
        }
    }
}
