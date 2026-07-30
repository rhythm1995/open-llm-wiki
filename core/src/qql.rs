//! QQL 文本解析器(layer 1):DQL 风格字符串 → `Query` AST。
//! 解析出的 `Query` 交给 `query::eval` 求值。两层分离:语法可换、求值器不变。
//!
//! # 语法(子集;关键字大小写不敏感)
//!
//! ```text
//! WHERE   <谓词>                          -- 不写 = 全量
//! SORT    <字段> [ASC|DESC] [, ...]       -- 字段:title | body | path | type | <键> | <键>.len()
//! LIMIT   <n>                             -- 非负整数
//! SHOW    <字段> [AS <别名>] [, ...]      -- 不写 = 只返回节点 id
//! RENDER  list | table | count | group_by(<字段>) | sum(<字段>)
//! ```
//!
//! 子句顺序不限,可跨行;首 token 不是子句关键字时按隐式 `WHERE` 处理。
//!
//! # 谓词
//!
//! | 写法 | AST |
//! |---|---|
//! | `#tag` | `HasTag` |
//! | `has <字段>` | `HasField` |
//! | `<字段> = / != / > / >= / < / <=  "字"\|3\|true` | `Cmp` |
//! | `<字段> ~ "x"` 或 `CONTAINS "x"` | `Contains`(子串,大小写不敏感) |
//! | `<字段> STARTSWITH / ENDSWITH "x"` | 前缀 / 后缀 |
//! | `<字段> IN ("a", "b")` | 值 ∈ 列表 |
//! | `NOT <原子>` / `<a> AND <b>` / `<a> OR <b>` / `( <谓词> )` | 逻辑组合,优先级 NOT > AND > OR |
//!
//! # 字段(`<字段>`)
//!
//! `title` / `body` / `path` / `type` 为内置;`<键>` 取 frontmatter;`<键>.len()` 取长度。
//! 特例:`tags.len()`、`mentioned_in.len()`(反链入度)、`links.len()`(出度)。
//! `status` / `created` / `modified` 为常用 frontmatter 键糖(仍走 Key)。
//!
//! 字符串值必须加引号;数字 / `true` / `false` 不加。

use crate::query::{
    Cmp, Column, Direction, FieldRef, LenSrc, Literal, OrderKey, Predicate, Query, Render, Select,
};

/// 解析错误(带人话信息)。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParseError(pub String);

impl std::fmt::Display for ParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "QQL 解析错误:{}", self.0)
    }
}
impl std::error::Error for ParseError {}

type R<T> = Result<T, ParseError>;

/// 解析 QQL 文本为 `Query`。空串 → `Query::new()`(全量、列表)。
pub fn parse(input: &str) -> R<Query> {
    let mut toks = lex(input)?;
    if toks.is_empty() {
        return Ok(Query::new());
    }
    if !matches!(toks[0], Tok::Clause(_)) {
        toks.insert(0, Tok::Clause(Clause::Where));
    }
    let bodies = split_clauses(&toks)?;

    let mut q = Query::new();
    let mut render_set = false;
    if let Some(b) = bodies.where_ {
        let mut c = PCursor { toks: b, pos: 0 };
        q.filter = parse_or(&mut c)?;
        expect_end(&c, "WHERE")?;
    }
    if let Some(b) = bodies.sort {
        q.order = parse_sort(b)?;
    }
    if let Some(b) = bodies.limit {
        q.limit = parse_limit(b)?;
    }
    if let Some(b) = bodies.render {
        q.render = parse_render(b)?;
        render_set = true;
    }
    if let Some(b) = bodies.show {
        q.select = parse_show(b)?;
    }
    // 未显式 RENDER 时:有投影 → 表格;否则列表。
    if !render_set {
        q.render = match &q.select {
            Select::Fields(_) => Render::Table,
            Select::Notes => Render::List,
        };
    }
    Ok(q)
}

// ───────────────────────── 词法 ──────────────────────────

