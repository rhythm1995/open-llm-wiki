//! MediaIndex —— vault 媒体索引(IO-free)。
//!
//! 与 [`crate::vault::VaultIndex`] 平行:**不**把二进制塞进笔记图谱。
//! - `files`:磁盘上有哪些媒体(由 app walk 后喂入 meta)
//! - `by_note` / `by_media`:正文引用的正排 / 倒排
//! - `orphans()` = 在 files 且 refcount==0
//! - `missing()` = 被引用但不在 files
//!
//! 删除策略不在本模块:只提供查询;GC 由 app/UI 确认后删文件并 `remove_file`。

use std::collections::{BTreeMap, BTreeSet};

/// 媒体类型(扩展名启发式)。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MediaKind {
    Image,
    Other,
}

/// 磁盘侧一条媒体记录(app 填 bytes/mtime;core 不碰 fs)。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MediaMeta {
    pub path: String,
    pub kind: MediaKind,
    pub bytes: u64,
    pub mtime_ms: u64,
}

/// 媒体索引统计。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct MediaStats {
    pub files: usize,
    pub notes_with_media: usize,
    pub refs: usize,
    pub orphans: usize,
    pub missing: usize,
}

/// Vault 级媒体索引:文件表 + 引用正排/倒排。
#[derive(Debug, Clone, Default)]
pub struct MediaIndex {
    files: BTreeMap<String, MediaMeta>,
    /// note path → media paths
    by_note: BTreeMap<String, BTreeSet<String>>,
    /// media path → note paths
    by_media: BTreeMap<String, BTreeSet<String>>,
}

impl MediaIndex {
    pub fn new() -> Self {
        Self::default()
    }

    /// 全量构建。
    pub fn build(
        file_metas: impl IntoIterator<Item = MediaMeta>,
        notes: impl IntoIterator<Item = (String, String)>,
    ) -> Self {
        let mut ix = Self::new();
        for m in file_metas {
            let path = normalize_media_path(&m.path);
            if path.is_empty() {
                continue;
            }
            let mut meta = m;
            meta.path = path.clone();
            ix.files.insert(path, meta);
        }
        for (note, content) in notes {
            let note = normalize_media_path(&note);
            if note.is_empty() {
                continue;
            }
            ix.reindex_note(&note, &content);
        }
        ix
    }

    /// 笔记正文变更:`None` = 删除笔记(只清引用,不动 files)。
    pub fn apply_note_delta(&mut self, note_path: &str, content: Option<&str>) {
        let note = normalize_media_path(note_path);
        if note.is_empty() {
            return;
        }
        self.clear_note_refs(&note);
        if let Some(c) = content {
            self.reindex_note(&note, c);
        }
    }

    /// 登记/更新磁盘文件。
    pub fn upsert_file(&mut self, meta: MediaMeta) {
        let path = normalize_media_path(&meta.path);
        if path.is_empty() {
            return;
        }
        let mut m = meta;
        m.path = path.clone();
        self.files.insert(path, m);
    }

    /// 磁盘文件消失(删附件 / 外部删除)。不改 by_media 里的引用 → 变为 missing。
    pub fn remove_file(&mut self, path: &str) {
        let path = normalize_media_path(path);
        self.files.remove(&path);
    }

    /// 批量同步 files 侧:先可选清空再插入,或按 path 列表 upsert/remove。
    pub fn set_files(&mut self, file_metas: impl IntoIterator<Item = MediaMeta>) {
        self.files.clear();
        for m in file_metas {
            self.upsert_file(m);
        }
    }

    pub fn files(&self) -> &BTreeMap<String, MediaMeta> {
        &self.files
    }

    pub fn by_note(&self) -> &BTreeMap<String, BTreeSet<String>> {
        &self.by_note
    }

    pub fn by_media(&self) -> &BTreeMap<String, BTreeSet<String>> {
        &self.by_media
    }

    pub fn refcount(&self, media_path: &str) -> usize {
        let p = normalize_media_path(media_path);
        self.by_media.get(&p).map(|s| s.len()).unwrap_or(0)
    }

