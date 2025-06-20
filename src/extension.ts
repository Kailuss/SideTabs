import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

class SideTabsPanelViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'sideTabsPanelView';
	private customOrder: string[] = []; // Orden personalizado de las pestañas
	private readonly _extensionUri: vscode.Uri;
	private _context: vscode.ExtensionContext | undefined;
	private _view: vscode.WebviewView | undefined;

	constructor(extensionUri: vscode.Uri, context?: vscode.ExtensionContext) {
		this._extensionUri = extensionUri;
		if (context) this._context = context;
	}

	public async showTabContextMenu(tab: vscode.Tab): Promise<void> {
		// Primero enfocamos la pestaña
		if (tab.input instanceof vscode.TabInputText) {
			await vscode.window.showTextDocument(tab.input.uri);
		}
		// Mostrar QuickPick con opciones
		const items: vscode.QuickPickItem[] = [
			{ label: "Cerrar", description: "Cierra esta pestaña" },
			{ label: "Cerrar otras", description: "Cierra todas las pestañas menos esta" },
			{ label: "Cerrar todas", description: "Cierra todas las pestañas" },
			{ label: "Separador", kind: vscode.QuickPickItemKind.Separator },
			{ label: "Dividir editor", description: "Divide el editor con esta pestaña" },
			{ label: "Copiar ruta", description: "Copia la ruta del archivo al portapapeles" }
		];

		const selected = await vscode.window.showQuickPick(items, {
			placeHolder: `Acciones para ${tab.label}`
		});

		if (selected) {
			switch (selected.label) {
				case "Cerrar":
					await vscode.window.tabGroups.close(tab);
					break;
				case "Cerrar otras":
					for (const group of vscode.window.tabGroups.all) {
						for (const t of group.tabs) {
							if (t !== tab) {
								await vscode.window.tabGroups.close(t);
							}
						}
					}
					break;
				case "Cerrar todas":
					for (const group of vscode.window.tabGroups.all) {
						for (const t of group.tabs) {
							await vscode.window.tabGroups.close(t);
						}
					}
					break;
				case "Dividir editor":
					await vscode.commands.executeCommand('workbench.action.splitEditor');
					break;
				case "Copiar ruta":
					if (tab.input instanceof vscode.TabInputText) {
						await vscode.env.clipboard.writeText(tab.input.uri.fsPath);
						vscode.window.showInformationMessage('Ruta copiada al portapapeles');
					}
					break;
			}
		}
	}

	resolveWebviewView(webviewView: vscode.WebviewView) {
		console.log('[SideTabs] resolveWebviewView INVOCADO');
		this._view = webviewView; // Guardar referencia a la vista
		// Asegurarse de incluir la carpeta de iconos explícitamente
		const iconsDir = vscode.Uri.joinPath(this._context!.globalStorageUri, 'icons');
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode', 'codicons', 'dist'),
				this._context!.globalStorageUri,
				iconsDir // Añadido explícitamente
			]
		};

		// Añadir escucha para cambios de configuración
		const configListener = vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('sidetabs')) {
				update();
			}
		});

		// Asegurar que el listener se elimine cuando se destruya la vista
		webviewView.onDidDispose(() => {
			configListener.dispose();
		});

		const update = async () => {
			try {
				// Precargar iconos antes de renderizar el HTML
				const tabGroups = vscode.window.tabGroups.all;
				const allTabsFlat: vscode.Tab[] = [];
				for (const group of tabGroups) {
					for (const tab of group.tabs) {
						allTabsFlat.push(tab);
					}
				}
				let needsRetry = false;
				for (const tab of allTabsFlat) {
					if (tab.input instanceof vscode.TabInputText) {
						const input = tab.input as vscode.TabInputText;
						const fileName = input.uri.path.split('/').pop() || '';
						let doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === input.uri.toString());
						let languageId = doc?.languageId;
						// Si no hay languageId, intentar abrir el documento en background SOLO si el archivo existe
						if (!languageId && input.uri.scheme === 'file' && fs.existsSync(input.uri.fsPath)) {
							try {
								doc = await vscode.workspace.openTextDocument(input.uri);
								languageId = doc.languageId;
							} catch (e) {
								needsRetry = true;
							}
						}
						const cacheKey = `${fileName}|${languageId || ''}`;
						if (!this._iconCache.has(cacheKey)) {
							const iconBase64 = await this.getFileIconAsBase64(fileName, this._context!, languageId);
							if (iconBase64) {
								this._iconCache.set(cacheKey, iconBase64);
							}
						}
					}
				}
				webviewView.webview.html = await this.getHtml(webviewView.webview);
				// Si algún languageId no estaba disponible, reintentar tras 500ms
				if (needsRetry) {
					setTimeout(() => { update(); }, 500);
				}
			} catch (error) {
				console.error('[SideTabs] Error al actualizar la vista:', error);
				webviewView.webview.html = `<html><body><h3>Error al cargar SideTabs</h3><p>${error}</p></body></html>`;
			}
		};
		// Función para reintentar tras 1 segundo solo al cargar el panel
		const updateWithRetry = async () => {
			await update();
			setTimeout(() => { update(); }, 1000);
		};
		updateWithRetry();
		vscode.window.tabGroups.onDidChangeTabs(update, this);
		vscode.window.tabGroups.onDidChangeTabGroups(update, this);
		vscode.languages.onDidChangeDiagnostics(update, this);
		// Nuevo: actualizar cuando se abre un documento
		vscode.workspace.onDidOpenTextDocument(() => update(), this);
		webviewView.webview.onDidReceiveMessage(async message => {
			const tabGroups = vscode.window.tabGroups.all;

			if (message.command === 'move') {
				// Mover pestaña en nuestro orden personalizado
				const sourceIndex = this.customOrder.indexOf(message.label);
				if (sourceIndex === -1) return;

				// Remover la pestaña de su posición actual
				this.customOrder.splice(sourceIndex, 1);

				if (message.targetLabel) {
					// Nuevo sistema de drag & drop
					const targetIndex = this.customOrder.indexOf(message.targetLabel);
					if (targetIndex !== -1) {
						const newIndex = message.position === 'before' ? targetIndex : targetIndex + 1;
						this.customOrder.splice(newIndex, 0, message.label);
					}
				} else if (message.direction) {
					// Sistema antiguo de botones
					if (message.direction === 'up' && sourceIndex > 0) {
						this.customOrder.splice(sourceIndex - 1, 0, message.label);
					} else if (message.direction === 'down') {
						this.customOrder.splice(sourceIndex + 1, 0, message.label);
					} else {
						this.customOrder.splice(sourceIndex, 0, message.label);
					}
				}

				// Actualizar la vista
				await update();
				return;
			}

			for (const group of tabGroups) {
				for (const tab of group.tabs) {
					if (tab.label === message.label) {
						if (message.command === 'close') {
							await vscode.window.tabGroups.close(tab);
						} else if (message.command === 'showContextMenu') {
							// Primero enfocamos la pestaña para darle contexto
							if (tab.input instanceof vscode.TabInputText) {
								await vscode.window.showTextDocument(tab.input.uri);
							} else {
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

							// Usar menú nativo de VS Code con opciones personalizadas
							try {
								// Mostrar un menú personalizado usando QuickPick
								const items: vscode.QuickPickItem[] = [
									{ label: "Cerrar", description: "Cierra esta pestaña" },
									{ label: "Cerrar otras", description: "Cierra todas las pestañas menos esta" },
									{ label: "Cerrar todas", description: "Cierra todas las pestañas" },
									{ label: "Separador", kind: vscode.QuickPickItemKind.Separator },
									{ label: "Dividir editor", description: "Divide el editor con esta pestaña" },
									{ label: "Copiar ruta", description: "Copia la ruta del archivo al portapapeles" }
								];

								// Mostrar el menú de opciones
								const selected = await vscode.window.showQuickPick(items, {
									placeHolder: `Acciones para ${tab.label}`
								});

								// Procesar la selección
								if (selected) {
									switch (selected.label) {
										case "Cerrar":
											await vscode.window.tabGroups.close(tab);
											break;
										case "Cerrar otras":
											// Cerrar todas menos la actual
											for (const g of vscode.window.tabGroups.all) {
												for (const t of g.tabs) {
													if (t.label !== tab.label) {
														await vscode.window.tabGroups.close(t);
													}
												}
											}
											break;
										case "Cerrar todas":
											// Cerrar todas
											for (const g of vscode.window.tabGroups.all) {
												for (const t of g.tabs) {
													await vscode.window.tabGroups.close(t);
												}
											}
											break;
										case "Dividir editor":
											await vscode.commands.executeCommand('workbench.action.splitEditor');
											break;
										case "Copiar ruta":
											// Copiar la ruta al portapapeles si es un archivo
											if (tab.input instanceof vscode.TabInputText) {
												await vscode.env.clipboard.writeText(tab.input.uri.fsPath);
												vscode.window.showInformationMessage('Ruta copiada al portapapeles');
											}
											break;
									}
								}
							} catch (e) {
								console.error('[SideTabs] Error al mostrar menú contextual:', e);
								vscode.window.showErrorMessage('Error al mostrar el menú contextual');
							}

						} else if (message.command === 'focus') {
							// Para archivos de texto, usar la API oficial
							if (tab.input instanceof vscode.TabInputText) {
								await vscode.window.showTextDocument(tab.input.uri);
							} else {
								// Para otros tipos (SVG, imágenes, etc), usar el comando interno de VS Code
								// que cambia a una pestaña por su índice en el grupo
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
				}
			}
		});
	}

	private async copyIconToStorage(absIconPath: string, fileName: string, context: vscode.ExtensionContext): Promise<string | undefined> {
		try {
			if (!fs.existsSync(absIconPath)) return undefined;
			const storageDir = path.join(context.globalStorageUri.fsPath, 'icons');
			if (!fs.existsSync(storageDir)) {
				fs.mkdirSync(storageDir, { recursive: true });
			}
			const destPath = path.join(storageDir, fileName);
			if (!fs.existsSync(destPath)) {
				fs.copyFileSync(absIconPath, destPath);
			}
			return destPath;
		} catch {
			return undefined;
		}
	}

	// Mapeo global de iconos por extensión, nombre y languageId
	private _iconMap: Record<string, string> | null = null;
	private _iconThemeId: string | null = null;
	private _iconThemePath: string | null = null;
	private _iconThemeJson: any = null;
	private _iconCache: Map<string, string> = new Map(); // Caché de iconos por filename+languageId

	// Precarga los iconos para todos los archivos abiertos (ahora público)
	public async preloadAllIcons(tabs: vscode.Tab[], context: vscode.ExtensionContext): Promise<void> {
		for (const tab of tabs) {
			if (tab.input instanceof vscode.TabInputText) {
				const input = tab.input as vscode.TabInputText;
				const fileName = input.uri.path.split('/').pop() || '';
				let doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === input.uri.toString());
				let languageId = doc?.languageId;
				if (!languageId) {
					const ext = fileName.split('.').pop()?.toLowerCase();
					if (ext) {
						const conf = vscode.workspace.getConfiguration('files.associations');
						if (conf && conf[`.${ext}`]) {
							languageId = conf[`.${ext}`];
						}
					}
				}
				// Precarga usando la misma lógica de caché que el render
				await this.getIconForFile(fileName, context, languageId);
			}
		}
	}

	// Obtiene un icono de la caché o lo carga si no existe
	private async getIconForFile(fileName: string, context: vscode.ExtensionContext, languageId?: string): Promise<string | undefined> {
		// Primero intentamos por nombre
		let cacheKey = `name:${fileName.toLowerCase()}`;
		if (this._iconCache.has(cacheKey)) {
			return this._iconCache.get(cacheKey);
		}
		// Luego por extensión
		const ext = fileName.split('.').pop()?.toLowerCase() || '';
		cacheKey = `ext:${ext}`;
		if (this._iconCache.has(cacheKey)) {
			return this._iconCache.get(cacheKey);
		}
		// Luego por languageId si está definido
		if (languageId) {
			cacheKey = `lang:${languageId.toLowerCase()}`;
			if (this._iconCache.has(cacheKey)) {
				return this._iconCache.get(cacheKey);
			}
		}
		// Si no está en caché, lo buscamos y lo guardamos con la clave adecuada
		const iconBase64 = await this.getFileIconAsBase64(fileName, context, languageId);
		if (iconBase64) {
			// Guardar en caché por el primer criterio que se resuelva
			if (this._iconMap && this._iconMap[`name:${fileName.toLowerCase()}`]) {
				this._iconCache.set(`name:${fileName.toLowerCase()}`, iconBase64);
			} else if (this._iconMap && this._iconMap[`ext:${ext}`]) {
				this._iconCache.set(`ext:${ext}`, iconBase64);
			} else if (languageId && this._iconMap && this._iconMap[`lang:${languageId.toLowerCase()}`]) {
				this._iconCache.set(`lang:${languageId.toLowerCase()}`, iconBase64);
			} else {
				this._iconCache.set(`default`, iconBase64);
			}
		}
		return iconBase64;
	}

	private async buildIconMap(context: vscode.ExtensionContext): Promise<void> {
		const config = vscode.workspace.getConfiguration();
		const iconTheme = config.get<string>('workbench.iconTheme');
		if (!iconTheme) return;
		if (this._iconThemeId === iconTheme && this._iconMap) return; // Ya está construido

		const ext = vscode.extensions.all.find(e =>
			e.packageJSON.contributes?.iconThemes?.some((t: any) => t.id === iconTheme)
		);
		if (!ext) return;
		const themeContribution = ext.packageJSON.contributes.iconThemes.find((t: any) => t.id === iconTheme);
		if (!themeContribution) return;
		const themePath = path.join(ext.extensionPath, themeContribution.path);
		if (!fs.existsSync(themePath)) return;
		const themeJson = JSON.parse(fs.readFileSync(themePath, 'utf8'));

		this._iconThemeId = iconTheme;
		this._iconThemePath = themePath;
		this._iconThemeJson = themeJson;
		const iconMap: Record<string, string> = {};

		// Mapear nombres de archivo
		if (themeJson.fileNames) {
			for (const name in themeJson.fileNames) {
				iconMap[`name:${name.toLowerCase()}`] = themeJson.fileNames[name];
			}
		}
		// Mapear extensiones
		if (themeJson.fileExtensions) {
			for (const ext in themeJson.fileExtensions) {
				iconMap[`ext:${ext.toLowerCase()}`] = themeJson.fileExtensions[ext];
			}
		}
		// Mapear languageIds
		if (themeJson.languageIds) {
			for (const lang in themeJson.languageIds) {
				iconMap[`lang:${lang.toLowerCase()}`] = themeJson.languageIds[lang];
			}
		}
		this._iconMap = iconMap;
	}

	private async getFileIconAsBase64(fileName: string, context: vscode.ExtensionContext, languageId?: string): Promise<string | undefined> {
		try {
			await this.buildIconMap(context);
			if (!this._iconMap || !this._iconThemeJson) return undefined;
			const themeJson = this._iconThemeJson;
			const fileNameLower = fileName.toLowerCase();
			const extName = fileNameLower.split('.').pop() || '';
			let iconId: string | undefined = undefined;

			// 1. Buscar por nombre de archivo exacto
			if (this._iconMap[`name:${fileNameLower}`]) {
				iconId = this._iconMap[`name:${fileNameLower}`];
			}
			// 2. Buscar por extensión
			if (!iconId && this._iconMap[`ext:${extName}`]) {
				iconId = this._iconMap[`ext:${extName}`];
			}
			// 3. Buscar por languageId SIEMPRE si no hay por nombre ni extensión
			if (!iconId && languageId && this._iconMap[`lang:${languageId.toLowerCase()}`]) {
				iconId = this._iconMap[`lang:${languageId.toLowerCase()}`];
			}
			// 4. Fallback: icono de archivo por defecto
			if (!iconId) {
				if (themeJson.iconDefinitions && themeJson.iconDefinitions._file) {
					iconId = '_file';
				} else if (themeJson.iconDefinitions && themeJson.iconDefinitions.file) {
					iconId = 'file';
				} else {
					for (const key in themeJson.iconDefinitions) {
						if (key.toLowerCase().includes('file') && !key.toLowerCase().includes('folder')) {
							iconId = key;
							break;
						}
					}
				}
			}
			if (!iconId || !themeJson.iconDefinitions) {
				return undefined;
			}
			const iconDef = themeJson.iconDefinitions[iconId];
			if (!iconDef) {
				return undefined;
			}
			let iconPath = iconDef.iconPath || iconDef.path;
			if (!iconPath) {
				return undefined;
			}
			const absIconPath = path.join(path.dirname(this._iconThemePath!), iconPath);
			if (!fs.existsSync(absIconPath)) {
				return undefined;
			}
			const fileData = fs.readFileSync(absIconPath);
			const base64Data = fileData.toString('base64');
			const isSvg = absIconPath.toLowerCase().endsWith('.svg');
			const mimeType = isSvg ? 'image/svg+xml' : 'image/png';
			const dataUri = `data:${mimeType};base64,${base64Data}`;
			return dataUri;
		} catch (e) {
			return undefined;
		}
	}

	private async getProblems(uri: vscode.Uri): Promise<{ errors: number, warnings: number, infos: number, hints: number }> {
		const diagnostics = vscode.languages.getDiagnostics(uri);
		let errors = 0;
		let warnings = 0;
		let infos = 0;
		let hints = 0;

		for (const diagnostic of diagnostics) {
			if (diagnostic.severity === vscode.DiagnosticSeverity.Error) {
				errors++;
			} else if (diagnostic.severity === vscode.DiagnosticSeverity.Warning) {
				warnings++;
			} else if (diagnostic.severity === vscode.DiagnosticSeverity.Information) {
				infos++;
			} else if (diagnostic.severity === vscode.DiagnosticSeverity.Hint) {
				hints++;
			}
		}

		return { errors, warnings, infos, hints };
	}

	// Hacer el método getHtml público para poder actualizarlo
	public async getHtml(webview: vscode.Webview): Promise<string> {
		const tabGroups = vscode.window.tabGroups.all;
		const context = this._context!;

		// Obtener configuraciones
		const config = vscode.workspace.getConfiguration('sidetabs');
		const fontSize = config.get<number>('fontSize', 14);
		const tabHeight = config.get<number>('tabHeight', 40);
		const showDirectoryPath = config.get<boolean>('showDirectoryPath', true);

		// Crear una lista de todas las pestañas para precargar los iconos
		const allTabsFlat: vscode.Tab[] = [];
		for (const group of tabGroups) {
			for (const tab of group.tabs) {
				allTabsFlat.push(tab);
			}
		}

		// Precargar TODOS los iconos antes de generar el HTML
		await this.preloadAllIcons(allTabsFlat, context);

		// Recopilar todas las pestañas con metadatos
		const allTabs: { tab: vscode.Tab, group: vscode.TabGroup, languageId?: string }[] = [];
		for (const group of tabGroups) {
			for (const tab of group.tabs) {
				let languageId: string | undefined = undefined;
				if (tab.input instanceof vscode.TabInputText) {
					const input = tab.input as vscode.TabInputText;
					const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === input.uri.toString());
					if (doc) {
						languageId = doc.languageId;
					}
				}
				allTabs.push({ tab, group, languageId });
				// Añadir al orden personalizado si no está
				if (!this.customOrder.includes(tab.label)) {
					this.customOrder.push(tab.label);
				}
			}
		}

		// Remover del orden personalizado las pestañas que ya no existen
		this.customOrder = this.customOrder.filter(label =>
			allTabs.some(item => item.tab.label === label)
		);

		// Ordenar pestañas según el orden personalizado
		allTabs.sort((a, b) => {
			const indexA = this.customOrder.indexOf(a.tab.label);
			const indexB = this.customOrder.indexOf(b.tab.label);
			return indexA - indexB;
		});

		// SVGs inline para iconos
		// SVG inline para el botón de cerrar
		const closeSvgInline = `<svg class="close-svg" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;

		// SVG inline para el icono de guardar (color propio SVG)
		const saveSvgBase64 = 'data:image/svg+xml;base64,PHN2ZyBpZD0iQ2FwYV8xIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZlcnNpb249IjEuMSIgdmlld0JveD0iMCAwIDI0IDI0Ij4KICA8ZGVmcz4KICAgIDxzdHlsZT4KICAgICAgLnN0MCB7CiAgICAgICAgZmlsbDogIzYyYTZmODsKICAgICAgfQogICAgPC9zdHlsZT4KICA8L2RlZnM+CiAgPGNpcmNsZSBjbGFzcz0ic3QwIiBjeD0iMTIiIGN5PSIxMiIgcj0iNiIvPgo8L3N2Zz4K';

		let html = `<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<title>Side Tabs Panel</title>
			<style>
			.file-icon { 
				display: inline-block; 
				vertical-align: middle; 
				flex-shrink: 0;
				pointer-events: none;
			}
			body { 
				font-family: var(--vscode-font-family); 
				margin: 0; 
				padding: 0; 
				background: var(--vscode-sideBar-background);
			}
			.tab { 
				display: flex; 
				align-items: center; 
				padding: 8px 12px; 
				border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border); 
				cursor: pointer;
				transition: background-color 0.1s;
				position: relative;
				user-select: none;
				min-height: ${tabHeight}px; /* Altura configurable */
				box-sizing: border-box;
				z-index: 1;
				border-left: 3px solid transparent;
			}
			.tab.dragging {
				opacity: 0.5;
				cursor: move;
			}
			/* Línea de inserción entre pestañas */
			.drop-indicator {
				position: absolute;
				left: 0;
				right: 0;
				height: 2px;
				background-color: var(--vscode-focusBorder);
				pointer-events: none !important;
				z-index: 2;
				display: none;
			}
			.tab.drag-over-top .drop-indicator {
				display: block;
				top: -1px;
			}
			.tab.drag-over-bottom .drop-indicator {
				display: block;
				bottom: -1px;
			}
			.tab.active { 
				background: var(--vscode-list-activeSelectionBackground); 
				color: var(--vscode-list-activeSelectionForeground);
				border-left: 3px solid var(--vscode-focusBorder);
			}
			/* Estilo para la pestaña con menú contextual activo */
			.tab.contextmenu-active {
				background-color: var(--vscode-list-hoverBackground);
				outline: 1px solid var(--vscode-focusBorder);
			}
			.tab .label {
				flex: 1;
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
				color: var(--vscode-foreground);
				transition: color 0.1s;
				font-size: ${fontSize}px; /* Tamaño de fuente configurable */
			}
			.tab .directory {
				opacity: 0.6;
				font-size: ${fontSize}px;
				font-style: italic;
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
			}
			.tab .label.faded {
				color: var(--vscode-sideBarTitle-foreground, #888);
			}
			.tab .label.error {
				color: var(--vscode-errorForeground) !important;
			}
			.tab .label.warning {
				color: var(--vscode-list-warningForeground, var(--vscode-problemsWarningIcon-foreground, #cca700)) !important;
			}
			.tab .label.info {
				color: var(--vscode-notificationsInfoIcon-foreground, var(--vscode-problemsInfoIcon-foreground, #75beff)) !important;
			}
			.tab.active .label {
				color: var(--vscode-list-activeSelectionForeground, #fff);
			}
			.tab.active .label.error,
			.tab.active .label.warning,
			.tab.active .label.info {
				opacity: 1 !important;
			}
			.tab .problems {
				margin-left: 6px;
				font-weight: 500;
				font-size: ${Math.max(fontSize - 1, 12)}px; /* Ajustamos también el tamaño del contador */
			}
			.tab .tab-actions { 
				margin-left: 8px;
				position: relative;
				width: 18px;
				height: 18px;
			}
			.tab .save-icon {
				display: flex;
				align-items: center;
				justify-content: center;
				position: absolute;
				top: 0;
				left: 0;
				transition: opacity 0.2s;
			}
			.tab .save-svg {
				stroke: var(--vscode-sideBarTitle-foreground, #888); /* Color faded en lugar de azul */
				width: 18px;
				height: 18px;
			}
			.tab .close {
				display: none;
				cursor: pointer;
				padding: 0;
				border-radius: 3px;
				background: transparent;
				transition: filter 0.1s, opacity 0.1s;
				opacity: 0.7;
				line-height: 1;
				vertical-align: middle;
				position: absolute;
				top: 0;
				left: 0;
				width: 100%;
				height: 100%;
				display: flex;
				align-items: center;
				justify-content: center;
				opacity: 0;
				transition: opacity 0.2s;
			}
			.tab .close-svg {
				width: 18px;
				height: 18px;
				display: block;
				background: none;
				border: none;
				padding: 0;
				margin: 0;
				stroke: var(--vscode-sideBarTitle-foreground, #888);
				transition: stroke 0.1s;
			}
			.tab:hover .close {
				opacity: 1;
			}
			.tab:hover .save-icon {
				opacity: 0;
			}
			.tab .close:hover .close-svg {
				stroke: var(--vscode-list-activeSelectionForeground, #fff);
				filter: brightness(1.8) saturate(1.2);
			}
			.tab .icon-container {
				position: relative;
				margin-right: 8px;
				width: 16px;
				height: 16px;
				flex-shrink: 0;
			}
			</style>
		</head>
		<body>`;

		// Mejorar la obtención del icono: si no hay languageId, intentar inferirlo por extensión usando los lenguajes registrados
		for (const tabInfo of allTabs) {
			const { tab, group } = tabInfo;
			let languageId = tabInfo.languageId;
			if (!languageId && tab.input instanceof vscode.TabInputText) {
				const fileName = tab.input.uri.path.split('/').pop() || '';
				const ext = fileName.split('.').pop()?.toLowerCase();
				if (ext) {
					const conf = vscode.workspace.getConfiguration('files.associations');
					if (conf && conf[`.${ext}`]) {
						languageId = conf[`.${ext}`];
					}
				}
			}
			tabInfo.languageId = languageId;
		}

		for (const { tab, group, languageId } of allTabs) {
			const isActive = group.activeTab === tab;
			const label = tab.label;
			const isDirty = tab.isDirty;

			// Extraer el directorio del archivo si corresponde
			let directoryPath = '';
			if (showDirectoryPath && tab.input instanceof vscode.TabInputText) {
				const uri = tab.input.uri;
				// Obtener la ruta relativa al workspace
				let relativePath = '';
				if (vscode.workspace.workspaceFolders) {
					const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
					if (workspaceFolder) {
						relativePath = path.relative(workspaceFolder.uri.fsPath, path.dirname(uri.fsPath));
						if (relativePath) {
							directoryPath = relativePath;
						}
					} else {
						// Si no está en ningún workspace, mostrar la ruta absoluta acortada
						const dirName = path.dirname(uri.fsPath);
						const parts = dirName.split(path.sep);
						if (parts.length > 2) {
							directoryPath = path.join(parts[parts.length - 2], parts[parts.length - 1]);
						} else {
							directoryPath = dirName;
						}
					}
				}
			}

			let iconHtml = '<span class="codicon codicon-file"></span>';
			// Mostrar icono para cualquier pestaña con nombre de archivo
			let fileName: string | undefined = undefined;
			if (tab.input instanceof vscode.TabInputText) {
				fileName = tab.input.uri.path.split('/').pop() || '';
			} else if ((tab as any).input && (tab as any).input.uri) {
				try {
					fileName = (tab as any).input.uri.path.split('/').pop() || '';
				} catch { }
			}
			if (fileName) {
				const iconBase64 = await this.getIconForFile(fileName, context, languageId);
				if (iconBase64) {
					iconHtml = `<div class="icon-container">
						<div class="file-icon" style="width:16px;height:16px;background-image:url('${iconBase64}');background-size:contain;background-repeat:no-repeat;background-position:center;position:absolute;z-index:1;"></div>
					</div>`;
				}
			}

			// Determinar la clase del label y el texto de problemas
			let labelClass = isActive ? 'label' : 'label faded';
			let problemsText = '';
			if (tab.input instanceof vscode.TabInputText) {
				const problems = await this.getProblems(tab.input.uri);
				// Solo contar errores, warnings e infos, ignorar hints completamente
				const totalProblems = problems.errors + problems.warnings + problems.infos;
				if (problems.errors > 0) {
					labelClass = 'label error'; // Errores en rojo
					problemsText = `${totalProblems}`;
				} else if (problems.warnings > 0) {
					labelClass = 'label warning'; // Warnings en amarillo
					problemsText = `${totalProblems}`;
				} else if (problems.infos > 0) {
					labelClass = 'label info'; // Info en azul
					problemsText = `${totalProblems}`;
				} else if (!isActive) {
					labelClass = 'label faded';
				}
			} else if (!isActive) {
				labelClass = 'label faded';
			}

			html += `<div class="tab${isActive ? ' active' : ''}"
			data-label="${label}"
			title="${directoryPath ? `${directoryPath}/${label}` : label}"
			draggable="true">
		<div class="click-layer"></div>
		${iconHtml}
		<span class="${labelClass}">
			${label}
			${showDirectoryPath && directoryPath ? `<span class="directory"> • ${directoryPath}</span>` : ''}
			${problemsText ? `<span class="problems">${problemsText}</span>` : ''}
		</span>
		<div class="tab-actions">
			${isDirty ? `<div class="save-icon" title="Archivo con cambios sin guardar"><img src="${saveSvgBase64}" style="width:18px;height:18px;display:block;"/></div>` : ''}
			<span class="close" title="Cerrar pestaña">${closeSvgInline}</span>
		</div>
		<div class="drop-indicator"></div>
	</div>`;
		}

		html += `<script>
	const vscode = acquireVsCodeApi();
	let draggedTab = null;
	let allTabs = Array.from(document.querySelectorAll('.tab'));
	const tabContainer = document.body; // Usar body como contenedor

	// Dragover global para evitar icono prohibido y parpadeo
	document.addEventListener('dragover', e => {
		e.preventDefault();
		e.dataTransfer.dropEffect = 'move';
	}, false);

	// Nuevo: dragover en el contenedor para highlight estable
	tabContainer.addEventListener('dragover', e => {
		if (!draggedTab) return;
		let target = document.elementFromPoint(e.clientX, e.clientY);
		while (target && !target.classList.contains('tab') && target !== tabContainer) {
			target = target.parentElement;
		}
		allTabs.forEach(t => t.classList.remove('drag-over-top', 'drag-over-bottom'));
		if (target && target.classList.contains('tab') && target !== draggedTab) {
			const idx = allTabs.indexOf(target);
			const rect = target.getBoundingClientRect();
			const midY = rect.top + rect.height / 2;
			const isLast = idx === allTabs.length - 1;
			const isAbove = e.clientY < midY;
			if (isLast && !isAbove) {
				target.classList.add('drag-over-bottom');
			} else {
				target.classList.add('drag-over-top');
			}
		}
	});

	// Asignar eventos drag & drop a cada tab
	allTabs.forEach(tab => {
		tab.addEventListener('dragstart', e => {
			draggedTab = tab;
			tab.classList.add('dragging');
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', tab.dataset.label);
		});
		tab.addEventListener('dragend', e => {
			draggedTab = null;
			allTabs.forEach(t => t.classList.remove('dragging', 'drag-over-top', 'drag-over-bottom'));
		});
		tab.addEventListener('drop', e => {
			e.preventDefault();
			allTabs.forEach(t => t.classList.remove('drag-over-top', 'drag-over-bottom'));
			const sourceLabel = e.dataTransfer.getData('text/plain');
			const targetLabel = tab.dataset.label;
			let position = 'before';
			const rect = tab.getBoundingClientRect();
			const midY = rect.top + rect.height / 2;
			if (e.clientY > midY) position = 'after';
			if (sourceLabel && targetLabel && sourceLabel !== targetLabel) {
				vscode.postMessage({ command: 'move', label: sourceLabel, targetLabel, position });
			}
		});
		tab.addEventListener('dragleave', e => {
			tab.classList.remove('drag-over-top', 'drag-over-bottom');
		});

		// Click events para abrir/cerrar pestañas
		tab.addEventListener('click', e => {
			e.stopPropagation();
			const closeBtn = e.target.closest('.close');
			if (closeBtn) {
				vscode.postMessage({ command: 'close', label: tab.dataset.label });
			} else if (e.target.classList.contains('click-layer') || !e.target.classList.contains('move-btn')) {
				vscode.postMessage({ command: 'focus', label: tab.dataset.label });
			}
		});
		
		// Menú contextual para las pestañas
		tab.addEventListener('contextmenu', e => {
			e.preventDefault();
			e.stopPropagation();
			
			// Marcar visualmente la tab actual antes de mostrar el menú contextual
			allTabs.forEach(t => t.classList.remove('contextmenu-active'));
			tab.classList.add('contextmenu-active');
			
			vscode.postMessage({ 
				command: 'showContextMenu', 
				label: tab.dataset.label,
				x: e.clientX,  // Posición X del click
				y: e.clientY   // Posición Y del click
			});
			
			// Eliminar la marca visual después de un tiempo
			setTimeout(() => {
				tab.classList.remove('contextmenu-active');
			}, 1000);
		});
		
		// Específicamente asignar evento a clicklayer para garantizar el enfoque
		const clickLayer = tab.querySelector('.click-layer');
		if (clickLayer) {
			clickLayer.addEventListener('click', e => {
				e.stopPropagation();
				vscode.postMessage({ command: 'focus', label: tab.dataset.label });
			});
		}
	});
</script>`;
		return html + '</body></html>';
	}
}

export function activate(context: vscode.ExtensionContext) {
	console.log('[SideTabs] FUNCIÓN ACTIVATE INVOCADA');

	// Crea el proveedor de vista
	const provider = new SideTabsPanelViewProvider(context.extensionUri, context);
	console.log('[SideTabs] Proveedor creado');

	// Registramos el proveedor de vista
	const disposable = vscode.window.registerWebviewViewProvider(
		SideTabsPanelViewProvider.viewType,
		provider
	);
	context.subscriptions.push(disposable);
	console.log('[SideTabs] Proveedor registrado con ID:', SideTabsPanelViewProvider.viewType);

	// Intentar mostrar la vista automáticamente
	setTimeout(async () => {
		try {
			await vscode.commands.executeCommand('sideTabsPanelView.focus');
		} catch (e) {
			// Silenciar error
		}
	}, 1000);

	// Registramos los comandos para el menú contextual
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
			if (activeTab && provider.showTabContextMenu) {
				await provider.showTabContextMenu(activeTab);
			}
		})
	);

	// Inicialización inmediata de iconos al activar la extensión
	(async () => {
		try {
			// Cargar todos los iconos posibles en el momento de activación
			const allTabs: vscode.Tab[] = [];
			vscode.window.tabGroups.all.forEach(group => {
				group.tabs.forEach(tab => {
					allTabs.push(tab);
				});
			});

			// Usar el mismo proveedor para cargar los iconos
			await provider.preloadAllIcons(allTabs, context);
		} catch (e) {
			// Ignorar errores en la precarga, no son críticos
		}
	})();
}