#[derive(Debug, Clone, PartialEq, Eq)]
enum Clause {
    Where,
    Sort,
    Limit,
    Show,
    Render,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum Tok {
    Clause(Clause),
    Comma,
    LParen,
    RParen,
    Dot,
    // 比较运算符
    Eq,
    BangEq,
    Gt,
    Ge,
    Lt,
    Le,
    // 子串 / 前缀 / 后缀 / 列表
    Tilde,
    ContainsOp,
    StartsWithOp,
    EndsWithOp,
    InOp,
    And,
    Or,
    Not,
    Has,
    As,
    Asc,
    Desc,
    Str(String),
    Num(i64),
    Bool(bool),
    Ident(String),
    Tag(String),
}

fn lex(input: &str) -> R<Vec<Tok>> {
    let chars: Vec<char> = input.chars().collect();
    let mut i = 0;
    let mut out = Vec::new();
    while i < chars.len() {
        let c = chars[i];
        match c {
            _ if c.is_whitespace() => i += 1,
            '#' => {
                let mut j = i + 1;
                let mut t = String::new();
                while j < chars.len()
                    && (chars[j].is_alphanumeric() || matches!(chars[j], '_' | '-' | '/'))
                {
                    t.push(chars[j]);
                    j += 1;
                }
                if t.is_empty() {
                    return Err(ParseError(format!("空标签 '#'(位置 {i})")));
                }
                out.push(Tok::Tag(t));
                i = j;
            }
            '"' => {
                let mut j = i + 1;
                let mut s = String::new();
                while j < chars.len() && chars[j] != '"' {
                    if chars[j] == '\n' {
                        return Err(ParseError(format!("字符串未闭合(位置 {i})")));
                    }
                    s.push(chars[j]);
                    j += 1;
                }
                if j >= chars.len() {
                    return Err(ParseError(format!("字符串未闭合(位置 {i})")));
                }
                out.push(Tok::Str(s));
                i = j + 1;
            }
            '!' => {
                if i + 1 < chars.len() && chars[i + 1] == '=' {
                    out.push(Tok::BangEq);
                    i += 2;
                } else {
                    return Err(ParseError(format!("'!' 后应为 '='(位置 {i})")));
                }
            }
            '=' => {
                out.push(Tok::Eq);
                i += 1;
            }
            '~' => {
                out.push(Tok::Tilde);
                i += 1;
            }
            '>' => {
                if i + 1 < chars.len() && chars[i + 1] == '=' {
                    out.push(Tok::Ge);
                    i += 2;
                } else {
                    out.push(Tok::Gt);
                    i += 1;
                }
            }
            '<' => {
                if i + 1 < chars.len() && chars[i + 1] == '=' {
                    out.push(Tok::Le);
                    i += 2;
                } else {
                    out.push(Tok::Lt);
                    i += 1;
                }
            }
            '.' => {
                out.push(Tok::Dot);
                i += 1;
            }
            '(' => {
                out.push(Tok::LParen);
                i += 1;
            }
            ')' => {
                out.push(Tok::RParen);
                i += 1;
            }
            ',' => {
                out.push(Tok::Comma);
                i += 1;
            }
            c if c.is_ascii_digit()
                || (c == '-' && i + 1 < chars.len() && chars[i + 1].is_ascii_digit()) =>
            {
                let start = if c == '-' { i + 1 } else { i };
                let mut j = start;
                while j < chars.len() && chars[j].is_ascii_digit() {
                    j += 1;
                }
                let num_str: String = chars[start..j].iter().collect();
                let num: i64 = num_str
                    .parse()
                    .map_err(|_| ParseError(format!("数字解析失败:{num_str}(位置 {i})")))?;
                out.push(Tok::Num(if c == '-' { -num } else { num }));
                i = j;
            }
            c if c.is_alphabetic() || c == '_' => {
                let mut j = i;
                while j < chars.len() && (chars[j].is_alphanumeric() || chars[j] == '_') {
                    j += 1;
                }
                let word: String = chars[i..j].iter().collect();
                let tok = match word.to_uppercase().as_str() {
                    "WHERE" => Tok::Clause(Clause::Where),
                    "SORT" => Tok::Clause(Clause::Sort),
                    "LIMIT" => Tok::Clause(Clause::Limit),
                    "SHOW" => Tok::Clause(Clause::Show),
                    "RENDER" => Tok::Clause(Clause::Render),
                    "AND" => Tok::And,
                    "OR" => Tok::Or,
                    "NOT" => Tok::Not,
                    "HAS" => Tok::Has,
                    "AS" => Tok::As,
                    "ASC" => Tok::Asc,
                    "DESC" => Tok::Desc,
                    "CONTAINS" => Tok::ContainsOp,
                    "STARTSWITH" => Tok::StartsWithOp,
                    "ENDSWITH" => Tok::EndsWithOp,
                    "IN" => Tok::InOp,
                    "TRUE" => Tok::Bool(true),
                    "FALSE" => Tok::Bool(false),
                    _ => Tok::Ident(word),
                };
                out.push(tok);
                i = j;
            }
            _ => return Err(ParseError(format!("无法识别的字符 '{c}'(位置 {i})"))),
        }
    }
    Ok(out)
}

// ─────────────────────── 子句切分 ────────────────────────

#[derive(Default)]
struct ClauseBodies<'a> {
    where_: Option<&'a [Tok]>,
    sort: Option<&'a [Tok]>,
    limit: Option<&'a [Tok]>,
    show: Option<&'a [Tok]>,
    render: Option<&'a [Tok]>,
}

