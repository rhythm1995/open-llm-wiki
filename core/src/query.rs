//! QQL 求值器(Query AST → 结果集)。纯结构、无歧义;文本解析层(string → Query AST)
//! 待你拍板语法(P2,见 docs/open-questions)后再接。**这是 F-QUERY 的内核**:
//! Obsidian Dataview 的活聚合能力,但作为一等公民、可被图谱/列表/卡片视图复用。
//!
//! 一个 `Query` = `filter`(谓词)+ `order`(排序键)+ `limit` + `select`(投影),
//! 在 `&[Note]` 上求值。纯函数,IO-free。

use std::cmp::Ordering;

use serde_yaml::Value;

use crate::graph::NodeId;
use crate::index::{tags, type_of, Note};

/// 字面量(用于 `FieldIs` 比较)。
#[derive(Debug, Clone, PartialEq)]
pub enum Literal {
    Str(String),
    Int(i64),
    Bool(bool),
}

/// 谓词(WHERE)。所有字符串匹配默认大小写不敏感。
#[derive(Debug, Clone, PartialEq)]
pub enum Predicate {
    /// 恒真(无过滤)。
    All,
    /// 软类型相等:`type: X`。
    HasType(String),
    /// 标签包含(来自 frontmatter `tags` + 正文 `#tag`)。
    HasTag(String),
    /// frontmatter 含某键。
    HasField(String),
    /// frontmatter 键值 == 字面量。
    FieldIs(String, Literal),
    /// 标题含子串。
    TitleContains(String),
    /// 正文含子串。
    BodyContains(String),
    /// 路径含子串。
    PathMatches(String),
    /// 逻辑非。
    Not(Box<Predicate>),
    /// 逻辑与(空 → 恒真)。
    And(Vec<Predicate>),
    /// 逻辑或(空 → 恒假)。
    Or(Vec<Predicate>),
}

/// 排序方向。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Direction {
    Asc,
    Desc,
}

/// 排序键(多键排序,按 Vec 顺序为优先级)。
#[derive(Debug, Clone, PartialEq)]
pub enum OrderKey {
    Title(Direction),
    Path(Direction),
    /// 按 frontmatter 字段排序;**缺失值恒排末尾**(与方向无关)。
    Field(String, Direction),
}

/// 投影。
#[derive(Debug, Clone, PartialEq)]
pub enum Select {
    /// 只返回匹配的节点 id(默认)。
    Notes,
    /// 返回节点 id + 指定 frontmatter 字段的字符串投影(缺失/非标量 → None)。
    Fields(Vec<String>),
}

/// 查询。
#[derive(Debug, Clone, PartialEq)]
pub struct Query {
    pub filter: Predicate,
    pub order: Vec<OrderKey>,
    pub limit: Option<usize>,
    pub select: Select,
}

impl Query {
    /// 空查询:全量、不排序、不投影。
    pub fn new() -> Self {
        Query {
            filter: Predicate::All,
            order: Vec::new(),
            limit: None,
            select: Select::Notes,
        }
    }
}

impl Default for Query {
    fn default() -> Self {
        Query::new()
    }
}

/// 结果行:节点 id + 可选的字段投影。
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct Row {
    pub id: NodeId,
    pub fields: Option<Vec<Option<String>>>,
}

/// 结果集。
pub type ResultSet = Vec<Row>;

/// 在笔记切片上求值。
pub fn eval(notes: &[Note], q: &Query) -> ResultSet {
    let mut matched: Vec<(NodeId, &Note)> = notes
        .iter()
        .enumerate()
        .filter(|(_, n)| matches(&q.filter, n))
        .collect();
    // 多键稳定排序:从最低优先级键开始排(稳定排序保留高优先级顺序)。
    for key in q.order.iter().rev() {
        matched.sort_by(|a, b| cmp_by_key(key, a.1, b.1));
    }
    if let Some(lim) = q.limit {
        matched.truncate(lim);
    }
    matched
        .into_iter()
        .map(|(id, n)| Row {
            id,
            fields: match &q.select {
                Select::Notes => None,
                Select::Fields(fs) => Some(
                    fs.iter()
                        .map(|f| n.frontmatter.get(f).and_then(scalar_str))
                        .collect(),
                ),
            },
        })
        .collect()
}