    /// 某笔记引用的媒体 meta(按 path 序;缺文件的只返回 path 占位 meta bytes=0)。
    pub fn media_of(&self, note_path: &str) -> Vec<MediaMeta> {
        let note = normalize_media_path(note_path);
        let Some(set) = self.by_note.get(&note) else {
            return Vec::new();
        };
        set.iter()
            .map(|p| {
                self.files.get(p).cloned().unwrap_or_else(|| MediaMeta {
                    path: p.clone(),
                    kind: kind_from_path(p),
                    bytes: 0,
                    mtime_ms: 0,
                })
            })
            .collect()
    }

    /// 引用该媒体的笔记路径。
    pub fn used_by(&self, media_path: &str) -> Vec<String> {
        let p = normalize_media_path(media_path);
        self.by_media
            .get(&p)
            .map(|s| s.iter().cloned().collect())
            .unwrap_or_default()
    }

    /// 磁盘上有、但没有任何笔记引用。
    pub fn orphans(&self) -> Vec<&MediaMeta> {
        self.files
            .values()
            .filter(|m| self.refcount(&m.path) == 0)
            .collect()
    }

    /// 正文引用了、磁盘 files 表没有。
    pub fn missing(&self) -> Vec<String> {
        self.by_media
            .keys()
            .filter(|p| !self.files.contains_key(*p))
            .cloned()
            .collect()
    }

    pub fn stats(&self) -> MediaStats {
        let refs: usize = self.by_note.values().map(|s| s.len()).sum();
        MediaStats {
            files: self.files.len(),
            notes_with_media: self.by_note.len(),
            refs,
            orphans: self.orphans().len(),
            missing: self.missing().len(),
        }
    }

    fn clear_note_refs(&mut self, note: &str) {
        let Some(medias) = self.by_note.remove(note) else {
            return;
        };
        for m in medias {
            if let Some(set) = self.by_media.get_mut(&m) {
                set.remove(note);
                if set.is_empty() {
                    self.by_media.remove(&m);
                }
            }
        }
    }

    fn reindex_note(&mut self, note: &str, content: &str) {
        let refs = extract_media_refs(content);
        if refs.is_empty() {
            return;
        }
        let entry = self.by_note.entry(note.to_string()).or_default();
        for r in refs {
            entry.insert(r.clone());
            self.by_media
                .entry(r)
                .or_default()
                .insert(note.to_string());
        }
    }

    /// 磁盘文件改名:迁移 files meta,并把 by_media / by_note 中的 path 键从 old→new。
    pub fn rename_file_key(&mut self, from: &str, to: &str) {
        let from = normalize_media_path(from);
        let to = normalize_media_path(to);
        if from.is_empty() || to.is_empty() || from == to {
            return;
        }
        if let Some(mut meta) = self.files.remove(&from) {
            meta.path = to.clone();
            self.files.insert(to.clone(), meta);
        }
        if let Some(notes) = self.by_media.remove(&from) {
            for n in &notes {
                if let Some(set) = self.by_note.get_mut(n) {
                    set.remove(&from);
                    set.insert(to.clone());
                }
            }
            self.by_media.insert(to, notes);
        }
    }
}

/// 笔记路径 → stem(无 `.md`,空白→`-` 的轻量版;与 UI sanitize 不必逐字相同,仅用于桶匹配)。
pub fn note_stem_from_path(note_path: &str) -> String {
    let n = normalize_media_path(note_path);
    let base = n.rsplit('/').next().unwrap_or(&n);
    let stem = base
        .strip_suffix(".md")
        .or_else(|| base.strip_suffix(".MD"))
        .unwrap_or(base)
        .trim();
    stem.replace(char::is_whitespace, "-")
}

/// 笔记所在目录(vault 相对);根级 → `""`。
pub fn note_dir_from_path(note_path: &str) -> String {
    let n = normalize_media_path(note_path);
    match n.rfind('/') {
        Some(i) if i > 0 => n[..i].to_string(),
        _ => String::new(),
    }
}

fn path_basename(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

fn path_parent(path: &str) -> String {
    let p = normalize_media_path(path);
    match p.rfind('/') {
        Some(i) if i > 0 => p[..i].to_string(),
        Some(0) => String::new(),
        _ => String::new(),
    }
}

/// 一次附件搬家计划。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MediaMove {
    pub from: String,
    pub to: String,
}