fn split_clauses(toks: &[Tok]) -> R<ClauseBodies<'_>> {
    let mut b = ClauseBodies::default();
    let mut i = 0;
    while i < toks.len() {
        let clause = match &toks[i] {
            Tok::Clause(c) => c.clone(),
            other => return Err(ParseError(format!("子句外的 token:{other:?}"))),
        };
        i += 1;
        let start = i;
        while i < toks.len() && !matches!(toks[i], Tok::Clause(_)) {
            i += 1;
        }
        let body: &[Tok] = &toks[start..i];
        match clause {
            Clause::Where => set_clause(&mut b.where_, body, "WHERE")?,
            Clause::Sort => set_clause(&mut b.sort, body, "SORT")?,
            Clause::Limit => set_clause(&mut b.limit, body, "LIMIT")?,
            Clause::Show => set_clause(&mut b.show, body, "SHOW")?,
            Clause::Render => set_clause(&mut b.render, body, "RENDER")?,
        }
    }
    Ok(b)
}

fn set_clause<'a>(slot: &mut Option<&'a [Tok]>, body: &'a [Tok], name: &str) -> R<()> {
    if slot.is_some() {
        return Err(ParseError(format!("重复的子句:{name}")));
    }
    *slot = Some(body);
    Ok(())
}

// ─────────────────────── 字段引用解析 ────────────────────

struct PCursor<'a> {
    toks: &'a [Tok],
    pos: usize,
}

impl<'a> PCursor<'a> {
    fn peek(&self) -> Option<&Tok> {
        self.toks.get(self.pos)
    }
    fn bump(&mut self) -> Option<Tok> {
        let t = self.toks.get(self.pos).cloned();
        if t.is_some() {
            self.pos += 1;
        }
        t
    }
}

