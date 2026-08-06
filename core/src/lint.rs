//! 内容级 lint L1 —— 纯结构启发式(零模型、零依赖;只产候选、不做判决)。
//!
//! 设计依据:`docs/research/content-lint-contradiction.md` §5.0/§5.1。
//! - **只产候选,不自动改 `status`**:把候选落成 `contradicts` 边 / `Contested` 状态,
//!   永远是 agent/人经 `write_note` 的显式动作;本模块只读、纯函数、IO-free。
//! - QQL 可直接表达的两条(**L1-C** 陈旧 Source、**L1-B** 同名粗筛)不在本模块重复,
//!   见 `templates/wiki-starter/health/stale-sources.md` 与 `duplicate-titles.md`。
//!
//! 本模块覆盖 QQL 够不到的跨笔记检查(均以 [`Finding`] 返回,可解释、不判决):
//! - [`contradiction_consistency`] —— L1-A:`contradicts` ↔ `Contested` 双向一致性;
//! - [`duplicate_names`] —— L1-B 精筛:归一化 title/alias 撞名(解析 first-wins 的隐患);
//! - [`summaries_on_superseded`] —— L1-D:Summary 挂在已废源上;
//! - [`refs_to_superseded`] —— L1-E:Active/Contested 页仍引用 Superseded 页。

use std::collections::{BTreeMap, BTreeSet};

use crate::graph::{aliases_of, EdgeKind, Graph, NodeId, Target};
use crate::index::{frontmatter_str, type_of, Note};

/// lint 候选(「报告/候选」,绝不直接改 vault)。
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct Finding {
    pub kind: FindingKind,
    /// 处理时先看这个节点。
    pub subject: NodeId,
    /// 边另一端的关联节点(如有)。
    pub other: Option<NodeId>,
}

/// 候选类型 = 可解释信号(为什么这一页 / 这一对被提名)。
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
pub enum FindingKind {
    /// L1-A 规则①:存在 `contradicts` 边,但两端都没标 `Contested`。
    ContradictionUncontested,
    /// L1-A 规则②:`status: Contested` 的 Concept 却无任何入向 `contradicts` 边(状态与图脱节)。
    ContestedWithoutContradiction,
    /// L1-D:Summary 的 `source:` 挂在 `Superseded` 页上(派生知识挂在已废源上)。
    SummaryOnSuperseded,
    /// L1-E:Active/Contested 页仍引用 `Superseded` 页(contradicts / superseded_by 边除外)。
    RefToSuperseded,
}

fn status_of(n: &Note) -> Option<String> {
    frontmatter_str(n, "status")
}

fn is_status(n: &Note, want: &str) -> bool {
    status_of(n).as_deref() == Some(want)
}

fn is_relation(e: &EdgeKind, key: &str) -> bool {
    matches!(e, EdgeKind::Relation(k) if k == key)
}

/// L1-A:`contradicts` ↔ `Contested` 双向一致性。
///
/// - 规则①:`contradicts` 边两端都没标 `Contested` → 报(ingest 约定 docs/14 §1.4 被漏执行)。
///   首版宽严取宽松:任一端已 `Contested` 即过(边方向由人手写,可能写反)。
/// - 规则②:`type: Concept AND status = Contested` 但无入向 `contradicts` 边 → 报。
///
/// 同一对节点的多条 / 双向 `contradicts` 边去重为一条候选。
pub fn contradiction_consistency(g: &Graph) -> Vec<Finding> {
    let mut out: Vec<Finding> = Vec::new();
    let mut seen_pairs: BTreeSet<(NodeId, NodeId)> = BTreeSet::new();

    for e in &g.edges {
        if !is_relation(&e.kind, "contradicts") {
            continue;
        }
        let Target::Resolved(to) = e.to else {
            continue;
        };
        let (a, b) = (e.from, to);
        if !seen_pairs.insert((a.min(b), a.max(b))) {
            continue;
        }
        if !is_status(&g.nodes[a], "Contested") && !is_status(&g.nodes[b], "Contested") {
            out.push(Finding {
                kind: FindingKind::ContradictionUncontested,
                subject: a,
                other: Some(b),
            });
        }
    }

    for (id, n) in g.nodes.iter().enumerate() {
        if type_of(n).as_deref() != Some("Concept") || !is_status(n, "Contested") {
            continue;
        }
        let has_in = g
            .backlinks(id)
            .iter()
            .any(|e| is_relation(&e.kind, "contradicts"));
        if !has_in {
            out.push(Finding {
                kind: FindingKind::ContestedWithoutContradiction,
                subject: id,
                other: None,
            });
        }
    }
    out
}

