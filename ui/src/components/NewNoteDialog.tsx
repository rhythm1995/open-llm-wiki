/**
 * NewNoteDialog —— 新建笔记对话框(Radix Dialog)。
 *
 * 输入名称 + 选择模板(来自 vault 的 `templates/` 目录)。模板正文经
 * `{{title}}`/`{{date}}` 替换后作为新笔记初始内容;选「空模板」则用默认 H1。
 * 回车提交。模板候选由上层从 state.entries 过滤得出,本组件只负责交互。
 */
import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Plus } from "@phosphor-icons/react";

export interface TemplateOption {
  path: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  templates: TemplateOption[];
  onCreate: (name: string, templatePath: string | null) => void;
}

export function NewNoteDialog({ open, onOpenChange, templates, onCreate }: Props) {
  const [name, setName] = useState("");
  const [tpl, setTpl] = useState("");

  // 每次打开重置草稿。
  useEffect(() => {
    if (open) {
      setName("");
      setTpl("");
    }
  }, [open]);

  const submit = () => {
    const n = name.trim();
    if (!n) return;
    onCreate(n, tpl || null);
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-[25%] w-[440px] max-w-[90vw] -translate-x-1/2 rounded-lg border border-surface2 bg-mantle p-4 shadow-2xl outline-none">
          <Dialog.Title className="mb-3 text-[14px] font-medium text-text">
            新建笔记
          </Dialog.Title>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            placeholder="名称(可含路径,如 sources/foo)"
            className="w-full rounded border border-surface bg-base px-2.5 py-1.5 text-[13px] text-text outline-none placeholder:text-overlay focus:border-blue"
          />
          {templates.length > 0 && (
            <label className="mt-3 block text-[12px] text-subtext">
              模板
              <select
                value={tpl}
                onChange={(e) => setTpl(e.target.value)}
                className="mt-1 w-full rounded border border-surface bg-base px-2 py-1.5 text-[13px] text-text outline-none focus:border-blue"
              >
                <option value="">(空模板)</option>
                {templates.map((t) => (
                  <option key={t.path} value={t.path}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => onOpenChange(false)}
              className="rounded px-3 py-1 text-[12px] text-subtext hover:bg-surface"
            >
              取消
            </button>
            <button
              onClick={submit}
              disabled={!name.trim()}
              className="flex items-center gap-1 rounded bg-blue px-3 py-1 text-[12px] text-crust disabled:opacity-50"
            >
              <Plus size={13} weight="bold" /> 创建
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