fn parse_field_ref(c: &mut PCursor) -> R<FieldRef> {
    let name = match c.bump() {
        Some(Tok::Ident(n)) => n,
        other => return Err(ParseError(format!("期望字段名,得到 {other:?}"))),
    };
    // `.len()`(括号可选)
    if matches!(c.peek(), Some(Tok::Dot)) {
        c.bump(); // dot
        let m = match c.bump() {
            Some(Tok::Ident(m)) => m,
            other => return Err(ParseError(format!("'.' 后期望 'len',得到 {other:?}"))),
        };
        if m.to_lowercase() != "len" {
            return Err(ParseError(format!("仅支持 .len(),得到 '.{m}'")));
        }
        // 可选空括号
        if matches!(c.peek(), Some(Tok::LParen)) {
            c.bump();
            expect(c, Tok::RParen)?;
        }
        return Ok(match name.to_lowercase().as_str() {
            "tags" => FieldRef::Len(LenSrc::Tags),
            "mentioned_in" => FieldRef::Len(LenSrc::Backlinks),
            "links" => FieldRef::Len(LenSrc::Links),
            _ => FieldRef::Len(LenSrc::KeyList(name)),
        });
    }
    Ok(match name.to_lowercase().as_str() {
        "title" => FieldRef::Title,
        "body" => FieldRef::Body,
        "path" => FieldRef::Path,
        "type" => FieldRef::Type,
        _ => FieldRef::Key(name),
    })
}

// ─────────────────────── 谓词解析 ────────────────────────

fn parse_or(c: &mut PCursor) -> R<Predicate> {
    let mut terms = vec![parse_and(c)?];
    while matches!(c.peek(), Some(Tok::Or)) {
        c.bump();
        terms.push(parse_and(c)?);
    }
    Ok(if terms.len() == 1 {
        terms.remove(0)
    } else {
        Predicate::Or(terms)
    })
}

fn parse_and(c: &mut PCursor) -> R<Predicate> {
    let mut terms = vec![parse_not(c)?];
    while matches!(c.peek(), Some(Tok::And)) {
        c.bump();
        terms.push(parse_not(c)?);
    }
    Ok(if terms.len() == 1 {
        terms.remove(0)
    } else {
        Predicate::And(terms)
    })
}

fn parse_not(c: &mut PCursor) -> R<Predicate> {
    if matches!(c.peek(), Some(Tok::Not)) {
        c.bump();
        let inner = parse_not(c)?;
        return Ok(Predicate::Not(Box::new(inner)));
    }
    parse_atom(c)
}

fn parse_atom(c: &mut PCursor) -> R<Predicate> {
    let tok = c
        .peek()
        .cloned()
        .ok_or_else(|| ParseError("谓词不完整(意外结束)".into()))?;
    match tok {
        Tok::LParen => {
            c.bump();
            let p = parse_or(c)?;
            expect(c, Tok::RParen)?;
            Ok(p)
        }
        Tok::Tag(t) => {
            c.bump();
            Ok(Predicate::HasTag(t))
        }
        Tok::Has => {
            c.bump();
            let rf = parse_field_ref(c)?;
            Ok(Predicate::HasField(rf))
        }
        _ => {
            let rf = parse_field_ref(c)?;
            match c.peek().cloned() {
                Some(op @ (Tok::Eq | Tok::BangEq | Tok::Gt | Tok::Ge | Tok::Lt | Tok::Le)) => {
                    c.bump();
                    let lit = parse_literal(c)?;
                    Ok(Predicate::Cmp(rf, tok_to_cmp(&op)?, lit))
                }
                Some(Tok::Tilde) | Some(Tok::ContainsOp) => {
                    c.bump();
                    let s = match c.bump() {
                        Some(Tok::Str(s)) => s,
                        other => {
                            return Err(ParseError(format!(
                                "CONTAINS/~ 后须为字符串,得到 {other:?}"
                            )))
                        }
                    };
                    Ok(Predicate::Contains(rf, s))
                }
                Some(Tok::StartsWithOp) => {
                    c.bump();
                    let s = expect_str(c, "STARTSWITH")?;
                    Ok(Predicate::StartsWith(rf, s))
                }
                Some(Tok::EndsWithOp) => {
                    c.bump();
                    let s = expect_str(c, "ENDSWITH")?;
                    Ok(Predicate::EndsWith(rf, s))
                }
                Some(Tok::InOp) => {
                    c.bump();
                    let list = parse_str_list(c)?;
                    Ok(Predicate::InList(rf, list))
                }
                other => Err(ParseError(format!(
                    "字段后应为比较运算符 / CONTAINS / STARTSWITH / ENDSWITH / IN / '~',得到 {other:?}"
                ))),
            }
        }
    }
}

