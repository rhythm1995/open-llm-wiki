//! LLM Wiki「Health 即查询」模板回归(见 docs/07 §Health 即查询、docs/14、templates/wiki-starter/health/)。
//!
//! 这十一条 QQL 是随 starter vault 交付的健康指标模板。本测试既验**语法能解析**,
//! 又在一个代表 LLM Wiki 形态的小 vault 上验**语义算得对**——改 QQL 引擎或模板都会被这里挡下。
//!
//! 入度(反链)由正文 `[[wikilink]]` 生成:`mentioned_in.len()` 即图的反链入度,
//! 与 frontmatter 是否写了 `mentioned_in:` 键无关。

use open_llm_wiki_core::{parse_query, ResultSet, VaultIndex};

/// 一个微型 LLM Wiki:2 个 Source(不同 evidence_tier)、2 个 Summary、
/// 2 个 Entity(其一无人引用 = 孤儿)、3 个 Concept(其一 Contested、其一深、其一浅)。
/// provenance/reviewed/last_verified 字段按「provenance 约定」(docs/research/trust-provenance-frontmatter.md)布点,
/// 让溯源 / 漂移类健康查询各有非空命中:Sum1/ConThin 从未复审、ConTested 复审超期、EntOrphan 缺字段进 (none) 桶。
fn wiki_fixture() -> VaultIndex {
    let raw: &[(&str, &str)] = &[
        // —— Raw 层:Source(不可变;evidence_tier 区分证据质量)——
        ("src-independent.md",
         "---\ntype: Source\nevidence_tier: independent_research\nstatus: Digested\nprovenance: ingested\nlast_verified: 2026-03-01\n---\n# SrcInd\n"),
        ("src-vendor.md",
         "---\ntype: Source\nevidence_tier: vendor_source\nstatus: Digested\nprovenance: ingested\n---\n# SrcVen\n"),
        // —— Wiki 层:Summary(派生知识;正文 wikilink 即关系边)——
        // Sum1 引用 EntA + 三个 Concept;Sum2 只补 ConDeep 一次 → ConDeep 入度 2。
        ("sum-1.md",
         "---\ntype: Summary\nstatus: Active\nprovenance: agent\nsource: \"[[src-independent]]\"\n---\n# Sum1\n\n见 [[EntA]]、[[ConTested]]、[[ConThin]]、[[ConDeep]]。\n"),
        ("sum-2.md",
         "---\ntype: Summary\nstatus: Active\nprovenance: agent\nreviewed: 2026-07-01\nsource: \"[[src-vendor]]\"\n---\n# Sum2\n\n补充 [[ConDeep]]。\n"),
        // —— Wiki 层:Entity ——
        ("ent-a.md",      "---\ntype: Entity\nstatus: Active\nprovenance: human\nreviewed: 2026-07-15\n---\n# EntA\n"),
        ("ent-orphan.md", "---\ntype: Entity\nstatus: Active\n---\n# EntOrphan\n"), // 入度 0 = 孤儿;无 provenance → (none) 桶
        // —— Wiki 层:Concept ——
        ("con-tested.md", "---\ntype: Concept\nstatus: Contested\nprovenance: agent\nreviewed: 2026-04-01\n---\n# ConTested\n"), // 入度 1;复审超期
        ("con-thin.md",   "---\ntype: Concept\nstatus: Active\nprovenance: agent\n---\n# ConThin\n"),  // 入度 1 < 2 = 单源;从未复审
        ("con-deep.md",   "---\ntype: Concept\nstatus: Active\nprovenance: agent\nreviewed: 2026-07-20\n---\n# ConDeep\n"), // 入度 2
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

// ── provenance / 信任分级模板(docs/research/trust-provenance-frontmatter.md §5.3)──

#[test]
fn health_agent_unreviewed() {
    // 溯源健康:agent 写了但从没人复核的页。Sum1 / ConThin 是 agent 产出且无 reviewed。
    let ix = wiki_fixture();
    let rs = must_run(
        &ix,
        r#"WHERE provenance = "agent" AND NOT has reviewed SHOW title"#,
    );
    let mut got = titles(&ix, &rs);
    got.sort();
    assert_eq!(got, vec!["ConThin".to_string(), "Sum1".to_string()]);
}

#[test]
fn health_stale_agent_notes_with_cutoff() {
    // 复审超期:cutoff 由运行者插值(QQL 无日期算术)。从未复审与复审太早一并捞出;
    // Sum2 / ConDeep 复审在 cutoff 之后 → 不命中。
    let ix = wiki_fixture();
    let rs = must_run(
        &ix,
        r#"WHERE provenance = "agent" AND (NOT has reviewed OR reviewed < "2026-06-01") SHOW title"#,
    );
    let mut got = titles(&ix, &rs);
    got.sort();
    assert_eq!(
        got,
        vec![
            "ConTested".to_string(),
            "ConThin".to_string(),
            "Sum1".to_string()
        ]
    );
}

#[test]
fn health_unreviewed_pages_any_producer() {
    // 漂移风险:无 reviewed 的 Wiki 层页,不限产出者(EntOrphan 是人/未知产出也命中)。
    let ix = wiki_fixture();
    let rs = must_run(
        &ix,
        r#"WHERE type IN ("Concept", "Entity", "Summary") AND NOT has reviewed SHOW title"#,
    );
    let mut got = titles(&ix, &rs);
    got.sort();
    assert_eq!(
        got,
        vec![
            "ConThin".to_string(),
            "EntOrphan".to_string(),
            "Sum1".to_string()
        ]
    );
}

#[test]
fn health_knowledge_mix_by_provenance() {
    // 知识构成:按 provenance 分组;缺失字段进 (none) 桶——该桶本身就是字段腐烂探针。
    let ix = wiki_fixture();
    let rs = must_run(
        &ix,
        r#"WHERE type IN ("Concept", "Entity", "Summary") RENDER group_by(provenance)"#,
    );
    match &rs {
        ResultSet::Groups(groups) => {
            let mut pairs: Vec<(String, usize)> =
                groups.iter().map(|g| (g.key.clone(), g.count)).collect();
            pairs.sort_by(|a, b| a.0.cmp(&b.0));
            assert_eq!(
                pairs,
                vec![
                    ("(none)".to_string(), 1), // EntOrphan
                    ("agent".to_string(), 5),  // Sum1 Sum2 ConTested ConThin ConDeep
                    ("human".to_string(), 1)   // EntA
                ]
            );
        }
        other => panic!("应为 Groups,得到 {other:?}"),
    }
}

// ── 内容级 lint L1 的 QQL 侧(docs/research/content-lint-contradiction.md §5.1/§5.4)──

#[test]
fn health_stale_sources() {
    // L1-C 第一条:last_verified 超期(ISO 日期串字典序 = 日期序);阈值由 lint 运行者插值。
    let ix = wiki_fixture();
    let rs = must_run(
        &ix,
        r#"WHERE type = "Source" AND last_verified < "2026-06-01" SORT last_verified ASC SHOW title, last_verified"#,
    );
    assert_eq!(titles(&ix, &rs), vec!["SrcInd"]);
    // L1-C 第二条:缺 last_verified 的页第一条捕不到,需第二条。
    let rs = must_run(
        &ix,
        r#"WHERE type = "Source" AND NOT has last_verified SHOW title"#,
    );
    assert_eq!(titles(&ix, &rs), vec!["SrcVen"]);
}

#[test]
fn health_duplicate_titles_coarse() {
    // L1-B 粗筛:group_by(title) 按原值分桶,count > 1 即撞名。
    // (大小写归一与 alias 撞名 QQL 够不到,由 core::lint::duplicate_names 精筛。)
    let entries: Vec<(String, String)> = vec![
        (
            "a.md".to_string(),
            "---\ntype: Concept\n---\n# Foo Bar\n".to_string(),
        ),
        (
            "b.md".to_string(),
            "---\ntype: Concept\n---\n# Foo Bar\n".to_string(),
        ),
        (
            "c.md".to_string(),
            "---\ntype: Entity\n---\n# Baz\n".to_string(),
        ),
    ];
    let ix = VaultIndex::build(entries);
    let rs = must_run(
        &ix,
        r#"WHERE type IN ("Concept", "Entity") RENDER group_by(title)"#,
    );
    match &rs {
        ResultSet::Groups(groups) => {
            let dup = groups
                .iter()
                .find(|g| g.key == "Foo Bar")
                .expect("应有 Foo Bar 桶");
            assert_eq!(dup.count, 2);
            let baz = groups.iter().find(|g| g.key == "Baz").expect("应有 Baz 桶");
            assert_eq!(baz.count, 1);
        }
        other => panic!("应为 Groups,得到 {other:?}"),
    }
}
