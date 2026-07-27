//! QQL 文本解析器(layer 1):DQL 风格字符串 → `Query` AST。
//! 解析出的 `Query` 交给 `query::eval` 求值。两层分离的好处:语法可换、求值器不变。
//!
//! # 语法(子集;关键字大小写不敏感)
//!
//! ```text
//! WHERE  <谓词>                       -- 不写 = 全量
//! SORT   <键> [ASC|DESC] [, ...]      -- 键:title | path | <字段名>;缺省 ASC
//! LIMIT  <n>                          -- 非负整数
//! SHOW   <字段> [, ...]               -- 不写 = 只返回节点 id
//! ```
//!
//! 子句顺序不限,可跨行;首 token 不是子句关键字时按隐式 `WHERE` 处理(可只写谓词)。
//!
//! # 谓词(`<谓词>`)
//!
//! | 写法 | AST |
//! |---|---|
//! | `#tag` | `HasTag` |
//! | `has <字段>` | `HasField` |
//! | `type = "X"` | `HasType("X")`(`type` 键特化) |
//! | `<字段> = "字"\|3\|true` | `FieldIs` |
//! | `title ~ "x"` / `body ~ "x"` / `path ~ "x"` | `TitleContains` / `BodyContains` / `PathMatches` |
//! | `NOT <原子>` / `<a> AND <b>` / `<a> OR <b>` / `( <谓词> )` | 逻辑组合,优先级 NOT > AND > OR |
//!
//! 字符串值必须加引号;数字 / `true` / `false` 不加。

use crate::query::{Direction, Literal, OrderKey, Predicate, Query, Select};

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

