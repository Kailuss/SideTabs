import * as vscode from 'vscode';
import { TabManager } from './TabManager';
import { TabMenuManager } from './TabMenuManager';
import { TabsProvider } from 'src/providers/TabsProvider';

// = Comandos reconocidos desde el webview
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
	requestTabsUpdate = 'requestTabsUpdate',
}

// = EventManager: Gestiona todos los eventos y mensajes entre el webview y la extensión.
// - Escucha mensajes del webview (clics, cierre, drag & drop, menú contextual, etc.)
// - Llama a los métodos apropiados del TabManager y CommandManager
// - Actualiza la UI y sincroniza el estado tras cada acción
export class EventManager {
	private disposables: vscode.Disposable[] = [];

	constructor(
		private tabManager: TabManager,
		private commandManager: TabMenuManager,
		private tabsProvider: TabsProvider
	) { }

	/**
	 * Registra todos los listeners relevantes para sincronizar el estado de las tabs
	 * entre VS Code y el webview de la extensión.
	 * 
	 * @param tabsPanel - El webview donde se muestra la UI de las tabs.
	 * @param diagnosisManager - (No usado aquí, pero puede ser para diagnósticos).
	 * @param onTabsChanged - Callback para actualizar la UI cuando cambian las tabs.
	 * @param onDiagnosisChanged - Callback para actualizar diagnósticos.
	 */
	public setupEventListeners(
		tabsPanel: vscode.WebviewView,
		diagnosisManager: any,
		onTabsChanged: (fast: boolean) => void,
		onDiagnosisChanged: (uris?: vscode.Uri[]) => void
	): void {
		console.log(`[SideTabs] EventManager: Configurando listeners para el webview`);
		this.dispose(); // Limpia listeners previos

		this.disposables.push(
			// Listener: Cambios de configuración de la extensión
			// Si el usuario cambia settings de 'sidetabs', se fuerza actualización de tabs
			vscode.workspace.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration('sidetabs')) onTabsChanged(false);
			}),

			// Listener: Cambios en los grupos de tabs (por ejemplo, se crea o elimina un grupo)
			vscode.window.tabGroups.onDidChangeTabGroups(() => {
				console.log(`[SideTabs] EventManager: Cambio en grupos de tabs detectado`);
				onTabsChanged(true);
			}),

			// Listener: Cambio de editor de texto activo (cuando el usuario cambia de archivo)
			vscode.window.onDidChangeActiveTextEditor((e) => {
				console.log(`[SideTabs] EventManager: Cambio de editor activo: ${e?.document.fileName || 'ninguno'}`);
				onTabsChanged(true);
			}),

			// Listener: Cambio de editor de texto activo (duplicado, pero con delay para asegurar actualización)
			vscode.window.tabGroups.onDidChangeTabs(() => {
				console.log(`[SideTabs] EventManager: Cambio de editor de texto activo detectado`);
				setTimeout(() => onTabsChanged(true), 50); // Pequeño retraso para asegurar que VS Code actualice el estado
			}),

			// Listener: Cambios en diagnósticos (errores/warnings en archivos)
			vscode.languages.onDidChangeDiagnostics((e) => {
				console.log(`[SideTabs] Cambio en diagnósticos detectado para ${e.uris.length} archivos`);
				onDiagnosisChanged([...e.uris]); // Convert readonly array to mutable array
			}),

			// Listener: Guardado de documentos (puede afectar diagnósticos)
			vscode.workspace.onDidSaveTextDocument((doc) => {
				console.log(`[SideTabs] EventManager: Documento guardado: ${doc.fileName}`);
				onDiagnosisChanged([doc.uri]);
			}),

			// Listener: Apertura de nuevos documentos (puede afectar tabs y diagnósticos)
			vscode.workspace.onDidOpenTextDocument((doc) => {
				console.log(`[SideTabs] EventManager: Documento abierto: ${doc.fileName}`);
				onDiagnosisChanged([doc.uri]); // Actualizar diagnósticos para el nuevo documento
				onTabsChanged(true);
			}),

			// Listener: Mensajes recibidos desde el webview (acciones del usuario en la UI de la extensión)
			//? Aquí se capturan todas las acciones realizadas desde la UI personalizada del webview,
			// como clics en pestañas, cerrar, mover, menú contextual, etc.
			tabsPanel.webview.onDidReceiveMessage(async message => {
				console.log('[SideTabs] EventManager: Mensaje recibido desde webview:', message.command);
				// Si el webview avisa que está listo, solo loguea
				if (message.command === WebviewCommand.viewReady) {
					console.log('[SideTabs] EventManager: Vista lista. Estilos cargados:', message.stylesLoaded);
					return;
				}
				// Procesa el mensaje recibido y ejecuta la acción correspondiente
				await this.handleWebviewMessage(message, async (forceFullUpdate?: boolean) => {
					onTabsChanged(true); // Siempre forzar actualización completa
				});
			})
		);
	}

	/// Limpia todos los listeners registrados para evitar fugas de memoria.
	public dispose(): void {
		this.disposables.forEach(d => d.dispose());
		this.disposables = [];
	}

	/**
	 * Procesa los mensajes recibidos desde el webview y ejecuta la acción correspondiente.
	 * Si el mensaje es para enfocar una pestaña, cerrar, mover, etc, llama al handler adecuado.
	 */
	public async handleWebviewMessage(
		message: any,
		updateCallback: () => Promise<void>
	): Promise<void> {
		const cmd = message.command as WebviewCommand;
		console.log('[SideTabs] ✉ EventManager: Mensaje recibido desde webview:', cmd);

		switch (cmd) {
			case WebviewCommand.tabClicked:
				await this.handleTabFocus(message);
				console.log('[SideTabs] EventManager: Pestaña enfocada:', message.uniqueId);
				break;
			case WebviewCommand.tabClosed:
				await this.handleTabClose(message, updateCallback);
				break;
			case WebviewCommand.dragStarted:
				console.log('[SideTabs] EventManager: Inicio drag & drop:', message.uniqueId);
				break;
			case WebviewCommand.dragEnded:
				console.log('[SideTabs] EventManager: Fin drag & drop, éxito:', message.success);
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
			case WebviewCommand.requestTabsUpdate:
				console.log('[SideTabs] EventManager: Solicitud de actualización de pestañas recibida, motivo:', message.reason);
				await updateCallback();
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
				console.warn('[SideTabs] EventManager: Comando no reconocido:', cmd, message);
		}
	}

	// --- Handlers de eventos principales ---

	/// Enfoca la pestaña indicada por el mensaje.
	private async handleTabFocus(message: any): Promise<void> {
		console.log('[SideTabs] EventManager: Enfocando pestaña:', message.uniqueId);
		const tabResult = this.tabManager.findTabByUniqueId(message.uniqueId);
		if (tabResult) {
			console.log('[SideTabs] EventManager: Activando pestaña:', message.uniqueId);
			await this.focusTab(tabResult.tab, tabResult.group);
		} else {
			console.warn('[SideTabs] EventManager: No se encontró la pestaña con uniqueId:', message.uniqueId);
			// Sugerencia: revisar que el uniqueId enviado desde el webview coincida con el que maneja TabManager
		}
	}

	/// Cierra la pestaña indicada y refresca la UI tras un breve retraso para asegurar sincronización.
	private async handleTabClose(message: any, updateCallback: (forceFullUpdate?: boolean) => Promise<void>): Promise<void> {
		const tabResult = this.tabManager.findTabByUniqueId(message.uniqueId);
		if (tabResult) {
			console.log('[SideTabs] EventManager: Cerrando pestaña:', message.uniqueId);
			try {
				await vscode.window.tabGroups.close(tabResult.tab);
				// Espera un poco más para asegurar que VS Code actualice el modelo de tabs
				setTimeout(async () => {
					// Forzar actualización completa del webview
					await updateCallback(true);
				}, 200);
			} catch (error) {
				console.error('[SideTabs] EventManager: Error cerrando pestaña:', error);
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

		console.log(`[SideTabs] EventManager: Moviendo pestaña ${sourceId} ${position} de ${targetId}`);

		const success = this.tabManager.moveTab(sourceId, targetId, position);
		if (success) {
			console.log('[SideTabs] EventManager: Pestaña movida exitosamente');
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
					console.error('[SideTabs] EventManager: Error actualizando vista tras mover pestaña:', error);
				}
			}, 100);
		} else {
			console.warn('[SideTabs] EventManager: No se pudo mover la pestaña - IDs no encontrados');
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
			console.log('[SideTabs] EventManager: Intentando enfocar pestaña:', tab.label);
			await this.activateTabWithCommand(tab, group);
			if (tab.input instanceof vscode.TabInputText) {
				const options = {
					preserveFocus: false,
					preview: false,
					viewColumn: group.viewColumn,
					selection: undefined
				};
				await vscode.window.showTextDocument(tab.input.uri, options); // Asegura que el documento se abra en el grupo correcto
			}
		} catch (error) {
			console.error('[SideTabs] EventManager: Error al enfocar pestaña:', error);
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
				console.warn('[SideTabs] EventManager: Error al activar por URI, probando método alternativo');
			}
		}

		if (shouldFocusGroup) {
			try {
				await vscode.commands.executeCommand('workbench.action.focusEditorGroup', groupIndex + 1);
				await new Promise(resolve => setTimeout(resolve, 50));
			} catch (e) {
				console.warn('[SideTabs] EventManager: Error al enfocar grupo:', e);
			}
		}

		const tabIndex = group.tabs.indexOf(tab);
		if (tabIndex !== -1) {
			try {
				await vscode.commands.executeCommand('workbench.action.openEditorAtIndex', tabIndex);
			} catch (e) {
				console.warn('[SideTabs] EventManager: Error al activar por índice:', e);
				if (tab.input instanceof vscode.TabInputText) {
					try {
						const uri = (tab.input as vscode.TabInputText).uri;
						const doc = vscode.workspace.textDocuments.find(d =>
							d.uri.toString() === uri.toString());
						await vscode.commands.executeCommand('setContext', 'editorLangId',
							doc?.languageId || '');
					} catch (e2) {
						console.error('[SideTabs] EventManager: Todos los intentos de activación fallaron');
					}
				}
			}
		}
	}
}