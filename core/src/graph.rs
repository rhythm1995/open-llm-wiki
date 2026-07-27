//! 关系图:从 enriched 笔记构建统一图谱,并算反向链接。
//!
//! 解析阶段(`Link`)只产出"原始目标文本";本模块把目标解析到具体笔记(按 title / 路径),
//! 悬空的标 `Unresolved`(图谱里画虚边)。
//!
//! **边有两类**(统一在一处产出):正文 `[[...]]` → `EdgeKind::Wiki`;
//! frontmatter 关系(`source/mentions/related_to/...` 里的 `[[...]]`)→ `EdgeKind::Relation(key)`。
//! 两类边共用同一个 `resolve` + 出入邻接结构,反向链接、图谱、悬空检测一视同仁。

use std::collections::HashMap;

use crate::index::Note;
use crate::parse::Link;

/// 节点 id = 笔记在输入 `Vec` 里的下标。
pub type NodeId = usize;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub enum EdgeKind {
    /// 正文 `[[...]]` wikilink。
    Wiki,
    /// frontmatter 关系(键名,如 "mentions")。
    Relation(String),
}

/// 边的指向:解析到的节点,或悬空。
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub enum Target {
    Resolved(NodeId),
    Unresolved(String),
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct Edge {
    pub from: NodeId,
    pub to: Target,
    pub kind: EdgeKind,
    /// `[[target#anchor]]` 里的 anchor(块级引用),无则 None。
    pub anchor: Option<String>,
}

/// 关系图。`build` 消费笔记数组。
pub struct Graph {
    pub nodes: Vec<Note>,
    pub edges: Vec<Edge>,
    /// 节点 id → 出边下标。
    outgoing: Vec<Vec<usize>>,
    /// 节点 id → 入边下标(只含 Resolved 的)。
    incoming: Vec<Vec<usize>>,
}

impl Graph {
    /// 从笔记数组构建图:建标题/路径索引、解析每条 link、算出入邻接。
    pub fn build(notes: Vec<Note>) -> Graph {
        let n = notes.len();
        // 标题/路径索引:建图时用于把 link 文本解析到节点 id。建完即弃
        // (增量重解析留待 Phase 1+ watcher 切片,届时再放回字段)。
        let mut title_index: HashMap<String, NodeId> = HashMap::new();
        let mut path_index: HashMap<String, NodeId> = HashMap::new();
        for (i, note) in notes.iter().enumerate() {
            // 冲突取首个(first wins)。
            title_index.entry(note.title.to_lowercase()).or_insert(i);
            path_index
                .entry(path_stem(&note.path).to_lowercase())
                .or_insert(i);
        }

        let mut edges: Vec<Edge> = Vec::new();
        let mut outgoing: Vec<Vec<usize>> = vec![Vec::new(); n];
        let mut incoming: Vec<Vec<usize>> = vec![Vec::new(); n];

        for (from, note) in notes.iter().enumerate() {
            // 正文 wikilink → Wiki 边
            for link in &note.body_links {
                add_edge(
                    &mut edges,
                    &mut outgoing,
                    &mut incoming,
                    from,
                    link,
                    EdgeKind::Wiki,
                    &title_index,
                    &path_index,
                );
            }
            // frontmatter 关系 → Relation(key) 边
            for (key, link) in &note.relation_links {
                add_edge(
                    &mut edges,
                    &mut outgoing,
                    &mut incoming,
                    from,
                    link,
                    EdgeKind::Relation(key.clone()),
                    &title_index,
                    &path_index,
                );
            }
        }

        Graph {
            nodes: notes,
            edges,
            outgoing,
            incoming,
        }
    }

    /// 节点的出边。
    pub fn outgoing(&self, id: NodeId) -> Vec<&Edge> {
        self.outgoing
            .get(id)
            .map(|idxs| idxs.iter().map(|&i| &self.edges[i]).collect())
            .unwrap_or_default()
    }

    /// 节点的反向链接(谁指向它)。
    pub fn backlinks(&self, id: NodeId) -> Vec<&Edge> {
        self.incoming
            .get(id)
            .map(|idxs| idxs.iter().map(|&i| &self.edges[i]).collect())
            .unwrap_or_default()
    }

    /// 所有悬空边(目标未解析)。
    pub fn unresolved(&self) -> impl Iterator<Item = &Edge> {
        self.edges
            .iter()
            .filter(|e| matches!(e.to, Target::Unresolved(_)))
    }
}

/// 解析 link target:先按标题(大小写不敏感),再按路径 stem,否则悬空。
fn resolve(
    target: &str,
    title_index: &HashMap<String, NodeId>,
    path_index: &HashMap<String, NodeId>,
) -> Target {
    let t = target.to_lowercase();
    if let Some(&id) = title_index.get(&t) {
        return Target::Resolved(id);
    }
    if let Some(&id) = path_index.get(&t) {
        return Target::Resolved(id);
    }
    Target::Unresolved(target.to_string())
}

/// 路径去掉文件扩展名(保留目录部分)。仅当最后那个 '.' 落在文件名段才剥。
fn path_stem(path: &str) -> &str {
    match path.rsplit_once('.') {
        Some((stem, ext)) if !ext.is_empty() && !ext.contains('/') => stem,
        _ => path,
    }
}

/// 推一条边进图(并登记出入邻接)。
#[allow(clippy::too_many_arguments)]
fn add_edge(
    edges: &mut Vec<Edge>,
    outgoing: &mut [Vec<usize>],
    incoming: &mut [Vec<usize>],
    from: NodeId,
    link: &Link,
    kind: EdgeKind,
    title_index: &HashMap<String, NodeId>,
    path_index: &HashMap<String, NodeId>,
) {
    let to = resolve(&link.target, title_index, path_index);
    let edge_idx = edges.len();
    edges.push(Edge {
        from,
        to: to.clone(),
        kind,
        anchor: link.anchor.clone(),
    });
    outgoing[from].push(edge_idx);
    if let Target::Resolved(t) = to {
        incoming[t].push(edge_idx);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::index::enrich;
    use crate::parse::parse_note;

    /// 测试辅助:parse_note → enrich → Note。
    fn note(content: &str, path: &str) -> Note {
        enrich(parse_note(content, path))
    }

    fn resolved_id(t: &Target) -> NodeId {
        match t {
            Target::Resolved(id) => *id,
            other => panic!("expected Resolved, got {other:?}"),
        }
    }

    #[test]
    fn resolve_by_title() {
        let notes = vec![
            note("# Alpha\nlinks [[Beta]]", "a.md"),
            note("# Beta", "b.md"),
        ];
        let g = Graph::build(notes);
        assert_eq!(g.nodes.len(), 2);
        assert_eq!(g.edges.len(), 1);
        assert_eq!(resolved_id(&g.edges[0].to), 1);
        assert_eq!(g.backlinks(1).len(), 1);
    }

    #[test]
    fn resolve_case_insensitive_title() {
        let notes = vec![note("# Alpha\n[[BETA]]", "a.md"), note("# Beta", "b.md")];
        let g = Graph::build(notes);
        assert!(matches!(g.edges[0].to, Target::Resolved(_)));
    }

    #[test]
    fn resolve_by_path_when_title_differs() {
        let notes = vec![
            note("# A\n[[dir/the-b-note]]", "a.md"),
            note("# B", "dir/the-b-note.md"),
        ];
        let g = Graph::build(notes);
        assert!(
            matches!(g.edges[0].to, Target::Resolved(_)),
            "got {:?}",
            g.edges[0].to
        );
    }

    #[test]
    fn unresolved_target_is_dangling() {
        let notes = vec![note("# A\n[[Ghost]]", "a.md")];
        let g = Graph::build(notes);
        let unres: Vec<_> = g.unresolved().collect();
        assert_eq!(unres.len(), 1);
        // A 没有反向链接
        assert!(g.backlinks(0).is_empty());
    }

    #[test]
    fn backlinks_aggregate_multiple_sources() {
        // A→B, C→B
        let notes = vec![
            note("# A\n[[B]]", "a.md"),
            note("# B", "b.md"),
            note("# C\n[[B]]", "c.md"),
        ];
        let g = Graph::build(notes);
        assert_eq!(g.backlinks(1).len(), 2);
        assert_eq!(g.outgoing(0).len(), 1);
    }

    #[test]
    fn self_link_counts() {
        let notes = vec![note("# A\n[[A]]", "a.md")];
        let g = Graph::build(notes);
        assert!(matches!(g.edges[0].to, Target::Resolved(0)));
        assert_eq!(g.backlinks(0).len(), 1);
    }

    #[test]
    fn anchor_preserved_on_edge() {
        let notes = vec![note("# A\n[[B#section]]", "a.md"), note("# B", "b.md")];
        let g = Graph::build(notes);
        assert_eq!(g.edges[0].anchor.as_deref(), Some("section"));
    }

    #[test]
    fn empty_vault_is_empty_graph() {
        let g = Graph::build(vec![]);
        assert!(g.nodes.is_empty());
        assert!(g.edges.is_empty());
    }

    // ---- Relation 边(本切片新增)----

    #[test]
    fn relation_edge_resolves_and_backlinks() {
        let notes = vec![
            note("---\nsource: \"[[Beta]]\"\n---\n# Alpha", "a.md"),
            note("# Beta", "b.md"),
        ];
        let g = Graph::build(notes);
        // 一条 Relation("source") 边,无 Wiki 边
        assert_eq!(g.edges.len(), 1);
        assert!(matches!(&g.edges[0].kind, EdgeKind::Relation(k) if k == "source"));
        assert!(matches!(g.edges[0].to, Target::Resolved(1)));
        // Beta 的反向链接含这条关系
        let bl = g.backlinks(1);
        assert_eq!(bl.len(), 1);
        assert!(matches!(bl[0].kind, EdgeKind::Relation(_)));
    }

    #[test]
    fn relation_and_wiki_coexist() {
        let notes = vec![
            note(
                "---\nmentions:\n  - \"[[B]]\"\n---\n# A\n\nsee [[B]] in body.\n",
                "a.md",
            ),
            note("# B", "b.md"),
        ];
        let g = Graph::build(notes);
        // 一条 Wiki + 一条 Relation("mentions")
        assert_eq!(g.edges.len(), 2);
        let kinds: Vec<&EdgeKind> = g.edges.iter().map(|e| &e.kind).collect();
        assert!(kinds.iter().any(|k| **k == EdgeKind::Wiki));
        assert!(kinds
            .iter()
            .any(|k| matches!(k, EdgeKind::Relation(r) if r == "mentions")));
        assert_eq!(g.backlinks(1).len(), 2);
    }
}
