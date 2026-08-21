//! storage —— vault 存储位置判定与云同步伴生问题(doc 17 / research/icloud-vault-storage)。
//!
//! IO-free:所有探测结果(目录存在性)由调用方注入 [`StorageProbes`],本模块只做
//! 纯判定。三类伴生问题也在此收口为纯函数,供 app 层复用:
//! - 旧 macOS 的 iCloud 占位文件(`.名字.icloud`)识别;
//! - 云同步冲突副本(`X N.ext` 与 `X.ext` 并存)配对;
//! - 存储类别 → git 自动化是否放行的决策(见 doc 17 §5 G3;icloud-managed 宽松)。

use std::path::{Path, PathBuf};

/// vault 所在存储类别(doc 17 §5 G2)。
///
/// - `Local`:普通本地目录,一切照旧,零提示。
/// - `Icloud`:规范路径在 `~/Library/Mobile Documents/` 下(显式 iCloud Drive)。
///   git 自动化默认关(可显式开启);eviction / 冲突提示生效。
/// - `IcloudManaged`:路径在 `~/Documents`、`~/Desktop` 下且系统开了
///   "Desktop & Documents" 同步——用户往往不知情。**宽松**(IC-1 拍板):
///   git 自动化照常,仅提示与 eviction 探测生效。
/// - `CloudOther`:第三方云盘(OneDrive / Dropbox / iCloud for Windows 等)。
///   只给"不建议"提示,不改任何行为。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StorageKind {
    Local,
    Icloud,
    IcloudManaged,
    CloudOther,
}

impl StorageKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            StorageKind::Local => "local",
            StorageKind::Icloud => "icloud",
            StorageKind::IcloudManaged => "icloud-managed",
            StorageKind::CloudOther => "cloud-other",
        }
    }
}

impl std::fmt::Display for StorageKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

/// 探测结果(全部由 app 层 fs 检查后注入;None = 不存在 / 不适用)。
#[derive(Debug, Clone, Default)]
pub struct StorageProbes {
    /// `~/Library/Mobile Documents`(macOS iCloud Drive 容器根)。
    pub mobile_documents: Option<PathBuf>,
    /// `~/Library/Mobile Documents/com~apple~CloudDocs`。
    pub cloud_docs: Option<PathBuf>,
    /// `…/com~apple~CloudDocs/Documents` 存在 ⇒ Desktop & Documents 同步开启。
    pub dnd_documents: Option<PathBuf>,
    /// 其它已知云盘根(OneDrive / Dropbox / iCloud for Windows 等)。
    pub other_cloud_roots: Vec<PathBuf>,
}

/// 判定 vault 存储类别。规则(先命中先赢):
/// 1. 在 `Mobile Documents` 下 → `Icloud`(含第三方 iCloud 容器,如 `iCloud~md~…`);
/// 2. 在 `~/Documents` 或 `~/Desktop` 下且 D&D 同步开启 → `IcloudManaged`;
/// 3. 在任一其它云盘根下 → `CloudOther`;
/// 4. 其余 → `Local`。
pub fn classify_storage(root: &Path, home: &Path, probes: &StorageProbes) -> StorageKind {
    if let Some(md) = &probes.mobile_documents {
        if root.starts_with(md) {
            return StorageKind::Icloud;
        }
    }
    if probes.dnd_documents.is_some() {
        let docs = home.join("Documents");
        let desk = home.join("Desktop");
        if root.starts_with(&docs) || root.starts_with(&desk) {
            return StorageKind::IcloudManaged;
        }
    }
    for base in &probes.other_cloud_roots {
        if root.starts_with(base) {
            return StorageKind::CloudOther;
        }
    }
    StorageKind::Local
}

/// 旧 macOS(≤ Ventura)的 iCloud 占位文件名:点开头 + `.icloud` 结尾,
/// 如 `.Welcome.md.icloud`。Sonoma 起改为 APFS dataless 文件,不再有此形态。
pub fn is_icloud_stub(file_name: &str) -> bool {
    file_name.starts_with('.') && file_name.ends_with(".icloud") && file_name.len() > ".icloud".len() + 1
}

/// 一对疑似云同步冲突副本:`base` = 原文件,`copy` = `X N.ext` 形态的副本。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConflictPair {
    pub base: String,
    pub copy: String,
}

