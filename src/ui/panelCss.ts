// Styles for the panel. Kept as a string so the same CSS works in the standalone demo
// (injected once) and inside the extension's shadow DOM.

export const PANEL_CSS = `
.nrc-optimiser, .nrc-optimiser * { box-sizing: border-box; }
.nrc-optimiser {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: #1a2230; font-size: 14px; line-height: 1.45;
}
.nrc-stack { display: flex; flex-direction: column; align-items: stretch; gap: 8px; }

/* one-line state notes */
.nrc-note {
  border: 1px solid #e3e9f1; border-radius: 14px; background: #fff; padding: 12px 14px;
  box-shadow: 0 8px 30px rgba(20, 40, 80, 0.10); font-size: 13px;
}
.nrc-note-ok { border-left: 3px solid #2e9e5b; }
.nrc-note-warn { border-left: 3px solid #c0563b; }

/* results card */
.nrc-card {
  border: 1px solid #e3e9f1; border-radius: 14px; background: #fff;
  box-shadow: 0 8px 30px rgba(20, 40, 80, 0.10); overflow: hidden;
}
.nrc-card-head { padding: 13px 15px 10px; }
.nrc-card-head b { font-weight: 700; }
.nrc-card-head-row { display: flex; align-items: center; justify-content: space-between; }
.nrc-collapse-btn {
  background: none; border: 0; cursor: pointer; color: #6b7689; font-size: 14px;
  padding: 2px 7px; border-radius: 6px; line-height: 1;
}
.nrc-collapse-btn:hover { background: #f0f3f7; }
.nrc-card-sub { display: block; color: #8696ad; font-size: 12px; margin-top: 2px; }
.nrc-card-foot { padding: 9px 14px 12px; color: #9aa4b5; font-size: 11px; border-top: 1px solid #f0f3f7; }
.nrc-foot-actions { margin-top: 6px; display: flex; gap: 16px; }
.nrc-link {
  background: none; border: 0; padding: 0; cursor: pointer; color: #2e6df6;
  font: 600 11px -apple-system, system-ui, sans-serif;
}

/* collapsed pill */
.nrc-collapsed {
  display: flex; align-items: center; gap: 10px; width: 100%; text-align: left;
  background: #fff; border: 1px solid #e3e9f1; border-radius: 999px;
  padding: 9px 15px; cursor: pointer; box-shadow: 0 6px 22px rgba(20, 40, 80, 0.12);
}
.nrc-collapsed-route { font-weight: 700; white-space: nowrap; color: #1a2230; }
.nrc-collapsed-meta { color: #6b7689; font-size: 12px; flex: 1; }
.nrc-collapsed-exp { color: #2e6df6; font-weight: 700; }
.nrc-card-body { max-height: 58vh; overflow-y: auto; }

.nrc-trip { padding: 0 0 4px; }
.nrc-trip-head {
  position: sticky; top: 0; z-index: 1; background: #f7f9fc;
  padding: 7px 15px; font-weight: 700; font-size: 12px; color: #3a4763;
  border-top: 1px solid #eef2f7; border-bottom: 1px solid #eef2f7;
}
.nrc-trip-note { padding: 9px 15px; font-size: 12.5px; }
.nrc-trip-more { list-style: none; color: #9aa4b5; font-size: 11px; padding: 4px 4px 2px; text-align: center; }
.nrc-trip-ok { color: #2e7d4f; }
.nrc-trip-warn { color: #b0563b; }

.nrc-options {
  list-style: none; margin: 0; padding: 8px;
  display: flex; flex-direction: column; gap: 6px;
}
.nrc-opt { border: 1px solid #edf1f6; border-radius: 10px; background: #fff; }
.nrc-opt-best { border-color: #bfe6cf; background: #f5fbf7; }

.nrc-opt-head {
  width: 100%; text-align: left; background: none; border: 0; cursor: pointer;
  padding: 10px 12px; display: flex; flex-direction: column; gap: 3px; font: inherit; color: inherit;
}
.nrc-opt-top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.nrc-opt-price { font-weight: 700; font-size: 16px; color: #14202e; }
.nrc-opt-meta { color: #6b7689; font-size: 12px; text-align: right; }
.nrc-opt-tags { display: flex; flex-wrap: wrap; gap: 5px; }
.nrc-tag { font-size: 10px; font-weight: 600; padding: 1px 7px; border-radius: 999px; }
.nrc-tag-best { background: #2e9e5b; color: #fff; }
.nrc-tag-cheap { background: #e8f0ff; color: #2152b3; }
.nrc-tag-mix { background: #fff3df; color: #9a6611; }
.nrc-opt-route { color: #59657a; font-size: 12px; }
.nrc-opt-toggle { color: #2e6df6; font-size: 11px; font-weight: 600; margin-top: 2px; }

.nrc-steps {
  list-style: none; margin: 0; padding: 6px 12px 11px;
  display: flex; flex-direction: column; gap: 5px; border-top: 1px solid #f0f3f7;
}
.nrc-steps li { display: flex; justify-content: space-between; gap: 10px; font-size: 12px; }
.nrc-step-route { font-weight: 600; color: #1a2230; white-space: nowrap; }
.nrc-step-detail { color: #6b7689; text-align: right; }

/* status chip */
.nrc-statuschip {
  font: 600 11px/1.4 -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  background: #1a2230; color: #cdd6e3;
  border-radius: 999px; padding: 5px 11px;
  box-shadow: 0 2px 10px rgba(20, 40, 80, 0.25);
  white-space: nowrap; user-select: none;
}

/* dev-staging trace */
.nrc-debug {
  border-radius: 12px; background: #0f1626; color: #c7d2e0;
  padding: 12px 14px; font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
  max-height: 320px; overflow: auto; box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25);
}
.nrc-debug-title { font-weight: 700; color: #fff; margin-bottom: 6px; letter-spacing: .3px; }
.nrc-debug-reason {
  background: #1b2740; border-left: 3px solid #4a90e2; padding: 6px 8px;
  border-radius: 6px; margin-bottom: 8px; color: #e6edf6;
}
.nrc-debug-row { color: #9fb0c6; margin-bottom: 6px; }
.nrc-debug-row b, .nrc-debug-reason b, .nrc-debug-trip b { color: #fff; }
.nrc-debug-trip { color: #cdd9ea; font-weight: 700; margin: 8px 0 3px; }
.nrc-debug-block { margin-top: 8px; }
.nrc-debug-sub { color: #8696ad; margin-bottom: 4px; }
.nrc-debug-hop { color: #7fd1a3; }
.nrc-debug-hop.miss { color: #e0896f; }
.nrc-debug-seg { color: #9fb0c6; white-space: pre; }
.nrc-debug-btn {
  margin-top: 10px; width: 100%; padding: 8px 10px; border: 0; border-radius: 8px;
  background: #2e6df6; color: #fff; cursor: pointer;
  font: 600 12px ui-monospace, SFMono-Regular, Menlo, monospace;
}
.nrc-debug-btn:disabled { background: #3a4866; cursor: default; }
`;
