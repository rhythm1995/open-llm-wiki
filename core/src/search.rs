//! 全文检索:倒排索引 + 简单排序(词频 + 标题加权)。纯函数,在 `&[Note]` 上构建。
//!
//! 分词:小写化 + 取最长字母数字串(unicode 感知)。标题命中加权(×2),正文命中常规权重。
//! 这是 F-SEARCH 的内核;语义/模糊检索留待后端接入。

use std::collections::HashMap;

use crate::graph::NodeId;
use crate::index::Note;

/// 倒排索引:两套(标题、正文),term → (doc → 词频)。
#[derive(Debug, Clone)]
pub struct SearchIndex {
    title: HashMap<String, HashMap<NodeId, usize>>,
    body: HashMap<String, HashMap<NodeId, usize>>,
    /// 节点总数(避免对外暴露笔记切片)。
    doc_count: usize,
}

impl SearchIndex {
    pub fn build(notes: &[Note]) -> SearchIndex {
        let mut title: HashMap<String, HashMap<NodeId, usize>> = HashMap::new();
        let mut body: HashMap<String, HashMap<NodeId, usize>> = HashMap::new();
        for (i, n) in notes.iter().enumerate() {
            for term in tokenize(&n.title) {
                *title.entry(term).or_default().entry(i).or_insert(0) += 1;
            }
            for term in tokenize(&n.body) {
                *body.entry(term).or_default().entry(i).or_insert(0) += 1;
            }
        }
        SearchIndex {
            title,
            body,
            doc_count: notes.len(),
        }
    }

    /// 按查询词检索,返回按分数降序的 (节点 id, 分数)。词项间为 AND(都命中才计分)。
    /// 单词项分数 = 标题词频×2 + 正文词频。
    pub fn search(&self, terms: &[&str]) -> Vec<(NodeId, f64)> {
        let normalized: Vec<String> = terms
            .iter()
            .flat_map(|t| tokenize(t))
            .map(|t| t.to_lowercase())
            .collect();
        if normalized.is_empty() || self.doc_count == 0 {
            return Vec::new();
        }
        // AND:每个词项都要命中同一文档。
        let mut score: HashMap<NodeId, f64> = HashMap::new();
        for term in &normalized {
            let title_hits = self.title.get(term);
            let body_hits = self.body.get(term);
            if title_hits.is_none() && body_hits.is_none() {
                return Vec::new(); // 该词无文档命中 → AND 失败
            }
            let mut term_score: HashMap<NodeId, f64> = HashMap::new();
            if let Some(hits) = title_hits {
                for (&doc, &tf) in hits {
                    *term_score.entry(doc).or_insert(0.0) += 2.0 * tf as f64;
                }
            }
            if let Some(hits) = body_hits {
                for (&doc, &tf) in hits {
                    *term_score.entry(doc).or_insert(0.0) += tf as f64;
                }
            }
            // 累加进总分(第一次词项初始化,之后累加)。
            if score.is_empty() {
                score = term_score;
            } else {
                // AND:只保留两词都命中的文档。
                score.retain(|doc, _| term_score.contains_key(doc));
                for (doc, s) in term_score {
                    if let Some(v) = score.get_mut(&doc) {
                        *v += s;
                    }
                }
            }
        }
        let mut ranked: Vec<(NodeId, f64)> = score.into_iter().collect();
        ranked.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        ranked
    }
}

/// 分词:小写化,取最长"字母数字 + 下划线"串(unicode)。下划线视为词内字符,
/// 保留标识符(如 `foo_bar`、代码符号)完整。其余标点/空白为分隔。
fn tokenize(s: &str) -> Vec<String> {
    s.split(|c: char| !(c.is_alphanumeric() || c == '_'))
        .filter(|t| !t.is_empty())
        .map(|t| t.to_lowercase())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::index::enrich;
    use crate::parse::parse_note;

    fn note(content: &str, path: &str) -> Note {
        enrich(parse_note(content, path))
    }

    #[test]
    fn tokenize_basic() {
        assert_eq!(
            tokenize("Hello, WORLD! foo_bar"),
            vec!["hello", "world", "foo_bar"]
        );
        assert!(tokenize("   !!!   ").is_empty());
    }

    #[test]
    fn single_term_title_boost() {
        let notes = vec![
            note("# Rust guide\n\nabout python", "a.md"),
            note("# Python\n\nrust and python here", "b.md"),
        ];
        let idx = SearchIndex::build(&notes);
        let r = idx.search(&["python"]);
        // a: 标题 0 + 正文 1 = 1; b: 标题 2 + 正文 1 = 3
        assert_eq!(r[0].0, 1);
        assert!(r[0].1 > r[1].1);
    }

    #[test]
    fn multi_term_and_semantics() {
        let notes = vec![
            note("# A\n\nfoo bar", "a.md"),
            note("# B\n\nfoo only", "b.md"),
            note("# C\n\nbar only", "c.md"),
        ];
        let idx = SearchIndex::build(&notes);
        let r = idx.search(&["foo", "bar"]);
        // 只有 a 同时含 foo 和 bar
        let ids: Vec<NodeId> = r.iter().map(|(id, _)| *id).collect();
        assert_eq!(ids, vec![0]);
    }

    #[test]
    fn no_match_empty() {
        let notes = vec![note("# A\n\nhello", "a.md")];
        let idx = SearchIndex::build(&notes);
        assert!(idx.search(&["nonexistent"]).is_empty());
        assert!(idx.search(&[]).is_empty());
    }

    #[test]
    fn empty_vault_index() {
        let idx = SearchIndex::build(&[]);
        assert!(idx.search(&["x"]).is_empty());
    }

    #[test]
    fn case_insensitive_query() {
        let notes = vec![note("# Rust\n\nbody", "a.md")];
        let idx = SearchIndex::build(&notes);
        assert_eq!(idx.search(&["RUST"]).len(), 1);
    }
}