fn tok_to_cmp(t: &Tok) -> R<Cmp> {
    Ok(match t {
        Tok::Eq => Cmp::Eq,
        Tok::BangEq => Cmp::Ne,
        Tok::Gt => Cmp::Gt,
        Tok::Ge => Cmp::Ge,
        Tok::Lt => Cmp::Lt,
        Tok::Le => Cmp::Le,
        _ => return Err(ParseError(format!("非比较运算符 {t:?}"))),
    })
}

fn parse_literal(c: &mut PCursor) -> R<Literal> {
    match c.bump() {
        Some(Tok::Str(s)) => Ok(Literal::Str(s)),
        Some(Tok::Num(n)) => Ok(Literal::Int(n)),
        Some(Tok::Bool(b)) => Ok(Literal::Bool(b)),
        other => Err(ParseError(format!(
            "应为字面量(字符串/数字/bool),得到 {other:?}"
        ))),
    }
}

fn expect_str(c: &mut PCursor, ctx: &str) -> R<String> {
    match c.bump() {
        Some(Tok::Str(s)) => Ok(s),
        other => Err(ParseError(format!(
            "{ctx} 后须为字符串,得到 {other:?}"
        ))),
    }
}

/// `IN ("a", "b")` 或 `IN "a"`(单值)。
fn parse_str_list(c: &mut PCursor) -> R<Vec<String>> {
    if matches!(c.peek(), Some(Tok::LParen)) {
        c.bump();
        let mut out = Vec::new();
        if matches!(c.peek(), Some(Tok::RParen)) {
            c.bump();
            return Ok(out);
        }
        loop {
            out.push(expect_str(c, "IN")?);
            match c.peek().cloned() {
                Some(Tok::Comma) => {
                    c.bump();
                    continue;
                }
                Some(Tok::RParen) => {
                    c.bump();
                    break;
                }
                other => {
                    return Err(ParseError(format!(
                        "IN 列表中期望 ',' 或 ')',得到 {other:?}"
                    )));
                }
            }
        }
        Ok(out)
    } else {
        Ok(vec![expect_str(c, "IN")?])
    }
}

fn expect(c: &mut PCursor, expected: Tok) -> R<()> {
    match c.bump() {
        Some(t) if t == expected => Ok(()),
        other => Err(ParseError(format!("期望 {expected:?},得到 {other:?}"))),
    }
}

fn expect_end(c: &PCursor, name: &str) -> R<()> {
    if c.pos != c.toks.len() {
        return Err(ParseError(format!(
            "{name} 有多余 token:{:?}",
            &c.toks[c.pos..]
        )));
    }
    Ok(())
}

// ─────────────────────── 其它子句解析 ────────────────────

fn parse_sort(body: &[Tok]) -> R<Vec<OrderKey>> {
    let mut keys = Vec::new();
    for seg in split_on_comma(body) {
        let seg = seg.ok_or_else(|| ParseError("SORT:空排序键".into()))?;
        let mut c = PCursor { toks: &seg, pos: 0 };
        let rf = parse_field_ref(&mut c)?;
        let dir = match c.bump() {
            None => Direction::Asc,
            Some(Tok::Asc) => Direction::Asc,
            Some(Tok::Desc) => Direction::Desc,
            other => return Err(ParseError(format!("SORT 方向应为 ASC/DESC,得到 {other:?}"))),
        };
        expect_end(&c, "SORT 键")?;
        keys.push(OrderKey(rf, dir));
    }
    Ok(keys)
}

fn parse_limit(body: &[Tok]) -> R<Option<usize>> {
    match body {
        [Tok::Num(n)] if *n >= 0 => Ok(Some(*n as usize)),
        _ => Err(ParseError("LIMIT 后应为一个非负整数".into())),
    }
}

