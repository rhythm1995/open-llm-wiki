//! OpenObsidian core 端到端 demo。
//!
//! **IO 只在本二进制里**(读文件系统);核心 `openobs-core` 库保持 IO-free。
//!
//! 用法:
//!   cargo run -p openobs-core --example demo            # 用内建样例
//!   cargo run -p openobs-core --example demo -- docs    # 索引一个真实目录
//!   cargo run -p openobs-core --example demo -- <dir>   # 索引任意 .md 目录(递归)

use std::fs;
use std::path::{Path, PathBuf};

use openobs_core::{parse_query, EdgeKind, Target, VaultIndex};

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let entries: Vec<(String, String)> = match args.get(1) {
        Some(dir) => read_vault(Path::new(dir)).unwrap_or_else(|e| {
            eprintln!("读取目录 {dir} 失败: {e}");
            std::process::exit(1);
        }),
        None => {
            eprintln!("(未传目录,用内建样例。可 `cargo run --example demo -- docs` 索引真实目录)");
            builtin_sample()
        }
    };

    let v = VaultIndex::build(entries);

    // ---- 概览 ----
    let total_edges = v.graph().edges.len();
    let dangling = v.graph().unresolved().count();
    println!("═══ OpenObsidian core demo ═══");
    println!(
        "笔记 {} 篇 · 边 {} 条(其中悬空 {})",
        v.len(),
        total_edges,
        dangling
    );

    // ---- 类型分布 ----
    println!("\n── 类型分布 ──");
    for (ty, ids) in &v.by_type {
        println!("  {ty:<10} {}", ids.len());
    }

    // ---- 标签 top ----
    println!("\n── 标签(前 10)──");
    let mut tags: Vec<(&String, &Vec<usize>)> = v.by_tag.iter().collect();
    tags.sort_by_key(|(_, ids)| std::cmp::Reverse(ids.len()));
    for (tag, ids) in tags.iter().take(10) {
        println!("  #{tag:<16} {}", ids.len());
    }

    // ---- QQL:文本 → AST → 结果(展示过滤 / 投影 / 聚合)----
    let dql = if v.by_type.is_empty() {
        r#"WHERE body ~ "source" SORT title ASC LIMIT 5"#
    } else {
        r#"WHERE type = "Concept" SORT mentioned_in.len() DESC SHOW title, status, mentioned_in.len() AS depth"#
    };
    println!("\n── QQL 文本查询 ──\n  {dql}");
    let q = match parse_query(dql) {
        Ok(q) => q,
        Err(e) => {
            println!("  解析失败:{e}");
            return;
        }
    };
    print_resultset(&v, &v.query(&q));

    // 聚合:按类型分组计数
    let agg = r#"RENDER group_by(type)"#;
    println!("\n── QQL 聚合 ──\n  {agg}");
    if let Ok(q) = parse_query(agg) {
        print_resultset(&v, &v.query(&q));
    }

    // ---- 全文检索 ----
    let term = "source";
    println!("\n── 全文检索:\"{term}\"(标题×2 + 正文,AND)──");
    for (id, score) in v.search(&[term]).into_iter().take(5) {
        println!("  · {score:>5.1}  {}", v.notes()[id].title);
    }

    // ---- 反向链接演示:挑一个被引用最多的节点 ----
    let best = (0..v.len())
        .map(|i| (i, v.graph().backlinks(i).len()))
        .max_by_key(|&(_, c)| c)
        .filter(|&(_, c)| c > 0);
    if let Some((id, count)) = best {
        let title = &v.notes()[id].title;
        println!("\n── 反向链接:{title} 被引 {count} 次 ──");
        for e in v.graph().backlinks(id) {
            let kind = match &e.kind {
                EdgeKind::Wiki => "wiki".into(),
                EdgeKind::Relation(k) => format!("rel:{k}"),
            };
            let from = &v.notes()[e.from].title;
            match &e.to {
                Target::Resolved(_) => println!("  · {from:<20} --{kind}--> {title}"),
                Target::Unresolved(t) => println!("  · {from:<20} --{kind}--> (悬空:{t})"),
            }
        }
    }

    // ---- 悬空边 ----
    if dangling > 0 {
        println!("\n── 悬空目标(待创建的笔记)──");
        for e in v.graph().unresolved().take(10) {
            if let Target::Unresolved(t) = &e.to {
                println!("  · [[{t}]]  ← {}", v.notes()[e.from].title);
            }
        }
    }

    println!("\n✓ 端到端 OK:parse → enrich → graph → query → search 全链路在纯内核上跑通。\n");
}