/// 笔记改名时计算应跟随移动的附件(纯逻辑)。
///
/// 仅当 `refcount(media)==1`:
/// 1. **同父目录**:`parent(media)==parent(note_from)` → `parent(note_to)/basename`
/// 2. **stem 桶**:`parent` 的最后一段 == oldStem → 换成 newStem
pub fn plan_media_moves_on_note_rename(
    note_from: &str,
    note_to: &str,
    media_paths: impl IntoIterator<Item = String>,
    refcount: impl Fn(&str) -> usize,
) -> Vec<MediaMove> {
    let note_from = normalize_media_path(note_from);
    let note_to = normalize_media_path(note_to);
    let old_dir = note_dir_from_path(&note_from);
    let new_dir = note_dir_from_path(&note_to);
    let old_stem = note_stem_from_path(&note_from);
    let new_stem = note_stem_from_path(&note_to);
    let mut out = Vec::new();
    let mut taken_to = BTreeSet::new();

    for raw in media_paths {
        let from = normalize_media_path(&raw);
        if from.is_empty() || refcount(&from) != 1 {
            continue;
        }
        let parent = path_parent(&from);
        let base = path_basename(&from);
        let mut to: Option<String> = None;

        // 规则 1:与旧笔记同目录
        if parent == old_dir {
            let dest = if new_dir.is_empty() {
                base.to_string()
            } else {
                format!("{new_dir}/{base}")
            };
            if dest != from {
                to = Some(dest);
            }
        } else if !old_stem.is_empty() {
            // 规则 2:父目录名为 oldStem(…/Daily/file.png)
            let parent_base = path_basename(&parent);
            if parent_base == old_stem && old_stem != new_stem {
                let grand = path_parent(&parent);
                let new_parent = if grand.is_empty() {
                    new_stem.clone()
                } else {
                    format!("{grand}/{new_stem}")
                };
                let dest = format!("{new_parent}/{base}");
                if dest != from {
                    to = Some(dest);
                }
            }
        }

        if let Some(dest) = to {
            if taken_to.contains(&dest) {
                continue;
            }
            taken_to.insert(dest.clone());
            out.push(MediaMove {
                from,
                to: dest,
            });
        }
    }
    out
}

/// 把正文中的媒体路径从 from→to(md 图、html src、wiki 嵌入字面量)。
pub fn rewrite_media_paths_in_body(body: &str, moves: &[MediaMove]) -> String {
    if moves.is_empty() {
        return body.to_string();
    }
    let mut s = body.to_string();
    // 长路径优先,避免短前缀误伤
    let mut ordered: Vec<&MediaMove> = moves.iter().collect();
    ordered.sort_by(|a, b| b.from.len().cmp(&a.from.len()));
    for m in ordered {
        if m.from == m.to {
            continue;
        }
        s = s.replace(&m.from, &m.to);
    }
    s
}

/// 将 wiki/md 目标解析为 vault 相对媒体路径。
/// - 已是完整相对路径且在 files 中 → 原样
/// - 仅 basename 且 files 中唯一匹配 → 该路径
/// - 否则返回 normalize 后的 target(可能仍断链)
pub fn resolve_media_target(target: &str, file_paths: impl IntoIterator<Item = impl AsRef<str>>) -> String {
    let t = normalize_media_path(target);
    if t.is_empty() {
        return t;
    }
    let files: Vec<String> = file_paths
        .into_iter()
        .map(|p| normalize_media_path(p.as_ref()))
        .filter(|p| !p.is_empty())
        .collect();
    if files.iter().any(|p| p == &t) {
        return t;
    }
    let base = path_basename(&t);
    let hits: Vec<&String> = files
        .iter()
        .filter(|p| path_basename(p) == base)
        .collect();
    if hits.len() == 1 {
        return hits[0].clone();
    }
    t
}

/// vault 相对路径规范化(与 app `normalize_rel` 对齐)。
pub fn normalize_media_path(path: &str) -> String {
    path.replace('\\', "/")
        .trim()
        .trim_start_matches("./")
        .trim_start_matches('/')
        .to_string()
}