fn parse_show(body: &[Tok]) -> R<Select> {
    let mut cols: Vec<Column> = Vec::new();
    for seg in split_on_comma(body) {
        let seg = seg.ok_or_else(|| ParseError("SHOW:空列".into()))?;
        let mut c = PCursor { toks: &seg, pos: 0 };
        let rf = parse_field_ref(&mut c)?;
        let alias = if matches!(c.peek(), Some(Tok::As)) {
            c.bump();
            match c.bump() {
                Some(Tok::Ident(a)) => Some(a),
                other => return Err(ParseError(format!("AS 后应为别名,得到 {other:?}"))),
            }
        } else {
            None
        };
        expect_end(&c, "SHOW 列")?;
        cols.push((rf, alias));
    }
    Ok(Select::Fields(cols))
}

fn parse_render(body: &[Tok]) -> R<Render> {
    let mut c = PCursor { toks: body, pos: 0 };
    let mode = match c.bump() {
        Some(Tok::Ident(m)) => m.to_lowercase(),
        other => return Err(ParseError(format!("RENDER 后应为模式名,得到 {other:?}"))),
    };
    let render = match mode.as_str() {
        "list" => Render::List,
        "table" => Render::Table,
        "count" => Render::Count,
        "group_by" | "groupby" => {
            let rf = parse_render_field(&mut c)?;
            Render::GroupBy(rf)
        }
        "sum" => {
            let rf = parse_render_field(&mut c)?;
            Render::Sum(rf)
        }
        "histogram" => {
            let rf = parse_render_field(&mut c)?;
            Render::Histogram(rf)
        }
        _ => return Err(ParseError(format!("未知 RENDER 模式:{mode}"))),
    };
    expect_end(&c, "RENDER")?;
    Ok(render)
}

/// RENDER 的 group_by/sum 字段:允许 `group_by(field)` 或 `group_by field`。
fn parse_render_field(c: &mut PCursor) -> R<FieldRef> {
    if matches!(c.peek(), Some(Tok::LParen)) {
        c.bump();
        let rf = parse_field_ref(c)?;
        expect(c, Tok::RParen)?;
        Ok(rf)
    } else {
        parse_field_ref(c)
    }
}