/// L1-B 精筛:归一化(小写、trim)后的 title / alias 撞名。
///
/// 返回 (归一化键, 撞名节点集),按键升序;只报 ≥ 2 个**不同**节点的桶。
/// 补齐 QQL `group_by(title)` 够不到的:大小写差异、alias 撞名、title × alias 交叉撞。
/// 撞名之所以是隐患:`ResolveIndex` first-wins,链接会静默偏向第一篇。
pub fn duplicate_names(notes: &[Note]) -> Vec<(String, Vec<NodeId>)> {
    let mut buckets: BTreeMap<String, BTreeSet<NodeId>> = BTreeMap::new();
    for (id, n) in notes.iter().enumerate() {
        let title_key = n.title.trim().to_lowercase();
        if !title_key.is_empty() {
            buckets.entry(title_key).or_default().insert(id);
        }
        for a in aliases_of(n) {
            let key = a.trim().to_lowercase();
            if !key.is_empty() {
                buckets.entry(key).or_default().insert(id);
            }
        }
    }
    buckets
        .into_iter()
        .filter(|(_, set)| set.len() > 1)
        .map(|(key, set)| (key, set.into_iter().collect()))
        .collect()
}

/// L1-D:Summary 的 `source:` 指向 `Superseded` 页 → 报「派生知识挂在已废源上」。
///
/// 已退役(`Superseded`)的 Summary 挂着已废源是正常配对,不报。
pub fn summaries_on_superseded(g: &Graph) -> Vec<Finding> {
    let mut out: Vec<Finding> = Vec::new();
    let mut seen: BTreeSet<(NodeId, NodeId)> = BTreeSet::new();
    for e in &g.edges {
        if !is_relation(&e.kind, "source") {
            continue;
        }
        let Target::Resolved(to) = e.to else {
            continue;
        };
        let from = &g.nodes[e.from];
        if type_of(from).as_deref() != Some("Summary") || is_status(from, "Superseded") {
            continue;
        }
        if !is_status(&g.nodes[to], "Superseded") {
            continue;
        }
        if seen.insert((e.from, to)) {
            out.push(Finding {
                kind: FindingKind::SummaryOnSuperseded,
                subject: e.from,
                other: Some(to),
            });
        }
    }
    out
}

