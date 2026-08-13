**Final Result**

passed with visual-access caveat

**Scope**

- Surface: `API&Skills` at `/settings/api-keys`
- Current implementation file: `components/api-key-settings-workspace.tsx`
- Logo assets: `public/assets/integrations/`

**Implemented Changes**

- Removed the top in-page navigation. The page now reads directly as `Skill`, `MCP`, and `API Key`.
- Simplified `Skill` to one install command plus recognizable platform logo chips.
- Simplified `MCP` to platform selection plus one copied configuration block.
- Simplified `API Key` to credential creation and documentation links.
- Removed visible `Base URL` and `权限范围`.
- Removed the title divider under `API&Skills`.
- Removed platform names and chip borders from the `Skill` supported-platform row; only logos remain.
- Removed the visible `MCP 配置` label from each MCP command block.
- Moved `最近调用` out as a standalone record area; when empty, it shows only one empty-state row instead of a table shell.
- Reworked the `API Key` area from a single-key setting into a multi-key management list.
- Merged `最近调用` back into the key list as a column, because it describes each key rather than a separate workflow.
- Restored per-key revoke and restore actions in the list.

**Design Checks**

- Visibility of system status: loading states stay on key and recent-call areas.
- Match with user mental model: first install Skill, then connect MCP, then manage API credentials.
- Match with key management: generating multiple keys creates multiple records, so the primary surface must be a list, not a single current-key field.
- Recognition rather than recall: supported tools use real logos, with names kept only where platform selection needs text.
- Consistency and standards: copy actions exist only beside copyable command/config content.
- Aesthetic and minimalist design: removed extra nav, repeated copy text, and low-value technical metadata.

**Verification**

- `npx eslint components/api-key-settings-workspace.tsx`
- `git diff --check -- components/api-key-settings-workspace.tsx`

**Visual Verification Boundary**

- The running page is expected at `http://localhost:3000/settings/api-keys`.
- I have not claimed a fresh browser screenshot pass in this note.
