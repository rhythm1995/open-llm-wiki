import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** 渲染崩溃时回调(如切换到更稳健的视图)。在 componentDidCatch 中触发。 */
  onError?: (error: Error) => void;
  /** 自定义降级 UI;不传则用内置全屏降级页(仅推荐用于渲染根)。 */
  fallback?: ReactNode;
}
interface State {
  error: Error | null;
  showDetail: boolean;
}

/** BlockNote/ProseMirror schema 校验失败 vs 其它渲染崩溃。 */
export function isSchemaRenderError(error: Error): boolean {
  const msg = error.message || String(error);
  return (
    /Invalid content for node|RangeError/i.test(msg) || error.name === "RangeError"
  );
}

/**
 * ErrorBoundary —— 渲染层兜底,防止单个子树抛错导致整页白屏。
 *
 * 背景:BlockNote / ProseMirror 在 schema 校验(createChecked)失败时会同步抛 RangeError,
 * 若没有 boundary 捕获,React 会卸载整棵树 → 白屏。此组件把崩溃隔离,给出降级 UI
 * (错误摘要 + 重新加载 + 复制 stack),让用户不必强退整个 app。
 *
 * 注意:它只兜「渲染期」错误;transact / 异步回调里抛的某些错误 React 仍可能不在此捕获,
 * 因此根因(schema 校验、wikilink 误升级等)仍需在产生处修——本组件是第二道防线,不是第一。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, showDetail: false };

  static getDerivedStateFromError(error: Error): State {
    return { error, showDetail: false };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 走 console →(经 diag-log 桥)落 app 日志,便于事后排查。
    console.error("[ErrorBoundary] render crashed:", error, info.componentStack);
    this.props.onError?.(error);
  }

  private reload = () => {
    location.reload();
  };

  private copy = () => {
    const e = this.state.error;
    if (!e) return;
    navigator.clipboard?.writeText(`${e.name}: ${e.message}\n${e.stack ?? ""}`).catch(() => {});
  };

  render() {
    const { error, showDetail } = this.state;
    if (!error) return this.props.children;
    // 局部使用(如包某个视图):用调用方给的降级 UI,不挡全屏。
    if (this.props.fallback) return this.props.fallback;
    const msg = error.message || String(error);
    const isSchema = isSchemaRenderError(error);

    return (
      <div
        data-testid="error-boundary"
        data-kind={isSchema ? "schema" : "generic"}
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--color-base, #1e1e2e)",
          color: "var(--color-text, #cdd6f4)",
          fontFamily: "var(--font-sans, system-ui, sans-serif)",
          padding: 24,
        }}
      >
        <div
          style={{
            maxWidth: 520,
            width: "100%",
            background: "var(--color-mantle, #181825)",
            border: "1px solid var(--color-crust, #313244)",
            borderRadius: 12,
            padding: 24,
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          }}
        >
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
            <span
              style={{
                fontSize: 22,
                lineHeight: 1,
                color: "var(--color-red, #f38ba8)",
                flexShrink: 0,
              }}
            >
              ⚠
            </span>
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: 16,
                  fontWeight: 600,
                  color: "var(--color-text, #cdd6f4)",
                }}
              >
                界面渲染时崩溃了
              </h2>
              <p
                style={{
                  margin: "6px 0 0",
                  fontSize: 13,
                  lineHeight: 1.5,
                  color: "var(--color-subtext, #a6adc8)",
                }}
              >
                {isSchema
                  ? "通常是某个笔记的内容触发了编辑器(常见于代码块 / frontmatter 里夹带了特殊链接)。根因已在代码层修复,重新加载通常即可恢复。"
                  : "已记录详细错误。重新加载通常即可恢复;若反复出现,可复制下方信息反馈。"}
              </p>
            </div>
          </div>

          <pre
            style={{
              margin: "0 0 16px",
              padding: 12,
              background: "var(--color-crust, #11111b)",
              border: "1px solid var(--color-crust, #313244)",
              borderRadius: 8,
              fontSize: 12,
              lineHeight: 1.5,
              color: "var(--color-red, #f38ba8)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              maxHeight: showDetail ? 260 : 84,
              overflow: "auto",
            }}
          >
            {error.name}: {msg}
          </pre>

          {showDetail && error.stack && (
            <pre
              data-testid="error-boundary-stack"
              style={{
                margin: "0 0 16px",
                padding: 12,
                background: "var(--color-crust, #11111b)",
                border: "1px solid var(--color-crust, #313244)",
                borderRadius: 8,
                fontSize: 11,
                lineHeight: 1.5,
                color: "var(--color-subtext, #a6adc8)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                maxHeight: 240,
                overflow: "auto",
              }}
            >
              {error.stack}
            </pre>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={this.reload}
              style={{
                cursor: "pointer",
                flex: 1,
                padding: "8px 14px",
                border: "1px solid var(--color-blue, #89b4fa)",
                borderRadius: 8,
                background: "var(--color-blue, #89b4fa)",
                color: "var(--color-base, #1e1e2e)",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              重新加载
            </button>
            <button
              onClick={() => this.setState({ showDetail: !showDetail })}
              style={{
                cursor: "pointer",
                padding: "8px 14px",
                border: "1px solid var(--color-crust, #313244)",
                borderRadius: 8,
                background: "transparent",
                color: "var(--color-subtext, #a6adc8)",
                fontSize: 13,
              }}
            >
              {showDetail ? "收起详情" : "展开详情"}
            </button>
            <button
              onClick={this.copy}
              style={{
                cursor: "pointer",
                padding: "8px 14px",
                border: "1px solid var(--color-crust, #313244)",
                borderRadius: 8,
                background: "transparent",
                color: "var(--color-subtext, #a6adc8)",
                fontSize: 13,
              }}
            >
              复制
            </button>
          </div>
        </div>
      </div>
    );
  }
}