/// 按逗号切分;返回每段的 Option(None 表示空段,如尾随逗号)。
fn split_on_comma(body: &[Tok]) -> Vec<Option<Vec<Tok>>> {
    let mut segs: Vec<Vec<Tok>> = vec![Vec::new()];
    for t in body {
        if matches!(t, Tok::Comma) {
            segs.push(Vec::new());
        } else {
            segs.last_mut().unwrap().push(t.clone());
        }
    }
    segs.into_iter()
        .map(|s| if s.is_empty() { None } else { Some(s) })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::query::{FieldRef as F, LenSrc};

    fn p(s: &str) -> Predicate {
        parse(s).unwrap().filter
    }

    // ---- 字段引用 ----

    #[test]
    fn fieldref_builtins_and_key() {
        // 通过 Cmp 间接验证。
        assert_eq!(
            p(r#"title = "x""#),
            Predicate::Cmp(F::Title, Cmp::Eq, Literal::Str("x".into()))
        );
        assert_eq!(
            p(r#"type = "Concept""#),
            Predicate::Cmp(F::Type, Cmp::Eq, Literal::Str("Concept".into()))
        );
        assert_eq!(
            p(r#"status = "active""#),
            Predicate::Cmp(F::Key("status".into()), Cmp::Eq, Literal::Str("active".into()))
        );
    }

    #[test]
    fn fieldref_len_variants() {
        assert_eq!(
            p("tags.len() > 1"),
            Predicate::Cmp(F::Len(LenSrc::Tags), Cmp::Gt, Literal::Int(1))
        );
        assert_eq!(
            p("mentioned_in.len() < 3"),
            Predicate::Cmp(F::Len(LenSrc::Backlinks), Cmp::Lt, Literal::Int(3))
        );
        assert_eq!(
            p("links.len() >= 2"),
            Predicate::Cmp(F::Len(LenSrc::Links), Cmp::Ge, Literal::Int(2))
        );
        // 任意键 .len
        assert_eq!(
            p("mentions.len() = 2"),
            Predicate::Cmp(
                F::Len(LenSrc::KeyList("mentions".into())),
                Cmp::Eq,
                Literal::Int(2)
            )
        );
        // 不带括号
        assert_eq!(
            p("tags.len > 0"),
            Predicate::Cmp(F::Len(LenSrc::Tags), Cmp::Gt, Literal::Int(0))
        );
    }

    // ---- 比较运算符 ----

    #[test]
    fn all_comparison_operators() {
        assert!(matches!(
            p(r#"status != "done""#),
            Predicate::Cmp(_, Cmp::Ne, _)
        ));
        assert!(matches!(p("rank > 1"), Predicate::Cmp(_, Cmp::Gt, _)));
        assert!(matches!(p("rank >= 1"), Predicate::Cmp(_, Cmp::Ge, _)));
        assert!(matches!(p("rank < 1"), Predicate::Cmp(_, Cmp::Lt, _)));
        assert!(matches!(p("rank <= 1"), Predicate::Cmp(_, Cmp::Le, _)));
    }

    #[test]
    fn contains_via_tilde() {
        assert_eq!(
            p(r#"title ~ "cap""#),
            Predicate::Contains(F::Title, "cap".into())
        );
        // ~ 也允许任意字段(如字符串键)
        assert_eq!(
            p(r#"status ~ "act""#),
            Predicate::Contains(F::Key("status".into()), "act".into())
        );
    }

    #[test]
    fn contains_startswith_endswith_in() {
        assert_eq!(
            p(r#"title CONTAINS "cap""#),
            Predicate::Contains(F::Title, "cap".into())
        );
        assert_eq!(
            p(r#"path STARTSWITH "notes/""#),
            Predicate::StartsWith(F::Path, "notes/".into())
        );
        assert_eq!(
            p(r#"path ENDSWITH ".md""#),
            Predicate::EndsWith(F::Path, ".md".into())
        );
        assert_eq!(
            p(r#"type IN ("Concept", "Entity")"#),
            Predicate::InList(F::Type, vec!["Concept".into(), "Entity".into()])
        );
        assert_eq!(
            p(r#"status IN "Active""#),
            Predicate::InList(F::Key("status".into()), vec!["Active".into()])
        );
    }

    // ---- 逻辑 ----

    #[test]
    fn bool_and_or_not_parens() {
        assert_eq!(
            p(r#"type = "A" AND #x"#),
            Predicate::And(vec![
                Predicate::Cmp(F::Type, Cmp::Eq, Literal::Str("A".into())),
                Predicate::HasTag("x".into())
            ])
        );
        assert_eq!(
            p("(has a OR has b) AND has c"),
            Predicate::And(vec![
                Predicate::Or(vec![
                    Predicate::HasField(F::Key("a".into())),
                    Predicate::HasField(F::Key("b".into()))
                ]),
                Predicate::HasField(F::Key("c".into()))
            ])
        );
        assert_eq!(
            p("NOT #x"),
            Predicate::Not(Box::new(Predicate::HasTag("x".into())))
        );
    }

    // ---- 子句 ----

    #[test]
    fn sort_by_fieldref_and_len() {
        let q = parse("SORT title DESC, rank ASC").unwrap();
        assert_eq!(
            q.order,
            vec![
                OrderKey(F::Title, Direction::Desc),
                OrderKey(F::Key("rank".into()), Direction::Asc)
            ]
        );
        let q = parse("SORT mentioned_in.len() DESC").unwrap();
        assert_eq!(
            q.order,
            vec![OrderKey(F::Len(LenSrc::Backlinks), Direction::Desc)]
        );
    }

    #[test]
    fn show_with_alias() {
        let q = parse("SHOW title, status AS st, mentioned_in.len() AS depth").unwrap();
        assert_eq!(
            q.select,
            Select::Fields(vec![
                (F::Title, None),
                (F::Key("status".into()), Some("st".into())),
                (F::Len(LenSrc::Backlinks), Some("depth".into()))
            ])
        );
        // SHOW 默认渲染为 table
        assert_eq!(q.render, Render::Table);
    }

    #[test]
    fn render_modes() {
        assert_eq!(parse("RENDER count").unwrap().render, Render::Count);
        assert_eq!(parse("RENDER list").unwrap().render, Render::List);
        assert_eq!(parse("RENDER table").unwrap().render, Render::Table);
        assert_eq!(
            parse("RENDER group_by(type)").unwrap().render,
            Render::GroupBy(F::Type)
        );
        assert_eq!(
            parse("RENDER sum(score)").unwrap().render,
            Render::Sum(F::Key("score".into()))
        );
        // group_by 不带括号
        assert_eq!(
            parse("RENDER group_by type").unwrap().render,
            Render::GroupBy(F::Type)
        );
    }

    #[test]
    fn full_aggregate_query() {
        let q = parse(
            r#"WHERE type = "Concept" AND mentioned_in.len() < 3
               SORT mentioned_in.len() ASC
               RENDER group_by(status) SHOW title"#,
        )
        .unwrap();
        assert!(matches!(q.filter, Predicate::And(_)));
        assert_eq!(
            q.order,
            vec![OrderKey(F::Len(LenSrc::Backlinks), Direction::Asc)]
        );
        assert_eq!(q.render, Render::GroupBy(F::Key("status".into())));
    }

    #[test]
    fn empty_and_bare_predicate() {
        assert_eq!(parse("").unwrap(), Query::new());
        assert_eq!(p("#x"), Predicate::HasTag("x".into()));
    }

    // ---- 错误 ----

    #[test]
    fn err_bad_char() {
        assert!(parse("WHERE #x @").is_err());
    }

    #[test]
    fn err_unclosed_string() {
        assert!(parse(r#"WHERE type = "unclosed"#).is_err());
    }

    #[test]
    fn err_field_without_op() {
        assert!(parse("WHERE status").is_err());
    }

    #[test]
    fn err_unknown_dot_suffix() {
        assert!(parse("WHERE rank.count > 1").is_err());
    }

    #[test]
    fn err_duplicate_clause() {
        assert!(parse("WHERE #x WHERE #y").is_err());
    }

    #[test]
    fn err_limit_negative() {
        assert!(parse("LIMIT -1").is_err());
    }

    #[test]
    fn err_unknown_render_mode() {
        assert!(parse("RENDER histogram").is_err()); // 缺字段
        assert_eq!(
            parse("RENDER histogram(type)").unwrap().render,
            Render::Histogram(F::Type)
        );
        assert_eq!(
            parse("RENDER histogram status").unwrap().render,
            Render::Histogram(F::Key("status".into()))
        );
    }

    #[test]
    fn err_bang_without_eq() {
        assert!(parse("WHERE status ! \"x\"").is_err());
    }
}

// ─────────────────────────── 属性测试(proptest)───────────────────────────

#[cfg(test)]
mod props {
    use super::parse;
    use proptest::prelude::*;

    proptest! {
        /// 任意字符串喂给 QQL 解析器,绝不 panic(Ok 或 Err 都合法)。
        /// 解析器是面向用户输入的第一道关口,鲁棒性最关键。
        #[test]
        fn parse_never_panics(s in ".{0,120}") {
            let _ = parse(&s);
        }

        /// 一组合法查询反复解析都成功(防回归把合法语法改挂)。
        #[test]
        fn known_valid_queries_parse_ok(
            q in proptest::sample::select(vec![
                "".to_string(),
                "#x".into(),
                "WHERE type = \"A\"".into(),
                "SORT title".into(),
                "LIMIT 5".into(),
                "WHERE #x AND status = \"y\" SORT modified DESC RENDER list".into(),
            ])
        ) {
            prop_assert!(parse(&q).is_ok(), "合法查询解析失败: {q}");
        }
    }
}
