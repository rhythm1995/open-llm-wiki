//! QQL 求值器(Query AST → 结果集)。F-QUERY 的内核:Obsidian Dataview 式的活聚合,
//! 作为一等公民、可被图谱/列表/卡片视图复用。纯结构、无歧义、IO-free。
//!
//! 一个 `Query` = `filter`(谓词)+ `order`(排序键)+ `limit` + `select`(投影)+ `render`(聚合模式)。
//! 求值需要 `&[Note]`(取 frontmatter/正文)+ `&Graph`(取入度/出度,即 `mentioned_in.len()` / `links.len()`)。
//!
//! 两个分离层:本模块只管求值(纯结构);文本 → AST 在 [`crate::qql`](crate::qql)。

use std::cmp::Ordering;

use serde_yaml::Value;

use crate::graph::{Graph, NodeId};
use crate::index::{tags, type_of, Note};

// ───────────────────────── AST ──────────────────────────

/// 字面量(用于比较)。
#[derive(Debug, Clone, PartialEq)]
pub enum Literal {
    Str(String),
    Int(i64),
    Bool(bool),
}

/// 比较运算符。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Cmp {
    Eq,
    Ne,
    Gt,
    Ge,
    Lt,
    Le,
}

/// 长度来源(用于 `.len()` 访问器)。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LenSrc {
    /// `tags.len()` —— frontmatter `tags` + 正文 `#tag` 总数。
    Tags,
    /// `mentioned_in.len()` —— 反向链接数(入度)。
    Backlinks,
    /// `links.len()` —— 正文 wikilink 出度。
    Links,
    /// `<key>.len()` —— 某 frontmatter 列表的元素数(非列表 → 0)。
    KeyList(String),
}

/// 字段引用:谓词 LHS、排序键、投影列的统一表达。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FieldRef {
    Title,
    Body,
    Path,
    /// 软类型(`type:`)。
    Type,
    /// 任意 frontmatter 键。
    Key(String),
    /// `.len()` 聚合。
    Len(LenSrc),
}

/// 谓词(WHERE)。字符串匹配默认大小写不敏感。
#[derive(Debug, Clone, PartialEq)]
pub enum Predicate {
    /// 恒真(无过滤)。
    All,
    /// 标签包含。
    HasTag(String),
    /// 字段存在(非缺失)。
    HasField(FieldRef),
    /// 字段与字面量的比较。
    Cmp(FieldRef, Cmp, Literal),
    /// 文本字段含子串(标题/正文/路径/字符串键;列表则任一元素含)。
    Contains(FieldRef, String),
    /// 前缀匹配(Dataview 常用)。
    StartsWith(FieldRef, String),
    /// 后缀匹配。
    EndsWith(FieldRef, String),
    /// 字段值 ∈ 列表(字符串/列表任一元素命中;大小写不敏感)。
    InList(FieldRef, Vec<String>),
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
pub struct OrderKey(pub FieldRef, pub Direction);

/// 投影列:(字段引用, 可选别名)。
pub type Column = (FieldRef, Option<String>);

/// 投影。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Select {
    /// 只返回匹配的节点 id(默认)。
    Notes,
    /// 返回节点 id + 指定列的字符串投影。
    Fields(Vec<Column>),
}

/// 聚合渲染模式(决定结果集形态)。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Render {
    /// 节点 id 列表(默认)。
    List,
    /// 每节点一行 + 投影列。
    Table,
    /// 匹配数。
    Count,
    /// 按 FieldRef 的字符串值分组 → (key, count, ids)。
    GroupBy(FieldRef),
    /// 对 FieldRef 求和(数值字段)。
    Sum(FieldRef),
    /// 按 FieldRef 做直方图(分组计数,与 GroupBy 同数据形态,UI 画条形图)。
    Histogram(FieldRef),
}

/// 查询。
#[derive(Debug, Clone, PartialEq)]
pub struct Query {
    pub filter: Predicate,
    pub order: Vec<OrderKey>,
    pub limit: Option<usize>,
    pub select: Select,
    pub render: Render,
}

impl Query {
    /// 空查询:全量、不排序、不投影、列表渲染。
    pub fn new() -> Self {
        Query {
            filter: Predicate::All,
            order: Vec::new(),
            limit: None,
            select: Select::Notes,
            render: Render::List,
        }
    }
}

