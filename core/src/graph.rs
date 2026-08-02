//! 关系图:从 enriched 笔记构建统一图谱,并算反向链接。
//!
//! 解析阶段(`Link`)只产出"原始目标文本";本模块把目标解析到具体笔记(按 title / 路径),
//! 悬空的标 `Unresolved`(图谱里画虚边)。
//!
//! **边有两类**(统一在一处产出):正文 `[[...]]` → `EdgeKind::Wiki`;
//! frontmatter 关系(`source/mentions/related_to/...` 里的 `[[...]]`)→ `EdgeKind::Relation(key)`。
//! 两类边共用同一个 `resolve` + 出入邻接结构,反向链接、图谱、悬空检测一视同仁。

use std::collections::HashMap;

use serde_yaml::Value;

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

/// 孤儿判定的方向(与 ui `graph-health` OrphanMode 同义)。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OrphanMode {
    Incoming,
    Outgoing,
    Both,
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
    /// 从笔记数组构建图:建解析索引(标题/别名/路径/文件名)、解析每条 link、算出入邻接。
    pub fn build(notes: Vec<Note>) -> Graph {
        let n = notes.len();
        let mut idx = ResolveIndex::new();
        for (i, note) in notes.iter().enumerate() {
            idx.add_note(i, note);
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
                    &idx,
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
                    &idx,
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

    /// 节点的已解析出度(悬空目标不计;与 ui graph-health 同义)。
    pub fn out_degree(&self, id: NodeId) -> usize {
        self.outgoing
            .get(id)
            .map(|idxs| {
                idxs.iter()
                    .filter(|&&i| matches!(self.edges[i].to, Target::Resolved(_)))
                    .count()
            })
            .unwrap_or(0)
    }

    /// 节点的已解析入度(incoming 只含 Resolved,直接计数)。
    pub fn in_degree(&self, id: NodeId) -> usize {
        self.incoming.get(id).map(|v| v.len()).unwrap_or(0)
    }

    /// 总度数(已解析:出度 + 入度)。
    pub fn degree(&self, id: NodeId) -> usize {
        self.out_degree(id) + self.in_degree(id)
    }

    /// 孤儿节点 id:`mode` 决定哪个方向无连边视作孤儿。
    ///   - Both:总度数 0(完全无已解析边)
    ///   - Outgoing:出度 0
    ///   - Incoming:入度 0
    pub fn orphans_by(&self, mode: OrphanMode) -> Vec<NodeId> {
        (0..self.nodes.len())
            .filter(|&id| match mode {
                OrphanMode::Both => self.degree(id) == 0,
                OrphanMode::Outgoing => self.out_degree(id) == 0,
                OrphanMode::Incoming => self.in_degree(id) == 0,
            })
            .collect()
    }

    /// 枢纽:按总度数降序(同度按 id 升序)取前 `limit`,返回 (id, degree)。0 度节点排除。
    pub fn hubs(&self, limit: usize) -> Vec<(NodeId, usize)> {
        let mut v: Vec<(NodeId, usize)> = (0..self.nodes.len())
            .map(|id| (id, self.degree(id)))
            .filter(|(_, d)| *d > 0)
            .collect();
        v.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
        v.truncate(limit);
        v
    }

    /// 节点发出的悬空目标(目标未解析的出边)。供 MCP dead / broken_links 用。
    pub fn dead_links_from(&self, id: NodeId) -> Vec<&Edge> {
        self.outgoing(id)
            .into_iter()
            .filter(|e| matches!(e.to, Target::Unresolved(_)))
            .collect()
    }
}

/// 解析索引:把 link 文本解析到节点 id。四级回退,首条命中即取(first wins)。
///   标题 → 别名(aliases) → 完整路径 stem → 裸文件名 stem(跨目录)
struct ResolveIndex {
    title: HashMap<String, NodeId>,
    alias: HashMap<String, NodeId>,
    path: HashMap<String, NodeId>,
    filestem: HashMap<String, NodeId>,
}

impl ResolveIndex {
    fn new() -> Self {
        ResolveIndex {
            title: HashMap::new(),
            alias: HashMap::new(),
            path: HashMap::new(),
            filestem: HashMap::new(),
        }
    }

    fn add_note(&mut self, id: NodeId, note: &Note) {
        self.title.entry(note.title.to_lowercase()).or_insert(id);
        for a in aliases_of(note) {
            self.alias.entry(a.to_lowercase()).or_insert(id);
        }
        self.path
            .entry(path_stem(&note.path).to_lowercase())
            .or_insert(id);
        self.filestem
            .entry(file_stem(&note.path).to_lowercase())
            .or_insert(id);
    }

    fn resolve(&self, target: &str) -> Target {
        let t = target.to_lowercase();
        if let Some(&id) = self.title.get(&t) {
            return Target::Resolved(id);
        }
        if let Some(&id) = self.alias.get(&t) {
            return Target::Resolved(id);
        }
        if let Some(&id) = self.path.get(&t) {
            return Target::Resolved(id);
        }
        if let Some(&id) = self.filestem.get(&t) {
            return Target::Resolved(id);
        }
        Target::Unresolved(target.to_string())
    }
}

/// frontmatter `aliases`(字符串或字符串列表)。
fn aliases_of(n: &Note) -> Vec<String> {
    match n.frontmatter.get("aliases") {
        Some(Value::String(s)) => vec![s.clone()],
        Some(Value::Sequence(seq)) => seq
            .iter()
            .filter_map(|v| match v {
                Value::String(s) => Some(s.clone()),
                _ => None,
            })
            .collect(),
        _ => Vec::new(),
    }
}

/// 路径去掉文件扩展名(保留目录部分)。仅当最后那个 '.' 落在文件名段才剥。
fn path_stem(path: &str) -> &str {
    match path.rsplit_once('.') {
        Some((stem, ext)) if !ext.is_empty() && !ext.contains('/') => stem,
        _ => path,
    }
}

/// 路径最后一段去扩展名(裸文件名)。用于跨目录的 `[[note]]` 解析。
fn file_stem(path: &str) -> &str {
    let last = path.rsplit('/').next().unwrap_or(path);
    match last.rsplit_once('.') {
        Some((stem, _)) => stem,
        None => last,
    }
}

/// 推一条边进图(并登记出入邻接)。
fn add_edge(
    edges: &mut Vec<Edge>,
    outgoing: &mut [Vec<usize>],
    incoming: &mut [Vec<usize>],
    from: NodeId,
    link: &Link,
    kind: EdgeKind,
    idx: &ResolveIndex,
) {
    let to = idx.resolve(&link.target);
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

    // ---- aliases 解析 ----

    #[test]
    fn resolve_by_alias_list() {
        let notes = vec![
            note("---\naliases:\n  - Foo\n  - Bar\n---\n# Real Title", "a.md"),
            note("# B\n[[Foo]]", "b.md"),
        ];
        let g = Graph::build(notes);
        assert!(
            matches!(g.edges[0].to, Target::Resolved(0)),
            "alias Foo 应解析到节点 0, got {:?}",
            g.edges[0].to
        );
        // 别名也产生反链
        assert_eq!(g.backlinks(0).len(), 1);
    }

    #[test]
    fn resolve_by_alias_scalar() {
        let notes = vec![
            note("---\naliases: Nickname\n---\n# Real", "a.md"),
            note("# B\n[[Nickname]]", "b.md"),
        ];
        let g = Graph::build(notes);
        assert!(matches!(g.edges[0].to, Target::Resolved(0)));
    }

    #[test]
    fn title_preferred_over_alias() {
        // 两个节点:一个标题 "Foo",另一个别名 "Foo"。标题优先。
        let notes = vec![
            note("# Foo", "title_node.md"),
            note("---\naliases:\n  - Foo\n---\n# Other", "alias_node.md"),
            note("# Linker\n[[Foo]]", "linker.md"),
        ];
        let g = Graph::build(notes);
        assert!(matches!(g.edges[0].to, Target::Resolved(0)));
    }

    // ---- 裸文件名跨目录解析 ----

    #[test]
    fn resolve_by_bare_filename_stem() {
        let notes = vec![
            note("# A\n[[gamma]]", "a.md"),
            note("# Gamma Real", "subdir/gamma.md"),
        ];
        let g = Graph::build(notes);
        assert!(
            matches!(g.edges[0].to, Target::Resolved(1)),
            "[[gamma]] 应按裸文件名解析到 subdir/gamma.md, got {:?}",
            g.edges[0].to
        );
    }

    #[test]
    fn resolve_path_stem_takes_priority_over_filestem() {
        // 完整路径 stem 命中优先于裸文件名(避免歧义时取更具体的)。
        let notes = vec![
            note("# A\n[[sub/x]]", "a.md"),
            note("# X", "sub/x.md"),
            note("# Other X", "other/x.md"),
        ];
        let g = Graph::build(notes);
        assert!(matches!(g.edges[0].to, Target::Resolved(1)));
    }

    /// 图健康度夹具:Alpha 出 2(均解析);Beta 出 1 但悬空(Ghost);Gamma 仅被指;Delta 孤立。
    fn health_fixture() -> Graph {
        Graph::build(vec![
            note("# Alpha\n[[Beta]]\n[[Gamma]]", "a.md"),
            note("# Beta\n[[Ghost]]", "b.md"),
            note("# Gamma", "c.md"),
            note("# Delta", "d.md"),
        ])
    }

    #[test]
    fn degree_excludes_unresolved_out_edges() {
        let g = health_fixture();
        // a: 出 2 入 0; b: 出 0(Ghost 不计)入 1; c: 入 1; d: 0。
        assert_eq!(g.out_degree(0), 2);
        assert_eq!(g.in_degree(0), 0);
        assert_eq!(g.degree(0), 2);
        assert_eq!(g.out_degree(1), 0); // Ghost 悬空,不计出度
        assert_eq!(g.in_degree(1), 1);
        assert_eq!(g.degree(1), 1);
        assert_eq!(g.degree(2), 1);
        assert_eq!(g.degree(3), 0);
    }

    #[test]
    fn orphans_by_mode() {
        let g = health_fixture();
        // Both:只有 Delta(3)完全孤立。
        assert_eq!(g.orphans_by(OrphanMode::Both), vec![3]);
        // Outgoing:a 出度 2,其余出度 0。
        assert_eq!(g.orphans_by(OrphanMode::Outgoing), vec![1, 2, 3]);
        // Incoming:a、d 无入边。
        assert_eq!(g.orphans_by(OrphanMode::Incoming), vec![0, 3]);
    }

    #[test]
    fn hubs_sorted_desc_then_id_truncated() {
        let g = health_fixture();
        // 度数 2,1,1,0 → 排除 0;同度按 id 升序。
        assert_eq!(g.hubs(10), vec![(0, 2), (1, 1), (2, 1)]);
        assert_eq!(g.hubs(1), vec![(0, 2)]);
        assert!(g.hubs(0).is_empty());
    }

    #[test]
    fn dead_links_from_returns_only_unresolved() {
        let g = health_fixture();
        // Beta(1) 的 [[Ghost]] 是悬空出边。
        let beta_dead = g.dead_links_from(1);
        assert_eq!(beta_dead.len(), 1);
        assert!(matches!(beta_dead[0].to, Target::Unresolved(_)));
        // Alpha(0) 的出边都解析了 → 无悬空。
        assert!(g.dead_links_from(0).is_empty());
    }
}

// ─────────────────────────── 属性测试(proptest)───────────────────────────

#[cfg(test)]
mod props {
    use super::*;
    use crate::index::enrich;
    use crate::parse::parse_note;
    use proptest::prelude::*;

    /// 随机笔记:title 与正文 wikilink 都从小词表 [a-e] 抽,
    /// 使部分边 Resolved(命中别的笔记 title)、部分 Unresolved(悬空)。
    fn arb_note() -> impl Strategy<Value = Note> {
        ("[a-e]{1,3}", prop::collection::vec("[a-e]{1,3}", 0..3)).prop_map(|(title, targets)| {
            let links: String = targets
                .iter()
                .map(|t| format!("[[{t}]]"))
                .collect::<Vec<_>>()
                .join(" ");
            let content = format!("# {title}\n{links}");
            enrich(parse_note(&content, &format!("{title}.md")))
        })
    }

    proptest! {
        /// 任意笔记集合 → Graph::build 不 panic。
        #[test]
        fn build_never_panics(notes in prop::collection::vec(arb_note(), 0..20)) {
            let _ = Graph::build(notes);
        }

        /// 出入邻接一致性:每条边都在其 from 的 outgoing 里;
        /// Resolved 边还在其 to 的 incoming(backlinks)里。Unresolved 边不入任何 incoming。
        #[test]
        fn adjacency_consistent(notes in prop::collection::vec(arb_note(), 0..20)) {
            let g = Graph::build(notes);
            for edge in &g.edges {
                let in_out = g.outgoing(edge.from).iter().any(|e| std::ptr::eq(*e, edge));
                prop_assert!(in_out, "边不在 from 的 outgoing 里");
                if let Target::Resolved(t) = edge.to {
                    let in_in = g.backlinks(t).iter().any(|e| std::ptr::eq(*e, edge));
                    prop_assert!(in_in, "Resolved 边不在 to 的 incoming 里");
                }
            }
        }

        /// backlinks(id).len() == 图里所有 to=Resolved(id) 的边数。
        #[test]
        fn backlinks_count_matches_edges(notes in prop::collection::vec(arb_note(), 0..20)) {
            let g = Graph::build(notes);
            for id in 0..g.nodes.len() {
                let expected = g.edges.iter().filter(|e| e.to == Target::Resolved(id)).count();
                let got = g.backlinks(id).len();
                prop_assert_eq!(expected, got);
            }
        }
    }
}
