# Pre-Rebase Report

> Previous: release/1.116 -> Target: release/1.128
> Conflicts found: 70

## All conflicting files (raw list)

- `code/build/gulpfile.cli.ts`
- `code/build/gulpfile.reh.ts`
- `code/build/gulpfile.vscode.web.ts`
- `code/build/lib/policies/policyData.jsonc`
- `code/build/lib/stylelint/vscode-known-variables.json`
- `code/build/package-lock.json`
- `code/build/package.json`
- `code/build/rspack/package-lock.json`
- `code/build/vite/package-lock.json`
- `code/cglicenses.json`
- `code/extensions/copilot/chat-lib/package-lock.json`
- `code/extensions/copilot/chat-lib/package.json`
- `code/extensions/copilot/package-lock.json`
- `code/extensions/copilot/package.json`
- `code/extensions/copilot/script/postinstall.ts`
- `code/extensions/copilot/src/extension/chatSessions/copilotcli/node/copilotcliSessionService.ts`
- `code/extensions/copilot/src/extension/chatSessions/copilotcli/node/test/copilotcliSession.spec.ts`
- `code/extensions/copilot/src/extension/chatSessions/copilotcli/node/test/permissionHelpers.spec.ts`
- `code/extensions/copilot/src/extension/chatSessions/vscode-node/test/copilotCLISDKUpgrade.spec.ts`
- `code/extensions/copilot/src/extension/conversation/vscode-node/languageModelAccess.ts`
- `code/extensions/copilot/src/extension/prompt/node/chatMLFetcher.ts`
- `code/extensions/copilot/src/extension/prompt/node/chatMLFetcherTelemetry.ts`
- `code/extensions/copilot/src/platform/chat/common/chatQuotaService.ts`
- `code/extensions/copilot/src/platform/chat/common/chatQuotaServiceImpl.ts`
- `code/extensions/copilot/src/platform/chat/common/commonTypes.ts`
- `code/extensions/copilot/src/platform/configuration/common/configurationService.ts`
- `code/extensions/copilot/src/platform/endpoint/node/messagesApi.ts`
- `code/extensions/copilot/src/platform/endpoint/test/node/messagesApi.spec.ts`
- `code/extensions/copilot/src/platform/inlineEdits/common/inlineEditLogContext.ts`
- `code/extensions/copilot/src/platform/networking/node/chatWebSocketManager.ts`
- `code/extensions/copilot/src/platform/networking/node/chatWebSocketTelemetry.ts`
- `code/extensions/copilot/src/platform/networking/node/test/chatWebSocketManager.spec.ts`
- `code/extensions/css-language-features/package-lock.json`
- `code/extensions/html-language-features/package-lock.json`
- `code/extensions/json-language-features/package-lock.json`
- `code/extensions/markdown-language-features/package-lock.json`
- `code/extensions/markdown-language-features/package.json`
- `code/extensions/mermaid-chat-features/package-lock.json`
- `code/extensions/mermaid-chat-features/package.json`
- `code/extensions/package-lock.json`
- `code/extensions/package.json`
- `code/package-lock.json`
- `code/package.json`
- `code/product.json`
- `code/remote/package-lock.json`
- `code/remote/package.json`
- `code/src/vs/base/browser/dompurify/cgmanifest.json`
- `code/src/vs/base/browser/dompurify/dompurify.d.ts`
- `code/src/vs/base/browser/dompurify/dompurify.js`
- `code/src/vs/platform/workspaces/common/workspaceIdentifier.ts`
- `code/src/vs/sessions/contrib/changes/browser/changesViewActions.ts`
- `code/src/vs/workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditor.ts`
- `code/src/vs/workbench/contrib/chat/browser/aiCustomization/aiCustomizationWelcomePage.ts`
- `code/src/vs/workbench/contrib/chat/browser/aiCustomization/aiCustomizationWelcomePageClassic.ts`
- `code/src/vs/workbench/contrib/chat/browser/aiCustomization/aiCustomizationWelcomePagePromptLaunchers.ts`
- `code/src/vs/workbench/contrib/chat/electron-browser/agentSessions/agentSessionsActions.ts`
- `code/src/vs/workbench/contrib/terminal/browser/terminal.contribution.ts`
- `code/src/vs/workbench/contrib/terminal/browser/terminalInstance.ts`
- `code/src/vs/workbench/contrib/terminalContrib/chatAgentTools/browser/tools/runInTerminalTool.ts`
- `code/src/vs/workbench/contrib/terminalContrib/chatAgentTools/browser/tools/sendToTerminalTool.ts`
- `code/src/vs/workbench/contrib/terminalContrib/chatAgentTools/common/terminalChatAgentToolsConfiguration.ts`
- `code/src/vs/workbench/contrib/terminalContrib/chatAgentTools/test/browser/sendToTerminalTool.test.ts`
- `code/src/vs/workbench/contrib/webview/browser/pre/index.html`
- `code/src/vs/workbench/contrib/welcomeGettingStarted/browser/startupPage.ts`
- `code/src/vs/workbench/contrib/welcomeOnboarding/browser/media/variationA.css`
- `code/src/vs/workbench/contrib/welcomeOnboarding/browser/onboardingVariationA.ts`
- `code/src/vs/workbench/services/authentication/browser/authenticationService.ts`
- `code/src/vs/workbench/test/browser/componentFixtures/sessions/aiCustomizationManagementEditor.fixture.ts`
- `code/src/vs/workbench/test/browser/componentFixtures/sessions/aiCustomizationWelcomePages.fixture.ts`
- `code/test/monaco/package.json`

