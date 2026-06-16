# Pre-Rebase Report

> Previous: release/1.108 -> Target: release/1.116
> Conflicts found: 32

## All conflicting files (raw list)

- `code/build/gulpfile.cli.ts`
- `code/build/gulpfile.reh.ts`
- `code/build/package-lock.json`
- `code/extensions/css-language-features/package-lock.json`
- `code/extensions/npm/package-lock.json`
- `code/extensions/npm/package.json`
- `code/extensions/package-lock.json`
- `code/extensions/package.json`
- `code/package-lock.json`
- `code/package.json`
- `code/product.json`
- `code/remote/package-lock.json`
- `code/remote/package.json`
- `code/remote/web/package-lock.json`
- `code/remote/web/package.json`
- `code/src/vs/editor/browser/controller/editContext/native/nativeEditContext.ts`
- `code/src/vs/editor/browser/controller/editContext/textArea/textAreaEditContextInput.ts`
- `code/src/vs/editor/contrib/dropOrPasteInto/browser/copyPasteController.ts`
- `code/src/vs/platform/product/common/product.ts`
- `code/src/vs/server/node/serverServices.ts`
- `code/src/vs/server/node/webClientServer.ts`
- `code/src/vs/workbench/contrib/accessibility/browser/accessibleView.ts`
- `code/src/vs/workbench/contrib/chat/browser/widget/chatContentParts/toolInvocationParts/chatTerminalToolConfirmationSubPart.ts`
- `code/src/vs/workbench/contrib/chat/browser/widget/chatContentParts/toolInvocationParts/chatTerminalToolProgressPart.ts`
- `code/src/vs/workbench/contrib/chat/browser/widget/input/chatInputPart.ts`
- `code/src/vs/workbench/contrib/chat/common/chatSessionsService.ts`
- `code/src/vs/workbench/contrib/extensions/browser/extensionsWorkbenchService.ts`
- `code/src/vs/workbench/contrib/terminal/browser/terminalInstance.ts`
- `code/src/vs/workbench/contrib/terminalContrib/inlineHint/browser/media/terminalInitialHint.css`
- `code/src/vscode-dts/vscode.proposed.chatSessionsProvider.d.ts`
- `code/test/monaco/package-lock.json`
- `code/test/monaco/package.json`

## RULED - has rebase rules and elif entry (13 files)

- `code/build/gulpfile.cli.ts` --.rebase/replace + elif OK
- `code/build/gulpfile.reh.ts` --.rebase/replace + elif OK
- `code/extensions/npm/package.json` --.rebase/override + elif OK
- `code/extensions/package.json` --.rebase/add + elif OK
- `code/package.json` --.rebase/replace add override + elif OK
- `code/product.json` --.rebase/add override + elif OK
- `code/remote/package.json` --.rebase/add + elif OK
- `code/src/vs/platform/product/common/product.ts` --.rebase/replace + elif OK
- `code/src/vs/server/node/serverServices.ts` --.rebase/replace + elif OK
- `code/src/vs/server/node/webClientServer.ts` --.rebase/replace + elif OK
- `code/src/vs/workbench/contrib/extensions/browser/extensionsWorkbenchService.ts` --.rebase/replace + elif OK
- `code/src/vs/workbench/contrib/terminal/browser/terminalInstance.ts` --.rebase/replace + elif OK
- `code/test/monaco/package.json` --.rebase/add + elif OK

## LOCK - package-lock.json, auto-handled (8 files)

- `code/build/package-lock.json`
- `code/extensions/css-language-features/package-lock.json`
- `code/extensions/npm/package-lock.json`
- `code/extensions/package-lock.json`
- `code/package-lock.json`
- `code/remote/package-lock.json`
- `code/remote/web/package-lock.json`
- `code/test/monaco/package-lock.json`

## TAKE_THEIRS - no che changes, safe to take upstream (11 files)

- `code/remote/web/package.json`
- `code/src/vs/editor/browser/controller/editContext/native/nativeEditContext.ts`
- `code/src/vs/editor/browser/controller/editContext/textArea/textAreaEditContextInput.ts`
- `code/src/vs/editor/contrib/dropOrPasteInto/browser/copyPasteController.ts`
- `code/src/vs/workbench/contrib/accessibility/browser/accessibleView.ts`
- `code/src/vs/workbench/contrib/chat/browser/widget/chatContentParts/toolInvocationParts/chatTerminalToolConfirmationSubPart.ts`
- `code/src/vs/workbench/contrib/chat/browser/widget/chatContentParts/toolInvocationParts/chatTerminalToolProgressPart.ts`
- `code/src/vs/workbench/contrib/chat/browser/widget/input/chatInputPart.ts`
- `code/src/vs/workbench/contrib/chat/common/chatSessionsService.ts`
- `code/src/vs/workbench/contrib/terminalContrib/inlineHint/browser/media/terminalInitialHint.css`
- `code/src/vscode-dts/vscode.proposed.chatSessionsProvider.d.ts`

## MISSING_ELIF - has rebase rules but NO elif entry (0 files)

_None_

## NEEDS_RULE - che-specific changes WITHOUT rules (0 files)

_None_