impl Default for Query {
    fn default() -> Self {
        Query::new()
    }
}

// ─────────────────────── 结果集 ─────────────────────────

/// 结果行(表格渲染):节点 id + 可选的列投影。
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct Row {
    pub id: NodeId,
    pub fields: Option<Vec<Option<String>>>,
}

/// 分组行(group_by 渲染)。
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct GroupRow {
    pub key: String,
    pub count: usize,
    pub ids: Vec<NodeId>,
}

/// 结果集(形态由 `Render` 决定)。
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub enum ResultSet {
    /// 节点 id 列表。
    List(Vec<NodeId>),
    /// 表格行。
    Table(Vec<Row>),
    /// 匹配计数。
    Count(usize),
    /// 分组。
    Groups(Vec<GroupRow>),
    /// 数值求和。
    Sum(f64),
    /// 直方图(桶 = 分组行,与 Groups 同形)。
    Histogram(Vec<GroupRow>),
}

// ─────────────────────── 字段取值 ───────────────────────

/// 字段解析值(内部比较用)。缺失与"列表"显式区分。
#[derive(Debug, Clone)]
enum FVal {
    Str(String),
    Num(f64),
    Bool(bool),
    List(Vec<String>),
    Missing,
}

/// 取节点某字段的值。
fn field_value(rf: &FieldRef, n: &Note, graph: &Graph, id: NodeId) -> FVal {
    match rf {
        FieldRef::Title => FVal::Str(n.title.clone()),
        FieldRef::Body => FVal::Str(n.body.clone()),
        FieldRef::Path => FVal::Str(n.path.clone()),
        FieldRef::Type => match type_of(n) {
            Some(s) => FVal::Str(s),
            None => FVal::Missing,
        },
        FieldRef::Key(k) => match n.frontmatter.get(k) {
            None => FVal::Missing,
            Some(Value::String(s)) => FVal::Str(s.clone()),
            Some(Value::Number(x)) => FVal::Num(x.as_f64().unwrap_or(f64::NAN)),
            Some(Value::Bool(b)) => FVal::Bool(*b),
            Some(Value::Sequence(seq)) => {
                let items: Vec<String> = seq
                    .iter()
                    .filter_map(|v| match v {
                        Value::String(s) => Some(s.clone()),
                        Value::Number(x) => Some(x.to_string()),
                        Value::Bool(b) => Some(b.to_string()),
                        _ => None,
                    })
                    .collect();
                FVal::List(items)
            }
            _ => FVal::Missing,
        },
        FieldRef::Len(src) => {
            let len = match src {
                LenSrc::Tags => tags(n).len(),
                LenSrc::Backlinks => graph.backlinks(id).len(),
                LenSrc::Links => graph.outgoing(id).len(),
                LenSrc::KeyList(k) => match n.frontmatter.get(k) {
                    Some(Value::Sequence(seq)) => seq.len(),
                    _ => 0,
                },
            };
            FVal::Num(len as f64)
        }
    }
}

/// 投影用:把字段值转成显示字符串(Missing → None)。
fn project_str(rf: &FieldRef, n: &Note, graph: &Graph, id: NodeId) -> Option<String> {
    match field_value(rf, n, graph, id) {
        FVal::Missing => None,
        FVal::Str(s) => Some(s),
        FVal::Num(x) => Some(format_num(x)),
        FVal::Bool(b) => Some(b.to_string()),
        FVal::List(items) => Some(items.join(", ")),
    }
}

fn format_num(x: f64) -> String {
    if x.fract() == 0.0 && x.is_finite() {
        format!("{x:.0}")
    } else {
        format!("{x}")
    }
}

// ─────────────────────── 谓词求值 ───────────────────────

