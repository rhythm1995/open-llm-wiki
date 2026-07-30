//! VaultIndex:把 parse→enrich→graph→search 串成一个纯结构。Vault 级别的索引入口。
//!
//! **铁律延续**:本模块 IO-free。输入是纯数据 `Vec<(path, content)>` 或 `BTreeMap`;
//! 读文件系统的副作用留给 `app` 层。app 持有 entry map,路径级 delta 用
//! [`apply_entry_deltas`] 改 map 后再 [`VaultIndex::build_from_map`] —— 无磁盘 walk。

use std::collections::BTreeMap;

use crate::graph::{Graph, NodeId};
use crate::index::{enrich, Note};
use crate::parse::parse_note;
use crate::query::{eval as eval_query, Query, ResultSet};
use crate::search::SearchIndex;

/// 路径级内容 delta:`Some(content)` = upsert,`None` = 删除该路径。
pub type EntryDelta = (String, Option<String>);

/// 把路径级变更应用到 entry map(纯,无 IO)。返回变更后 map 的引用方便链式 build。
pub fn apply_entry_deltas(
    entries: &mut BTreeMap<String, String>,
    deltas: impl IntoIterator<Item = EntryDelta>,
) {
    for (path, content) in deltas {
        match content {
            Some(c) => {
                entries.insert(path, c);
            }
            None => {
                entries.remove(&path);
            }
        }
    }
}