## RULED - has rebase rules and elif entry (15 files)

- `code/build/gulpfile.cli.ts` --.rebase/replace + elif OK
- `code/build/gulpfile.reh.ts` --.rebase/replace + elif OK
- `code/build/lib/stylelint/vscode-known-variables.json` --.rebase/replace + elif OK
- `code/build/package.json` --.rebase/add override + elif OK
- `code/extensions/copilot/chat-lib/package.json` --.rebase/add override + elif OK
- `code/extensions/copilot/package.json` --.rebase/add override + elif OK
- `code/extensions/markdown-language-features/package.json` --.rebase/override + elif OK
- `code/extensions/mermaid-chat-features/package.json` --.rebase/override + elif OK
- `code/extensions/package.json` --.rebase/add + elif OK
- `code/package.json` --.rebase/replace add override + elif OK
- `code/product.json` --.rebase/add override + elif OK
- `code/remote/package.json` --.rebase/add override + elif OK
- `code/src/vs/base/browser/dompurify/cgmanifest.json` --.rebase/replace + elif OK
- `code/src/vs/workbench/contrib/terminal/browser/terminalInstance.ts` --.rebase/replace + elif OK
- `code/src/vs/workbench/contrib/webview/browser/pre/index.html` --.rebase/replace + elif OK

## LOCK - package-lock.json, auto-handled (13 files)

- `code/build/package-lock.json`
- `code/build/rspack/package-lock.json`
- `code/build/vite/package-lock.json`
- `code/extensions/copilot/chat-lib/package-lock.json`
- `code/extensions/copilot/package-lock.json`
- `code/extensions/css-language-features/package-lock.json`
- `code/extensions/html-language-features/package-lock.json`
- `code/extensions/json-language-features/package-lock.json`
- `code/extensions/markdown-language-features/package-lock.json`
- `code/extensions/mermaid-chat-features/package-lock.json`
- `code/extensions/package-lock.json`
- `code/package-lock.json`
- `code/remote/package-lock.json`

## TAKE_THEIRS - no che changes, safe to take upstream (36 files)

