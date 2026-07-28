/**
 * F-TRASH 回收站的纯路径逻辑(无 IO)。
 *
 * 回收站约定:笔记被"删除"时不是直接抹除,而是改名移入 vault 根下的
 * `.trash/` 隐藏目录,保留原目录结构。这样:
 *   - 文件即真相仍然成立(只是换了位置,内容无损);
 *   - 可恢复(restore):原路移回;
 *   - 可清空(purge / empty trash):才真正 fs::remove。
 *
 * 本模块只做**路径与命名的纯计算**,把"移到哪、叫什么、还原成什么"确定下来,
 * 让上层 store 据此调用 rename_note / delete_note;碰撞解析集中在此,便于测试。
 * 实际文件移动是 IO,在 app 层(rename_note 命令)完成。
 */
export const TRASH_DIR = ".trash";

/** 笔记相对路径 → 回收站内相对路径(保留目录结构)。 */
export function toTrashPath(notePath: string): string {
  return `${TRASH_DIR}/${notePath}`;
}

/** 该相对路径是否位于回收站内(含回收站根本身)。 */
export function isTrashPath(path: string): boolean {
  return path === TRASH_DIR || path.startsWith(`${TRASH_DIR}/`);
}

/** 回收站内路径 → 还原后的原始相对路径(去掉 `.trash/` 前缀;非回收站路径原样返回)。 */
export function restorePath(trashPath: string): string {
  if (!isTrashPath(trashPath)) return trashPath;
  return trashPath.slice(TRASH_DIR.length + 1);
}

/**
 * 给定期望名与已存在名集合,返回不冲突的名字:无冲突原样返回;
 * 冲突则把**最后一段文件名**加 `-2` / `-3` … 后缀(扩展名保留,目录前缀不动)。
 * 大小写不敏感比较(避免在大小写不敏感的文件系统上覆盖)。
 */
export function uniqueName(
  desired: string,
  existing: ReadonlySet<string>,
): string {
  const lower = new Set([...existing].map((s) => s.toLowerCase()));
  if (!lower.has(desired.toLowerCase())) return desired;
  // 把"目录前缀 + 主名"与扩展名拆开,只在主名上递增。
  const slash = desired.lastIndexOf("/");
  const dir = slash >= 0 ? desired.slice(0, slash + 1) : "";
  const filename = slash >= 0 ? desired.slice(slash + 1) : desired;
  const dot = filename.match(/\.md$/i);
  const stem = dot ? filename.slice(0, -dot[0].length) : filename;
  const ext = dot ? dot[0] : "";
  let n = 2;
  while (lower.has(`${dir}${stem}-${n}${ext}`.toLowerCase())) n++;
  return `${dir}${stem}-${n}${ext}`;
}
