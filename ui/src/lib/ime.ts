/**
 * IME(输入法)组合期判定 —— 受控输入 Enter 处理的统一守卫。
 *
 * 背景:中文/日文/韩文输入法用回车「确认候选词」时,keydown 的 key 同样是
 * "Enter"。若不做组合期判定,确认拼音的回车会被当成提交(误发送 / 误建标签 /
 * 误提交重命名)。部分浏览器(尤其旧 WebKit)在确认键时刻 isComposing 已为
 * false,需叠加 keyCode 229(组合期遗留标记)兜底。
 */

/** 该键盘事件是否处于 IME 组合期(或为组合期的确认键)。 */
export function isIMEComposing(e: {
  nativeEvent?: { isComposing?: boolean };
  keyCode?: number;
}): boolean {
  return e.nativeEvent?.isComposing === true || e.keyCode === 229;
}
