# Pre-Rebase Report

> Previous: release/1.128 -> Target: release/1.143
> Conflicts found: 81

## All conflicting files (raw list)

- `code/build/.moduleignore`
- `code/build/agent-sdk/agents/claude/package-lock.json`
- `code/build/agent-sdk/agents/claude/package.json`
- `code/build/gulpfile.reh.ts`
- `code/build/gulpfile.vscode.web.ts`
- `code/build/lib/mangle/index.ts`
- `code/build/npm/gyp/package-lock.json`
- `code/build/package-lock.json`
- `code/build/package.json`
- `code/build/rspack/package-lock.json`
- `code/build/rspack/package.json`
- `code/build/vite/package.json`
- `code/extensions/copilot/chat-lib/package-lock.json`
- `code/extensions/copilot/chat-lib/package.json`
- `code/extensions/copilot/package-lock.json`
- `code/extensions/copilot/package.json`
- `code/extensions/copilot/src/extension/chatInputNotification/vscode-node/byokUtilityModel.contribution.ts`
- `code/extensions/copilot/src/extension/chatInputNotification/vscode-node/test/byokUtilityModel.contribution.spec.ts`
- `code/extensions/copilot/src/extension/chatSessions/vscode-node/copilotCLITerminalIntegration.ts`
- `code/extensions/copilot/src/extension/prompt/vscode-node/endpointProviderImpl.ts`
- `code/extensions/copilot/src/extension/test/vscode-node/endpoints.test.ts`
- `code/extensions/copilot/src/platform/endpoint/common/chatModelCapabilities.ts`
- `code/extensions/css-language-features/package-lock.json`
- `code/extensions/emmet/package-lock.json`
- `code/extensions/emmet/package.json`
- `code/extensions/github-authentication/package.json`
- `code/extensions/github-authentication/src/extension.ts`
- `code/extensions/html-language-features/package-lock.json`
- `code/extensions/json-language-features/package-lock.json`
- `code/extensions/markdown-language-features/package-lock.json`
- `code/extensions/mermaid-markdown-features/package-lock.json`
- `code/extensions/mermaid-markdown-features/package.json`
- `code/extensions/microsoft-authentication/package.json`
- `code/extensions/notebook-renderers/package-lock.json`
- `code/extensions/npm/package-lock.json`
- `code/extensions/theme-defaults/themes/2026-dark.json`
- `code/extensions/theme-defaults/themes/2026-light.json`
- `code/package-lock.json`
- `code/package.json`
- `code/product.json`
- `code/remote/package-lock.json`
- `code/remote/package.json`
- `code/src/vs/code/browser/workbench/workbench-dev.html`
- `code/src/vs/code/browser/workbench/workbench.html`
- `code/src/vs/platform/extensionManagement/common/extensionManagement.ts`
- `code/src/vs/platform/product/common/product.ts`
- `code/src/vs/server/node/remoteTerminalChannel.ts`
- `code/src/vs/server/node/serverServices.ts`
- `code/src/vs/server/node/webClientServer.ts`
- `code/src/vs/sessions/AI_CUSTOMIZATIONS.md`
- `code/src/vs/sessions/contrib/automations/browser/automationDialogService.ts`
- `code/src/vs/sessions/contrib/changes/browser/changesView.ts`
- `code/src/vs/sessions/services/sessions/browser/sessionsService.ts`
- `code/src/vs/sessions/services/sessions/test/browser/sessionsManagementService.test.ts`
- `code/src/vs/workbench/browser/parts/editor/media/modalEditorPart.css`
- `code/src/vs/workbench/contrib/chat/browser/aiCustomization/media/aiCustomizationManagement.css`
- `code/src/vs/workbench/contrib/chat/browser/aiCustomization/toolsListWidget.ts`
- `code/src/vs/workbench/contrib/chat/browser/chat.shared.contribution.ts`
- `code/src/vs/workbench/contrib/chat/browser/chatSessions/chatSessions.contribution.ts`
- `code/src/vs/workbench/contrib/chat/browser/widget/chatListRenderer.ts`
- `code/src/vs/workbench/contrib/chat/browser/widget/chatListWidget.ts`
- `code/src/vs/workbench/contrib/chat/browser/widget/input/chatInputPart.ts`
- `code/src/vs/workbench/contrib/chat/browser/widget/input/chatModelPicker.ts`
- `code/src/vs/workbench/contrib/chat/browser/widgetHosts/editor/chatEditor.ts`
- `code/src/vs/workbench/contrib/chat/browser/widgetHosts/editor/chatEditorInput.ts`
- `code/src/vs/workbench/contrib/chat/common/constants.ts`
- `code/src/vs/workbench/contrib/chat/common/model/chatViewModel.ts`
- `code/src/vs/workbench/contrib/chat/test/browser/widget/input/chatModelPicker.test.ts`
- `code/src/vs/workbench/contrib/chat/test/browser/widgetHosts/editor/chatEditorInput.test.ts`
- `code/src/vs/workbench/contrib/chat/test/common/model/chatViewModel.test.ts`
- `code/src/vs/workbench/contrib/onboarding/browser/onboardingService.ts`
- `code/src/vs/workbench/contrib/relauncher/browser/relauncher.contribution.ts`
- `code/src/vs/workbench/contrib/relauncher/test/browser/relauncher.test.ts`
- `code/src/vs/workbench/contrib/webview/browser/pre/index.html`
- `code/src/vs/workbench/services/assignment/common/assignmentService.ts`
- `code/src/vs/workbench/test/browser/componentFixtures/sessions/changesView.fixture.ts`
- `code/test/automation/package-lock.json`
- `code/test/automation/package.json`
- `code/test/integration/browser/package-lock.json`
- `code/test/mcp/package-lock.json`
- `code/test/sanity/package-lock.json`