- `code/build/lib/policies/policyData.jsonc`
- `code/cglicenses.json`
- `code/extensions/copilot/script/postinstall.ts`
- `code/extensions/copilot/src/extension/chatSessions/copilotcli/node/copilotcliSessionService.ts`
- `code/extensions/copilot/src/extension/chatSessions/copilotcli/node/test/copilotcliSession.spec.ts`
- `code/extensions/copilot/src/extension/chatSessions/copilotcli/node/test/permissionHelpers.spec.ts`
- `code/extensions/copilot/src/extension/chatSessions/vscode-node/test/copilotCLISDKUpgrade.spec.ts`
- `code/extensions/copilot/src/extension/conversation/vscode-node/languageModelAccess.ts`
- `code/extensions/copilot/src/extension/prompt/node/chatMLFetcher.ts`
- `code/extensions/copilot/src/extension/prompt/node/chatMLFetcherTelemetry.ts`
- `code/extensions/copilot/src/platform/chat/common/chatQuotaService.ts`
- `code/extensions/copilot/src/platform/chat/common/chatQuotaServiceImpl.ts`
- `code/extensions/copilot/src/platform/chat/common/commonTypes.ts`
- `code/extensions/copilot/src/platform/configuration/common/configurationService.ts`
- `code/extensions/copilot/src/platform/endpoint/node/messagesApi.ts`
- `code/extensions/copilot/src/platform/endpoint/test/node/messagesApi.spec.ts`
- `code/extensions/copilot/src/platform/inlineEdits/common/inlineEditLogContext.ts`
- `code/extensions/copilot/src/platform/networking/node/chatWebSocketManager.ts`
- `code/extensions/copilot/src/platform/networking/node/chatWebSocketTelemetry.ts`
- `code/extensions/copilot/src/platform/networking/node/test/chatWebSocketManager.spec.ts`
- `code/src/vs/platform/workspaces/common/workspaceIdentifier.ts`
- `code/src/vs/sessions/contrib/changes/browser/changesViewActions.ts`
- `code/src/vs/workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditor.ts`
- `code/src/vs/workbench/contrib/chat/browser/aiCustomization/aiCustomizationWelcomePage.ts`
- `code/src/vs/workbench/contrib/chat/browser/aiCustomization/aiCustomizationWelcomePageClassic.ts`
- `code/src/vs/workbench/contrib/chat/browser/aiCustomization/aiCustomizationWelcomePagePromptLaunchers.ts`
- `code/src/vs/workbench/contrib/chat/electron-browser/agentSessions/agentSessionsActions.ts`
- `code/src/vs/workbench/contrib/terminalContrib/chatAgentTools/browser/tools/runInTerminalTool.ts`
- `code/src/vs/workbench/contrib/terminalContrib/chatAgentTools/browser/tools/sendToTerminalTool.ts`
- `code/src/vs/workbench/contrib/terminalContrib/chatAgentTools/common/terminalChatAgentToolsConfiguration.ts`
- `code/src/vs/workbench/contrib/terminalContrib/chatAgentTools/test/browser/sendToTerminalTool.test.ts`
- `code/src/vs/workbench/contrib/welcomeGettingStarted/browser/startupPage.ts`
- `code/src/vs/workbench/contrib/welcomeOnboarding/browser/media/variationA.css`
- `code/src/vs/workbench/contrib/welcomeOnboarding/browser/onboardingVariationA.ts`
- `code/src/vs/workbench/test/browser/componentFixtures/sessions/aiCustomizationManagementEditor.fixture.ts`
- `code/src/vs/workbench/test/browser/componentFixtures/sessions/aiCustomizationWelcomePages.fixture.ts`

## MISSING_ELIF - has rebase rules but NO elif entry (1 files)

- `code/test/monaco/package.json` -- has .rebase/add rule, no elif in resolve_conflicts()
  Action: add elif entry or rely on smart fallback

## NEEDS_RULE - che-specific changes WITHOUT rules (5 files)

- `code/build/gulpfile.vscode.web.ts`
  Diff lines: ~10
  Action: create rebase rule before running rebase.sh
- `code/src/vs/base/browser/dompurify/dompurify.d.ts`
  Diff lines: ~16
  Action: create rebase rule before running rebase.sh
- `code/src/vs/base/browser/dompurify/dompurify.js`
  Diff lines: ~268
  Action: create rebase rule before running rebase.sh
- `code/src/vs/workbench/contrib/terminal/browser/terminal.contribution.ts`
  Diff lines: ~2
  Action: create rebase rule before running rebase.sh
- `code/src/vs/workbench/services/authentication/browser/authenticationService.ts`
  Diff lines: ~7
  Action: create rebase rule before running rebase.sh