/// 谓词求值(单笔记,需 graph 算度数)。
pub fn matches(p: &Predicate, n: &Note, graph: &Graph, id: NodeId) -> bool {
    use Predicate::*;
    match p {
        All => true,
        HasTag(t) => tags(n).iter().any(|x| x == t),
        HasField(rf) => !matches!(field_value(rf, n, graph, id), FVal::Missing),
        Cmp(rf, op, lit) => cmp_eval(&field_value(rf, n, graph, id), *op, lit),
        Contains(rf, needle) => contains_eval(&field_value(rf, n, graph, id), needle),
        StartsWith(rf, prefix) => prefix_eval(&field_value(rf, n, graph, id), prefix, true),
        EndsWith(rf, suffix) => prefix_eval(&field_value(rf, n, graph, id), suffix, false),
        InList(rf, list) => in_list_eval(&field_value(rf, n, graph, id), list),
        Not(inner) => !matches(inner, n, graph, id),
        And(ps) => ps.iter().all(|p| matches(p, n, graph, id)),
        Or(ps) => ps.iter().any(|p| matches(p, n, graph, id)),
    }
}

fn cmp_eval(v: &FVal, op: Cmp, lit: &Literal) -> bool {
    // 缺失字段:Eq→假,Ne→真,其余→假。
    if matches!(v, FVal::Missing) {
        return matches!(op, Cmp::Ne);
    }
    let ord = match (v, lit) {
        (FVal::Str(a), Literal::Str(b)) => Some(a.to_lowercase().cmp(&b.to_lowercase())),
        (FVal::Num(a), Literal::Int(b)) => a.partial_cmp(&(*b as f64)),
        (FVal::Bool(a), Literal::Bool(b)) => Some(a.cmp(b)),
        _ => None,
    };
    // 不同型且非 Eq/Ne → 假。
    let ord = match ord {
        Some(o) => o,
        None => return matches!(op, Cmp::Ne),
    };
    match op {
        Cmp::Eq => ord == Ordering::Equal,
        Cmp::Ne => ord != Ordering::Equal,
        Cmp::Gt => ord == Ordering::Greater,
        Cmp::Ge => ord != Ordering::Less,
        Cmp::Lt => ord == Ordering::Less,
        Cmp::Le => ord != Ordering::Greater,
    }
}

fn contains_eval(v: &FVal, needle: &str) -> bool {
    if needle.is_empty() {
        return true;
    }
    let nl = needle.to_lowercase();
    match v {
        FVal::Str(s) => s.to_lowercase().contains(&nl),
        FVal::List(items) => items.iter().any(|it| it.to_lowercase().contains(&nl)),
        _ => false,
    }
}

/// `start=true` → starts_with;否则 ends_with。列表任一元素命中即可。
fn prefix_eval(v: &FVal, affix: &str, start: bool) -> bool {
    if affix.is_empty() {
        return true;
    }
    let a = affix.to_lowercase();
    let check = |s: &str| {
        let sl = s.to_lowercase();
        if start {
            sl.starts_with(&a)
        } else {
            sl.ends_with(&a)
        }
    };
    match v {
        FVal::Str(s) => check(s),
        FVal::List(items) => items.iter().any(|it| check(it)),
        _ => false,
    }
}

fn in_list_eval(v: &FVal, list: &[String]) -> bool {
    if list.is_empty() {
        return false;
    }
    let lows: Vec<String> = list.iter().map(|s| s.to_lowercase()).collect();
    let hit = |s: &str| lows.iter().any(|x| x == &s.to_lowercase());
    match v {
        FVal::Str(s) => hit(s),
        FVal::List(items) => items.iter().any(|it| hit(it)),
        FVal::Num(n) => hit(&format_num(*n)),
        FVal::Bool(b) => hit(&b.to_string()),
        FVal::Missing => false,
    }
}

// ─────────────────────── 排序 ─────────────────────────

fn cmp_field(a: &FVal, b: &FVal) -> Ordering {
    // 缺失恒排末尾(Equal 之间也稳定)。
    match (a, b) {
        (FVal::Missing, FVal::Missing) => Ordering::Equal,
        (FVal::Missing, _) => Ordering::Greater,
        (_, FVal::Missing) => Ordering::Less,
        (FVal::Num(x), FVal::Num(y)) => x.partial_cmp(y).unwrap_or(Ordering::Equal),
        (FVal::Str(x), FVal::Str(y)) => x.cmp(y),
        (FVal::Bool(x), FVal::Bool(y)) => x.cmp(y),
        // 型不同:按型名兜底,保证确定性。
        _ => Ordering::Equal,
    }
}

fn dir(o: Ordering, d: Direction) -> Ordering {
    match d {
        Direction::Asc => o,
        Direction::Desc => o.reverse(),
    }
}