/// 解析 QQL 文本为 `Query`。空串 → `Query::new()`(全量、不排序、不投影)。
pub fn parse(input: &str) -> R<Query> {
    let mut toks = lex(input)?;
    if toks.is_empty() {
        return Ok(Query::new());
    }
    // 隐式 WHERE:首 token 非子句关键字 → 当作裸谓词,前插 WHERE。
    if !matches!(toks[0], Tok::Clause(_)) {
        toks.insert(0, Tok::Clause(Clause::Where));
    }
    let bodies = split_clauses(&toks)?;

    let mut q = Query::new();
    if let Some(b) = bodies.where_ {
        let mut c = PCursor { toks: b, pos: 0 };
        q.filter = parse_or(&mut c)?;
        if c.pos != c.toks.len() {
            return Err(ParseError(format!(
                "WHERE 有多余 token:{:?}",
                &c.toks[c.pos..]
            )));
        }
    }
    if let Some(b) = bodies.sort {
        q.order = parse_sort(b)?;
    }
    if let Some(b) = bodies.limit {
        q.limit = parse_limit(b)?;
    }
    if let Some(b) = bodies.show {
        q.select = parse_show(b)?;
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
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum Tok {
    Clause(Clause),
    Comma,
    LParen,
    RParen,
    Eq,
    Tilde,
    And,
    Or,
    Not,
    Has,
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
            '=' => {
                out.push(Tok::Eq);
                i += 1;
            }
            '~' => {
                out.push(Tok::Tilde);
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
                    "AND" => Tok::And,
                    "OR" => Tok::Or,
                    "NOT" => Tok::Not,
                    "HAS" => Tok::Has,
                    "ASC" => Tok::Asc,
                    "DESC" => Tok::Desc,
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

// ─────────────────────── 谓词解析 ────────────────────────

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
            match c.bump() {
                Some(Tok::Tag(t)) => Ok(Predicate::HasTag(t)),
                Some(Tok::Ident(k)) => Ok(Predicate::HasField(k)),
                other => Err(ParseError(format!(
                    "`has` 后应为字段名或 #tag,得到 {other:?}"
                ))),
            }
        }
        Tok::Ident(key) => {
            c.bump();
            match c.peek() {
                Some(Tok::Eq) => {
                    c.bump();
                    let lit = parse_literal(c)?;
                    if key.to_lowercase() == "type" {
                        match lit {
                            Literal::Str(s) => Ok(Predicate::HasType(s)),
                            _ => Err(ParseError("`type =` 后须为字符串".into())),
                        }
                    } else {
                        Ok(Predicate::FieldIs(key, lit))
                    }
                }
                Some(Tok::Tilde) => {
                    c.bump();
                    let s = match c.bump() {
                        Some(Tok::Str(s)) => s,
                        other => {
                            return Err(ParseError(format!("`~` 后须为字符串,得到 {other:?}")))
                        }
                    };
                    match key.to_lowercase().as_str() {
                        "title" => Ok(Predicate::TitleContains(s)),
                        "body" => Ok(Predicate::BodyContains(s)),
                        "path" => Ok(Predicate::PathMatches(s)),
                        _ => Err(ParseError(format!(
                            "`~` 仅支持 title/body/path,得到 '{key}'"
                        ))),
                    }
                }
                other => Err(ParseError(format!(
                    "字段 '{key}' 后应为 '=' 或 '~',得到 {other:?}"
                ))),
            }
        }
        other => Err(ParseError(format!("无法解析谓词原子:{other:?}"))),
    }
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

fn expect(c: &mut PCursor, expected: Tok) -> R<()> {
    match c.bump() {
        Some(t) if t == expected => Ok(()),
        other => Err(ParseError(format!("期望 {expected:?},得到 {other:?}"))),
    }
}

// ─────────────────────── 其它子句解析 ────────────────────

fn parse_sort(body: &[Tok]) -> R<Vec<OrderKey>> {
    let mut keys = Vec::new();
    for seg in split_on_comma(body) {
        let seg = seg.ok_or_else(|| ParseError("SORT:空排序键".into()))?;
        let mut c = PCursor { toks: &seg, pos: 0 };
        let name = match c.bump() {
            Some(Tok::Ident(n)) => n,
            other => return Err(ParseError(format!("SORT 键应为标识符,得到 {other:?}"))),
        };
        let dir = match c.bump() {
            None => Direction::Asc,
            Some(Tok::Asc) => Direction::Asc,
            Some(Tok::Desc) => Direction::Desc,
            other => return Err(ParseError(format!("SORT 方向应为 ASC/DESC,得到 {other:?}"))),
        };
        if c.pos != c.toks.len() {
            return Err(ParseError("SORT 键有多余 token".into()));
        }
        keys.push(match name.to_lowercase().as_str() {
            "title" => OrderKey::Title(dir),
            "path" => OrderKey::Path(dir),
            _ => OrderKey::Field(name, dir),
        });
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
    let mut fields = Vec::new();
    for seg in split_on_comma(body) {
        let seg = seg.ok_or_else(|| ParseError("SHOW:空字段名".into()))?;
        match seg.as_slice() {
            [Tok::Ident(f)] => fields.push(f.clone()),
            other => return Err(ParseError(format!("SHOW 字段名非法:{other:?}"))),
        }
    }
    Ok(Select::Fields(fields))
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
    use crate::query::{Direction as D, Literal as L};

    fn p(s: &str) -> Predicate {
        parse(s).unwrap().filter
    }

    // ---- 谓词原子 ----

    #[test]
    fn atom_tag() {
        assert_eq!(p("#idea"), Predicate::HasTag("idea".into()));
    }

    #[test]
    fn atom_has_field() {
        assert_eq!(p("has rank"), Predicate::HasField("rank".into()));
    }

    #[test]
    fn atom_type_eq() {
        assert_eq!(
            p(r#"type = "Concept""#),
            Predicate::HasType("Concept".into())
        );
    }

    #[test]
    fn atom_field_eq_str_int_bool() {
        assert_eq!(
            p(r#"status = "active""#),
            Predicate::FieldIs("status".into(), L::Str("active".into()))
        );
        assert_eq!(p("rank = 3"), Predicate::FieldIs("rank".into(), L::Int(3)));
        assert_eq!(
            p("done = true"),
            Predicate::FieldIs("done".into(), L::Bool(true))
        );
    }

    #[test]
    fn atom_contains() {
        assert_eq!(
            p(r#"title ~ "cap""#),
            Predicate::TitleContains("cap".into())
        );
        assert_eq!(
            p(r#"body ~ "rust""#),
            Predicate::BodyContains("rust".into())
        );
        assert_eq!(p(r#"path ~ "dir""#), Predicate::PathMatches("dir".into()));
    }

    #[test]
    fn bool_and_or_not() {
        assert_eq!(
            p(r#"type = "A" AND #x"#),
            Predicate::And(vec![
                Predicate::HasType("A".into()),
                Predicate::HasTag("x".into())
            ])
        );
        assert_eq!(
            p(r#"has a OR has b"#),
            Predicate::Or(vec![
                Predicate::HasField("a".into()),
                Predicate::HasField("b".into())
            ])
        );
        assert_eq!(
            p("NOT #x"),
            Predicate::Not(Box::new(Predicate::HasTag("x".into())))
        );
    }

    #[test]
    fn precedence_not_and_or() {
        // a OR b AND c  ==  a OR (b AND c)
        assert_eq!(
            p("has a OR has b AND has c"),
            Predicate::Or(vec![
                Predicate::HasField("a".into()),
                Predicate::And(vec![
                    Predicate::HasField("b".into()),
                    Predicate::HasField("c".into())
                ]),
            ])
        );
    }

    #[test]
    fn parens_override() {
        assert_eq!(
            p("(has a OR has b) AND has c"),
            Predicate::And(vec![
                Predicate::Or(vec![
                    Predicate::HasField("a".into()),
                    Predicate::HasField("b".into())
                ]),
                Predicate::HasField("c".into()),
            ])
        );
    }

    // ---- 子句 ----

    #[test]
    fn sort_basic() {
        let q = parse("SORT title").unwrap();
        assert_eq!(q.order, vec![OrderKey::Title(D::Asc)]);
        let q = parse("SORT rank DESC, title ASC").unwrap();
        assert_eq!(
            q.order,
            vec![
                OrderKey::Field("rank".into(), D::Desc),
                OrderKey::Title(D::Asc)
            ]
        );
    }

    #[test]
    fn limit_and_show() {
        let q = parse("LIMIT 5").unwrap();
        assert_eq!(q.limit, Some(5));
        let q = parse("SHOW type, status").unwrap();
        assert_eq!(
            q.select,
            Select::Fields(vec!["type".into(), "status".into()])
        );
    }

    #[test]
    fn full_query_multiline() {
        let q = parse(
            r#"WHERE type = "Concept" AND #idea
               SORT title ASC
               LIMIT 10
               SHOW type, status"#,
        )
        .unwrap();
        assert_eq!(
            q.filter,
            Predicate::And(vec![
                Predicate::HasType("Concept".into()),
                Predicate::HasTag("idea".into())
            ])
        );
        assert_eq!(q.order, vec![OrderKey::Title(D::Asc)]);
        assert_eq!(q.limit, Some(10));
        assert_eq!(
            q.select,
            Select::Fields(vec!["type".into(), "status".into()])
        );
    }

    #[test]
    fn clauses_any_order() {
        let q = parse(r#"SHOW status LIMIT 3 WHERE #x"#).unwrap();
        assert_eq!(q.filter, Predicate::HasTag("x".into()));
        assert_eq!(q.limit, Some(3));
        assert_eq!(q.select, Select::Fields(vec!["status".into()]));
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
    fn err_tilde_on_arbitrary_field() {
        assert!(parse(r#"WHERE rank ~ "x""#).is_err());
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
    fn err_trailing_sort_comma() {
        assert!(parse("SORT title,").is_err());
    }
}