/// 是否像 vault 内媒体 src(非 http/data/blob…)。
pub fn is_vault_media_src(src: &str) -> bool {
    let s = src.trim();
    if s.is_empty() {
        return false;
    }
    if s.starts_with("//") {
        return false;
    }
    let lower = s.to_ascii_lowercase();
    if lower.starts_with("https://")
        || lower.starts_with("http://")
        || lower.starts_with("data:")
        || lower.starts_with("blob:")
        || lower.starts_with("asset:")
        || lower.starts_with("tauri:")
        || lower.starts_with("file:")
    {
        return false;
    }
    true
}

pub fn is_image_path(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    lower.ends_with(".png")
        || lower.ends_with(".jpg")
        || lower.ends_with(".jpeg")
        || lower.ends_with(".gif")
        || lower.ends_with(".webp")
        || lower.ends_with(".svg")
        || lower.ends_with(".bmp")
}

pub fn kind_from_path(path: &str) -> MediaKind {
    if is_image_path(path) {
        MediaKind::Image
    } else {
        MediaKind::Other
    }
}

/// 从 Markdown 正文抽取 vault 相对媒体路径。
/// 管道:标准 `![alt](src)`、HTML `<img src>`、wiki 嵌入 `![[path.ext]]`(仅图片扩展名)。
pub fn extract_media_refs(md: &str) -> Vec<String> {
    if md.is_empty() {
        return Vec::new();
    }
    let mut out = Vec::new();
    let mut seen = BTreeSet::new();

    // ![alt](path) or ![alt](path "title")
    let md_re = regex_lite_md_images(md);
    for raw in md_re {
        push_ref(&mut out, &mut seen, &raw);
    }

    // <img ... src="...">
    for raw in regex_lite_html_imgs(md) {
        push_ref(&mut out, &mut seen, &raw);
    }

    // ![[file.png]] / ![[path/file.webp|alias]]
    for raw in regex_lite_wiki_embeds(md) {
        push_ref(&mut out, &mut seen, &raw);
    }

    out
}

fn push_ref(out: &mut Vec<String>, seen: &mut BTreeSet<String>, raw: &str) {
    if !is_vault_media_src(raw) {
        return;
    }
    let norm = normalize_media_path(raw);
    // 去 query/hash
    let norm = norm
        .split_once('?')
        .map(|(a, _)| a)
        .unwrap_or(&norm)
        .split_once('#')
        .map(|(a, _)| a)
        .unwrap_or(&norm)
        .to_string();
    if norm.is_empty() || seen.contains(&norm) {
        return;
    }
    // 无扩展名的 wiki 嵌入可能是笔记,不进媒体索引
    if !norm.contains('.') {
        return;
    }
    seen.insert(norm.clone());
    out.push(norm);
}

/// 零依赖轻量扫 `![...](...)` —— 不用 regex crate,保 core 依赖面。
fn regex_lite_md_images(md: &str) -> Vec<String> {
    let mut out = Vec::new();
    let bytes = md.as_bytes();
    let mut i = 0;
    while i + 1 < bytes.len() {
        if bytes[i] == b'!' && bytes[i + 1] == b'[' {
            // 找 ]
            if let Some(rel_rb) = md[i + 2..].find(']') {
                let after = i + 2 + rel_rb + 1;
                if after < bytes.len() && bytes[after] == b'(' {
                    let rest = &md[after + 1..];
                    if let Some(end) = find_md_link_dest_end(rest) {
                        let dest = rest[..end].trim();
                        // 去掉可选 <...> 与 title
                        let path = strip_md_dest(dest);
                        if !path.is_empty() {
                            out.push(path);
                        }
                        i = after + 1 + end + 1;
                        continue;
                    }
                }
            }
        }
        i += 1;
    }
    out
}

fn find_md_link_dest_end(s: &str) -> Option<usize> {
    let b = s.as_bytes();
    let mut i = 0;
    let mut depth = 0i32;
    while i < b.len() {
        match b[i] {
            b'(' => depth += 1,
            b')' => {
                if depth == 0 {
                    return Some(i);
                }
                depth -= 1;
            }
            b'"' | b'\'' if depth == 0 => {
                // title 起,已过 path
                // path 在空白处截断更稳,但简单:找到配对引号后的 )
            }
            _ => {}
        }
        i += 1;
    }
    None
}