// ─────────────────────── eval ─────────────────────────

/// 在笔记切片 + 图上求值。
pub fn eval(notes: &[Note], graph: &Graph, q: &Query) -> ResultSet {
    let mut matched: Vec<(NodeId, &Note)> = notes
        .iter()
        .enumerate()
        .filter(|(id, n)| matches(&q.filter, n, graph, *id))
        .collect();

    // 多键稳定排序:从最低优先级键开始。
    for OrderKey(rf, d) in q.order.iter().rev() {
        matched.sort_by(|(ia, a), (ib, b)| {
            let va = field_value(rf, a, graph, *ia);
            let vb = field_value(rf, b, graph, *ib);
            // 缺失排末尾、不随方向反转:先比"是否缺失",再对非缺失应用方向。
            let a_miss = matches!(va, FVal::Missing);
            let b_miss = matches!(vb, FVal::Missing);
            match (a_miss, b_miss) {
                (true, true) => Ordering::Equal,
                (true, false) => Ordering::Greater,
                (false, true) => Ordering::Less,
                (false, false) => dir(cmp_field(&va, &vb), *d),
            }
        });
    }

    if let Some(lim) = q.limit {
        matched.truncate(lim);
    }

    let ids: Vec<NodeId> = matched.iter().map(|(id, _)| *id).collect();

    match &q.render {
        Render::List => ResultSet::List(ids),
        Render::Count => ResultSet::Count(matched.len()),
        Render::Table => ResultSet::Table(
            matched
                .iter()
                .map(|(id, n)| Row {
                    id: *id,
                    fields: match &q.select {
                        Select::Notes => None,
                        Select::Fields(cols) => Some(
                            cols.iter()
                                .map(|(rf, _)| project_str(rf, n, graph, *id))
                                .collect(),
                        ),
                    },
                })
                .collect(),
        ),
        Render::Sum(rf) => {
            let total: f64 = matched
                .iter()
                .filter_map(|(id, n)| match field_value(rf, n, graph, *id) {
                    FVal::Num(x) => Some(x),
                    _ => None,
                })
                .sum();
            ResultSet::Sum(total)
        }
        Render::GroupBy(rf) | Render::Histogram(rf) => {
            let is_hist = matches!(&q.render, Render::Histogram(_));
            let mut buckets: Vec<(String, Vec<NodeId>)> = Vec::new();
            let mut index: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
            for (id, n) in &matched {
                let key = match field_value(rf, n, graph, *id) {
                    FVal::Missing => "(none)".to_string(),
                    FVal::Str(s) => s,
                    FVal::Num(x) => format_num(x),
                    FVal::Bool(b) => b.to_string(),
                    FVal::List(items) => items.join(", "),
                };
                if let Some(&i) = index.get(&key) {
                    buckets[i].1.push(*id);
                } else {
                    index.insert(key.clone(), buckets.len());
                    buckets.push((key, vec![*id]));
                }
            }
            buckets.sort_by(|a, b| a.0.cmp(&b.0));
            let rows: Vec<GroupRow> = buckets
                .into_iter()
                .map(|(key, ids)| GroupRow {
                    key,
                    count: ids.len(),
                    ids,
                })
                .collect();
            if is_hist {
                ResultSet::Histogram(rows)
            } else {
                ResultSet::Groups(rows)
            }
        }
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

    /// 构建笔记 + 图(两者同源)。
    fn build(contents: &[(&str, &str)]) -> (Vec<Note>, Graph) {
        let notes: Vec<Note> = contents.iter().map(|(c, p)| note(c, p)).collect();
        let g = Graph::build(notes.clone());
        (notes, g)
    }

    fn run(notes: &[Note], g: &Graph, q: &Query) -> ResultSet {
        eval(notes, g, q)
    }

    fn list_ids(rs: &ResultSet) -> Vec<NodeId> {
        match rs {
            ResultSet::List(ids) => ids.clone(),
            _ => panic!("expected List, got {rs:?}"),
        }
    }

    // ---- 比较运算符 ----

    #[test]
    fn cmp_eq_ne_str() {
        let (notes, g) = build(&[
            ("---\nstatus: active\n---\n# A", "a.md"),
            ("---\nstatus: done\n---\n# B", "b.md"),
        ]);
        let eq = Query {
            filter: Predicate::Cmp(FieldRef::Key("status".into()), Cmp::Eq, Literal::Str("active".into())),
            ..Query::new()
        };
        assert_eq!(list_ids(&run(&notes, &g, &eq)), vec![0]);
        let ne = Query {
            filter: Predicate::Cmp(FieldRef::Key("status".into()), Cmp::Ne, Literal::Str("active".into())),
            ..Query::new()
        };
        assert_eq!(list_ids(&run(&notes, &g, &ne)), vec![1]);
    }

    #[test]
    fn cmp_numeric_ordering() {
        let (notes, g) = build(&[
            ("---\nrank: 2\n---\n# A", "a.md"),
            ("---\nrank: 5\n---\n# B", "b.md"),
            ("---\nrank: 1\n---\n# C", "c.md"),
        ]);
        let gt = Query {
            filter: Predicate::Cmp(FieldRef::Key("rank".into()), Cmp::Gt, Literal::Int(1)),
            ..Query::new()
        };
        assert_eq!(list_ids(&run(&notes, &g, &gt)), vec![0, 1]);
        let le = Query {
            filter: Predicate::Cmp(FieldRef::Key("rank".into()), Cmp::Le, Literal::Int(2)),
            ..Query::new()
        };
        assert_eq!(list_ids(&run(&notes, &g, &le)), vec![0, 2]);
    }

    #[test]
    fn cmp_missing_field_ne_is_true_eq_is_false() {
        let (notes, g) = build(&[("---\nrank: 1\n---\n# A", "a.md"), ("# B", "b.md")]);
        // 缺 rank 的 B:Ne 1 → 真;Eq 1 → 假。
        let ne = Query {
            filter: Predicate::Cmp(FieldRef::Key("rank".into()), Cmp::Ne, Literal::Int(1)),
            ..Query::new()
        };
        assert_eq!(list_ids(&run(&notes, &g, &ne)), vec![1]);
        let eq = Query {
            filter: Predicate::Cmp(FieldRef::Key("rank".into()), Cmp::Eq, Literal::Int(1)),
            ..Query::new()
        };
        assert_eq!(list_ids(&run(&notes, &g, &eq)), vec![0]);
    }

    #[test]
    fn cmp_type_eq() {
        let (notes, g) = build(&[
            ("---\ntype: Concept\n---\n# A", "a.md"),
            ("---\ntype: Source\n---\n# B", "b.md"),
        ]);
        let q = Query {
            filter: Predicate::Cmp(FieldRef::Type, Cmp::Eq, Literal::Str("Concept".into())),
            ..Query::new()
        };
        assert_eq!(list_ids(&run(&notes, &g, &q)), vec![0]);
    }

    // ---- .len() 度数 ----

    #[test]
    fn len_backlinks_degree() {
        // A→B, C→B: B 入度 2,A/C 入度 0。
        let (notes, g) = build(&[
            ("# A\n[[B]]", "a.md"),
            ("# B", "b.md"),
            ("# C\n[[B]]", "c.md"),
        ]);
        let q = Query {
            filter: Predicate::Cmp(FieldRef::Len(LenSrc::Backlinks), Cmp::Ge, Literal::Int(2)),
            ..Query::new()
        };
        assert_eq!(list_ids(&run(&notes, &g, &q)), vec![1]);
    }

    #[test]
    fn len_links_outgoing() {
        // A 出 2,B 出 0。
        let (notes, g) = build(&[("# A\n[[B]] [[C]]", "a.md"), ("# B", "b.md"), ("# C", "c.md")]);
        let q = Query {
            filter: Predicate::Cmp(FieldRef::Len(LenSrc::Links), Cmp::Gt, Literal::Int(0)),
            ..Query::new()
        };
        assert_eq!(list_ids(&run(&notes, &g, &q)), vec![0]);
    }

    #[test]
    fn len_tags_and_keylist() {
        let (notes, g) = build(&[
            ("---\ntags: [a, b]\nmentions:\n  - x\n  - y\n---\n# A #inline", "a.md"),
        ]);
        // tags.len = 3 (a, b, inline)
        let q = Query {
            filter: Predicate::Cmp(FieldRef::Len(LenSrc::Tags), Cmp::Eq, Literal::Int(3)),
            ..Query::new()
        };
        assert_eq!(list_ids(&run(&notes, &g, &q)), vec![0]);
        // mentions.len = 2
        let q = Query {
            filter: Predicate::Cmp(
                FieldRef::Len(LenSrc::KeyList("mentions".into())),
                Cmp::Eq,
                Literal::Int(2),
            ),
            ..Query::new()
        };
        assert_eq!(list_ids(&run(&notes, &g, &q)), vec![0]);
    }

    #[test]
    fn sort_by_backlinks_desc() {
        // A→B, A→C, B→C:入度 C=2, B=1, A=0。
        let (notes, g) = build(&[
            ("# A\n[[B]] [[C]]", "a.md"),
            ("# B\n[[C]]", "b.md"),
            ("# C", "c.md"),
        ]);
        let q = Query {
            order: vec![OrderKey(FieldRef::Len(LenSrc::Backlinks), Direction::Desc)],
            ..Query::new()
        };
        assert_eq!(list_ids(&run(&notes, &g, &q)), vec![2, 1, 0]);
    }

    // ---- contains / hasfield ----

    #[test]
    fn contains_title_body_path() {
        let (notes, g) = build(&[("# Capital Idea\n\nrust body\n", "dir/a.md")]);
        let q = |rf: FieldRef, s: &str| Query {
            filter: Predicate::Contains(rf, s.into()),
            ..Query::new()
        };
        assert_eq!(list_ids(&run(&notes, &g, &q(FieldRef::Title, "cap"))), vec![0]);
        assert_eq!(list_ids(&run(&notes, &g, &q(FieldRef::Body, "rust"))), vec![0]);
        assert_eq!(list_ids(&run(&notes, &g, &q(FieldRef::Path, "dir"))), vec![0]);
    }

    #[test]
    fn startswith_endswith_inlist() {
        let (notes, g) = build(&[
            ("---\ntype: Concept\n---\n# Alpha", "notes/a.md"),
            ("---\ntype: Note\n---\n# Beta", "x/b.md"),
        ]);
        let q = Query {
            filter: Predicate::StartsWith(FieldRef::Path, "notes/".into()),
            ..Query::new()
        };
        assert_eq!(list_ids(&run(&notes, &g, &q)), vec![0]);
        let q = Query {
            filter: Predicate::EndsWith(FieldRef::Path, "b.md".into()),
            ..Query::new()
        };
        assert_eq!(list_ids(&run(&notes, &g, &q)), vec![1]);
        let q = Query {
            filter: Predicate::InList(
                FieldRef::Type,
                vec!["Concept".into(), "Entity".into()],
            ),
            ..Query::new()
        };
        assert_eq!(list_ids(&run(&notes, &g, &q)), vec![0]);
    }

    #[test]
    fn hasfield_present_absent() {
        let (notes, g) = build(&[("---\nrank: 1\n---\n# A", "a.md"), ("# B", "b.md")]);
        let q = Query {
            filter: Predicate::HasField(FieldRef::Key("rank".into())),
            ..Query::new()
        };
        assert_eq!(list_ids(&run(&notes, &g, &q)), vec![0]);
    }

    // ---- 投影 + 表格 ----

    #[test]
    fn table_projection_with_alias_and_len() {
        let (notes, g) = build(&[
            ("---\ntype: Concept\nstatus: active\n---\n# A\n[[B]]", "a.md"),
            ("---\ntype: Source\n---\n# B", "b.md"),
        ]);
        let q = Query {
            select: Select::Fields(vec![
                (FieldRef::Title, None),
                (FieldRef::Type, Some("kind".into())),
                (FieldRef::Len(LenSrc::Backlinks), Some("depth".into())),
            ]),
            render: Render::Table,
            ..Query::new()
        };
        let rs = run(&notes, &g, &q);
        match rs {
            ResultSet::Table(rows) => {
                assert_eq!(rows.len(), 2);
                // A: 被谁指向?无。B: 被 A 指向 → depth 1。
                let a = rows.iter().find(|r| r.id == 0).unwrap();
                assert_eq!(
                    a.fields.as_ref().unwrap(),
                    &vec![Some("A".into()), Some("Concept".into()), Some("0".into())]
                );
                let b = rows.iter().find(|r| r.id == 1).unwrap();
                assert_eq!(
                    b.fields.as_ref().unwrap(),
                    &vec![Some("B".into()), Some("Source".into()), Some("1".into())]
                );
            }
            _ => panic!("expected Table"),
        }
    }

    // ---- 聚合:count / sum / group_by ----

    #[test]
    fn render_count() {
        let (notes, g) = build(&[
            ("---\ntype: Concept\n---\n# A", "a.md"),
            ("---\ntype: Concept\n---\n# B", "b.md"),
            ("---\ntype: Source\n---\n# C", "c.md"),
        ]);
        let q = Query {
            filter: Predicate::Cmp(FieldRef::Type, Cmp::Eq, Literal::Str("Concept".into())),
            render: Render::Count,
            ..Query::new()
        };
        assert_eq!(run(&notes, &g, &q), ResultSet::Count(2));
    }

    #[test]
    fn render_sum_numeric() {
        let (notes, g) = build(&[
            ("---\nscore: 1.5\n---\n# A", "a.md"),
            ("---\nscore: 2\n---\n# B", "b.md"),
            ("---\n---\n# C", "c.md"), // 无 score
        ]);
        let q = Query {
            render: Render::Sum(FieldRef::Key("score".into())),
            ..Query::new()
        };
        assert_eq!(run(&notes, &g, &q), ResultSet::Sum(3.5));
    }

    #[test]
    fn render_group_by_type() {
        let (notes, g) = build(&[
            ("---\ntype: Concept\n---\n# A", "a.md"),
            ("---\ntype: Source\n---\n# B", "b.md"),
            ("---\ntype: Concept\n---\n# C", "c.md"),
            ("# D", "d.md"), // 无 type
        ]);
        let q = Query {
            render: Render::GroupBy(FieldRef::Type),
            ..Query::new()
        };
        match run(&notes, &g, &q) {
            ResultSet::Groups(rows) => {
                // 按 key 字典序:(none), Concept, Source
                assert_eq!(rows.len(), 3);
                assert_eq!(rows[0].key, "(none)");
                assert_eq!(rows[0].count, 1);
                assert_eq!(rows[1].key, "Concept");
                assert_eq!(rows[1].count, 2);
                assert_eq!(rows[2].key, "Source");
                assert_eq!(rows[2].count, 1);
            }
            _ => panic!("expected Groups"),
        }
    }

    #[test]
    fn render_histogram_type() {
        let (notes, g) = build(&[
            ("---\ntype: Concept\n---\n# A", "a.md"),
            ("---\ntype: Concept\n---\n# B", "b.md"),
            ("---\ntype: Source\n---\n# C", "c.md"),
        ]);
        let q = Query {
            render: Render::Histogram(FieldRef::Type),
            ..Query::new()
        };
        match run(&notes, &g, &q) {
            ResultSet::Histogram(rows) => {
                assert_eq!(rows.len(), 2);
                assert_eq!(rows[0].key, "Concept");
                assert_eq!(rows[0].count, 2);
                assert_eq!(rows[1].key, "Source");
                assert_eq!(rows[1].count, 1);
            }
            other => panic!("expected Histogram, got {other:?}"),
        }
    }

    // ---- limit + list ----

    #[test]
    fn limit_truncates() {
        let (notes, g) = build(&[("# A", "a.md"), ("# B", "b.md"), ("# C", "c.md")]);
        let q = Query {
            order: vec![OrderKey(FieldRef::Title, Direction::Asc)],
            limit: Some(2),
            ..Query::new()
        };
        assert_eq!(list_ids(&run(&notes, &g, &q)), vec![0, 1]);
    }

    #[test]
    fn boolean_combinators() {
        let (notes, g) = build(&[
            ("---\ntype: Concept\nrank: 5\n---\n# A", "a.md"),
            ("---\ntype: Concept\nrank: 1\n---\n# B", "b.md"),
        ]);
        let q = Query {
            filter: Predicate::And(vec![
                Predicate::Cmp(FieldRef::Type, Cmp::Eq, Literal::Str("Concept".into())),
                Predicate::Cmp(FieldRef::Key("rank".into()), Cmp::Gt, Literal::Int(1)),
            ]),
            ..Query::new()
        };
        assert_eq!(list_ids(&run(&notes, &g, &q)), vec![0]);
    }
}
