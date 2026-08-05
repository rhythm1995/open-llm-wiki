//! LLM Wiki「Health 即查询」模板回归(见 docs/07 §Health 即查询、docs/14、templates/wiki-starter/health/)。
//!
//! 这五条 QQL 是随 starter vault 交付的健康指标模板。本测试既验**语法能解析**,
//! 又在一个代表 LLM Wiki 形态的小 vault 上验**语义算得对**——改 QQL 引擎或模板都会被这里挡下。
//!
//! 入度(反链)由正文 `[[wikilink]]` 生成:`mentioned_in.len()` 即图的反链入度,
//! 与 frontmatter 是否写了 `mentioned_in:` 键无关。

use openobs_core::{parse_query, ResultSet, VaultIndex};

/// 一个微型 LLM Wiki:2 个 Source(不同 evidence_tier)、2 个 Summary、
/// 2 个 Entity(其一无人引用 = 孤儿)、3 个 Concept(其一 Contested、其一深、其一浅)。
fn wiki_fixture() -> VaultIndex {
    let raw: &[(&str, &str)] = &[
        // —— Raw 层:Source(不可变;evidence_tier 区分证据质量)——
        ("src-independent.md",
         "---\ntype: Source\nevidence_tier: independent_research\nstatus: Digested\n---\n# SrcInd\n"),
        ("src-vendor.md",
         "---\ntype: Source\nevidence_tier: vendor_source\nstatus: Digested\n---\n# SrcVen\n"),
        // —— Wiki 层:Summary(派生知识;正文 wikilink 即关系边)——
        // Sum1 引用 EntA + 三个 Concept;Sum2 只补 ConDeep 一次 → ConDeep 入度 2。
        ("sum-1.md",
         "---\ntype: Summary\nstatus: Active\nsource: \"[[src-independent]]\"\n---\n# Sum1\n\n见 [[EntA]]、[[ConTested]]、[[ConThin]]、[[ConDeep]]。\n"),
        ("sum-2.md",
         "---\ntype: Summary\nstatus: Active\nsource: \"[[src-vendor]]\"\n---\n# Sum2\n\n补充 [[ConDeep]]。\n"),
        // —— Wiki 层:Entity ——
        ("ent-a.md",      "---\ntype: Entity\nstatus: Active\n---\n# EntA\n"),
        ("ent-orphan.md", "---\ntype: Entity\nstatus: Active\n---\n# EntOrphan\n"), // 入度 0 = 孤儿
        // —— Wiki 层:Concept ——
        ("con-tested.md", "---\ntype: Concept\nstatus: Contested\n---\n# ConTested\n"), // 入度 1
        ("con-thin.md",   "---\ntype: Concept\nstatus: Active\n---\n# ConThin\n"),       // 入度 1 < 2 = 单源
        ("con-deep.md",   "---\ntype: Concept\nstatus: Active\n---\n# ConDeep\n"),        // 入度 2
    ];
    let entries: Vec<(String, String)> = raw
        .iter()
        .map(|(p, c)| (p.to_string(), c.to_string()))
        .collect();
    VaultIndex::build(entries)
}

/// 把 Table / List 结果映成标题集合(顺序保留)。
fn titles(ix: &VaultIndex, rs: &ResultSet) -> Vec<String> {
    match rs {
        ResultSet::Table(rows) => rows.iter().map(|r| ix.notes()[r.id].title.clone()).collect(),
        ResultSet::List(ids) => ids.iter().map(|id| ix.notes()[*id].title.clone()).collect(),
        _ => vec![],
    }
}

fn must_run(ix: &VaultIndex, qql: &str) -> ResultSet {
    let q = parse_query(qql).unwrap_or_else(|e| panic!("QQL 应能解析:{qql}\n错误:{e}"));
    ix.query(&q)
}

#[test]
fn health_contested_concepts() {
    // 矛盾健康度:列出所有 Contested 概念。
    let ix = wiki_fixture();
    let rs = must_run(&ix, r#"WHERE type = "Concept" AND status = "Contested" SHOW title"#);
    assert_eq!(titles(&ix, &rs), vec!["ConTested"]);
}

#[test]
fn health_orphans_zero_backlinks() {
    // 孤儿:无入边的 Entity/Concept(反链入度 = 0)。注意 QQL 没有 `IS EMPTY`,
    // 用图算的 `mentioned_in.len() = 0` 表达「没有任何笔记指向我」。
    let ix = wiki_fixture();
    let rs = must_run(
        &ix,
        r#"WHERE type IN ("Entity", "Concept") AND mentioned_in.len() = 0 SHOW title"#,
    );
    assert_eq!(titles(&ix, &rs), vec!["EntOrphan"]);
}

#[test]
fn health_concept_hunger_by_depth() {
    // 概念饥饿度:每个概念的引用深度,最浅在前(最该补料的)。`group_by` 是 RENDER 模式不是子句。
    let ix = wiki_fixture();
    let rs = must_run(
        &ix,
        r#"WHERE type = "Concept" SHOW title, mentioned_in.len() AS depth SORT mentioned_in.len() ASC"#,
    );
    let mut got = titles(&ix, &rs);
    let mut want = vec![
        "ConTested".to_string(),
        "ConThin".to_string(),
        "ConDeep".to_string(),
    ];
    // 入度同为 1 的两个概念之间顺序不保证;只断言集合 + ConDeep(入度 2)必排末尾。
    got.sort();
    want.sort();
    assert_eq!(got, want, "三个概念都应在");
    match &rs {
        ResultSet::Table(rows) => {
            assert_eq!(rows.len(), 3);
            let last = &rows.last().expect("非空");
            assert_eq!(ix.notes()[last.id].title, "ConDeep", "入度最高者排末尾");
        }
        other => panic!("应为 Table,得到 {other:?}"),
    }
}

#[test]
fn health_evidence_tier_distribution() {
    // 证据质量分布:按 evidence_tier 分组数 Source。
    let ix = wiki_fixture();
    let rs = must_run(&ix, r#"WHERE type = "Source" RENDER group_by(evidence_tier)"#);
    match &rs {
        ResultSet::Groups(groups) => {
            let mut pairs: Vec<(String, usize)> =
                groups.iter().map(|g| (g.key.clone(), g.count)).collect();
            pairs.sort_by(|a, b| a.0.cmp(&b.0));
            assert_eq!(
                pairs,
                vec![
                    ("independent_research".to_string(), 1),
                    ("vendor_source".to_string(), 1)
                ]
            );
        }
        other => panic!("应为 Groups,得到 {other:?}"),
    }
}

#[test]
fn health_single_source_concepts() {
    // 综合度:引用深度 < 2 的概念(单源 / 薄证据)。ConDeep(入度 2)应被排除。
    let ix = wiki_fixture();
    let rs = must_run(
        &ix,
        r#"WHERE type = "Concept" AND mentioned_in.len() < 2 SHOW title"#,
    );
    let mut got = titles(&ix, &rs);
    got.sort();
    assert_eq!(got, vec!["ConTested".to_string(), "ConThin".to_string()]);
}
