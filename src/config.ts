/**
 * Configuration module for SideTabs extension
 * Manages and centralizes access to extension configuration
 * 
 * @module config
 * @version 3.0
 */

import * as vscode from 'vscode';

export interface SideTabsConfig {
	fontSize: number;
	tabHeight: number;
	showDirectoryPath: boolean;
}

export class ConfigManager {
	private static instance: ConfigManager;
	private configCache: SideTabsConfig;

	private constructor() {
		this.configCache = this.loadConfig();

		// Listen for configuration changes
		vscode.workspace.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration('sidetabs')) {
				this.configCache = this.loadConfig();
			}
		});
	}

	/**
	 * Get the singleton instance of ConfigManager
	 */
	public static getInstance(): ConfigManager {
		if (!ConfigManager.instance) {
			ConfigManager.instance = new ConfigManager();
		}
		return ConfigManager.instance;
	}

	/**
	 * Get the current configuration
	 */
	public getConfig(): SideTabsConfig {
		return { ...this.configCache };
	}

	/**
	 * Load configuration from VS Code settings
	 */
	private loadConfig(): SideTabsConfig {
		const config = vscode.workspace.getConfiguration('sidetabs');

		return {
			fontSize: config.get<number>('fontSize', 14),
			tabHeight: config.get<number>('tabHeight', 40),
			showDirectoryPath: config.get<boolean>('showDirectoryPath', true)
		};
	}
}
