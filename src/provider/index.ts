import * as vscode from 'vscode';
import { Localization } from '../localization';
import { IconManager } from '../icons';
import { DiagnosticsManager } from '../diagnostics';
import { TabManager } from '../tabs';
import { CommandManager } from '../commands';
import { UIManager } from '../ui';
import { EventManager } from '../events';

/**
 * Proveedor principal del webview panel de SideTabs
 * Integra todos los módulos y gestiona el ciclo de vida de la vista
 */
export class SideTabsProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'sideTabsPanelView';

	private readonly _extensionUri: vscode.Uri;
	private _context: vscode.ExtensionContext | undefined;
	private _view: vscode.WebviewView | undefined;

	// Managers para diferentes aspectos de la funcionalidad
	private iconManager: IconManager;
	private diagnosticsManager: DiagnosticsManager;
	private tabManager: TabManager;
	private commandManager: CommandManager;
	private uiManager: UIManager;
	private eventManager: EventManager;

	// Variables para optimización
	private updateTimeout: NodeJS.Timeout | undefined;
	private diagnosticsTimeout: NodeJS.Timeout | undefined;
	private activeTabUpdateTimeout: NodeJS.Timeout | undefined;
	private isUpdating: boolean = false;
	private pendingUpdate: boolean = false;
	private lastActiveTabId: string | undefined;
	private lastTabsMap: Map<string, any> | undefined;

	constructor(extensionUri: vscode.Uri, context?: vscode.ExtensionContext) {
		this._extensionUri = extensionUri;
		if (context) this._context = context;

		// Inicializar managers
		this.iconManager = new IconManager();
		this.diagnosticsManager = new DiagnosticsManager();
		this.tabManager = new TabManager();
		this.commandManager = new CommandManager();
		this.uiManager = new UIManager(this.iconManager, this.diagnosticsManager);
		this.eventManager = new EventManager(this.tabManager, this.commandManager);
	}

	/**
	 * Muestra el menú contextual de una pestaña (API pública)
	 */
	public async showTabContextMenu(tab: vscode.Tab): Promise<void> {
		await this.commandManager.showTabContextMenu(tab);
	}

	/**
	 * Precarga iconos en segundo plano (API pública)
	 */
	public async preloadIconsInBackground(forceRefresh: boolean = false): Promise<void> {
		if (!this._context) return;
		await this.iconManager.preloadIconsInBackground(this._context, forceRefresh);

		// Actualizar la vista si está disponible
		if (this._view) {
			await this.performUpdate();
		}
	}

	/**
	 * Resuelve la vista del webview
	 */
	resolveWebviewView(webviewView: vscode.WebviewView): void {
		this._view = webviewView;

		// Configurar opciones del webview
		this.setupWebviewOptions(webviewView);

		// Configurar listeners
		this.setupEventListeners(webviewView);

		// Inicializar iconos
		this.initializeIcons();

		// Primera actualización inmediata sin debouncing
		this.updateView(true);
	}

	/**
	 * Configura las opciones del webview
	 */
	private setupWebviewOptions(webviewView: vscode.WebviewView): void {
		const iconsDir = vscode.Uri.joinPath(this._context!.globalStorageUri, 'icons');
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode', 'codicons', 'dist'),
				this._context!.globalStorageUri,
				iconsDir
			]
		};
	}

	/**
	 * Actualiza solo el estado activo de las pestañas sin regenerar todo el HTML
	 * Con throttling mínimo para máxima fluidez
	 */
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

	/**
	 * Actualiza solo el estado activo de las pestañas sin regenerar todo el HTML
	 */
	private updateActiveTabState(): boolean {
		if (!this._view) return false;

		const allTabs = this.tabManager.getAllTabsWithMetadata();
		const currentActiveTab = allTabs.find((tab: any) => tab.tab.isActive);
		const currentActiveTabId = currentActiveTab?.uniqueId;

		// Si el estado activo cambió, enviar mensaje para actualización rápida
		if (currentActiveTabId !== this.lastActiveTabId) {
			this.lastActiveTabId = currentActiveTabId;

			const message = this.uiManager.generateActiveTabUpdateMessage(currentActiveTabId);
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

	/**
	 * Configura todos los event listeners
	 */
	private setupEventListeners(webviewView: vscode.WebviewView): void {
		// Listener para cambios de configuración
		const configListener = vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('sidetabs')) {
				this.scheduleUpdate(false, true);
			}
		});

		// Asegurar que el listener se elimine cuando se destruya la vista
		webviewView.onDidDispose(() => {
			configListener.dispose();
		});

		// Listeners para cambios en pestañas (optimización para archivos ligeros)
		vscode.window.tabGroups.onDidChangeTabs(() => {
			// Para archivos ligeros, reducir el debouncing
			this.scheduleUpdate(false, true, 50); // 50ms en lugar de 150ms
		}, this);
		vscode.window.tabGroups.onDidChangeTabGroups(() => {
			this.scheduleUpdate(false, true, 50);
		}, this);

		// Listener específico para cambios de pestaña activa (más directo y rápido)
		vscode.window.onDidChangeActiveTextEditor(() => {
			// Para cambios de editor activo, ejecutar inmediatamente sin throttling
			this.updateActiveTabState();
		});

		// Diagnósticos con mayor debouncing (750ms) para evitar sobrecarga en proyectos pesados
		vscode.languages.onDidChangeDiagnostics(() => this.scheduleDiagnosticsUpdate(), this);
		vscode.workspace.onDidOpenTextDocument(() => this.scheduleUpdate(false, true), this);

		// Listener para mensajes del webview
		webviewView.webview.onDidReceiveMessage(async message => {
			await this.eventManager.handleWebviewMessage(message, () => this.performUpdate());
		});
	}

	/**
	 * Actualiza la vista con detección inteligente de cambios
	 */
	private scheduleUpdate(forceIconRefresh: boolean = false, forceFullUpdate: boolean = false, customDebounce?: number): void {
		// Si se fuerza actualización completa, saltar optimizaciones
		if (forceFullUpdate || forceIconRefresh) {
			this.scheduleFullUpdate(forceIconRefresh, customDebounce);
			return;
		}

		// Primero intentar actualización rápida solo del estado activo
		if (this.updateActiveTabState()) {
			// Si solo cambió el estado activo, no necesitamos regenerar todo el HTML
			return;
		}

		// Verificar si necesitamos actualización completa
		if (this.needsFullUpdate()) {
			this.scheduleFullUpdate(forceIconRefresh, customDebounce);
		}
	}

	/**
	 * Programa una actualización completa del webview
	 */
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

	/**
	 * Programa actualizaciones de diagnósticos con mayor debouncing
	 */
	private scheduleDiagnosticsUpdate(): void {
		// Si ya hay una actualización de diagnósticos programada, cancelarla
		if (this.diagnosticsTimeout) {
			clearTimeout(this.diagnosticsTimeout);
		}

		// Programar actualización con debouncing de 750ms para diagnósticos
		this.diagnosticsTimeout = setTimeout(() => {
			this.scheduleUpdate(false, false);
		}, 750);
	}

	/**
	 * Realiza la actualización real de la vista
	 */
	private async performUpdate(forceIconRefresh: boolean = false): Promise<void> {
		if (this.isUpdating) {
			this.pendingUpdate = true;
			return;
		}

		this.isUpdating = true;
		this.pendingUpdate = false;

		try {
			await this.updateView(forceIconRefresh);
		} finally {
			this.isUpdating = false;

			// Si había una actualización pendiente, programarla
			if (this.pendingUpdate) {
				this.scheduleUpdate(forceIconRefresh, true);
			}
		}
	}

	/**
	 * Inicializa el sistema de iconos
	 */
	private initializeIcons(): void {
		this.iconManager.buildIconMap(this._context!).catch(err => {
			console.error('[SideTabs] Error al construir mapa de iconos:', err);
		});
	}

	/**
	 * Actualiza la vista del webview
	 */
	private async updateView(forceIconRefresh: boolean = false): Promise<void> {
		if (!this._view || !this._context) {
			return;
		}

		try {
			// Obtener todas las pestañas con metadatos
			const allTabs = this.tabManager.getAllTabsWithMetadata();

			// Mejorar languageId para pestañas que no lo tienen
			for (const tabInfo of allTabs) {
				if (!tabInfo.languageId) {
					const fileName = this.tabManager.getFileName(tabInfo.tab);
					if (fileName) {
						tabInfo.languageId = this.tabManager.inferLanguageId(fileName);
					}
				}
			}

			// Generar y establecer el HTML
			const htmlContent = await this.uiManager.generateHTML(
				this._view.webview,
				allTabs,
				this._context
			);

			this._view.webview.html = htmlContent;

			// Precargar iconos en segundo plano si es necesario
			if (forceIconRefresh) {
				this.preloadIconsInBackground(forceIconRefresh);
			}
		} catch (error) {
			console.error('[SideTabs] Error al actualizar la vista:', error);
			this._view.webview.html = `<html><body><h3>Error cargando SideTabs</h3><p>${error}</p></body></html>`;
		}
	}
}