/// 从一组 vault 相对路径(`/` 分隔)中找出疑似冲突副本对。
///
/// 判定:`dir/X N.ext`(X 非空、N 为 1–3 位数字、ext 非空)与同目录 `dir/X.ext`
/// 并存 ⇒ 配对。注意 "Part 2.md"+"Part.md" 这类自然命名也会命中——这是**提示卡**
/// 而非判决,由用户对比后决定(doc 17 §5 G5:绝不自动合并/删除)。
/// 输出按 copy 路径排序,确定性。
pub fn conflict_pairs(paths: &[String]) -> Vec<ConflictPair> {
    use std::collections::BTreeSet;
    let set: BTreeSet<&str> = paths.iter().map(|s| s.as_str()).collect();
    let mut out: Vec<ConflictPair> = Vec::new();
    for p in &set {
        let (dir, name) = match p.rsplit_once('/') {
            Some((d, n)) => (d, n),
            None => ("", *p), // 根目录文件无 '/'
        };
        let Some((stem, ext)) = name.rsplit_once('.') else {
            continue;
        };
        if stem.is_empty() || ext.is_empty() {
            continue;
        }
        let Some((base_stem, num)) = stem.rsplit_once(' ') else {
            continue;
        };
        if base_stem.is_empty() || num.is_empty() || num.len() > 3 || !num.bytes().all(|b| b.is_ascii_digit()) {
            continue;
        }
        let base = if dir.is_empty() {
            format!("{base_stem}.{ext}")
        } else {
            format!("{dir}/{base_stem}.{ext}")
        };
        if set.contains(base.as_str()) {
            out.push(ConflictPair { base, copy: (*p).to_string() });
        }
    }
    out
}