/// 谓词求值(单笔记)。
pub fn matches(p: &Predicate, n: &Note) -> bool {
    use Predicate::*;
    match p {
        All => true,
        HasType(t) => type_of(n).as_deref() == Some(t.as_str()),
        HasTag(t) => tags(n).iter().any(|x| x == t),
        HasField(k) => n.frontmatter.contains_key(k),
        FieldIs(k, lit) => n.frontmatter.get(k).is_some_and(|v| value_is(v, lit)),
        TitleContains(s) => contains_ci(&n.title, s),
        PathMatches(s) => contains_ci(&n.path, s),
        BodyContains(s) => contains_ci(&n.body, s),
        Not(inner) => !matches(inner, n),
        And(ps) => ps.iter().all(|p| matches(p, n)),
        Or(ps) => ps.iter().any(|p| matches(p, n)),
    }
}

fn contains_ci(haystack: &str, needle: &str) -> bool {
    if needle.is_empty() {
        return true;
    }
    haystack.to_lowercase().contains(&needle.to_lowercase())
}

fn value_is(v: &Value, lit: &Literal) -> bool {
    match (v, lit) {
        (Value::String(s), Literal::Str(x)) => s == x,
        (Value::Number(n), Literal::Int(x)) => n.as_i64() == Some(*x),
        (Value::Bool(b), Literal::Bool(x)) => b == x,
        _ => false,
    }
}

/// 把标量 Value 转为显示字符串(用于 Fields 投影)。非标量/缺失 → None。
fn scalar_str(v: &Value) -> Option<String> {
    match v {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        Value::Bool(b) => Some(b.to_string()),
        _ => None,
    }
}

fn cmp_by_key(key: &OrderKey, a: &Note, b: &Note) -> Ordering {
    match key {
        OrderKey::Title(d) => dir(a.title.cmp(&b.title), *d),
        OrderKey::Path(d) => dir(a.path.cmp(&b.path), *d),
        OrderKey::Field(name, d) => cmp_field(name, a, b, *d),
    }
}

fn dir(o: Ordering, d: Direction) -> Ordering {
    match d {
        Direction::Asc => o,
        Direction::Desc => o.reverse(),
    }
}

fn cmp_field(name: &str, a: &Note, b: &Note, d: Direction) -> Ordering {
    let av = a.frontmatter.get(name);
    let bv = b.frontmatter.get(name);
    match (av, bv) {
        (None, None) => Ordering::Equal,
        // 缺失值恒排末尾:用 Greater,且不随方向反转。
        (None, Some(_)) => Ordering::Greater,
        (Some(_), None) => Ordering::Less,
        (Some(x), Some(y)) => dir(value_cmp(x, y).unwrap_or_else(|| a.title.cmp(&b.title)), d),
    }
}

