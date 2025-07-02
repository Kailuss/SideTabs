/**
 * SideTabs Extension Root Index
 * Central point for all exports
 * 
 * @version 3.0
 */

// Re-export activation functions
export { activate, deactivate } from './extension';

// Core exports
export { ConfigManager, SideTabsConfig } from './config';

// Feature modules exports
export { Localization } from './localization/Localization';
export { IconManager } from './services/IconManager';
export { DiagnosisManager } from './services/DiagnosisManager';
export { TabManager, TabInfo } from './services/TabManager';
export { CommandManager } from './services/CommandManager';
export { GUIManager as UIManager } from './services/GUIManager';
export { EventManager } from './services/EventManager';
export { TabsProvider } from './providers/TabsProvider';

// Export interfaces and types as needed
export * from './services/TabManager';
export * from './services/DiagnosisManager';
export * from './services/GUIManager';
