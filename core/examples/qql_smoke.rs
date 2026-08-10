//! QQL smoke: real VaultIndex::query against multi-note fixture; run logic twice for consistency.
use open_llm_wiki_core::{parse_query, ResultSet, VaultIndex};

fn fixture() -> VaultIndex {
    VaultIndex::build(vec![
        (
            "a.md".into(),
            "---\ntype: Concept\nstatus: open\nscore: 2\n---\n# Alpha\n".into(),
        ),
        (
            "b.md".into(),
            "---\ntype: Concept\nstatus: done\nscore: 3\n---\n# Beta\n".into(),
        ),
        (
            "c.md".into(),
            "---\ntype: Source\nstatus: open\nscore: 1\n---\n# Gamma\n".into(),
        ),
    ])
}

fn once(v: &VaultIndex) -> (usize, usize, Vec<String>) {
    let count = match v.query(&parse_query(r#"WHERE status = "open" RENDER count"#).unwrap()) {
        ResultSet::Count(n) => n,
        other => panic!("count: {other:?}"),
    };
    let hist_concept = match v.query(&parse_query(r#"RENDER histogram(type)"#).unwrap()) {
        ResultSet::Histogram(rows) => rows.iter().find(|r| r.key == "Concept").unwrap().count,
        other => panic!("hist: {other:?}"),
    };
    let titles = match v.query(
        &parse_query(r#"WHERE type = "Concept" SORT title ASC RENDER list"#).unwrap(),
    ) {
        ResultSet::List(ids) => ids.iter().map(|&i| v.notes()[i].title.clone()).collect(),
        other => panic!("list: {other:?}"),
    };
    (count, hist_concept, titles)
}

fn main() {
    let v = fixture();
    let a = once(&v);
    let b = once(&v);
    assert_eq!(a, b, "two runs must match");
    assert_eq!(a.0, 2);
    assert_eq!(a.1, 2);
    assert_eq!(a.2, vec!["Alpha".to_string(), "Beta".to_string()]);
    println!("count_open={}", a.0);
    println!("histogram_concept={}", a.1);
    println!("list_titles={}", a.2.join(","));
    println!("qql-smoke OK (identical primary results on two runs)");
}