fn value_cmp(a: &Value, b: &Value) -> Option<Ordering> {
    match (a, b) {
        (Value::String(x), Value::String(y)) => Some(x.cmp(y)),
        (Value::Number(x), Value::Number(y)) => match (x.as_f64(), y.as_f64()) {
            (Some(xf), Some(yf)) => xf.partial_cmp(&yf),
            _ => Some(x.to_string().cmp(&y.to_string())),
        },
        (Value::Bool(x), Value::Bool(y)) => Some(x.cmp(y)),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::index::enrich;
    use crate::parse::parse_note;

    fn note(content: &str, path: &str) -> Note {
        enrich(parse_note(content, path))
    }

    fn ids(rs: &ResultSet) -> Vec<NodeId> {
        rs.iter().map(|r| r.id).collect()
    }

    // ---- 谓词 ----

    #[test]
    fn pred_has_type_tag_field() {
        let n = note(
            "---\ntype: Concept\ntags:\n  - alpha\nrank: 3\n---\n# T",
            "a.md",
        );
        assert!(matches(&Predicate::HasType("Concept".into()), &n));
        assert!(!matches(&Predicate::HasType("Source".into()), &n));
        assert!(matches(&Predicate::HasTag("alpha".into()), &n));
        assert!(matches(&Predicate::HasField("rank".into()), &n));
        assert!(!matches(&Predicate::HasField("missing".into()), &n));
    }

    #[test]
    fn pred_field_is_variants() {
        let n = note(
            "---\nstatus: active\ncount: 3\ndone: true\n---\n# T",
            "a.md",
        );
        assert!(matches(
            &Predicate::FieldIs("status".into(), Literal::Str("active".into())),
            &n
        ));
        assert!(matches(
            &Predicate::FieldIs("count".into(), Literal::Int(3)),
            &n
        ));
        assert!(matches(
            &Predicate::FieldIs("done".into(), Literal::Bool(true)),
            &n
        ));
        assert!(!matches(
            &Predicate::FieldIs("count".into(), Literal::Int(4)),
            &n
        ));
    }

    #[test]
    fn pred_text_contains_case_insensitive() {
        let n = note("# Capital Idea\n\nsome body text\n", "dir/a.md");
        assert!(matches(&Predicate::TitleContains("capital".into()), &n));
        assert!(matches(&Predicate::BodyContains("BODY".into()), &n));
        assert!(matches(&Predicate::PathMatches("dir/".into()), &n));
    }

    #[test]
    fn pred_boolean() {
        let n = note("# T", "a.md");
        assert!(matches(&Predicate::All, &n));
        assert!(matches(
            &Predicate::And(vec![
                Predicate::All,
                Predicate::Not(Box::new(Predicate::HasField("x".into())))
            ]),
            &n
        ));
        assert!(matches(
            &Predicate::Or(vec![Predicate::HasField("x".into()), Predicate::All]),
            &n
        ));
        assert!(!matches(
            &Predicate::Or(vec![
                Predicate::HasField("x".into()),
                Predicate::HasField("y".into())
            ]),
            &n
        ));
    }

    // ---- eval:过滤 + 排序 + limit ----

    #[test]
    fn eval_filters_by_type() {
        let notes = vec![
            note("---\ntype: Concept\n---\n# A", "a.md"),
            note("---\ntype: Source\n---\n# B", "b.md"),
            note("---\ntype: Concept\n---\n# C", "c.md"),
        ];
        let q = Query {
            filter: Predicate::HasType("Concept".into()),
            ..Query::new()
        };
        assert_eq!(ids(&eval(&notes, &q)), vec![0, 2]);
    }

    #[test]
    fn eval_order_title_asc_desc() {
        let notes = vec![
            note("# Banana", "b.md"),
            note("# Apple", "a.md"),
            note("# Cherry", "c.md"),
        ];
        let asc = Query {
            order: vec![OrderKey::Title(Direction::Asc)],
            ..Query::new()
        };
        assert_eq!(ids(&eval(&notes, &asc)), vec![1, 0, 2]);
        let desc = Query {
            order: vec![OrderKey::Title(Direction::Desc)],
            ..Query::new()
        };
        assert_eq!(ids(&eval(&notes, &desc)), vec![2, 0, 1]);
    }

    #[test]
    fn eval_order_field_missing_last() {
        let notes = vec![
            note("---\nrank: 2\n---\n# Two", "a.md"),
            note("# None", "b.md"),
            note("---\nrank: 1\n---\n# One", "c.md"),
        ];
        let q = Query {
            order: vec![OrderKey::Field("rank".into(), Direction::Asc)],
            ..Query::new()
        };
        // rank:1 → rank:2 → 缺失(b)
        assert_eq!(ids(&eval(&notes, &q)), vec![2, 0, 1]);
        // Desc 也保持缺失在末尾
        let qd = Query {
            order: vec![OrderKey::Field("rank".into(), Direction::Desc)],
            ..Query::new()
        };
        assert_eq!(ids(&eval(&notes, &qd)), vec![0, 2, 1]);
    }

    #[test]
    fn eval_limit() {
        let notes = vec![
            note("# A", "a.md"),
            note("# B", "b.md"),
            note("# C", "c.md"),
        ];
        let q = Query {
            order: vec![OrderKey::Title(Direction::Asc)],
            limit: Some(2),
            ..Query::new()
        };
        assert_eq!(ids(&eval(&notes, &q)), vec![0, 1]);
    }

    #[test]
    fn eval_select_fields_projection() {
        let notes = vec![
            note("---\ntype: Concept\nstatus: active\n---\n# A", "a.md"),
            note("---\ntype: Source\n---\n# B", "b.md"), // 无 status
        ];
        let q = Query {
            select: Select::Fields(vec!["type".into(), "status".into()]),
            ..Query::new()
        };
        let rs = eval(&notes, &q);
        assert_eq!(rs.len(), 2);
        assert_eq!(
            rs[0].fields.as_ref().unwrap(),
            &vec![Some("Concept".into()), Some("active".into())]
        );
        assert_eq!(
            rs[1].fields.as_ref().unwrap(),
            &vec![Some("Source".into()), None]
        );
    }
}