/// 打印 ResultSet(各渲染模式)。
fn print_resultset(v: &VaultIndex, rs: &openobs_core::ResultSet) {
    use openobs_core::ResultSet;
    match rs {
        ResultSet::List(ids) => {
            for &id in ids {
                println!("  · {}", v.notes()[id].title);
            }
        }
        ResultSet::Table(rows) => {
            for row in rows {
                let note = &v.notes()[row.id];
                match &row.fields {
                    Some(fs) => println!(
                        "  · {:<24} [{}]",
                        note.title,
                        fs.iter()
                            .map(|f| f.clone().unwrap_or_else(|| "—".into()))
                            .collect::<Vec<_>>()
                            .join(", ")
                    ),
                    None => println!("  · {}", note.title),
                }
            }
        }
        ResultSet::Count(n) => println!("  计数 = {n}"),
        ResultSet::Sum(x) => println!("  求和 = {x}"),
        ResultSet::Groups(groups) => {
            for g in groups {
                println!("  · {:<16} {}", g.key, g.count);
            }
        }
    }
}

/// 递归读取目录下所有 `.md`,返回 (相对路径, 内容)。
fn read_vault(root: &Path) -> std::io::Result<Vec<(String, String)>> {
    let mut paths = Vec::new();
    walk(root, &mut paths)?;
    paths.sort();
    paths
        .into_iter()
        .map(|p| {
            let rel = p
                .strip_prefix(root)
                .unwrap_or(&p)
                .to_string_lossy()
                .into_owned();
            let content = fs::read_to_string(&p)?;
            Ok((rel, content))
        })
        .collect()
}

fn walk(dir: &Path, out: &mut Vec<PathBuf>) -> std::io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let p = entry.path();
        if p.is_dir() {
            walk(&p, out)?;
        } else if p.extension().and_then(|e| e.to_str()) == Some("md") {
            out.push(p);
        }
    }
    Ok(())
}

/// 内建样例:演示 frontmatter 关系边、正文 wikilink、标签、软类型、悬空边,一应俱全。
fn builtin_sample() -> Vec<(String, String)> {
    vec![
        (
            "concepts/compounding.md".into(),
            indoc_like(
                r#"
---
type: Concept
tags:
  - principle
status: Active
related_to: "[[sources/karpathy-llm-wiki]]"
---

# 复利笔记

知识库是复利资产:建一次,持续用。见 [[entities/karpathy]] 与 [[concepts/atomic-notes]]。
没有 [[ghost/missing-page]]。
"#,
            ),
        ),
        (
            "concepts/atomic-notes.md".into(),
            indoc_like(
                r#"
---
type: Concept
tags:
  - principle
status: Contested
---

# 原子化笔记

每条笔记只讲一件事。被 [[concepts/compounding]] 提及。
"#,
            ),
        ),
        (
            "entities/karpathy.md".into(),
            indoc_like(
                r#"
---
type: Entity
---

# Karpathy

LLM Wiki 的提出者。
"#,
            ),
        ),
        (
            "sources/karpathy-llm-wiki.md".into(),
            indoc_like(
                r#"
---
type: Source
status: Digested
tags:
  - reference
---

# Karpathy LLM Wiki 原文

复利笔记 #principle 的来源。source of truth。
"#,
            ),
        ),
    ]
}

/// 把多行字面量的首行换行去掉,保证 frontmatter 在文件最开头。
fn indoc_like(s: &str) -> String {
    s.trim_start_matches('\n').to_string()
}