fn strip_md_dest(dest: &str) -> String {
    let mut s = dest.trim();
    // path "title" / path 'title'
    if let Some(sp) = s.find(|c: char| c.is_whitespace()) {
        s = s[..sp].trim();
    }
    if s.starts_with('<') && s.ends_with('>') && s.len() >= 2 {
        s = &s[1..s.len() - 1];
    }
    s.to_string()
}

fn regex_lite_html_imgs(md: &str) -> Vec<String> {
    let mut out = Vec::new();
    let lower_hint = md; // 保原始大小写 path
    let mut search_from = 0;
    let low = md.to_ascii_lowercase();
    while let Some(rel) = low[search_from..].find("<img") {
        let start = search_from + rel;
        let after = &md[start..];
        let end = after.find('>').unwrap_or(after.len());
        let tag = &after[..end];
        if let Some(src) = html_attr(tag, "src") {
            out.push(src);
        }
        search_from = start + end.max(1);
        let _ = lower_hint; // silence
    }
    out
}

fn html_attr(tag: &str, name: &str) -> Option<String> {
    let low = tag.to_ascii_lowercase();
    let key = format!("{name}=");
    let idx = low.find(&key)?;
    let rest = tag[idx + key.len()..].trim_start();
    let bytes = rest.as_bytes();
    if bytes.is_empty() {
        return None;
    }
    if bytes[0] == b'"' || bytes[0] == b'\'' {
        let q = bytes[0] as char;
        let end = rest[1..].find(q)?;
        return Some(rest[1..1 + end].to_string());
    }
    // 无引号:读到空白或 >
    let end = rest
        .find(|c: char| c.is_whitespace() || c == '>')
        .unwrap_or(rest.len());
    Some(rest[..end].to_string())
}