/// L1-E:Active/Contested 页的出边指向 `Superseded` 页 → 报「旧结论仍被当下引用」。
///
/// 两类边豁免:`contradicts`(反驳旧主张是正当的)与 `superseded_by`(替换指针正是该有的链接)。
pub fn refs_to_superseded(g: &Graph) -> Vec<Finding> {
    let mut out: Vec<Finding> = Vec::new();
    let mut seen: BTreeSet<(NodeId, NodeId)> = BTreeSet::new();
    for e in &g.edges {
        let Target::Resolved(to) = e.to else {
            continue;
        };
        if !is_status(&g.nodes[to], "Superseded") {
            continue;
        }
        let from = &g.nodes[e.from];
        let active_side = matches!(status_of(from).as_deref(), Some("Active") | Some("Contested"));
        if !active_side {
            continue;
        }
        if is_relation(&e.kind, "contradicts") || is_relation(&e.kind, "superseded_by") {
            continue;
        }
        if seen.insert((e.from, to)) {
            out.push(Finding {
                kind: FindingKind::RefToSuperseded,
                subject: e.from,
                other: Some(to),
            });
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::index::enrich;
    use crate::parse::parse_note;

    fn note(content: &str, path: &str) -> Note {
        enrich(parse_note(content, path))
    }

    fn kinds(findings: &[Finding]) -> Vec<FindingKind> {
        findings.iter().map(|f| f.kind).collect()
    }

    // ---- L1-A 规则①:contradicts 边两端都没 Contested ----

    #[test]
    fn contradiction_edge_without_contested_reported() {
        let g = Graph::build(vec![
            note(
                "---\ntype: Concept\nstatus: Active\ncontradicts:\n  - \"[[B]]\"\n---\n# A",
                "a.md",
            ),
            note("---\ntype: Concept\nstatus: Active\n---\n# B", "b.md"),
        ]);
        let f = contradiction_consistency(&g);
        assert_eq!(f.len(), 1);
        assert_eq!(f[0].kind, FindingKind::ContradictionUncontested);
        assert_eq!(f[0].subject, 0);
        assert_eq!(f[0].other, Some(1));
    }

    #[test]
    fn contradiction_edge_with_contested_target_passes_rule_one() {
        // 规则①宽松:被反驳方已 Contested 即过(B 有入向 contradicts 边,规则②也过)。
        let g = Graph::build(vec![
            note(
                "---\ntype: Concept\nstatus: Active\ncontradicts:\n  - \"[[B]]\"\n---\n# A",
                "a.md",
            ),
            note("---\ntype: Concept\nstatus: Contested\n---\n# B", "b.md"),
        ]);
        assert!(kinds(&contradiction_consistency(&g)).is_empty());
    }

    #[test]
    fn contested_rebutter_without_inbound_edge_flagged_by_rule_two() {
        // A 反驳 B 且 A 自己标了 Contested:规则①过(A 已 Contested),但规则②报 A——
        // 没有入向 contradicts 边说明「谁反驳了 A」在图里不存在,状态与图脱节,正该报。
        let g = Graph::build(vec![
            note(
                "---\ntype: Concept\nstatus: Contested\ncontradicts:\n  - \"[[B]]\"\n---\n# A",
                "a.md",
            ),
            note("---\ntype: Concept\nstatus: Active\n---\n# B", "b.md"),
        ]);
        let f = contradiction_consistency(&g);
        assert_eq!(f.len(), 1);
        assert_eq!(f[0].kind, FindingKind::ContestedWithoutContradiction);
        assert_eq!(f[0].subject, 0);
    }

    #[test]
    fn contradiction_pair_deduped_across_edges_and_directions() {
        // A→B 与 B→A 两条 contradicts 边 = 同一对 → 只报一条。
        let g = Graph::build(vec![
            note(
                "---\ntype: Concept\nstatus: Active\ncontradicts:\n  - \"[[B]]\"\n---\n# A",
                "a.md",
            ),
            note(
                "---\ntype: Concept\nstatus: Active\ncontradicts:\n  - \"[[A]]\"\n---\n# B",
                "b.md",
            ),
        ]);
        let f = contradiction_consistency(&g);
        assert_eq!(
            kinds(&f),
            vec![FindingKind::ContradictionUncontested],
            "同一对只报一条"
        );
    }

    #[test]
    fn unresolved_contradicts_target_not_reported() {
        // contradicts 指向不存在的笔记(悬空)→ 规则①不适用(先修断链,见 links kind=dead)。
        let g = Graph::build(vec![note(
            "---\ntype: Concept\nstatus: Active\ncontradicts:\n  - \"[[Ghost]]\"\n---\n# A",
            "a.md",
        )]);
        assert!(kinds(&contradiction_consistency(&g)).is_empty());
    }

    // ---- L1-A 规则②:Contested 却无入向 contradicts 边 ----

    #[test]
    fn contested_concept_without_inbound_contradicts_reported() {
        let g = Graph::build(vec![note(
            "---\ntype: Concept\nstatus: Contested\n---\n# A",
            "a.md",
        )]);
        let f = contradiction_consistency(&g);
        assert_eq!(f.len(), 1);
        assert_eq!(f[0].kind, FindingKind::ContestedWithoutContradiction);
        assert_eq!(f[0].subject, 0);
        assert_eq!(f[0].other, None);
    }

    #[test]
    fn contested_concept_with_inbound_contradicts_passes() {
        let g = Graph::build(vec![
            note(
                "---\ntype: Concept\nstatus: Active\ncontradicts:\n  - \"[[B]]\"\n---\n# A",
                "a.md",
            ),
            note("---\ntype: Concept\nstatus: Contested\n---\n# B", "b.md"),
        ]);
        assert!(kinds(&contradiction_consistency(&g)).is_empty());
    }

    #[test]
    fn contested_non_concept_not_checked_by_rule_two() {
        // 规则②只看 Concept;Entity 标 Contested 不在本规则射程(类型约定外,不判决)。
        let g = Graph::build(vec![note(
            "---\ntype: Entity\nstatus: Contested\n---\n# A",
            "a.md",
        )]);
        assert!(kinds(&contradiction_consistency(&g)).is_empty());
    }

    // ---- L1-B:归一化撞名 ----

    #[test]
    fn duplicate_titles_case_insensitive() {
        let notes = vec![
            note("---\ntype: Concept\n---\n# Foo Bar", "a.md"),
            note("---\ntype: Entity\n---\n# foo bar ", "b.md"),
            note("---\ntype: Concept\n---\n# Baz", "c.md"),
        ];
        let dups = duplicate_names(&notes);
        assert_eq!(dups.len(), 1);
        assert_eq!(dups[0].0, "foo bar");
        assert_eq!(dups[0].1, vec![0, 1]);
    }

    #[test]
    fn duplicate_alias_and_title_cross() {
        // A 的 title 与 B 的 alias 撞 → 报(解析时 title 优先,[[foo]] 会静默偏向 A)。
        let notes = vec![
            note("# Foo", "a.md"),
            note("---\naliases:\n  - Foo\n---\n# Other", "b.md"),
        ];
        let dups = duplicate_names(&notes);
        assert_eq!(dups.len(), 1);
        assert_eq!(dups[0].0, "foo");
        assert_eq!(dups[0].1, vec![0, 1]);
    }

    #[test]
    fn same_note_title_alias_not_false_positive() {
        // 同一篇笔记的 title 与 alias 归一化相同 → 桶里只有一个节点,不报。
        let notes = vec![note("---\naliases:\n  - foo\n---\n# Foo", "a.md")];
        assert!(duplicate_names(&notes).is_empty());
    }

    // ---- L1-D:Summary 挂在已废源上 ----

    #[test]
    fn summary_on_superseded_reported() {
        let g = Graph::build(vec![
            note(
                "---\ntype: Summary\nstatus: Active\nsource: \"[[s]]\"\n---\n# Sum",
                "sum.md",
            ),
            note("---\ntype: Source\nstatus: Superseded\n---\n# S", "s.md"),
        ]);
        let f = summaries_on_superseded(&g);
        assert_eq!(f.len(), 1);
        assert_eq!(f[0].kind, FindingKind::SummaryOnSuperseded);
        assert_eq!(f[0].subject, 0);
        assert_eq!(f[0].other, Some(1));
    }

    #[test]
    fn summary_on_live_source_passes() {
        let g = Graph::build(vec![
            note(
                "---\ntype: Summary\nstatus: Active\nsource: \"[[s]]\"\n---\n# Sum",
                "sum.md",
            ),
            note("---\ntype: Source\nstatus: Digested\n---\n# S", "s.md"),
        ]);
        assert!(summaries_on_superseded(&g).is_empty());
    }

    #[test]
    fn superseded_summary_on_superseded_source_passes() {
        // 已退役的 Summary 挂着已废源是正常配对,不报。
        let g = Graph::build(vec![
            note(
                "---\ntype: Summary\nstatus: Superseded\nsource: \"[[s]]\"\n---\n# Sum",
                "sum.md",
            ),
            note("---\ntype: Source\nstatus: Superseded\n---\n# S", "s.md"),
        ]);
        assert!(summaries_on_superseded(&g).is_empty());
    }

    #[test]
    fn non_summary_with_source_edge_not_reported() {
        // 规则只查 type: Summary 的主语;其他类型写 source: 不在射程。
        let g = Graph::build(vec![
            note(
                "---\ntype: Concept\nstatus: Active\nsource: \"[[s]]\"\n---\n# C",
                "c.md",
            ),
            note("---\ntype: Source\nstatus: Superseded\n---\n# S", "s.md"),
        ]);
        assert!(summaries_on_superseded(&g).is_empty());
    }

    // ---- L1-E:Active/Contested 页仍引用 Superseded 页 ----

    #[test]
    fn active_ref_to_superseded_reported() {
        let g = Graph::build(vec![
            note("---\ntype: Concept\nstatus: Active\n---\n# A\n见 [[B]]。", "a.md"),
            note("---\ntype: Summary\nstatus: Superseded\n---\n# B", "b.md"),
        ]);
        let f = refs_to_superseded(&g);
        assert_eq!(f.len(), 1);
        assert_eq!(f[0].kind, FindingKind::RefToSuperseded);
        assert_eq!(f[0].subject, 0);
        assert_eq!(f[0].other, Some(1));
    }

    #[test]
    fn contradicts_and_superseded_by_edges_exempt() {
        // 反驳旧主张、指向替换者,都是对旧页的正当引用。
        let g = Graph::build(vec![
            note(
                "---\ntype: Concept\nstatus: Active\ncontradicts:\n  - \"[[B]]\"\n---\n# A",
                "a.md",
            ),
            note("---\ntype: Concept\nstatus: Superseded\n---\n# B", "b.md"),
            note(
                "---\ntype: Summary\nstatus: Active\nsuperseded_by: \"[[B]]\"\n---\n# C",
                "c.md",
            ),
        ]);
        assert!(refs_to_superseded(&g).is_empty());
    }

    #[test]
    fn refs_from_retired_or_statusless_pages_not_reported() {
        // 主语只认 Active/Contested:Superseded 页、无 status 页引用旧页不报。
        let g = Graph::build(vec![
            note(
                "---\ntype: Summary\nstatus: Superseded\n---\n# A\n见 [[C]]。",
                "a.md",
            ),
            note("# B\n见 [[C]]。", "b.md"),
            note("---\ntype: Summary\nstatus: Superseded\n---\n# C", "c.md"),
        ]);
        assert!(refs_to_superseded(&g).is_empty());
    }

    #[test]
    fn multi_edge_pair_deduped() {
        // 同一对 (A→B) 的正文 Wiki 边 + frontmatter mentions 边 → 只报一条。
        let g = Graph::build(vec![
            note(
                "---\ntype: Concept\nstatus: Active\nmentions:\n  - \"[[B]]\"\n---\n# A\n见 [[B]]。",
                "a.md",
            ),
            note("---\ntype: Summary\nstatus: Superseded\n---\n# B", "b.md"),
        ]);
        let f = refs_to_superseded(&g);
        assert_eq!(f.len(), 1);
    }
}

// ─────────────────────────── 属性测试(proptest)───────────────────────────

#[cfg(test)]
mod props {
    use super::*;
    use crate::index::enrich;
    use crate::parse::parse_note;
    use proptest::prelude::*;

    const STATUSES: [&str; 4] = ["Active", "Contested", "Superseded", "Digested"];
    const TYPES: [&str; 4] = ["Concept", "Summary", "Source", "Entity"];

    /// 随机笔记:小词表 title / 链接 / aliases(制造撞名与解析命中),
    /// 可选 frontmatter(status/type/contradicts 从词表抽)——让四条 lint 都有机会触发。
    fn arb_note() -> impl Strategy<Value = Note> {
        (
            "[a-e]{1,3}",
            prop::collection::vec("[a-e]{1,3}", 0..3),
            prop::collection::vec("[a-e]{1,3}", 0..2),
            0usize..5,
            0usize..5,
            prop::collection::vec("[a-e]{1,3}", 0..2),
        )
            .prop_map(|(title, links, aliases, s_pick, t_pick, contra)| {
                let mut fm = String::new();
                let mut has_fm = false;
                if s_pick < STATUSES.len() {
                    fm.push_str(&format!("status: {}\n", STATUSES[s_pick]));
                    has_fm = true;
                }
                if t_pick < TYPES.len() {
                    fm.push_str(&format!("type: {}\n", TYPES[t_pick]));
                    has_fm = true;
                }
                if !aliases.is_empty() {
                    fm.push_str("aliases:\n");
                    for a in &aliases {
                        fm.push_str(&format!("  - {a}\n"));
                    }
                    has_fm = true;
                }
                if !contra.is_empty() {
                    fm.push_str("contradicts:\n");
                    for c in &contra {
                        fm.push_str(&format!("  - \"[[{c}]]\"\n"));
                    }
                    has_fm = true;
                }
                let body_links: Vec<String> = links.iter().map(|t| format!("[[{t}]]")).collect();
                let content = if has_fm {
                    format!("---\n{fm}---\n# {title}\n{}", body_links.join(" "))
                } else {
                    format!("# {title}\n{}", body_links.join(" "))
                };
                enrich(parse_note(&content, &format!("{title}.md")))
            })
    }

    fn all_findings(g: &Graph) -> Vec<Finding> {
        let mut v = contradiction_consistency(g);
        v.extend(summaries_on_superseded(g));
        v.extend(refs_to_superseded(g));
        v
    }

    proptest! {
        /// 任意笔记集合 → 四条 lint 均不 panic。
        #[test]
        fn lint_never_panics(notes in prop::collection::vec(arb_note(), 0..20)) {
            let g = Graph::build(notes.clone());
            let _ = all_findings(&g);
            let _ = duplicate_names(&notes);
        }

        /// 候选引用的节点 id 全部合法。
        #[test]
        fn findings_reference_valid_nodes(notes in prop::collection::vec(arb_note(), 0..20)) {
            let g = Graph::build(notes);
            for f in all_findings(&g) {
                prop_assert!(f.subject < g.nodes.len());
                if let Some(o) = f.other {
                    prop_assert!(o < g.nodes.len());
                }
            }
        }

        /// 健全性:凡 RefToSuperseded / SummaryOnSuperseded,目标必是 Superseded。
        #[test]
        fn superseded_findings_point_at_superseded(notes in prop::collection::vec(arb_note(), 0..20)) {
            let g = Graph::build(notes);
            for f in all_findings(&g) {
                if matches!(f.kind, FindingKind::RefToSuperseded | FindingKind::SummaryOnSuperseded) {
                    let target = f.other.expect("此类候选必带 other");
                    prop_assert!(is_status(&g.nodes[target], "Superseded"));
                }
            }
        }

        /// 健全性:撞名桶必有 ≥ 2 个不同节点,且每个节点确实在该键上有 title 或 alias。
        #[test]
        fn duplicate_buckets_are_real(notes in prop::collection::vec(arb_note(), 0..20)) {
            for (key, ids) in duplicate_names(&notes) {
                prop_assert!(ids.len() >= 2);
                for &id in &ids {
                    let n = &notes[id];
                    let hit_title = n.title.trim().to_lowercase() == key;
                    let hit_alias = aliases_of(n)
                        .iter()
                        .any(|a| a.trim().to_lowercase() == key);
                    prop_assert!(hit_title || hit_alias);
                }
            }
        }
    }
}
