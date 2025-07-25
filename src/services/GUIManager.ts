import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TabInfo } from './TabManager';
import { TabIconManager } from './TabIconManager';
import { TabDiagnosticsManager } from './TabDiagnosticsManager';
import iconUtils from './utils/iconsUtils';
import { renderTab, renderDiagnostics } from './templates/TabTemplate';
import { renderBaseTemplate } from './templates/BaseTemplate';
import { renderIconInitializationScript } from './templates/IconsTemplate';

// = Extiende la interfaz TabInfo para la GUI
interface GUITabInfo extends TabInfo {
	resourceUri?: vscode.Uri;
	label: string;
	isActive: boolean;
	isDirty: boolean;
	index: number;
}

// = Genera el HTML 
export class GUIManager {
	private iconManager: TabIconManager;
	private diagnosticsManager: TabDiagnosticsManager;
	private readonly _consoleId: string = "[SideTabs | GUIManager] ";

	constructor(iconManager: TabIconManager, diagnosticsManager: TabDiagnosticsManager) {
		this.iconManager = iconManager;
		this.diagnosticsManager = diagnosticsManager;
	}

	/// Genera el HTML base para el webview usando la plantilla
	public generateBaseHTML(
		extensionUri: vscode.Uri,
		context: vscode.ExtensionContext,
		webview: vscode.Webview,
		tabsHtml: string,
		fontSize: number,
		tabHeight: number
	): string {
		const uris = this.getWebviewResourceUris(context, webview);
		const cspSource = webview.cspSource;
		return renderBaseTemplate({
			uris: {
				mainStyle: uris.mainStyle,
				mainScript: uris.mainScript,
				styles: {
					tabs: uris.styles.tabs,
					tabComponents: uris.styles.tabComponents,
					diagnostics: uris.styles.diagnostics,
					dragDropAnimation: uris.styles.dragDropAnimation
				},
				scripts: {
					dragDropManager: uris.scripts.dragDropManager,
					tabDataModel: uris.scripts.tabDataModel
				}
			},
			tabsHtml,
			fontSize,
			tabHeight,
			cspSource
		});
	}

	/// Genera el HTML completo para el webview usando la plantilla base
	public async generateFullWebviewHTML(
		extensionUri: vscode.Uri,
		context: vscode.ExtensionContext,
		webview: vscode.Webview,
		tabsData: GUITabInfo[],
		forceIconRefresh: boolean = false
	): Promise<string> {
		const config = vscode.workspace.getConfiguration('sidetabs');
		const showDirectoryPath = config.get<boolean>('showFullPath', true);
		const fontSize = config.get<number>('fontSize', 12);
		const tabHeight = config.get<number>('tabHeight', 32);

		const uris = this.getWebviewResourceUris(context, webview);

		const tabsHTML = await this.generateTabsHTML(
			tabsData,
			context,
			showDirectoryPath,
			fontSize,
			webview
		);

		// Usa la plantilla base centralizada
		let html = renderBaseTemplate({
			uris: {
				mainStyle: uris.mainStyle,
				mainScript: uris.mainScript,
				styles: {
					tabs: uris.styles.tabs,
					tabComponents: uris.styles.tabComponents,
					diagnostics: uris.styles.diagnostics,
					dragDropAnimation: uris.styles.dragDropAnimation
				},
				scripts: {
					dragDropManager: uris.scripts.dragDropManager,
					tabDataModel: uris.scripts.tabDataModel
				}
			},
			tabsHtml: tabsHTML,
			fontSize,
			tabHeight,
			cspSource: webview.cspSource
		});

		const iconScript = await this.createIconInitializationScript(context);
		const debugInfo = `
			<script>
				console.log('[SideTabs Debug] CSS URI: ${uris.mainStyle.replace(/\\/g, '\\\\')}');
				console.log('[SideTabs Debug] JS URI: ${uris.mainScript.replace(/\\/g, '\\\\')}');
				console.log('[SideTabs Debug] EventsBridge URI: ${uris.scripts.eventsBridge.replace(/\\/g, '\\\\')}');
				console.log('[SideTabs Debug] TabDataModel URI: ${uris.scripts.tabDataModel.replace(/\\/g, '\\\\')}');
			</script>
		`;
		// Inserta debugInfo y iconScript antes de </head>
		html = html.replace('</head>', `${debugInfo}${iconScript}\n</head>`);

		console.log(this._consoleId + 'HTML inicio:', html.slice(0, 1000));
		console.log(this._consoleId + 'HTML fin:', html.slice(-1000));
		return html;
	}