fn regex_lite_wiki_embeds(md: &str) -> Vec<String> {
    let mut out = Vec::new();
    let bytes = md.as_bytes();
    let mut i = 0;
    while i + 3 < bytes.len() {
        // ![[
        if bytes[i] == b'!' && bytes[i + 1] == b'[' && bytes[i + 2] == b'[' {
            if let Some(rel) = md[i + 3..].find("]]") {
                let inner = md[i + 3..i + 3 + rel].trim();
                // path|alias or path#anchor
                let path = inner
                    .split('|')
                    .next()
                    .unwrap_or(inner)
                    .split('#')
                    .next()
                    .unwrap_or(inner)
                    .trim();
                if is_image_path(path) {
                    out.push(path.to_string());
                }
                i = i + 3 + rel + 2;
                continue;
            }
        }
        i += 1;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn meta(path: &str) -> MediaMeta {
        MediaMeta {
            path: path.into(),
            kind: kind_from_path(path),
            bytes: 10,
            mtime_ms: 1,
        }
    }

    #[test]
    fn extract_md_html_wiki() {
        let md = r#"
![a](attachments/a.png)
<img src="media/b.jpg" alt="x">
![[shots/c.webp|cap]]
![ext](https://x.com/z.png)
![[NotAnImage]]
"#;
        let refs = extract_media_refs(md);
        assert_eq!(
            refs,
            vec![
                "attachments/a.png".to_string(),
                "media/b.jpg".to_string(),
                "shots/c.webp".to_string(),
            ]
        );
    }

    #[test]
    fn build_orphans_missing_refcount() {
        let files = vec![meta("attachments/used.png"), meta("attachments/orphan.png")];
        let notes = vec![(
            "n.md".into(),
            "see ![u](attachments/used.png) and ![m](attachments/missing.png)".into(),
        )];
        let ix = MediaIndex::build(files, notes);
        assert_eq!(ix.refcount("attachments/used.png"), 1);
        assert_eq!(ix.refcount("attachments/orphan.png"), 0);
        assert_eq!(ix.orphans().len(), 1);
        assert_eq!(ix.orphans()[0].path, "attachments/orphan.png");
        assert_eq!(ix.missing(), vec!["attachments/missing.png".to_string()]);
        assert_eq!(ix.used_by("attachments/used.png"), vec!["n.md".to_string()]);
        assert_eq!(ix.media_of("n.md").len(), 2);
        let st = ix.stats();
        assert_eq!(st.files, 2);
        assert_eq!(st.orphans, 1);
        assert_eq!(st.missing, 1);
    }

    #[test]
    fn note_delta_clears_and_reindexes() {
        let mut ix = MediaIndex::build(
            vec![meta("a.png"), meta("b.png")],
            vec![("n.md".into(), "![x](a.png)".into())],
        );
        assert_eq!(ix.refcount("a.png"), 1);
        ix.apply_note_delta("n.md", Some("![y](b.png)"));
        assert_eq!(ix.refcount("a.png"), 0);
        assert_eq!(ix.refcount("b.png"), 1);
        ix.apply_note_delta("n.md", None);
        assert_eq!(ix.refcount("b.png"), 0);
        assert!(ix.orphans().iter().any(|m| m.path == "a.png"));
        assert!(ix.orphans().iter().any(|m| m.path == "b.png"));
    }

    #[test]
    fn upsert_remove_file() {
        let mut ix = MediaIndex::new();
        ix.upsert_file(meta("x.png"));
        assert_eq!(ix.files().len(), 1);
        ix.apply_note_delta("n.md", Some("![](x.png)"));
        assert_eq!(ix.refcount("x.png"), 1);
        ix.remove_file("x.png");
        assert!(ix.files().is_empty());
        assert_eq!(ix.missing(), vec!["x.png".to_string()]);
    }

    #[test]
    fn normalize_and_kind() {
        assert_eq!(normalize_media_path(r".\a\b.PNG"), "a/b.PNG");
        assert!(is_image_path("a/b.PNG"));
        assert_eq!(kind_from_path("a.pdf"), MediaKind::Other);
        assert!(!is_vault_media_src("data:image/png;base64,xx"));
    }

    #[test]
    fn plan_move_same_dir_and_stem_bucket() {
        let rc = |_p: &str| 1usize;
        // note-folder
        let moves = plan_media_moves_on_note_rename(
            "proj/a.md",
            "archive/a.md",
            vec!["proj/shot.png".into()],
            rc,
        );
        assert_eq!(
            moves,
            vec![MediaMove {
                from: "proj/shot.png".into(),
                to: "archive/shot.png".into(),
            }]
        );
        // folder-note stem bucket
        let moves2 = plan_media_moves_on_note_rename(
            "notes/Daily.md",
            "notes/Journal.md",
            vec!["attachments/Daily/x.png".into()],
            rc,
        );
        assert_eq!(moves2[0].to, "attachments/Journal/x.png");
        // shared skip
        let moves3 = plan_media_moves_on_note_rename(
            "a.md",
            "b.md",
            vec!["x.png".into()],
            |_| 2,
        );
        assert!(moves3.is_empty());
    }

    #[test]
    fn rewrite_body_and_resolve_short_name() {
        let moves = vec![MediaMove {
            from: "attachments/A/x.png".into(),
            to: "attachments/B/x.png".into(),
        }];
        let body = "![t](attachments/A/x.png) and ![[attachments/A/x.png]]";
        let out = rewrite_media_paths_in_body(body, &moves);
        assert!(out.contains("attachments/B/x.png"));
        assert!(!out.contains("attachments/A/x.png"));

        let files = ["attachments/Daily/shot.png", "other/y.png"];
        assert_eq!(
            resolve_media_target("shot.png", files),
            "attachments/Daily/shot.png"
        );
        assert_eq!(
            resolve_media_target("attachments/Daily/shot.png", files),
            "attachments/Daily/shot.png"
        );
    }

    #[test]
    fn rename_file_key_updates_refs() {
        let mut ix = MediaIndex::build(
            vec![meta("a.png")],
            vec![("n.md".into(), "![](a.png)".into())],
        );
        ix.rename_file_key("a.png", "b.png");
        assert!(ix.files().contains_key("b.png"));
        assert_eq!(ix.refcount("b.png"), 1);
        assert_eq!(ix.media_of("n.md")[0].path, "b.png");
    }
}