## RULED - has rebase rules and elif entry (27 files)

- `code/build/.moduleignore` --.rebase/replace + elif OK
- `code/build/agent-sdk/agents/claude/package.json` --.rebase/add + elif OK
- `code/build/gulpfile.reh.ts` --.rebase/replace + elif OK
- `code/build/gulpfile.vscode.web.ts` --.rebase/replace + elif OK
- `code/build/lib/mangle/index.ts` --.rebase/replace + elif OK
- `code/build/package.json` --.rebase/add override + elif OK
- `code/build/rspack/package.json` --.rebase/add + elif OK
- `code/build/vite/package.json` --.rebase/add override + elif OK
- `code/extensions/copilot/chat-lib/package.json` --.rebase/add override + elif OK
- `code/extensions/copilot/package.json` --.rebase/add override + elif OK
- `code/extensions/copilot/src/extension/chatSessions/vscode-node/copilotCLITerminalIntegration.ts` --.rebase/replace + elif OK
- `code/extensions/emmet/package.json` --.rebase/replace + elif OK
- `code/extensions/github-authentication/package.json` --.rebase/add override + elif OK
- `code/extensions/mermaid-markdown-features/package.json` --.rebase/add override + elif OK
- `code/extensions/microsoft-authentication/package.json` --.rebase/add override + elif OK
- `code/package.json` --.rebase/add override + elif OK
- `code/product.json` --.rebase/add override + elif OK
- `code/remote/package.json` --.rebase/add override + elif OK
- `code/src/vs/code/browser/workbench/workbench.html` --.rebase/replace + elif OK
- `code/src/vs/platform/extensionManagement/common/extensionManagement.ts` --.rebase/replace + elif OK
- `code/src/vs/platform/product/common/product.ts` --.rebase/replace + elif OK
- `code/src/vs/server/node/remoteTerminalChannel.ts` --.rebase/replace + elif OK
- `code/src/vs/server/node/serverServices.ts` --.rebase/replace + elif OK
- `code/src/vs/server/node/webClientServer.ts` --.rebase/replace + elif OK
- `code/src/vs/workbench/browser/parts/editor/media/modalEditorPart.css` --.rebase/replace + elif OK
- `code/src/vs/workbench/contrib/webview/browser/pre/index.html` --.rebase/replace + elif OK
- `code/test/automation/package.json` --.rebase/add + elif OK

## LOCK - package-lock.json, auto-handled (20 files)

