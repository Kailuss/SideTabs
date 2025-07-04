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
export { TabIconManager as IconManager } from './services/TabIconManager';
export { TabDiagnosticsManager as TabDiagnosticsManager } from './services/TabDiagnosticsManager';
export { TabManager, TabInfo } from './services/TabManager';
export { TabMenuManager as CommandManager } from './services/TabMenuManager';
export { GUIManager as UIManager } from './services/GUIManager';
export { EventManager } from './services/EventManager';
export { TabsProvider } from './providers/TabsProvider';

// Export interfaces and types as needed
export * from './services/TabManager';
export * from './services/TabDiagnosticsManager';
export * from './services/GUIManager';