/// git 自动化(结构操作自动提交 / git_init)是否放行(doc 17 §5 G3 + IC-1 拍板)。
/// - `Local` / `IcloudManaged` / `CloudOther`:放行(icloud-managed 明确宽松);
/// - `Icloud`:默认**不放行**;`user_override = Some(true)`(用户显式开启)才放行。
pub fn git_auto_allowed(kind: StorageKind, user_override: Option<bool>) -> bool {
    match kind {
        StorageKind::Icloud => user_override.unwrap_or(false),
        _ => true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;
    use std::path::Path;

    fn probes(home: &Path) -> StorageProbes {
        StorageProbes {
            mobile_documents: Some(home.join("Library/Mobile Documents")),
            cloud_docs: Some(home.join("Library/Mobile Documents/com~apple~CloudDocs")),
            dnd_documents: None,
            other_cloud_roots: vec![home.join("OneDrive")],
        }
    }

    #[test]
    fn classify_local_plain_dir() {
        let home = Path::new("/Users/a");
        assert_eq!(
            classify_storage(&home.join("notes"), home, &probes(home)),
            StorageKind::Local
        );
        // Documents 下但 D&D 同步未开 → 仍是本地。
        assert_eq!(
            classify_storage(&home.join("Documents/vault"), home, &probes(home)),
            StorageKind::Local
        );
    }

    #[test]
    fn classify_icloud_under_mobile_documents() {
        let home = Path::new("/Users/a");
        let p = probes(home);
        for root in [
            "/Users/a/Library/Mobile Documents/com~apple~CloudDocs/Open LLM Wiki/v",
            "/Users/a/Library/Mobile Documents/iCloud~md~obsidian/Documents/v",
        ] {
            assert_eq!(classify_storage(Path::new(root), home, &p), StorageKind::Icloud, "{root}");
        }
        // CloudDocs 根本身就是 vault。
        assert_eq!(
            classify_storage(p.cloud_docs.as_deref().unwrap(), home, &p),
            StorageKind::Icloud
        );
    }

    #[test]
    fn classify_icloud_managed_documents_and_desktop() {
        let home = Path::new("/Users/a");
        let mut p = probes(home);
        p.dnd_documents = p.cloud_docs.as_ref().map(|c| c.join("Documents"));
        assert_eq!(
            classify_storage(&home.join("Documents/Open LLM Wiki Demo"), home, &p),
            StorageKind::IcloudManaged
        );
        assert_eq!(
            classify_storage(&home.join("Desktop/vault"), home, &p),
            StorageKind::IcloudManaged
        );
    }

    #[test]
    fn classify_cloud_other_onedrive() {
        let home = Path::new("/Users/a");
        assert_eq!(
            classify_storage(&home.join("OneDrive/vault"), home, &probes(home)),
            StorageKind::CloudOther
        );
    }

    #[test]
    fn classify_mobile_documents_wins_over_managed() {
        // Mobile Documents 下还有个 Documents 子目录(非 ~/Documents),仍是 Icloud。
        let home = Path::new("/Users/a");
        let mut p = probes(home);
        p.dnd_documents = p.cloud_docs.as_ref().map(|c| c.join("Documents"));
        assert_eq!(
            classify_storage(
                Path::new("/Users/a/Library/Mobile Documents/com~apple~CloudDocs/Documents/v"),
                home,
                &p
            ),
            StorageKind::Icloud
        );
    }

    #[test]
    fn icloud_stub_detection() {
        assert!(is_icloud_stub(".Welcome.md.icloud"));
        assert!(is_icloud_stub(".a.icloud"));
        assert!(!is_icloud_stub("Welcome.md"));
        assert!(!is_icloud_stub(".icloud")); // 只有后缀,无本体名
        assert!(!is_icloud_stub("notes.icloud")); // 非点开头
    }

    #[test]
    fn conflict_pairs_basic_and_sorted() {
        let paths = vec![
            "b.md".to_string(),
            "Note 2.md".to_string(),
            "Note.md".to_string(),
            "sub/Deep 3.md".to_string(),
            "sub/Deep.md".to_string(),
        ];
        assert_eq!(
            conflict_pairs(&paths),
            vec![
                ConflictPair { base: "Note.md".into(), copy: "Note 2.md".into() },
                ConflictPair { base: "sub/Deep.md".into(), copy: "sub/Deep 3.md".into() },
            ]
        );
    }

    #[test]
    fn conflict_pairs_requires_sibling_base() {
        // 无同目录 base → 不算冲突("Note 2024" 这类自然命名安全)。
        assert!(conflict_pairs(&["Note 2024.md".to_string(), "other.md".to_string()]).is_empty());
        // base 在别的目录 → 不配对。
        assert!(conflict_pairs(&["a/Note 2.md".to_string(), "Note.md".to_string()]).is_empty());
    }

    #[test]
    fn conflict_pairs_digits_shape() {
        // 4 位数字(年份风)不判;多份副本各自配对。
        assert!(conflict_pairs(&["X 1234.md".to_string(), "X.md".to_string()]).is_empty());
        let pairs = conflict_pairs(&["X.md".into(), "X 2.md".into(), "X 3.md".into()]);
        assert_eq!(pairs.len(), 2);
        // 无扩展名 / 空 stem 不判。
        assert!(conflict_pairs(&["Y 2".to_string(), "Y".to_string()]).is_empty());
        // " 2" 前必须有名字。
        assert!(conflict_pairs(&["2.md".to_string(), ".md".to_string()]).is_empty());
    }

    #[test]
    fn git_auto_allowed_matrix() {
        use StorageKind::*;
        // Icloud:默认关,显式开启才放行。
        assert!(!git_auto_allowed(Icloud, None));
        assert!(!git_auto_allowed(Icloud, Some(false)));
        assert!(git_auto_allowed(Icloud, Some(true)));
        // 其余类别一律放行(IC-1:icloud-managed 宽松)。
        for k in [Local, IcloudManaged, CloudOther] {
            assert!(git_auto_allowed(k, None), "{k}");
            assert!(git_auto_allowed(k, Some(false)), "{k}");
        }
    }

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(64))]

        /// 任意名字绝不 panic;只有 `.x.icloud` 形态判 stub。
        #[test]
        fn stub_never_panics_on_arbitrary_names(name in "[.a-zA-Z0-9 ]{0,12}") {
            let is = is_icloud_stub(&name);
            prop_assert_eq!(is, name.starts_with('.') && name.ends_with(".icloud") && name.len() > 8);
        }

        /// 任意路径列表:结果 ⊆ 输入、按序、可重复计算(纯函数)。
        #[test]
        fn conflict_pairs_subset_and_deterministic(
            paths in prop::collection::vec("[a-z]{1,3}( [0-9]{1,3})?\\.md", 0..24)
        ) {
            let out = conflict_pairs(&paths);
            let again = conflict_pairs(&paths);
            let known: std::collections::HashSet<&str> = paths.iter().map(|s| s.as_str()).collect();
            for p in &out {
                prop_assert!(known.contains(p.base.as_str()));
                prop_assert!(known.contains(p.copy.as_str()));
            }
            let copies: Vec<&str> = out.iter().map(|p| p.copy.as_str()).collect();
            let mut sorted = copies.clone();
            sorted.sort();
            prop_assert_eq!(copies, sorted);
            prop_assert_eq!(out, again);
        }
    }
}