/// entry map → 稳定有序的 (path, content) 列表(BTreeMap 已按 path 排序)。
pub fn entries_to_vec(entries: &BTreeMap<String, String>) -> Vec<(String, String)> {
    entries
        .iter()
        .map(|(p, c)| (p.clone(), c.clone()))
        .collect()
}

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

    /// 从 path→content map 构建(路径有序,与 app 内存 live entry set 对齐)。
    pub fn build_from_map(entries: &BTreeMap<String, String>) -> VaultIndex {
        VaultIndex::build(entries_to_vec(entries))
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
        eval_query(self.notes(), &self.graph, q)
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
    use crate::query::{Cmp, Direction, FieldRef, Literal, OrderKey, Predicate, ResultSet};

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
            filter: Predicate::Cmp(FieldRef::Type, Cmp::Eq, Literal::Str("Concept".into())),
            order: vec![OrderKey(FieldRef::Title, Direction::Asc)],
            ..Query::default()
        };
        let rs = v.query(&q);
        match rs {
            ResultSet::List(ids) => {
                assert_eq!(ids, vec![0]);
            }
            _ => panic!("expected List"),
        }
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

    /// 路径级 delta 应用到 entry map 后再 build,与「最终全量 entries 一次 build」一致。
    #[test]
    fn path_delta_then_build_matches_full_build() {
        let mut map = BTreeMap::new();
        map.insert(
            "a.md".into(),
            "---\ntype: Note\n---\n# A\nsee [[B]]\n".into(),
        );
        map.insert("b.md".into(), "---\ntype: Concept\n---\n# B\n".into());

        // 模拟:新增 c、改 a、删 b
        apply_entry_deltas(
            &mut map,
            vec![
                (
                    "c.md".into(),
                    Some("---\ntype: Source\ntags:\n  - x\n---\n# C\n".into()),
                ),
                (
                    "a.md".into(),
                    Some("---\ntype: Note\nstatus: done\n---\n# A updated\nno links\n".into()),
                ),
                ("b.md".into(), None),
            ],
        );

        let from_delta = VaultIndex::build_from_map(&map);
        let from_full = VaultIndex::build(vec![
            (
                "a.md".into(),
                "---\ntype: Note\nstatus: done\n---\n# A updated\nno links\n".into(),
            ),
            (
                "c.md".into(),
                "---\ntype: Source\ntags:\n  - x\n---\n# C\n".into(),
            ),
        ]);

        assert_eq!(from_delta.len(), from_full.len());
        let paths_d: Vec<_> = from_delta.notes().iter().map(|n| n.path.as_str()).collect();
        let paths_f: Vec<_> = from_full.notes().iter().map(|n| n.path.as_str()).collect();
        assert_eq!(paths_d, paths_f);
        assert_eq!(paths_d, vec!["a.md", "c.md"]);

        // 标签 / 类型倒排一致
        assert_eq!(from_delta.by_type.get("Source"), from_full.by_type.get("Source"));
        assert_eq!(from_delta.by_tag.get("x"), from_full.by_tag.get("x"));

        // 同 QQL 结果一致
        let q = Query {
            filter: Predicate::Cmp(FieldRef::Type, Cmp::Eq, Literal::Str("Source".into())),
            ..Query::default()
        };
        match (from_delta.query(&q), from_full.query(&q)) {
            (ResultSet::List(a), ResultSet::List(b)) => assert_eq!(a, b),
            _ => panic!("expected List"),
        }

        // 检索一致
        assert_eq!(
            from_delta.search(&["updated"]).len(),
            from_full.search(&["updated"]).len()
        );
        // a 已无 [[B]] 边;b 已删 → 无 resolved 边
        let resolved = from_delta
            .graph()
            .edges
            .iter()
            .filter(|e| matches!(e.to, Target::Resolved(_)))
            .count();
        assert_eq!(resolved, 0);
    }

    #[test]
    fn apply_entry_deltas_upsert_and_remove() {
        let mut map = BTreeMap::new();
        apply_entry_deltas(&mut map, vec![("x.md".into(), Some("hi".into()))]);
        assert_eq!(map.get("x.md").map(String::as_str), Some("hi"));
        apply_entry_deltas(&mut map, vec![("x.md".into(), Some("yo".into()))]);
        assert_eq!(map.get("x.md").map(String::as_str), Some("yo"));
        apply_entry_deltas(&mut map, vec![("x.md".into(), None)]);
        assert!(!map.contains_key("x.md"));
    }

    /// 覆盖 WHERE/SORT/LIMIT/SHOW 与全部 RENDER 形态(含 histogram)的真实 ResultSet 断言。
    #[test]
    fn qql_all_render_shapes_on_fixture() {
        use crate::parse_query;
        let v = VaultIndex::build(vec![
            (
                "a.md".into(),
                "---\ntype: Concept\nstatus: open\nscore: 2\ntags:\n  - t\n---\n# Alpha\n".into(),
            ),
            (
                "b.md".into(),
                "---\ntype: Concept\nstatus: done\nscore: 3\n---\n# Beta\n".into(),
            ),
            (
                "c.md".into(),
                "---\ntype: Source\nstatus: open\nscore: 1\n---\n# Gamma\n".into(),
            ),
        ]);

        // List + WHERE + SORT + LIMIT
        let q = parse_query(
            r#"WHERE type = "Concept" SORT title ASC LIMIT 10 RENDER list"#,
        )
        .unwrap();
        match v.query(&q) {
            ResultSet::List(ids) => {
                assert_eq!(ids.len(), 2);
                assert_eq!(v.notes()[ids[0]].title, "Alpha");
                assert_eq!(v.notes()[ids[1]].title, "Beta");
            }
            other => panic!("List expected, got {other:?}"),
        }

        // Count
        let q = parse_query(r#"WHERE status = "open" RENDER count"#).unwrap();
        assert_eq!(v.query(&q), ResultSet::Count(2));

        // Table + SHOW
        let q = parse_query(
            r#"WHERE type = "Concept" SHOW title, status SORT title ASC"#,
        )
        .unwrap();
        match v.query(&q) {
            ResultSet::Table(rows) => {
                assert_eq!(rows.len(), 2);
                assert_eq!(rows[0].fields.as_ref().unwrap()[0].as_deref(), Some("Alpha"));
                assert_eq!(rows[0].fields.as_ref().unwrap()[1].as_deref(), Some("open"));
            }
            other => panic!("Table expected, got {other:?}"),
        }

        // Sum
        let q = parse_query(r#"RENDER sum(score)"#).unwrap();
        assert_eq!(v.query(&q), ResultSet::Sum(6.0));

        // Groups
        let q = parse_query(r#"RENDER group_by(type)"#).unwrap();
        match v.query(&q) {
            ResultSet::Groups(rows) => {
                assert_eq!(rows.len(), 2);
                let concept = rows.iter().find(|r| r.key == "Concept").unwrap();
                assert_eq!(concept.count, 2);
                let source = rows.iter().find(|r| r.key == "Source").unwrap();
                assert_eq!(source.count, 1);
            }
            other => panic!("Groups expected, got {other:?}"),
        }

        // Histogram(status)
        let q = parse_query(r#"RENDER histogram(status)"#).unwrap();
        match v.query(&q) {
            ResultSet::Histogram(rows) => {
                assert_eq!(rows.len(), 2);
                let open = rows.iter().find(|r| r.key == "open").unwrap();
                assert_eq!(open.count, 2);
                let done = rows.iter().find(|r| r.key == "done").unwrap();
                assert_eq!(done.count, 1);
            }
            other => panic!("Histogram expected, got {other:?}"),
        }
    }
}
