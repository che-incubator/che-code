/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { DynamicSpeechAccessibilityConfiguration, registerAccessibilityConfiguration } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { IWorkbenchContributionsRegistry, WorkbenchPhase, Extensions as WorkbenchExtensions, registerWorkbenchContribution2 } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { IAccessibleViewService, AccessibleViewService } from 'vs/workbench/contrib/accessibility/browser/accessibleView';
import { UnfocusedViewDimmingContribution } from 'vs/workbench/contrib/accessibility/browser/unfocusedViewDimmingContribution';
import { HoverAccessibleViewContribution, InlineCompletionsAccessibleViewContribution, NotificationAccessibleViewContribution } from 'vs/workbench/contrib/accessibility/browser/accessibilityContributions';
import { AccessibilityStatus } from 'vs/workbench/contrib/accessibility/browser/accessibilityStatus';
import { EditorAccessibilityHelpContribution } from 'vs/workbench/contrib/accessibility/browser/editorAccessibilityHelp';
import { SaveAccessibilitySignalContribution } from 'vs/workbench/contrib/accessibility/browser/saveAccessibilitySignal';
import { CommentsAccessibilityHelpContribution } from 'vs/workbench/contrib/comments/browser/commentsAccessibility';
import { DiffEditorActiveAnnouncementContribution } from 'vs/workbench/contrib/accessibility/browser/openDiffEditorAnnouncement';

registerAccessibilityConfiguration();
registerSingleton(IAccessibleViewService, AccessibleViewService, InstantiationType.Delayed);

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(EditorAccessibilityHelpContribution, LifecyclePhase.Eventually);
workbenchRegistry.registerWorkbenchContribution(CommentsAccessibilityHelpContribution, LifecyclePhase.Eventually);
workbenchRegistry.registerWorkbenchContribution(UnfocusedViewDimmingContribution, LifecyclePhase.Restored);

workbenchRegistry.registerWorkbenchContribution(HoverAccessibleViewContribution, LifecyclePhase.Eventually);
workbenchRegistry.registerWorkbenchContribution(NotificationAccessibleViewContribution, LifecyclePhase.Eventually);
workbenchRegistry.registerWorkbenchContribution(InlineCompletionsAccessibleViewContribution, LifecyclePhase.Eventually);

registerWorkbenchContribution2(AccessibilityStatus.ID, AccessibilityStatus, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(SaveAccessibilitySignalContribution.ID, SaveAccessibilitySignalContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(DiffEditorActiveAnnouncementContribution.ID, DiffEditorActiveAnnouncementContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(DynamicSpeechAccessibilityConfiguration.ID, DynamicSpeechAccessibilityConfiguration, WorkbenchPhase.AfterRestored);