- `code/build/agent-sdk/agents/claude/package-lock.json`
- `code/build/npm/gyp/package-lock.json`
- `code/build/package-lock.json`
- `code/build/rspack/package-lock.json`
- `code/extensions/copilot/chat-lib/package-lock.json`
- `code/extensions/copilot/package-lock.json`
- `code/extensions/css-language-features/package-lock.json`
- `code/extensions/emmet/package-lock.json`
- `code/extensions/html-language-features/package-lock.json`
- `code/extensions/json-language-features/package-lock.json`
- `code/extensions/markdown-language-features/package-lock.json`
- `code/extensions/mermaid-markdown-features/package-lock.json`
- `code/extensions/notebook-renderers/package-lock.json`
- `code/extensions/npm/package-lock.json`
- `code/package-lock.json`
- `code/remote/package-lock.json`
- `code/test/automation/package-lock.json`
- `code/test/integration/browser/package-lock.json`
- `code/test/mcp/package-lock.json`
- `code/test/sanity/package-lock.json`

## TAKE_THEIRS - no che changes, safe to take upstream (32 files)

- `code/extensions/copilot/src/extension/chatInputNotification/vscode-node/byokUtilityModel.contribution.ts`
- `code/extensions/copilot/src/extension/chatInputNotification/vscode-node/test/byokUtilityModel.contribution.spec.ts`
- `code/extensions/copilot/src/extension/prompt/vscode-node/endpointProviderImpl.ts`
- `code/extensions/copilot/src/extension/test/vscode-node/endpoints.test.ts`
- `code/extensions/copilot/src/platform/endpoint/common/chatModelCapabilities.ts`
- `code/extensions/theme-defaults/themes/2026-dark.json`
- `code/extensions/theme-defaults/themes/2026-light.json`
- `code/src/vs/sessions/AI_CUSTOMIZATIONS.md`
- `code/src/vs/sessions/contrib/automations/browser/automationDialogService.ts`
- `code/src/vs/sessions/contrib/changes/browser/changesView.ts`
- `code/src/vs/sessions/services/sessions/browser/sessionsService.ts`
- `code/src/vs/sessions/services/sessions/test/browser/sessionsManagementService.test.ts`
- `code/src/vs/workbench/contrib/chat/browser/aiCustomization/media/aiCustomizationManagement.css`
- `code/src/vs/workbench/contrib/chat/browser/aiCustomization/toolsListWidget.ts`
- `code/src/vs/workbench/contrib/chat/browser/chat.shared.contribution.ts`
- `code/src/vs/workbench/contrib/chat/browser/chatSessions/chatSessions.contribution.ts`
- `code/src/vs/workbench/contrib/chat/browser/widget/chatListRenderer.ts`
- `code/src/vs/workbench/contrib/chat/browser/widget/chatListWidget.ts`
- `code/src/vs/workbench/contrib/chat/browser/widget/input/chatInputPart.ts`
- `code/src/vs/workbench/contrib/chat/browser/widget/input/chatModelPicker.ts`
- `code/src/vs/workbench/contrib/chat/browser/widgetHosts/editor/chatEditor.ts`
- `code/src/vs/workbench/contrib/chat/browser/widgetHosts/editor/chatEditorInput.ts`
- `code/src/vs/workbench/contrib/chat/common/constants.ts`
- `code/src/vs/workbench/contrib/chat/common/model/chatViewModel.ts`
- `code/src/vs/workbench/contrib/chat/test/browser/widget/input/chatModelPicker.test.ts`
- `code/src/vs/workbench/contrib/chat/test/browser/widgetHosts/editor/chatEditorInput.test.ts`
- `code/src/vs/workbench/contrib/chat/test/common/model/chatViewModel.test.ts`
- `code/src/vs/workbench/contrib/onboarding/browser/onboardingService.ts`
- `code/src/vs/workbench/contrib/relauncher/browser/relauncher.contribution.ts`
- `code/src/vs/workbench/contrib/relauncher/test/browser/relauncher.test.ts`
- `code/src/vs/workbench/services/assignment/common/assignmentService.ts`
- `code/src/vs/workbench/test/browser/componentFixtures/sessions/changesView.fixture.ts`

## MISSING_ELIF - has rebase rules but NO elif entry (0 files)

_None_

## NEEDS_RULE - che-specific changes WITHOUT rules (2 files)

- `code/extensions/github-authentication/src/extension.ts`
  Diff lines: ~7
  Action: create rebase rule before running rebase.sh
- `code/src/vs/code/browser/workbench/workbench-dev.html`
  Diff lines: ~10
  Action: create rebase rule before running rebase.sh

