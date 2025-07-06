import * as vscode from 'vscode';
import { Localization } from '../localization/Localization';

// = Gestiona los comandos y menús contextuales de las pestañas = 
export class TabMenuManager {

	/// Establece la referencia al proveedor
	private provider?: any;
	public setProvider(provider: any): void {
		this.provider = provider;
	}

	/// Muestra el menú contextual de una pestaña
	public async showTabContextMenu(tab: vscode.Tab): Promise<void> {

		//* Enfocamos la pestaña
		if (tab.input instanceof vscode.TabInputText) {
			await vscode.window.showTextDocument(tab.input.uri);
		}
		const localize = this.getLocalize();
		//* Obtenemos las traducciones
		const items: vscode.QuickPickItem[] = [
			{ label: localize('close'), description: localize('closeDescription') },
			{ label: localize('closeOther'), description: localize('closeOtherDescription') },
			{ label: localize('closeAll'), description: localize('closeAllDescription') },
			{ label: localize('separator'), kind: vscode.QuickPickItemKind.Separator },
			{ label: localize('splitEditor'), description: localize('splitEditorDescription') },
			{ label: localize('copyPath'), description: localize('copyPathDescription') }
		];

		//* QuickPick para mostrar las opciones
		//* Se puede personalizar el placeholder con el nombre de la pestaña
		const selected = await vscode.window.showQuickPick(items, {
			placeHolder: localize('quickPickPlaceholder', tab.label)
		});

		if (selected) {
			await this.handleMenuAction(selected.label, tab);
		}
	}

	/// Devuelve la función de localización para evitar repetición
	private getLocalize() {
		const localizationInstance = Localization.getInstance();
		return (key: string, ...args: any[]) => localizationInstance.getLocaleString(key, ...args);
	}

	/// Envía un mensaje al webview
	public sendMessageToWebview(message: any): void {
		if (this.provider && this.provider._view) {
			try {
				this.provider._view.webview.postMessage(message);
			} catch (error) {
				console.error('[SideTabs] Error enviando mensaje al webview:', error);
			}
		} else {
			console.warn('[SideTabs] No se puede enviar mensaje - proveedor no disponible');
		}
	}

	/// Registra todos los comandos de la extensión
	public registerCommands(context: vscode.ExtensionContext): void {
		context.subscriptions.push(

			//* Muestra el menú contextual de la pestaña activa
			vscode.commands.registerCommand('sidetabs.showTabMenu', async () => {
				// Este comando se puede usar para mostrar el menú manualmente
				const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
				if (activeTab && this.provider) {
					await this.provider.showTabContextMenu(activeTab);
				}
			}),

			//* Cierra la pestaña activa
			vscode.commands.registerCommand('sidetabs.closeTab', async () => {
				const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
				if (activeTab) {
					await vscode.window.tabGroups.close(activeTab);
				}
			}),

			//* Cierra todas las pestañas
			vscode.commands.registerCommand('sidetabs.closeAllTabs', async () => {
				for (const group of vscode.window.tabGroups.all) {
					for (const tab of group.tabs) {
						await vscode.window.tabGroups.close(tab);
					}
				}
			}),

			//* Cierra otras pestañas
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
			})
		);
	}

	/// Maneja la acción seleccionada del menú contextual
	private async handleMenuAction(actionLabel: string, tab: vscode.Tab): Promise<void> {
		const localize = this.getLocalize();
		const actions: { [key: string]: () => Promise<void> } = {
			[localize('close')]: async () => this.closeTab(tab),
			[localize('closeOther')]: async () => this.closeOtherTabs(tab),
			[localize('closeAll')]: async () => this.closeAllTabs(),
			[localize('splitEditor')]: async () => vscode.commands.executeCommand('workbench.action.splitEditor'),
			[localize('copyPath')]: async () => this.copyTabPath(tab)
		};
		if (actions[actionLabel]) {
			await actions[actionLabel]();
		}
	}

	private async closeTab(tab: vscode.Tab) {
		await vscode.window.tabGroups.close(tab);
	}

	private async closeOtherTabs(tab: vscode.Tab) {
		for (const group of vscode.window.tabGroups.all) {
			for (const t of group.tabs) {
				if (t !== tab) {
					await vscode.window.tabGroups.close(t);
				}
			}
		}
	}

	private async closeAllTabs() {
		for (const group of vscode.window.tabGroups.all) {
			for (const t of group.tabs) {
				await vscode.window.tabGroups.close(t);
			}
		}
	}

	private async copyTabPath(tab: vscode.Tab) {
		const localize = this.getLocalize();
		if (tab.input instanceof vscode.TabInputText) {
			await vscode.env.clipboard.writeText(tab.input.uri.fsPath);
			vscode.window.showInformationMessage(localize('pathCopied'));
		}
	}
}