	/// Genera el contenido HTML del webview con todas las URIs seguras (legacy, para compatibilidad)
	public async generateWebviewContent(context: vscode.ExtensionContext, webview: vscode.Webview, tabs: GUITabInfo[]): Promise<string> {
		const htmlPath = vscode.Uri.joinPath(context.extensionUri, 'webview', 'sidetabs.html').fsPath;
		let html = fs.readFileSync(htmlPath, 'utf8');

		const uris = this.getWebviewResourceUris(context, webview);

		const tabsHtml = await this.generateTabsHTML(tabs, context, true, 13, webview);

		console.log(this._consoleId + 'CSS path: f:SideTabswebviewsidetabs.css, exists:', fs.existsSync(vscode.Uri.joinPath(context.extensionUri, 'webview', 'sidetabs.css').fsPath));
		console.log(this._consoleId + 'CSS URI generado:', uris.mainStyle);
		console.log(this._consoleId + 'Reemplazando placeholders. CSS URI:', uris.mainStyle);

		html = html.replace(/\{\{mainStyleUri\}\}/g, uris.mainStyle);
		html = html.replace(/\{\{mainScriptUri\}\}/g, uris.mainScript);
		html = html.replace(/PLACEHOLDER_TABS_CONTENT/g, tabsHtml);

		console.log(this._consoleId + 'HTML inicio:', html.substring(0, 1000));
		console.log(this._consoleId + 'HTML fin:', html.substring(html.length - 1000));
		return html;
	}

	/**
	 * Genera el HTML para todas las pestañas usando las plantillas centralizadas.
	 * Por cada pestaña, obtiene el icono, los diagnósticos y la ruta de carpeta,
	 * y utiliza las plantillas para renderizar el HTML de la pestaña y sus diagnósticos.
	 * @param allTabs - Lista de pestañas a mostrar
	 * @param context - Contexto de la extensión
	 * @param showDirectoryPath - Si se debe mostrar la ruta de la carpeta
	 * @param fontSize - Tamaño de fuente para la UI
	 * @param webview - Instancia opcional del webview para URIs
	 * @returns HTML de todas las pestañas
	 */
	public async generateTabsHTML(
		allTabs: (TabInfo & {
			resourceUri?: vscode.Uri,
			label: string,
			isActive: boolean,
			isDirty: boolean,
			index: number
		})[],
		context: vscode.ExtensionContext,
		showDirectoryPath: boolean,
		fontSize: number,
		webview?: vscode.Webview
	): Promise<string> {
		// Si no hay pestañas, retorna vacío
		if (!allTabs || allTabs.length === 0) {
			return ''; // No hay pestañas para mostrar
		}

		let html = '';
		// Procesa cada pestaña individualmente
		for (const tab of allTabs) {
			// Obtiene el icono en base64 o la URL del icono
			const iconBase64 = await this.iconManager.getFileIconAsBase64(
				tab.label,
				context,
				undefined
			);
			const iconUrl = iconBase64 || await iconUtils.getIconUrlForFile(tab.resourceUri, tab.label, context, webview);

			// Obtiene los diagnósticos (errores, warnings, infos) para la pestaña
			const diagnostics = tab.resourceUri ?
				await this.diagnosticsManager.getDiagnostics(tab.resourceUri) :
				{ errors: 0, warnings: 0, infos: 0, hints: 0 };

			// Obtiene la ruta de la carpeta para mostrar debajo del nombre del archivo
			const folderPath = this.getFolderPath(tab.resourceUri, showDirectoryPath);

			// Renderiza el HTML de los diagnósticos usando la plantilla centralizada
			const diagnosticsHtml = renderDiagnostics({
				errors: diagnostics.errors,
				warnings: diagnostics.warnings,
				infos: diagnostics.infos
			});

			// Renderiza el HTML de la pestaña usando la plantilla centralizada
			html += renderTab({
				uniqueId: tab.uniqueId,
				iconPath: iconUrl,
				label: tab.label,
				directory: folderPath,
				isActive: tab.isActive,
				isDirty: tab.isDirty,
				diagnostics: {
					errors: diagnostics.errors,
					warnings: diagnostics.warnings,
					infos: diagnostics.infos
				},
				diagnosticsLevel: diagnostics.errors > 0 ? 'error' : diagnostics.warnings > 0 ? 'warning' : diagnostics.infos > 0 ? 'info' : undefined
			});
		}

		return html;
	}

