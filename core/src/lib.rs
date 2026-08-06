//! openobs-core —— OpenObsidian 的纯逻辑内核。
//!
//! 全部 IO-free、纯函数、穷尽单测。设计见 `docs/02-architecture.md` 与 `docs/03-data-model.md`。
//! 分层铁律:本 crate 不碰文件系统、不碰网络、不碰时间。所有副作用在 `app` 层。
//!
//! 模块分层:
//! - `parse`(零依赖分词)→ `index`(frontmatter→map、关系边、标签/类型)
//! - → `graph`(统一 Wiki+Relation 图谱)
//! - → `query`(QQL 求值器:AST → 结果)/ `qql`(QQL 文本解析器:字符串 → AST)
//! - → `search`(倒排全文检索)
//! - → `vault`(顶层纯索引器:把以上串成一个 `VaultIndex`)
//! - → `media`(附件文件表 + 引用正排/倒排;与笔记索引平行,IO-free)
//! - → `lint`(内容级 lint L1:结构启发式候选生成;只产候选、不做判决)
//!
//! 顶层入口:`crate::vault::VaultIndex::build(Vec<(path, content)>)`。
//! 文本查询入口:`crate::qql::parse("WHERE type = \"Concept\" SORT title")`。
//! 媒体索引:`crate::media::MediaIndex::build(files, notes)`。

pub mod graph;
pub mod index;
pub mod lint;
pub mod media;
pub mod parse;
pub mod qql;
pub mod query;
pub mod search;
pub mod vault;

pub use graph::{aliases_of, Edge, EdgeKind, Graph, NodeId, OrphanMode, Target};
pub use lint::{
    contradiction_consistency, duplicate_names, lint_all, refs_to_superseded,
    summaries_on_superseded, DuplicateNameGroup, Finding, FindingKind, FindingReport, LintReport,
    NodeRef,
};
pub use index::{
    enrich, frontmatter_str, parse_frontmatter, relationship_links, tags, type_of, Frontmatter,
    Note,
};
pub use parse::{parse_note, Link, ParsedNote};
pub use qql::{parse as parse_query, ParseError as QqlParseError};
pub use query::{
    eval, matches as predicate_matches, Cmp, Column, Direction, FieldRef, GroupRow, LenSrc,
    Literal, OrderKey, Predicate, Query, Render, ResultSet, Row, Select,
};
pub use media::{
    extract_media_refs, is_image_path, is_vault_media_src, kind_from_path, normalize_media_path,
    note_dir_from_path, note_stem_from_path, plan_media_moves_on_note_rename,
    resolve_media_target, rewrite_media_paths_in_body, MediaIndex, MediaKind, MediaMeta, MediaMove,
    MediaStats,
};
pub use search::SearchIndex;
pub use vault::{apply_entry_deltas, entries_to_vec, EntryDelta, VaultIndex};
