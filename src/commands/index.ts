import * as vscode from 'vscode';
import { Localization } from '../localization';

/**
 * Gestiona los comandos y menús contextuales de las pestañas
 */
export class CommandManager {
	private provider?: any; // Referencia al proveedor para acceder a los métodos

	/**
	 * Establece la referencia al proveedor
	 */
	public setProvider(provider: any): void {
		this.provider = provider;
	}
	/**
	 * Muestra el menú contextual de una pestaña
	 */
	public async showTabContextMenu(tab: vscode.Tab): Promise<void> {
		// Primero enfocamos la pestaña
		if (tab.input instanceof vscode.TabInputText) {
			await vscode.window.showTextDocument(tab.input.uri);
		}

		// Obtenemos las traducciones
		const localizationInstance = Localization.getInstance();
		const localize = (key: string, ...args: any[]) => localizationInstance.getLocaleString(key, ...args);

		// Mostrar QuickPick con opciones
		const items: vscode.QuickPickItem[] = [
			{ label: localize('close'), description: localize('closeDescription') },
			{ label: localize('closeOther'), description: localize('closeOtherDescription') },
			{ label: localize('closeAll'), description: localize('closeAllDescription') },
			{ label: localize('separator'), kind: vscode.QuickPickItemKind.Separator },
			{ label: localize('splitEditor'), description: localize('splitEditorDescription') },
			{ label: localize('copyPath'), description: localize('copyPathDescription') }
		];

		const selected = await vscode.window.showQuickPick(items, {
			placeHolder: localize('quickPickPlaceholder', tab.label)
		});

		if (selected) {
			await this.executeContextMenuAction(selected.label, tab);
		}
	}

	/**
	 * Ejecuta una acción del menú contextual
	 */
	private async executeContextMenuAction(actionLabel: string, tab: vscode.Tab): Promise<void> {
		const localizationInstance = Localization.getInstance();
		const localize = (key: string, ...args: any[]) => localizationInstance.getLocaleString(key, ...args);

		switch (actionLabel) {
			case localize('close'):
				await vscode.window.tabGroups.close(tab);
				break;
			case localize('closeOther'):
				for (const group of vscode.window.tabGroups.all) {
					for (const t of group.tabs) {
						if (t !== tab) {
							await vscode.window.tabGroups.close(t);
						}
					}
				}
				break;
			case localize('closeAll'):
				for (const group of vscode.window.tabGroups.all) {
					for (const t of group.tabs) {
						await vscode.window.tabGroups.close(t);
					}
				}
				break;
			case localize('splitEditor'):
				await vscode.commands.executeCommand('workbench.action.splitEditor');
				break;
			case localize('copyPath'):
				if (tab.input instanceof vscode.TabInputText) {
					await vscode.env.clipboard.writeText(tab.input.uri.fsPath);
					vscode.window.showInformationMessage(localize('pathCopied'));
				}
				break;
		}
	}

	/**
	 * Registra todos los comandos de la extensión
	 */
	public registerCommands(context: vscode.ExtensionContext): void {
		context.subscriptions.push(
			vscode.commands.registerCommand('sidetabs.closeTab', async () => {
				const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
				if (activeTab) {
					await vscode.window.tabGroups.close(activeTab);
				}
			}),

			vscode.commands.registerCommand('sidetabs.closeAllTabs', async () => {
				for (const group of vscode.window.tabGroups.all) {
					for (const tab of group.tabs) {
						await vscode.window.tabGroups.close(tab);
					}
				}
			}),

			vscode.commands.registerCommand('sidetabs.closeOtherTabs', async () => {
				const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
				if (activeTab) {
					for (const group of vscode.window.tabGroups.all) {
						for (const tab of group.tabs) {
							if (tab !== activeTab) {
								await vscode.window.tabGroups.close(tab);
							}
						}
					}
				}
			}),

			vscode.commands.registerCommand('sidetabs.showTabMenu', async () => {
				// Este comando se puede usar para mostrar el menú manualmente
				const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
				if (activeTab && this.provider) {
					await this.provider.showTabContextMenu(activeTab);
				}
			})
		);
	}
}
