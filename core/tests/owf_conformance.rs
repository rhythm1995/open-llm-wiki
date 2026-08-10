//! OWF-1 宽容规则 conformance 锁(见 docs/15-owf-format.md §6)。
//!
//! 档 1 不给引擎加行为——这些属性 core 今天就有。本测试把「偶然属性」升为
//! 「规范承诺」:改解析/索引若破坏了未知 type/字段宽容或缺省宽容,会被这里挡下。
//! 回滚档 1 = 删本文件即可,core 行为不受影响(见 docs/15 §9.3)。

use open_llm_wiki_core::{enrich, frontmatter_str, parse_note, type_of, VaultIndex};

/// 环 3 自由区:未知 type 合法——解析、索引全链路不报错、不丢弃。
#[test]
fn unknown_type_is_tolerated_end_to_end() {
    let ix = VaultIndex::build(vec![(
        "zebra.md".to_string(),
        "---\ntype: Zebra\nstatus: Active\n---\n# ZebraPage\n".to_string(),
    )]);
    let notes = ix.notes();
    assert_eq!(notes.len(), 1, "未知 type 的笔记不得被丢弃");
    assert_eq!(type_of(&notes[0]).as_deref(), Some("Zebra"));
    // 图谱同样收录(节点存在,标题解析正常)。
    assert_eq!(ix.graph().nodes.len(), 1);
    assert_eq!(ix.graph().nodes[0].title, "ZebraPage");
}

/// 环 3 自由区:未知 frontmatter 字段必须全量保留(parse → enrich 不丢键)。
#[test]
fn unknown_frontmatter_fields_are_preserved() {
    let parsed = parse_note(
        "---\ntype: Concept\nstatus: Active\nrecall_triggers: [foo, bar]\nsome_future_field: 42\n---\n# C\n",
        "c.md",
    );
    let note = enrich(parsed);
    // 标准字段在。
    assert_eq!(type_of(&note).as_deref(), Some("Concept"));
    // 未知字段也在(字符串标量可读,非标量键不被静默删除)。
    assert_eq!(frontmatter_str(&note, "status").as_deref(), Some("Active"));
    assert!(
        note.frontmatter.contains_key("recall_triggers"),
        "未知列表字段不得被丢弃"
    );
    assert!(
        note.frontmatter.contains_key("some_future_field"),
        "未知标量字段不得被丢弃"
    );
}

/// 缺省宽容:无 status、无 format 声明皆合法,不报错、不丢页。
#[test]
fn missing_status_and_format_are_tolerated() {
    let ix = VaultIndex::build(vec![
        ("bare.md".to_string(), "# Bare\n\n没有 frontmatter 的裸页。\n".to_string()),
        ("nostatus.md".to_string(), "---\ntype: Concept\n---\n# NoStatus\n".to_string()),
    ]);
    assert_eq!(ix.notes().len(), 2);
    let nostatus = ix.notes().iter().find(|n| n.title == "NoStatus").unwrap();
    assert_eq!(frontmatter_str(nostatus, "status"), None, "缺 status = None,不报错");
}

/// 环 1 ④:format 声明本身也是普通 frontmatter 字段——存在即保留,缺失不报错。
#[test]
fn format_declaration_is_an_ordinary_field() {
    let with = enrich(parse_note(
        "---\ntype: Index\nstatus: Active\nformat: owf/1\n---\n# Index\n",
        "index.md",
    ));
    assert_eq!(frontmatter_str(&with, "format").as_deref(), Some("owf/1"));

    let without = enrich(parse_note("---\ntype: Index\n---\n# Index\n", "index.md"));
    assert_eq!(frontmatter_str(&without, "format"), None);
}
