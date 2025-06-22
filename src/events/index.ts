import * as vscode from 'vscode';
import { TabManager } from '../tabs';
import { CommandManager } from '../commands';

/**
 * Gestiona los eventos del webview (mensajes, clicks, etc.)
 */
export class EventManager {
	private tabManager: TabManager;
	private commandManager: CommandManager;

	constructor(tabManager: TabManager, commandManager: CommandManager) {
		this.tabManager = tabManager;
		this.commandManager = commandManager;
	}

	/**
	 * Maneja los mensajes recibidos desde el webview
	 */
	public async handleWebviewMessage(message: any, updateCallback: () => Promise<void>): Promise<void> {
		if (message.command === 'move') {
			// Mover pestaña en nuestro orden personalizado
			const position = message.position === 'before' ? 'before' : 'after';
			this.tabManager.moveTab(message.uniqueId, message.targetUniqueId, position);

			// Actualizar la vista
			await updateCallback();
			return;
		}

		// Buscar la pestaña correspondiente al mensaje usando uniqueId
		if (message.uniqueId) {
			const tabResult = this.tabManager.findTabByUniqueId(message.uniqueId);
			if (tabResult) {
				await this.handleTabAction(message, tabResult.tab, tabResult.group);
				return;
			}
		}

		// Fallback: buscar por label si no se proporciona uniqueId (compatibilidad hacia atrás)
		if (message.label) {
			const tabGroups = vscode.window.tabGroups.all;
			for (const group of tabGroups) {
				for (const tab of group.tabs) {
					if (tab.label === message.label) {
						await this.handleTabAction(message, tab, group);
						return;
					}
				}
			}
		}
	}

	/**
	 * Maneja las acciones específicas de una pestaña
	 */
	private async handleTabAction(message: any, tab: vscode.Tab, group: vscode.TabGroup): Promise<void> {
		switch (message.command) {
			case 'close':
				await vscode.window.tabGroups.close(tab);
				break;

			case 'showContextMenu':
				await this.handleContextMenu(tab);
				break;

			case 'focus':
				await this.focusTab(tab, group);
				break;
		}
	}

	/**
	 * Maneja el menú contextual de una pestaña
	 */
	private async handleContextMenu(tab: vscode.Tab): Promise<void> {
		// Primero enfocamos la pestaña para darle contexto
		if (tab.input instanceof vscode.TabInputText) {
			await vscode.window.showTextDocument(tab.input.uri);
		} else {
			const group = vscode.window.tabGroups.all.find(g => g.tabs.includes(tab));
			if (group) {
				const tabIndex = group.tabs.indexOf(tab);
				if (tabIndex !== -1) {
					if (vscode.window.tabGroups.all.length > 1) {
						const groupIndex = vscode.window.tabGroups.all.indexOf(group);
						if (groupIndex !== -1) {
							await vscode.commands.executeCommand('workbench.action.focusEditorGroup', groupIndex + 1);
						}
					}
					await vscode.commands.executeCommand('workbench.action.openEditorAtIndex', tabIndex);
				}
			}
		}

		// Mostrar el menú contextual personalizado
		await this.commandManager.showTabContextMenu(tab);
	}

	/**
	 * Enfoca una pestaña específica
	 */
	private async focusTab(tab: vscode.Tab, group: vscode.TabGroup): Promise<void> {
		// Para archivos de texto, usar la API oficial
		if (tab.input instanceof vscode.TabInputText) {
			await vscode.window.showTextDocument(tab.input.uri);
		} else {
			// Para otros tipos (SVG, imágenes, etc), usar el comando interno de VS Code
			const tabIndex = group.tabs.indexOf(tab);
			if (tabIndex !== -1) {
				// Si hay más de un grupo de pestañas, primero activar el grupo
				if (vscode.window.tabGroups.all.length > 1) {
					const groupIndex = vscode.window.tabGroups.all.indexOf(group);
					if (groupIndex !== -1) {
						await vscode.commands.executeCommand('workbench.action.focusEditorGroup', groupIndex + 1);
					}
				}
				// Luego activar la pestaña por su índice
				await vscode.commands.executeCommand('workbench.action.openEditorAtIndex', tabIndex);
			}
		}
	}
}
