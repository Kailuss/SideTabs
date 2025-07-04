import * as vscode from 'vscode';
import { TabManager } from '../services/TabManager';
import { GUIManager } from '../services/GUIManager';
import { TabIconManager } from '../services/TabIconManager';
import { TabDiagnosticsManager } from '../services/TabDiagnosticsManager';
import { TabMenuManager } from '../services/TabMenuManager';
import { EventManager } from '../services/EventManager';
import { initSvgIconUris } from '../services/utils/iconsUtils';

//· Proveedor principal del webview panel de SideTabs
//  Integra todos los módulos y gestiona el ciclo de vida de la vista

export class TabsProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'sideTabsPanelView';

	private readonly _extensionUri: vscode.Uri;
	private _context: vscode.ExtensionContext | undefined;
	private _view: vscode.WebviewView | undefined;
	private _stylesInitialized: boolean = false;
	private readonly _consoleId: string = "[SideTabs] TabsProvider.ts: ";

	// Managers para diferentes aspectos de la funcionalidad
	private iconManager: TabIconManager;
	private tabDiagnosticsManager: TabDiagnosticsManager | undefined = undefined;
	private tabManager: TabManager;
	private commandManager: TabMenuManager;
	private guiManager: GUIManager;
	private eventManager: EventManager;

	// Variables para optimización
	private updateTimeout: NodeJS.Timeout | undefined;
	private diagnosisTimeout: NodeJS.Timeout | undefined;
	private activeTabUpdateTimeout: NodeJS.Timeout | undefined;
	private isUpdating: boolean = false;
	private pendingUpdate: boolean = false;
	private lastActiveTabId: string | undefined;
	private lastTabsMap: Map<string, any> | undefined;
	private lastDiagnosticsMap: Map<string, any> | undefined;

	constructor(extensionUri: vscode.Uri, context?: vscode.ExtensionContext) {
		this._extensionUri = extensionUri;
		if (context) this._context = context;

		//* Inicializar managers
		this.iconManager = new TabIconManager();
		this.tabDiagnosticsManager = new TabDiagnosticsManager();
		this.tabManager = new TabManager();
		this.commandManager = new TabMenuManager();
		this.guiManager = new GUIManager(this.iconManager, this.tabDiagnosticsManager);
		this.eventManager = new EventManager(this.tabManager, this.commandManager, this);
	}

	/// Inicialización asíncrona del proveedor (para activate)
	public async initialize(context: vscode.ExtensionContext): Promise<void> {
		this._context = context;

		// Inicializar el manager de iconos
		console.log(this._consoleId + 'Inicializando IconManager');
		this.iconManager.initialize(context);

		// Registrar listener de diagnósticos para actualizaciones en tiempo real
		console.log(this._consoleId + 'Registrando listener para onDidChangeDiagnostics');
		const disposable = vscode.languages.onDidChangeDiagnostics(this.onDiagnosticsChanged.bind(this));
		context.subscriptions.push(disposable);
		console.log(this._consoleId + 'Listener registrado correctamente');
	}

	/// Muestra el menú contextual de una pestaña (API pública)
	public async showTabContextMenu(tab: vscode.Tab): Promise<void> {
		await this.commandManager.showTabContextMenu(tab);
	}

	/// Precarga iconos en segundo plano (API pública)
	public async preloadIconsInBackground(forceRefresh: boolean = false): Promise<void> {
		if (!this._context) return;
		await this.iconManager.preloadIconsInBackground(this._context, forceRefresh);

		//* Actualizar la vista si está disponible
		if (this._view) await this.performUpdate();
	}

	/// Resuelve la vista del webview
	resolveWebviewView(webviewView: vscode.WebviewView): void {
		this._view = webviewView;

		// Reiniciar el estado de inicialización
		this._stylesInitialized = false;
		this.lastActiveTabId = undefined;
		this.lastTabsMap = undefined;
		this.lastDiagnosticsMap = undefined;
		this.isUpdating = false;
		this.pendingUpdate = false;

		// Configurar opciones del webview con localResourceRoots adecuados
		const iconsDir = vscode.Uri.joinPath(this._context!.globalStorageUri, 'icons');
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				this._extensionUri,
				vscode.Uri.joinPath(this._extensionUri, 'webview'),
				vscode.Uri.joinPath(this._extensionUri, 'node_modules'),
				iconsDir
			]

		};

		//· Configurar listeners usando el EventManager
		console.log(`[SideTabs] TabsProvider.ts: Configurando listeners para el webview`);
		this.eventManager.setupEventListeners(
			webviewView,
			this.tabDiagnosticsManager,
			(fast: boolean) => this.updateActiveTabState(),
			(uris?: vscode.Uri[]) => {
				console.log(this._consoleId + `Evento de diagnósticos detectado. URIs afectadas: ${uris?.length ?? 'todas'}`);
				if (uris && uris.length > 0) {
					this.scheduleDiagnosisUpdate(uris);
				} else {
					// Si no hay URIs específicas, actualizar todos los diagnósticos
					const allTabs = this.tabManager.getAllTabsWithMetadata();
					const allUris = allTabs
						.filter(tab => tab.resourceUri)
						.map(tab => tab.resourceUri!);
					this.scheduleDiagnosisUpdate(allUris);
				}
			}
		);

		// Inicializar SVG para iconos
		initSvgIconUris(this._context!, webviewView.webview); // Solo necesitas llamarlo una vez aquí

		// Primera actualización inmediata sin debouncing
		this.performUpdate(true);
	}

	/// Actualiza solo el estado activo de las pestañas sin regenerar todo el HTML
	/// Con throttling mínimo para máxima fluidez
	private scheduleActiveTabUpdate(): void {
		// Cancelar timeout previo si existe
		if (this.activeTabUpdateTimeout) {
			clearTimeout(this.activeTabUpdateTimeout);
		}

		// Throttling muy corto (10ms) para cambios de pestaña activa
		this.activeTabUpdateTimeout = setTimeout(() => {
			this.updateActiveTabState();
		}, 10);
	}

	//· Actualiza solo el estado activo de las pestañas sin regenerar todo el HTML
	private updateActiveTabState(): boolean {
		console.log('updateActiveTabState llamado 🔁');
		if (!this._view) return false;

		const allTabs = this.tabManager.getAllTabsWithMetadata();
		//console.log('Tabs realmente abiertas:', allTabs.map(t => t.uniqueId));
		const currentActiveTab = allTabs.find((tab: any) => tab.tab.isActive);
		const currentActiveTabId = currentActiveTab?.uniqueId;

		// Si el estado activo cambió, enviar mensaje para actualización rápida
		if (currentActiveTabId !== this.lastActiveTabId) {
			this.lastActiveTabId = currentActiveTabId;

			const message = this.guiManager.generateActiveTabUpdateMessage(currentActiveTabId);
			this._view.webview.postMessage(message);

			return true; // Indica que hubo cambio de estado activo
		}

		return false; // No hubo cambio
	}

	/**
	 * Detecta si solo cambió el estado activo o si hay cambios estructurales
	 */
	private needsFullUpdate(): boolean {
		if (!this._view) return true;

		const allTabs = this.tabManager.getAllTabsWithMetadata();
		const currentTabsMap = new Map(allTabs.map((tab: any) => [tab.uniqueId, tab]));

		// Si no tenemos tabs previas guardadas, necesitamos actualización completa
		if (!this.lastTabsMap) {
			this.lastTabsMap = currentTabsMap;
			return true;
		}

		// Verificar si cambió el número de pestañas
		if (this.lastTabsMap.size !== currentTabsMap.size) {
			this.lastTabsMap = currentTabsMap;
			return true;
		}

		// Verificar si alguna pestaña fue agregada, eliminada o modificada (excepto estado activo)
		for (const [uniqueId, tab] of currentTabsMap) {
			const prevTab = this.lastTabsMap.get(uniqueId as string);
			if (!prevTab) {
				this.lastTabsMap = currentTabsMap;
				return true; // Nueva pestaña
			}

			// Verificar cambios relevantes (excepto isActive)
			const currentTab = tab as any;
			if (prevTab.tab.label !== currentTab.tab.label ||
				prevTab.uniqueId !== currentTab.uniqueId ||
				prevTab.tab.isDirty !== currentTab.tab.isDirty ||
				prevTab.tab.isPreview !== currentTab.tab.isPreview) {
				this.lastTabsMap = currentTabsMap;
				return true;
			}
		}

		// Verificar si alguna pestaña fue eliminada
		for (const uniqueId of this.lastTabsMap.keys()) {
			if (!currentTabsMap.has(uniqueId)) {
				this.lastTabsMap = currentTabsMap;
				return true; // Pestaña eliminada
			}
		}

		return false; // Solo cambió el estado activo
	}

	/// Actualiza la vista con detección inteligente de cambios
	private scheduleUpdate(forceIconRefresh: boolean = false, forceFullUpdate: boolean = false, customDebounce?: number): void {
		//console.log(this._consoleId + `scheduleUpdate llamado con forceIconRefresh=${forceIconRefresh}, forceFullUpdate=${forceFullUpdate}, customDebounce=${customDebounce}`);

		// Si se fuerza actualización completa, saltar optimizaciones
		if (forceFullUpdate || forceIconRefresh) {
			//console.log(this._consoleId + 'Programando actualización completa por forzado');
			this.scheduleFullUpdate(forceIconRefresh, customDebounce);
			return;
		}

		// Para cambios rápidos, intentar actualizar solo el estado activo primero
		this.scheduleActiveTabUpdate();

		// Verificar si necesitamos actualización completa
		if (this.needsFullUpdate()) {
			//console.log(this._consoleId + 'Programando actualización completa por cambios estructurales');
			this.scheduleFullUpdate(forceIconRefresh, customDebounce);
		}
	}

	/// Programa una actualización completa del webview
	private scheduleFullUpdate(forceIconRefresh: boolean = false, customDebounce?: number): void {
		// Si ya hay una actualización programada, cancelarla
		if (this.updateTimeout) {
			clearTimeout(this.updateTimeout);
		}

		// Si ya estamos actualizando, marcar que hay una actualización pendiente
		if (this.isUpdating) {
			this.pendingUpdate = true;
			return;
		}

		// Usar debouncing personalizado o el por defecto
		const debounceTime = customDebounce || 150;

		// Programar actualización completa con debouncing
		this.updateTimeout = setTimeout(() => {
			this.performUpdate(forceIconRefresh);
		}, debounceTime);
	}

	/// Programa actualizaciones de diagnósticos con menor debouncing
	/// Delega la generación de datos al DiagnosisManager
	private scheduleDiagnosisUpdate(uris?: vscode.Uri[]) {
		if (!this._view?.visible) return;

		if (this.diagnosisTimeout) { clearTimeout(this.diagnosisTimeout); }

		this.diagnosisTimeout = setTimeout(() => {
			this.updateDiagnostics(uris);
		}, 100); // Pequeño debounce para evitar actualizaciones muy frecuentes
	}

	/// Genera el HTML completo para el webview, delegando a UIManager
	private async generateFullHtml(forceIconRefresh: boolean = false): Promise<string> {
		// Obtener todas las pestañas con metadatos
		const allTabs = this.tabManager.getAllTabsWithMetadata();

		// Adaptar las pestañas al formato esperado por UIManager
		const uiTabs = allTabs.map(tabInfo => {
			const { tab, uniqueId, group } = tabInfo;
			return {
				...tabInfo,
				resourceUri: tab.input instanceof vscode.TabInputText ? tab.input.uri : undefined,
				label: tab.label,
				isActive: tab.isActive,
				isDirty: tab.isDirty,
				index: group.tabs.indexOf(tab)
			};
		});

		// Delegar la generación completa del HTML al UIManager
		return await this.guiManager.generateFullWebviewHTML(
			this._extensionUri,
			this._context!,
			this._view!.webview,
			uiTabs,
			forceIconRefresh
		);
	}

	/// Realiza la actualización real de la vista
	private async performUpdate(forceIconRefresh: boolean = false): Promise<void> {
		try {
			this.isUpdating = true;
			if (!this._view || !this._view.visible || !this._view.webview) return;

			console.log(this._consoleId + 'Realizando actualización...');

			// Refrescar iconos si se solicita explícitamente
			if (forceIconRefresh && this._context) {
				console.log(this._consoleId + 'Forzando reconstrucción del mapa de iconos');
				await this.iconManager.buildIconMap(this._context, true);
			}

			// Obtener las pestañas y actualizar languageIds
			const allTabs = this.tabManager.getAllTabsWithMetadata();
			this.enhanceTabsWithLanguageIds(allTabs);

			if (!this._stylesInitialized) {
				// Primera carga - inicializar todo el HTML incluyendo estilos
				console.log(this._consoleId + 'Primera carga - inicializando estilos y contenido');
				const html = await this.generateFullHtml(forceIconRefresh);
				this._view.webview.html = html;
				this._stylesInitialized = true;
			} else {
				// Actualizaciones posteriores - solo actualizar el contenido de las pestañas
				console.log(this._consoleId + 'Actualización parcial - solo contenido');
				await this.updateContentOnly(allTabs);
			}

			// Guardar una referencia al último ID de pestaña activa
			const currentActiveTab = allTabs.find((tab: any) => tab.tab.isActive);
			this.lastActiveTabId = currentActiveTab?.uniqueId;

			// Actualizar el mapa de pestañas para comparaciones futuras
			this.lastTabsMap = new Map(allTabs.map((tab: any) => [tab.uniqueId, tab]));
		} catch (error) {
			console.error(this._consoleId + 'Error al actualizar vista:', error);
			if (this._view && this._view.webview) {
				this._view.webview.html = `<html><body><h3>Error cargando SideTabs</h3><p>${error}</p></body></html>`;
			}
		} finally {
			this.isUpdating = false;
			this.handlePendingUpdates(forceIconRefresh);
		}
	}

	/// Envía actualizaciones de diagnósticos al webview
	/// @param diagnosticsMap - Mapa de diagnósticos por URI
	private sendDiagnosticsUpdate(diagnosticsMap: Map<string, any>) {
		if (!this._view?.visible) return;

		console.log(this._consoleId + "Enviando actualizaciones de diagnósticos al webview con comando correcto");

		// Convertir el mapa a un objeto para enviar al webview
		const diagnostics: { [key: string]: any } = {};
		for (const [uri, diag] of diagnosticsMap.entries()) {
			// Obtener el ID único de la pestaña desde la URI
			const tab = this.tabManager.getTabByUri(vscode.Uri.parse(uri));
			if (tab) {
				diagnostics[tab.uniqueId] = diag;
			}
		}

		// Enviar el mensaje al webview
		this._view.webview.postMessage({
			type: 'updateDiagnostics',
			diagnostics
		});
	}

	/// Actualiza los diagnósticos y los envía al webview
	private async updateDiagnostics(uris?: vscode.Uri[]) {
		if (!this._view?.visible) return;

		// Si se proporcionaron URIs específicas, actualizar solo esas
		if (uris && uris.length > 0) {
			const diagnosticsMap = new Map<string, any>();
			for (const uri of uris) {
				if (this.tabDiagnosticsManager) {
					const diagnosis = await this.tabDiagnosticsManager.getDiagnostics(uri);
					diagnosticsMap.set(uri.toString(), diagnosis);
				}
			}
			this.sendDiagnosticsUpdate(diagnosticsMap);
		} else {
			// Actualizar todos los diagnósticos
			const allTabs = this.tabManager.getAllTabsWithMetadata();
			const diagnosticsMap = new Map<string, any>();

			for (const tab of allTabs) {
				if (tab.resourceUri && this.tabDiagnosticsManager) {
					const diagnosis = await this.tabDiagnosticsManager.getDiagnostics(tab.resourceUri);
					diagnosticsMap.set(tab.resourceUri.toString(), diagnosis);
				}
			}

			this.sendDiagnosticsUpdate(diagnosticsMap);
		}
	}

	/// Añade languageId a los tabs si falta
	private enhanceTabsWithLanguageIds(tabs: any[]): void {
		for (const tabInfo of tabs) {
			if (!tabInfo.languageId) {
				const fileName = this.tabManager.getFileName(tabInfo.tab);
				if (fileName) {
					tabInfo.languageId = this.tabManager.inferLanguageId(fileName);
				}
			}
		}
	}

	/// ✔ Actualiza solo el contenido de las pestañas sin recargar estilos
	private async updateContentOnly(allTabs: any[]): Promise<void> {
		if (!this._view || !this._view.visible || !this._view.webview || !this._context) return;
		try {
			const { showDirectoryPath, fontSize } = this.getViewConfig();
			const uiTabs = allTabs.map(tabInfo => {
				const { tab, uniqueId, group } = tabInfo;
				return {
					...tabInfo,
					resourceUri: tab.input instanceof vscode.TabInputText ? tab.input.uri : undefined,
					label: tab.label,
					isActive: tab.isActive,
					isDirty: tab.isDirty,
					index: group.tabs.indexOf(tab)
				};
			});
			const tabsHTML = await this.guiManager.generateTabsHTML(
				uiTabs,
				this._context!,
				showDirectoryPath,
				fontSize,
				this._view!.webview
			);
			this._view.webview.postMessage({
				command: 'updateTabsContent',
				html: tabsHTML
			});
			const currentActiveTab = allTabs.find((tab: any) => tab.tab.isActive);
			const currentActiveTabId = currentActiveTab?.uniqueId;
			if (currentActiveTabId !== this.lastActiveTabId) {
				this._view.webview.postMessage({
					command: 'updateActiveTab',
					activeTabId: currentActiveTabId
				});
				this.lastActiveTabId = currentActiveTabId;
			}
			this.lastTabsMap = new Map(allTabs.map((tab: any) => [tab.uniqueId, tab]));
		} catch (error) {
			console.error(this._consoleId + 'Error al actualizar contenido:', error);
			this._stylesInitialized = false;
			const html = await this.generateFullHtml(true);
			this._view.webview.html = html;
		}
	}

	/// Maneja las actualizaciones pendientes
	private handlePendingUpdates(forceIconRefresh: boolean = false): void {
		if (this.pendingUpdate) {
			this.pendingUpdate = false;
			setTimeout(() => this.performUpdate(forceIconRefresh), 50);
		}
	}

	/// Actualiza la vista del webview (delega a performUpdate para evitar duplicación)
	private async updateView(forceIconRefresh: boolean = false): Promise<void> {
		if (!this._view || !this._context) return;

		// Delegamos a performUpdate para evitar duplicación
		await this.performUpdate(forceIconRefresh);

		// Precargar iconos en segundo plano si es necesario
		if (forceIconRefresh) {
			this.preloadIconsInBackground(forceIconRefresh);
		}
	}

	/// Devuelve la configuración de la vista
	private getViewConfig() {
		const config = vscode.workspace.getConfiguration('sidetabs');
		return {
			showDirectoryPath: config.get<boolean>('showDirectoryPath', true),
			fontSize: config.get<number>('fontSize', 14),
			tabHeight: config.get<number>('tabHeight', 40)
		};
	}

	/// Maneja los cambios en diagnósticos (errores, warnings, info)
	/// Se ejecuta automáticamente cuando VS Code detecta cambios en diagnósticos
	private onDiagnosticsChanged(event: vscode.DiagnosticChangeEvent): void {
		if (!this._view || !this._view.visible) return;

		// Registrar evento de diagnóstico
		console.log(this._consoleId + 'Evento de diagnósticos detectado. URIs afectadas:', event.uris.map(u => u.fsPath));

		// Evitar actualizaciones excesivas con un debounce
		if (this.diagnosisTimeout) {
			clearTimeout(this.diagnosisTimeout);
		}

		this.diagnosisTimeout = setTimeout(async () => {
			try {
				// Verificar qué archivos cambiaron sus diagnósticos
				const affectedUris = event.uris;
				if (!affectedUris.length) return;

				console.log(this._consoleId + 'Procesando cambios de diagnósticos para ' + affectedUris.length + ' URIs');

				// Obtener todas las pestañas y filtrar las afectadas
				const allTabs = this.tabManager.getAllTabsWithMetadata();
				console.log(this._consoleId + 'Total tabs:', allTabs.length);

				// Mejorar la comparación de URIs para asegurar que encuentra coincidencias
				const affectedTabs = allTabs.filter((tabInfo: any) => {
					// Verificar si la pestaña corresponde a uno de los archivos con diagnósticos actualizados
					if (tabInfo.tab.input instanceof vscode.TabInputText) {
						const tabPath = tabInfo.tab.input.uri.fsPath.toLowerCase();
						const found = affectedUris.some(uri => {
							const uriPath = uri.fsPath.toLowerCase();
							return tabPath === uriPath;
						});

						if (found) {
							console.log(this._consoleId + 'Pestaña afectada encontrada:', tabInfo.uniqueId, tabInfo.tab.label);
						}
						return found;
					}
					return false;
				});

				if (!affectedTabs.length) return;

				// Obtener diagnósticos actualizados solo para las pestañas afectadas
				const diagnosisUpdates: any[] = [];

				for (const tabInfo of affectedTabs) {
					// Asegurarse de que es un TabInputText antes de acceder a uri
					if (tabInfo.tab.input instanceof vscode.TabInputText) {
						if (this.tabDiagnosticsManager) {
							const diagData = await this.tabDiagnosticsManager.getDiagnostics(tabInfo.tab.input.uri);

							diagnosisUpdates.push({
								uniqueId: tabInfo.uniqueId,
								diagnosis: {
									errors: diagData.errors,
									warnings: diagData.warnings,
									infos: diagData.infos
								},
								diagnosisLevel: diagData.errors > 0 ? 'error' :
									diagData.warnings > 0 ? 'warning' :
										diagData.infos > 0 ? 'info' : undefined
							});
						}
					}
				}

				// Enviar actualización al webview
				if (this._view && diagnosisUpdates.length) {
					console.log(this._consoleId + 'Enviando actualizaciones de diagnóstico al webview:', diagnosisUpdates);

					// Asegurarnos de que el webview está disponible y visible
					if (this._view.visible && this._view.webview) {
						try {
							this._view.webview.postMessage({
								command: 'updateDiagnosis',
								updates: diagnosisUpdates
							});
							console.log(this._consoleId + 'Mensaje enviado correctamente al webview');
						} catch (err) {
							console.error(this._consoleId + 'Error al enviar mensaje al webview:', err);
						}
					} else {
						console.warn(this._consoleId + 'El webview no está visible o no está disponible');
					}
				}
			} catch (error) {
				console.error(this._consoleId + 'Error al actualizar diagnósticos:', error);
			}
		}, 50); // 50ms de debounce para una actualización más rápida
	}
}
