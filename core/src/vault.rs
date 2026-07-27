//! VaultIndex:把 parse→enrich→graph→search 串成一个纯结构。Vault 级别的索引入口。
//!
//! **铁律延续**:本模块 IO-free。输入是纯数据 `Vec<(path, content)>`;读文件系统的副作用
//! 留给 `app` 层 / 二进制。这里只负责"给我笔记原文,我还你完整可查询的索引"。

use std::collections::BTreeMap;

use crate::graph::{Graph, NodeId};
use crate::index::{enrich, Note};
use crate::parse::parse_note;
use crate::query::{eval as eval_query, Query, ResultSet};
use crate::search::SearchIndex;

/// Vault 级索引:图谱 + 全文检索 + 标签/类型倒排。一次性构建,纯只读查询。
pub struct VaultIndex {
    graph: Graph,
    search: SearchIndex,
    /// 标签 → 节点 id 列表(升序)。
    pub by_tag: BTreeMap<String, Vec<NodeId>>,
    /// 软类型 → 节点 id 列表(升序)。
    pub by_type: BTreeMap<String, Vec<NodeId>>,
}

impl VaultIndex {
    /// 从 (路径, 内容) 列表构建完整索引。
    pub fn build(entries: Vec<(String, String)>) -> VaultIndex {
        let notes: Vec<Note> = entries
            .into_iter()
            .map(|(path, content)| enrich(parse_note(&content, &path)))
            .collect();

        let search = SearchIndex::build(&notes);

        let mut by_tag: BTreeMap<String, Vec<NodeId>> = BTreeMap::new();
        let mut by_type: BTreeMap<String, Vec<NodeId>> = BTreeMap::new();
        for (i, n) in notes.iter().enumerate() {
            for t in crate::index::tags(n) {
                by_tag.entry(t).or_default().push(i);
            }
            if let Some(ty) = crate::index::type_of(n) {
                by_type.entry(ty).or_default().push(i);
            }
        }

        let graph = Graph::build(notes);

        VaultIndex {
            graph,
            search,
            by_tag,
            by_type,
        }
    }

    /// 全部笔记(graph 持有)。
    pub fn notes(&self) -> &[Note] {
        &self.graph.nodes
    }

    /// 图谱。
    pub fn graph(&self) -> &Graph {
        &self.graph
    }

    /// QQL 求值。
    pub fn query(&self, q: &Query) -> ResultSet {
        eval_query(self.notes(), q)
    }

    /// 全文检索(AND 语义)。返回按分降序的 (节点 id, 分数)。
    pub fn search(&self, terms: &[&str]) -> Vec<(NodeId, f64)> {
        self.search.search(terms)
    }

    /// 节点数。
    pub fn len(&self) -> usize {
        self.graph.nodes.len()
    }

    /// 是否空 vault。
    pub fn is_empty(&self) -> bool {
        self.graph.nodes.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::graph::{EdgeKind, Target};
    use crate::query::{Direction, OrderKey, Predicate};

    fn sample() -> VaultIndex {
        VaultIndex::build(vec![
            (
                "alpha.md".into(),
                "---\ntype: Concept\ntags:\n  - idea\nsource: \"[[beta]]\"\n---\n# Alpha\n\nsee [[Beta]] and #idea.\n".into(),
            ),
            (
                "beta.md".into(),
                "---\ntype: Source\nstatus: active\n---\n# Beta\n\nthe source of truth.\n".into(),
            ),
            (
                "orphan.md".into(),
                "# Orphan\n\nlinks to [[Ghost]] nowhere.\n".into(),
            ),
        ])
    }

    #[test]
    fn build_node_and_edge_counts() {
        let v = sample();
        assert_eq!(v.len(), 3);
        // Alpha→Beta:正文 Wiki + frontmatter source Relation = 2 条边都解析到 Beta
        // Orphan→Ghost:1 条悬空 Wiki 边
        let resolved: Vec<&Target> = v.graph().edges.iter().map(|e| &e.to).collect();
        let dangling = resolved
            .iter()
            .filter(|t| matches!(t, Target::Unresolved(_)))
            .count();
        assert_eq!(dangling, 1);
    }

    #[test]
    fn by_tag_and_by_type() {
        let v = sample();
        assert_eq!(
            v.by_type.get("Concept").map(|x| x.as_slice()),
            Some(&[0][..])
        );
        assert_eq!(
            v.by_type.get("Source").map(|x| x.as_slice()),
            Some(&[1][..])
        );
        // Alpha 的 #idea(frontmatter tag + 正文 #idea → 两条,不去重)
        let idea = v.by_tag.get("idea").unwrap();
        assert!(idea.contains(&0));
    }

    #[test]
    fn query_end_to_end() {
        let v = sample();
        let q = Query {
            filter: Predicate::HasType("Concept".into()),
            order: vec![OrderKey::Title(Direction::Asc)],
            ..Query::default()
        };
        let rs = v.query(&q);
        assert_eq!(rs.len(), 1);
        assert_eq!(rs[0].id, 0);
    }

    #[test]
    fn search_end_to_end() {
        let v = sample();
        let r = v.search(&["truth"]);
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].0, 1); // Beta
    }

    #[test]
    fn backlinks_unify_wiki_and_relation() {
        let v = sample();
        // Beta 被正文 Wiki + frontmatter source Relation 同时反向链接
        let bl = v.graph().backlinks(1);
        assert_eq!(bl.len(), 2);
        assert!(bl.iter().any(|e| matches!(e.kind, EdgeKind::Wiki)));
        assert!(bl
            .iter()
            .any(|e| matches!(&e.kind, EdgeKind::Relation(k) if k == "source")));
    }
}
