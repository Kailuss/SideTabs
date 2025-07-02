import * as vscode from 'vscode';
import { TabManager } from './TabManager';
import { CommandManager } from './CommandManager';
import { TabsProvider } from 'src/providers/TabsProvider';

//· Comandos reconocidos desde el webview
/// Enumera los comandos que el webview puede enviar a la extensión
/// para acciones como cerrar pestañas, mover, enfocar, etc.
enum WebviewCommand {
	viewReady = 'viewReady',
	tabClicked = 'tabClicked',
	tabClosed = 'tabClosed',
	dragStarted = 'dragStarted',
	dragEnded = 'dragEnded',
	tabMoved = 'tabMoved',
	showContextMenu = 'showContextMenu',
	focus = 'focus',
}

//· EventManager: Gestiona todos los eventos y mensajes entre el webview y la extensión.
// - Escucha mensajes del webview (clics, cierre, drag & drop, menú contextual, etc.)
// - Llama a los métodos apropiados del TabManager y CommandManager
// - Actualiza la UI y sincroniza el estado tras cada acción
export class EventManager {
	private disposables: vscode.Disposable[] = [];

	constructor(
		private tabManager: TabManager,
		private commandManager: CommandManager,
		private tabsProvider: TabsProvider
	) { }

	/// Registra todos los listeners relevantes para cambios de configuración,
	/// cambios en las tabs, diagnósticos y mensajes del webview.
	/// Llama a los callbacks proporcionados cuando detecta cambios.
	public setupEventListeners(
		webviewView: vscode.WebviewView,
		diagnosisManager: any,
		onTabsChanged: (fast: boolean) => void,
		onDiagnosisChanged: () => void
	): void {
		this.dispose(); // Limpia listeners previos
		this.disposables.push(
			// Cambios de configuración
			vscode.workspace.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration('sidetabs')) onTabsChanged(false);
			}),
			// Cambios en las tabs (cierre, apertura, movimiento)
			vscode.window.tabGroups.onDidChangeTabs((e) => {
				console.log(`[SideTabs] Cambio en tabs detectado: ${e.changed.length} cambiados, ${e.closed.length} cerrados, ${e.opened.length} abiertos`);
				onTabsChanged(true);
			}),
			vscode.window.tabGroups.onDidChangeTabGroups(() => {
				console.log(`[SideTabs] Cambio en grupos de tabs detectado`);
				onTabsChanged(true);
			}),
			vscode.window.onDidChangeActiveTextEditor((e) => {
				console.log(`[SideTabs] Cambio de editor activo: ${e?.document.fileName || 'ninguno'}`);
				onTabsChanged(true);
			}),
			// También detectar cambios en la tab activa
			vscode.window.onDidChangeActiveTextEditor(() => {
				console.log(`[SideTabs] Cambio de editor de texto activo detectado`);
				setTimeout(() => onTabsChanged(true), 50); // Pequeño retraso para asegurar que VS Code actualice el estado
			}),
			// Cambios en diagnósticos
			vscode.languages.onDidChangeDiagnostics(() => {
				console.log(`[SideTabs] Cambio en diagnósticos detectado (general)`);
				onDiagnosisChanged();
			}),
			vscode.workspace.onDidSaveTextDocument((doc) => {
				console.log(`[SideTabs] Documento guardado: ${doc.fileName}`);
				onDiagnosisChanged();
			}),
			vscode.workspace.onDidOpenTextDocument((doc) => {
				console.log(`[SideTabs] Documento abierto: ${doc.fileName}`);
				onTabsChanged(false);
			}),
			// Mensajes del webview (acciones del usuario en la UI)
			webviewView.webview.onDidReceiveMessage(async message => {
				if (message.command === WebviewCommand.viewReady) {
					console.log('[LoverTab] Vista lista. Estilos cargados:', message.stylesLoaded);
					return;
				}
				// Procesa el mensaje recibido y ejecuta la acción correspondiente
				await this.handleWebviewMessage(message, async (forceFullUpdate?: boolean) => {
					onTabsChanged(false); // Siempre forzar actualización completa
				});
				//await this.handleWebviewMessage(message, () => this.tabsProvider.performUpdate());
			}),
			vscode.languages.onDidChangeDiagnostics((e) => {
				console.log(`[SideTabs] Cambio en diagnósticos detectado para ${e.uris.length} archivos`);
				onDiagnosisChanged();
			})
		);
	}

	/// Limpia todos los listeners registrados para evitar fugas de memoria.
	public dispose(): void {
		this.disposables.forEach(d => d.dispose());
		this.disposables = [];
	}

	/// Procesa los mensajes recibidos desde el webview y
	/// ejecuta la acción correspondiente según el comando recibido.
	/// @param message Mensaje recibido del webview
	/// @param updateCallback Callback para refrescar la UI tras la acción
	public async handleWebviewMessage(
		message: any,
		updateCallback: () => Promise<void>
	): Promise<void> {
		const cmd = message.command as WebviewCommand;
		console.log('[LoverTab] Mensaje recibido desde webview:', cmd);

		switch (cmd) {
			case WebviewCommand.tabClicked:
				await this.handleTabFocus(message);
				break;
			case WebviewCommand.tabClosed:
				await this.handleTabClose(message, updateCallback);
				break;
			case WebviewCommand.dragStarted:
				console.log('[LoverTab] Inicio drag & drop:', message.uniqueId);
				break;
			case WebviewCommand.dragEnded:
				console.log('[LoverTab] Fin drag & drop, éxito:', message.success);
				this.tabManager.validateCustomOrder();
				break;
			case WebviewCommand.tabMoved:
				await this.handleTabMove(message, updateCallback);
				break;
			case WebviewCommand.showContextMenu:
				await this.handleTabContextMenu(message);
				break;
			case WebviewCommand.focus:
				await this.handleTabFocus(message);
				break;
			default:
				// Fallback: buscar por uniqueId o label si el comando no es reconocido
				if (message.uniqueId) {
					const tabResult = this.tabManager.findTabByUniqueId(message.uniqueId);
					if (tabResult) {
						await this.handleTabAction(message, tabResult.tab, tabResult.group);
						return;
					}
				}
				if (message.label) {
					for (const group of vscode.window.tabGroups.all) {
						for (const tab of group.tabs) {
							if (tab.label === message.label) {
								await this.handleTabAction(message, tab, group);
								return;
							}
						}
					}
				}
				console.warn('[LoverTab] Comando no reconocido:', cmd, message);
		}
	}

	// --- Handlers de eventos principales ---

	/// Enfoca la pestaña indicada por el mensaje.
	private async handleTabFocus(message: any): Promise<void> {
		const tabResult = this.tabManager.findTabByUniqueId(message.uniqueId);
		if (tabResult) {
			console.log('[LoverTab] Activando pestaña:', message.uniqueId);
			await this.focusTab(tabResult.tab, tabResult.group);
		}
	}

	/// Cierra la pestaña indicada y refresca la UI tras un breve retraso para asegurar sincronización.
	private async handleTabClose(message: any, updateCallback: (forceFullUpdate?: boolean) => Promise<void>): Promise<void> {
		const tabResult = this.tabManager.findTabByUniqueId(message.uniqueId);
		if (tabResult) {
			console.log('[LoverTab] Cerrando pestaña:', message.uniqueId);
			try {
				await vscode.window.tabGroups.close(tabResult.tab);
				// Espera un poco más para asegurar que VS Code actualice el modelo de tabs
				setTimeout(async () => {
					// Forzar actualización completa del webview
					await updateCallback(true);
				}, 200);
			} catch (error) {
				console.error('[LoverTab] Error cerrando pestaña:', error);
			}
		}
	}

	/// Mueve una pestaña a una nueva posición y actualiza la UI.
	private async handleTabMove(
		message: any,
		updateCallback: () => Promise<void>
	): Promise<void> {
		const sourceId = message.sourceId || message.uniqueId;
		const targetId = message.targetId || message.targetUniqueId;
		const position = message.position === 'before' ? 'before' : 'after';

		console.log(`[LoverTab] Moviendo pestaña ${sourceId} ${position} de ${targetId}`);

		const success = this.tabManager.moveTab(sourceId, targetId, position);
		if (success) {
			console.log('[LoverTab] Pestaña movida exitosamente');
			setTimeout(async () => {
				try {
					await updateCallback();
					this.commandManager.sendMessageToWebview({
						command: 'tabMoveConfirmed',
						sourceId,
						targetId,
						position,
						timestamp: message.timestamp || Date.now()
					});
				} catch (error) {
					console.error('[LoverTab] Error actualizando vista tras mover pestaña:', error);
				}
			}, 100);
		} else {
			console.warn('[LoverTab] No se pudo mover la pestaña - IDs no encontrados');
			this.commandManager.sendMessageToWebview({
				command: 'tabMoveFailed',
				sourceId,
				targetId,
				reason: 'IDs no encontrados'
			});
		}
	}

	/// Muestra el menú contextual para la pestaña indicada.
	private async handleTabContextMenu(message: any): Promise<void> {
		const tabResult = this.tabManager.findTabByUniqueId(message.uniqueId);
		if (tabResult) {
			await this.handleContextMenu(tabResult.tab);
		}
	}

	/// Ejecuta la acción indicada sobre la pestaña (cerrar, menú contextual, enfocar).
	private async handleTabAction(
		message: any,
		tab: vscode.Tab,
		group: vscode.TabGroup,
		updateCallback?: () => Promise<void>
	): Promise<void> {
		switch (message.command) {
			case WebviewCommand.tabClosed:
				await vscode.window.tabGroups.close(tab);
				// Espera breve para que VS Code actualice el modelo de tabs antes de refrescar la UI
				if (updateCallback) {
					setTimeout(async () => {
						await updateCallback();
					}, 120);
				}
				break;
			case WebviewCommand.showContextMenu:
				await this.handleContextMenu(tab);
				break;
			case WebviewCommand.focus:
				await this.focusTab(tab, group);
				break;
		}
	}

	// --- Métodos helpers privados ---

	/// Muestra el menú contextual de una pestaña.
	private async handleContextMenu(tab: vscode.Tab): Promise<void> {
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
		await this.commandManager.showTabContextMenu(tab);
	}

	/// Enfoca la pestaña indicada en el grupo correspondiente.
	private async focusTab(tab: vscode.Tab, group: vscode.TabGroup): Promise<void> {
		try {
			console.log('[LoverTab] Intentando enfocar pestaña:', tab.label);
			await this.activateTabWithCommand(tab, group);
			if (tab.input instanceof vscode.TabInputText) {
				const options = {
					preserveFocus: false,
					preview: false,
					viewColumn: group.viewColumn,
					selection: undefined
				};
				await vscode.window.showTextDocument(tab.input.uri, options);
			}
		} catch (error) {
			console.error('[LoverTab] Error al enfocar pestaña:', error);
		}
	}

	/// Activa la pestaña usando comandos de VS Code, manejando distintos casos.
	private async activateTabWithCommand(tab: vscode.Tab, group: vscode.TabGroup): Promise<void> {
		const groupIndex = vscode.window.tabGroups.all.indexOf(group);
		const shouldFocusGroup = vscode.window.tabGroups.all.length > 1 && groupIndex !== -1;

		if (tab.input instanceof vscode.TabInputText) {
			try {
				await vscode.commands.executeCommand('vscode.open', tab.input.uri, {
					viewColumn: group.viewColumn,
					preserveFocus: false,
					preview: false
				});
				return;
			} catch (e) {
				console.warn('[LoverTab] Error al activar por URI, probando método alternativo');
			}
		}

		if (shouldFocusGroup) {
			try {
				await vscode.commands.executeCommand('workbench.action.focusEditorGroup', groupIndex + 1);
				await new Promise(resolve => setTimeout(resolve, 50));
			} catch (e) {
				console.warn('[LoverTab] Error al enfocar grupo:', e);
			}
		}

		const tabIndex = group.tabs.indexOf(tab);
		if (tabIndex !== -1) {
			try {
				await vscode.commands.executeCommand('workbench.action.openEditorAtIndex', tabIndex);
			} catch (e) {
				console.warn('[LoverTab] Error al activar por índice:', e);
				if (tab.input instanceof vscode.TabInputText) {
					try {
						const uri = (tab.input as vscode.TabInputText).uri;
						const doc = vscode.workspace.textDocuments.find(d =>
							d.uri.toString() === uri.toString());
						await vscode.commands.executeCommand('setContext', 'editorLangId',
							doc?.languageId || '');
					} catch (e2) {
						console.error('[LoverTab] Todos los intentos de activación fallaron');
					}
				}
			}
		}
	}
}