	/// Crea el script de inicialización de iconos usando la plantilla
	public async createIconInitializationScript(context: vscode.ExtensionContext): Promise<string> {
		await this.iconManager.buildIconMap(context);
		const iconMap = (this.iconManager as any)._iconMap as Record<string, string> || {};
		const fileIconMap: Record<string, string> = {};
		Object.entries(iconMap).forEach(([key, value]) => {
			fileIconMap[key] = value as string;
		});
		return renderIconInitializationScript(iconMap, fileIconMap);
	}

	// === PUBLIC API: MESSAGES ===

	/// Genera un mensaje para actualizar solo el estado activo de las pestañas
	public generateActiveTabUpdateMessage(activeTabUniqueId: string | undefined): any {
		return {
			type: 'updateActiveTab',
			activeTabId: activeTabUniqueId
		};
	}

	// === RESOURCE/UTILITY METHODS ===

	/// Centraliza la generación de URIs de recursos para el webview.
	private getWebviewResourceUris(context: vscode.ExtensionContext, webview: vscode.Webview) {
		const getUri = (relativePath: string) =>
			webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'webview', relativePath)).toString();

		return {
			mainStyle: getUri('sidetabs.css'),
			mainScript: getUri('sidetabs.js'),
			styles: {
				tabs: getUri('css/tabs.css'),
				tabComponents: getUri('css/tab-components.css'),
				diagnostics: getUri('css/diagnostics.css'),
				dragDrop: getUri('css/drag-drop.css'),
				dragDropAnimation: getUri('css/drag-drop-animation.css'),
				actions: getUri('css/actions.css'),
			},
			scripts: {
				eventsBridge: getUri('js/eventsBridge.js'),
				tabDataModel: getUri('js/tabDataModel.js'),
				dragDropManager: getUri('js/dragDropManager.js')
			}
		};
	}

	/// Obtiene la URI de un asset de la extensión
	private getAssetUri(assetPath: string, context: vscode.ExtensionContext, webview?: vscode.Webview): string {
		if (webview) {
			return webview.asWebviewUri(
				vscode.Uri.joinPath(context.extensionUri, 'webview', 'assets', 'svg', assetPath)
			).toString();
		}
		return `vscode-resource:${context.extensionUri.path}/webview/assets/svg/${assetPath}`;
	}

	// === PRIVATE HELPERS ===

	/// Obtiene la ruta para mostrar debajo del nombre del archivo
	private getFolderPath(uri: vscode.Uri | undefined, showDirectoryPath: boolean): string {
		if (!uri || !showDirectoryPath) return '';

		try {
			//* Obtiene la parte del workspace para mostrarla de forma relativa
			const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);

			if (workspaceFolder) {
				// Obtiene ruta relativa al workspace
				const relativePath = path.relative(
					workspaceFolder.uri.fsPath,
					path.dirname(uri.fsPath)
				);

				if (relativePath === '') {
					// Si está directamente en la raíz del workspace
					return '';
				} else {
					// Combina el nombre del workspace con la ruta relativa
					return `${this.breakLongPath(relativePath)}`;
				}
			} else {
				// Si no hay workspace, muestra la ruta de carpeta
				return this.breakLongPath(path.dirname(uri.fsPath));
			}
		} catch (error) {
			console.error(this._consoleId + 'Error al obtener ruta de carpeta:', error);
			return '';
		}
	}

	/// Mejora el quebrado de líneas en rutas para tooltips
	private breakLongPath(path: string): string {
		if (!path) return '';
		if (path.length <= 48) return path;
		const lastSlash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
		if (lastSlash > 0 && lastSlash < path.length - 1) {
			return path.slice(0, lastSlash + 1) + '<br>' + path.slice(lastSlash + 1);
		}
		return path;
	}

	/// Método público para renderizar diagnósticos usando TabTemplate
	public renderDiagnosticsHtml(diagnostics: { errors: number, warnings: number, infos: number }): string {
		return renderDiagnostics(diagnostics);
	}
}
