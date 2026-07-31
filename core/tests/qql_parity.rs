//! QQL TS↔Rust 差分:与 `fixtures/qql-parity/cases.json` 对齐。
//! UI 侧 `ui/src/lib/qql/parity.test.ts` 消费同一文件。

use openobs_core::{parse_query, ResultSet, VaultIndex};
use serde::Deserialize;
use std::collections::BTreeMap;

#[derive(Debug, Deserialize)]
struct Fixture {
    notes: Vec<NoteFile>,
    cases: Vec<Case>,
}

#[derive(Debug, Deserialize)]
struct NoteFile {
    path: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct Case {
    name: String,
    qql: String,
    expect: Expect,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
enum Expect {
    List { paths: Vec<String> },
    Count { n: usize },
    Sum { value: f64 },
    Table { rows: Vec<TableRow> },
    Groups { groups: Vec<GroupExpect> },
}

#[derive(Debug, Deserialize)]
struct TableRow {
    path: String,
    fields: Vec<Option<String>>,
}

#[derive(Debug, Deserialize)]
struct GroupExpect {
    key: String,
    count: usize,
}

fn load() -> Fixture {
    let raw = include_str!("../../fixtures/qql-parity/cases.json");
    serde_json::from_str(raw).expect("parse qql-parity fixture")
}

fn index_from(fixture: &Fixture) -> VaultIndex {
    let mut map = BTreeMap::new();
    for n in &fixture.notes {
        map.insert(n.path.clone(), n.content.clone());
    }
    VaultIndex::build_from_map(&map)
}

fn path_of(ix: &VaultIndex, id: usize) -> String {
    ix.notes()
        .get(id)
        .map(|n| n.path.clone())
        .unwrap_or_else(|| format!("#id={id}"))
}

#[test]
fn qql_parity_all_cases() {
    let fixture = load();
    let ix = index_from(&fixture);
    for case in &fixture.cases {
        let q = parse_query(&case.qql).unwrap_or_else(|e| {
            panic!("case {} parse: {e}", case.name);
        });
        let rs = ix.query(&q);
        match (&case.expect, &rs) {
            (Expect::List { paths }, ResultSet::List(ids)) => {
                let got: Vec<String> = ids.iter().map(|id| path_of(&ix, *id)).collect();
                assert_eq!(got, *paths, "case {}", case.name);
            }
            (Expect::Count { n }, ResultSet::Count(c)) => {
                assert_eq!(c, n, "case {}", case.name);
            }
            (Expect::Sum { value }, ResultSet::Sum(s)) => {
                assert!(
                    (s - value).abs() < 1e-9,
                    "case {}: sum {s} != {value}",
                    case.name
                );
            }
            (Expect::Table { rows }, ResultSet::Table(got)) => {
                assert_eq!(got.len(), rows.len(), "case {} table len", case.name);
                for (i, exp) in rows.iter().enumerate() {
                    let g = &got[i];
                    assert_eq!(path_of(&ix, g.id), exp.path, "case {} row path", case.name);
                    assert_eq!(
                        g.fields.as_ref().unwrap_or(&vec![]),
                        &exp.fields,
                        "case {} fields",
                        case.name
                    );
                }
            }
            (Expect::Groups { groups }, ResultSet::Groups(got) | ResultSet::Histogram(got)) => {
                let mut sorted: Vec<_> = got.iter().map(|g| (g.key.clone(), g.count)).collect();
                sorted.sort_by(|a, b| a.0.cmp(&b.0));
                let mut exp: Vec<_> = groups.iter().map(|g| (g.key.clone(), g.count)).collect();
                exp.sort_by(|a, b| a.0.cmp(&b.0));
                assert_eq!(sorted, exp, "case {}", case.name);
            }
            (e, r) => panic!(
                "case {}: expect {:?} got {:?}",
                case.name,
                std::mem::discriminant(e),
                r
            ),
        }
    }
}
