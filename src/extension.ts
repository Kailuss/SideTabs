import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// Nueva clase para gestionar la localización
class Localization {
	private static _instance: Localization;
	private _strings: { [key: string]: string } = {};

	private constructor() {
		// Cargamos el idioma de VS Code
		this.loadCurrentLanguage();
	}

	public static getInstance(): Localization {
		if (!Localization._instance) {
			Localization._instance = new Localization();
		}
		return Localization._instance;
	}

	private loadCurrentLanguage(): void {
		try {
			// Obtener configuración de idioma de VS Code
			const vscodeLanguage = vscode.env.language || 'en';

			// Definir strings básicos en inglés (por defecto)
			this._strings = {
				// QuickPick ítems
				'close': 'Close',
				'closeDescription': 'Close this tab',
				'closeOther': 'Close others',
				'closeOtherDescription': 'Close all tabs except this one',
				'closeAll': 'Close all',
				'closeAllDescription': 'Close all tabs',
				'separator': 'Separator',
				'splitEditor': 'Split editor',
				'splitEditorDescription': 'Split the editor with this tab',
				'copyPath': 'Copy path',
				'copyPathDescription': 'Copy file path to clipboard',
				'quickPickPlaceholder': 'Actions for {0}',

				// Messages
				'pathCopied': 'Path copied to clipboard',
				'errorLoadingView': 'Error loading SideTabs',
				'unsavedChanges': 'Unsaved changes',
				'closeTab': 'Close tab'
			};

			// Cargar strings en español si es el idioma actual
			if (vscodeLanguage.startsWith('es')) {
				this._strings = {
					// QuickPick ítems
					'close': 'Cerrar',
					'closeDescription': 'Cierra esta pestaña',
					'closeOther': 'Cerrar otras',
					'closeOtherDescription': 'Cierra todas las pestañas menos esta',
					'closeAll': 'Cerrar todas',
					'closeAllDescription': 'Cierra todas las pestañas',
					'separator': 'Separador',
					'splitEditor': 'Dividir editor',
					'splitEditorDescription': 'Divide el editor con esta pestaña',
					'copyPath': 'Copiar ruta',
					'copyPathDescription': 'Copia la ruta del archivo al portapapeles',
					'quickPickPlaceholder': 'Acciones para {0}',
					// Messages
					'pathCopied': 'Ruta copiada al portapapeles',
					'errorLoadingView': 'Error al cargar SideTabs',
					'unsavedChanges': 'Archivo con cambios sin guardar',
					'closeTab': 'Cerrar pestaña'
				};
			}
		} catch (error) {
			console.error('[SideTabs] Error loading localization:', error);
		}
	}

	public getLocaleString(key: string, ...args: any[]): string {
		let text = this._strings[key] || key;

		// Reemplazar parámetros si se proporcionan
		if (args && args.length > 0) {
			args.forEach((arg, index) => {
				text = text.replace(`{${index}}`, arg);
			});
		}

		return text;
	}
}

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

		// Obtenemos las traducciones
		const localize = Localization.getInstance().getLocaleString;

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
			const localize = Localization.getInstance().getLocaleString;

			switch (selected.label) {
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

		// Definimos el mapa de iconos una sola vez durante la inicialización
		this.buildIconMap(this._context!).catch(err => {
			console.error('[SideTabs] Error al construir mapa de iconos:', err);
		});

		const update = async (forceIconRefresh: boolean = false) => {
			try {
				// OPTIMIZACIÓN: Renderizar primero la interfaz sin esperar a cargar todos los iconos
				webviewView.webview.html = await this.getHtml(webviewView.webview);

				// Luego, precargamos los iconos en segundo plano
				this.preloadIconsInBackground(forceIconRefresh);
			} catch (error) {
				console.error('[SideTabs] Error al actualizar la vista:', error);
				const localize = Localization.getInstance().getLocaleString;
				webviewView.webview.html = `<html><body><h3>${localize('errorLoadingView')}</h3><p>${error}</p></body></html>`;
			}
		};

		// Primera actualización sin reintento
		update(true);

		// Configurar listeners para actualizar la vista
		vscode.window.tabGroups.onDidChangeTabs(() => update(), this);
		vscode.window.tabGroups.onDidChangeTabGroups(() => update(), this);
		vscode.languages.onDidChangeDiagnostics(() => update(), this);
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
	private _iconCache: Map<string, string> = new Map();
	private _iconMap: Record<string, string> | undefined;
	private _iconThemeId: string | undefined;
	private _iconThemePath: string | undefined;
	private _iconThemeJson: any;
	private _isPreloadingIcons: boolean = false;

	// Método para obtener texto localizado
	private getLocalizedText(key: string, fallback: string): string {
		return Localization.getInstance().getLocaleString(key) || fallback;
	}

	// Método para precargar iconos en segundo plano sin bloquear la UI
	public async preloadIconsInBackground(forceRefresh: boolean = false): Promise<void> {
		// Evitar precarga simultánea
		if (this._isPreloadingIcons && !forceRefresh) return;

		this._isPreloadingIcons = true;
		try {
			const tabGroups = vscode.window.tabGroups.all;
			const allTabsFlat: vscode.Tab[] = [];

			for (const group of tabGroups) {
				for (const tab of group.tabs) {
					allTabsFlat.push(tab);
				}
			}

			// Proceso en segundo plano con promesas en paralelo para optimizar la carga
			const iconPromises: Promise<void>[] = [];

			for (const tab of allTabsFlat) {
				if (tab.input instanceof vscode.TabInputText) {
					const input = tab.input as vscode.TabInputText;
					const fileName = input.uri.path.split('/').pop() || '';
					let languageId: string | undefined = undefined;

					// Intentar obtener languageId de documentos ya abiertos
					const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === input.uri.toString());
					if (doc) {
						languageId = doc.languageId;
					}

					// Si no hay un documento abierto y el archivo existe, cargarlo de forma asíncrona
					const loadIconPromise = async () => {
						try {
							if (!languageId && input.uri.scheme === 'file' && fs.existsSync(input.uri.fsPath)) {
								try {
									const doc = await vscode.workspace.openTextDocument(input.uri);
									languageId = doc.languageId;
								} catch (e) {
									// Ignorar errores, usaremos sólo el nombre del archivo
								}
							}

							const cacheKey = `${fileName}|${languageId || ''}`;
							if (!this._iconCache.has(cacheKey) || forceRefresh) {
								const iconBase64 = await this.getFileIconAsBase64(fileName, this._context!, languageId);
								if (iconBase64) {
									this._iconCache.set(cacheKey, iconBase64);
								}
							}
						} catch (error) {
							console.error(`[SideTabs] Error al precargar icono para ${fileName}:`, error);
						}
					};

					iconPromises.push(loadIconPromise());
				}
			}

			// Ejecutar todas las promesas en paralelo pero limitando la concurrencia
			// para no sobrecargar el sistema
			const batchSize = 5;
			for (let i = 0; i < iconPromises.length; i += batchSize) {
				const batch = iconPromises.slice(i, i + batchSize);
				await Promise.all(batch);
			}

			// Una vez que se han cargado los iconos, actualizar la vista si aún existe
			if (this._view) {
				this._view.webview.html = await this.getHtml(this._view.webview);
			}
		} finally {
			this._isPreloadingIcons = false;
		}
	}

	private async buildIconMap(context: vscode.ExtensionContext): Promise<void> {
		try {
			const config = vscode.workspace.getConfiguration();
			const iconTheme = config.get<string>('workbench.iconTheme');

			// Si no hay tema de iconos, no hacemos nada
			if (!iconTheme) return;

			// Si ya tenemos el mapa construido para este tema, no lo reconstruimos
			if (this._iconThemeId === iconTheme && this._iconMap) return;

			console.log(`[SideTabs] Construyendo mapa de iconos para tema ${iconTheme}...`);

			// Obtenemos la extensión que provee este tema de iconos
			const ext = vscode.extensions.all.find(e =>
				e.packageJSON.contributes?.iconThemes?.some((t: any) => t.id === iconTheme)
			);
			if (!ext) {
				console.log(`[SideTabs] No se encontró extensión para tema de iconos ${iconTheme}`);
				return;
			}

			// Encontramos la contribución específica del tema
			const themeContribution = ext.packageJSON.contributes.iconThemes.find((t: any) => t.id === iconTheme);
			if (!themeContribution) return;

			// Construimos la ruta al archivo JSON del tema
			const themePath = path.join(ext.extensionPath, themeContribution.path);
			if (!fs.existsSync(themePath)) {
				console.log(`[SideTabs] No existe el archivo de tema ${themePath}`);
				return;
			}

			// OPTIMIZACIÓN: Usamos try-catch para manejo de errores
			const themeJson = JSON.parse(fs.readFileSync(themePath, 'utf8'));

			// Guardamos los datos del tema
			this._iconThemeId = iconTheme;
			this._iconThemePath = themePath;
			this._iconThemeJson = themeJson;

			// Construimos el mapa de iconos
			const iconMap: Record<string, string> = {};

			// Construimos el mapa de forma optimizada
			if (themeJson.fileNames) {
				Object.entries(themeJson.fileNames).forEach(([name, value]) => {
					iconMap[`name:${name.toLowerCase()}`] = value as string;
				});
			}

			if (themeJson.fileExtensions) {
				Object.entries(themeJson.fileExtensions).forEach(([ext, value]) => {
					iconMap[`ext:${ext.toLowerCase()}`] = value as string;
				});
			}

			if (themeJson.languageIds) {
				Object.entries(themeJson.languageIds).forEach(([lang, value]) => {
					iconMap[`lang:${lang.toLowerCase()}`] = value as string;
				});
			}

			this._iconMap = iconMap;
			console.log(`[SideTabs] Mapa de iconos construido con ${Object.keys(iconMap).length} entradas`);
		} catch (error) {
			console.error('[SideTabs] Error al construir mapa de iconos:', error);
		}
	}

	// Caché de rutas de iconos para evitar recálculos
	private _iconPathCache: Map<string, string> = new Map();

	private async getFileIconAsBase64(fileName: string, context: vscode.ExtensionContext, languageId?: string): Promise<string | undefined> {
		try {
			// Verificar que tengamos el mapa de iconos
			if (!this._iconMap || !this._iconThemeJson) {
				// Solo construir el mapa si no existe
				await this.buildIconMap(context);
				if (!this._iconMap || !this._iconThemeJson) return undefined;
			}

			const themeJson = this._iconThemeJson;
			const fileNameLower = fileName.toLowerCase();
			const extName = fileNameLower.split('.').pop() || '';

			// Clave de caché para este archivo/lenguaje
			const cacheKey = `${fileNameLower}|${languageId || ''}`;

			// OPTIMIZACIÓN: Verificar si ya tenemos la ruta en caché
			let iconPath = this._iconPathCache.get(cacheKey);

			if (!iconPath) {
				let iconId: string | undefined = undefined;

				// Estrategia de búsqueda optimizada
				iconId = this._iconMap[`name:${fileNameLower}`] ||
					(extName && this._iconMap[`ext:${extName}`]) ||
					(languageId && this._iconMap[`lang:${languageId.toLowerCase()}`]);

				// Fallback al icono de archivo por defecto
				if (!iconId) {
					if (themeJson.iconDefinitions?.['_file']) {
						iconId = '_file';
					} else if (themeJson.iconDefinitions?.['file']) {
						iconId = 'file';
					} else {
						// Buscar cualquier icono que contenga "file" en su nombre
						const fileIconKey = Object.keys(themeJson.iconDefinitions || {})
							.find(key => key.toLowerCase().includes('file') && !key.toLowerCase().includes('folder'));

						if (fileIconKey) {
							iconId = fileIconKey;
						}
					}
				}

				// Si no encontramos un iconId, no hay icono
				if (!iconId || !themeJson.iconDefinitions) {
					return undefined;
				}

				// Obtener la definición del icono
				const iconDef = themeJson.iconDefinitions[iconId];
				if (!iconDef) {
					return undefined;
				}

				// Obtener la ruta al icono
				iconPath = iconDef.iconPath || iconDef.path;
				if (!iconPath) {
					return undefined;
				}

				// Guardar en caché para uso futuro
				this._iconPathCache.set(cacheKey, iconPath);
			}

			// Construir la ruta absoluta al archivo de icono
			const absIconPath = path.join(path.dirname(this._iconThemePath!), iconPath);

			// Verificar que el archivo existe
			if (!fs.existsSync(absIconPath)) {
				return undefined;
			}

			// OPTIMIZACIÓN: Leer el archivo de forma asíncrona
			const fileData = fs.readFileSync(absIconPath);
			const base64Data = fileData.toString('base64');
			const isSvg = absIconPath.toLowerCase().endsWith('.svg');
			const mimeType = isSvg ? 'image/svg+xml' : 'image/png';
			const dataUri = `data:${mimeType};base64,${base64Data}`;

			return dataUri;
		} catch (e) {
			console.error(`[SideTabs] Error al obtener icono para ${fileName}:`, e);
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
		const localize = Localization.getInstance().getLocaleString;

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

		// Precargar los iconos necesarios para el HTML
		await this.preloadIconsInBackground(false);

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
			/* Estilos para tooltips personalizados con el estilo de VS Code */
			.vscode-tooltip {
			  background-color: var(--vscode-editorHoverWidget-background, #252526);
			  color: var(--vscode-editorHoverWidget-foreground, #cccccc);
			  border: 1px solid var(--vscode-editorHoverWidget-border, #454545);
			  border-radius: 4px;
			  padding: 6px 8px;
			  font-size: 12px;
			  max-width: 300px;
			  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
			  z-index: 1000;
			  white-space: normal;
			  line-height: 1.4;
			  position: fixed;
			  pointer-events: none;
			  opacity: 0;
			  visibility: hidden;
			  transition: opacity 0.15s ease-out, transform 0.15s ease-out, visibility 0.15s;
			  transform: translateY(4px);
			  font-family: var(--vscode-font-family);
			  overflow-wrap: break-word;
			  word-break: normal;
			}
			.vscode-tooltip.visible {
			  opacity: 1;
			  visibility: visible;
			  transform: translateY(0);
			}
			
			/* Hacer los elementos con tooltips más interactivos */
			[data-tooltip-content] {
			  position: relative;
			}
			
			/* Ocultar tooltips nativos del navegador */
			[data-tooltip-content]:hover::after {
			  content: none !important;
			}
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
				font-size: ${fontSize - 2}px;
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
				const iconBase64 = await this.getFileIconAsBase64(fileName, context, languageId);
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

			// Usar data-tooltip-content en lugar de title para nuestros tooltips personalizados
			html += `<div class="tab${isActive ? ' active' : ''}"
			data-label="${label}"
			data-tooltip-content="${directoryPath ? `${directoryPath}\\${label}` : label}"
			draggable="true">
		<div class="click-layer"></div>
		${iconHtml}
		<span class="${labelClass}">
			${label}
			${problemsText ? `<span class="problems">${problemsText}</span>` : ''}
			${showDirectoryPath && directoryPath ? `<span class="directory"> • ${directoryPath}</span>` : ''}
		</span>
		<div class="tab-actions">
			${isDirty ? `<div class="save-icon" data-tooltip-content="${this.getLocalizedText('unsavedChanges', 'Archivo con cambios sin guardar')}"><img src="${saveSvgBase64}" style="width:18px;height:18px;display:block;"/></div>` : ''}
			<span class="close" data-tooltip-content="${this.getLocalizedText('closeTab', 'Cerrar pestaña')}">${closeSvgInline}</span>
		</div>
		<div class="drop-indicator"></div>
	</div>`;
		}

		html += `<script>
	const vscode = acquireVsCodeApi();
	let draggedTab = null;
	let allTabs = Array.from(document.querySelectorAll('.tab'));
	const tabContainer = document.body; // Usar body como contenedor
	let tooltipTimeout = null;
	let activeTooltip = null;

	// Crear el elemento tooltip que se reutilizará
	function createTooltip() {
		if (document.querySelector('.vscode-tooltip')) {
			return document.querySelector('.vscode-tooltip');
		}
		const tooltip = document.createElement('div');
		tooltip.className = 'vscode-tooltip';
		document.body.appendChild(tooltip);
		return tooltip;
	}

	// Mostrar tooltip en posición específica
	function showTooltip(element, content) {
		// Cancelar cualquier tooltip pendiente
		if (tooltipTimeout) {
			clearTimeout(tooltipTimeout);
		}
		
		// Crear o reutilizar el elemento tooltip
		const tooltip = createTooltip();
		activeTooltip = tooltip;
		
		// Actualizar contenido
		tooltip.textContent = content;
		
		// Posicionar el tooltip
		tooltipTimeout = setTimeout(() => {
			const rect = element.getBoundingClientRect();
			
			// Posicionar encima o debajo dependiendo del espacio disponible
			const spaceBelow = window.innerHeight - rect.bottom;
			const spaceAbove = rect.top;
			
			const tooltipHeight = tooltip.offsetHeight;
			
			let top, left;
			
			if (spaceBelow >= tooltipHeight || spaceBelow >= spaceAbove) {
				// Mostrar debajo
				top = rect.bottom + 5;
			} else {
				// Mostrar arriba
				top = rect.top - tooltipHeight - 5;
			}
			
			// Centrar horizontalmente
			left = rect.left + (rect.width / 2) - (tooltip.offsetWidth / 2);
			
			// Asegurar que no se salga de la ventana
			if (left < 5) left = 5;
			if (left + tooltip.offsetWidth > window.innerWidth - 5) {
				left = window.innerWidth - tooltip.offsetWidth - 5;
			}
			
			tooltip.style.top = top + 'px';
			tooltip.style.left = left + 'px';
			tooltip.classList.add('visible');
		}, 300); // Pequeño retraso para evitar tooltips al pasar el cursor rápidamente
	}

	// Ocultar tooltip
	function hideTooltip() {
		if (tooltipTimeout) {
			clearTimeout(tooltipTimeout);
			tooltipTimeout = null;
		}
		
		if (activeTooltip) {
			activeTooltip.classList.remove('visible');
		}
	}

	// Aplicar tooltips a todos los elementos con data-tooltip-content
	document.addEventListener('mouseover', e => {
		const tooltipTarget = e.target.closest('[data-tooltip-content]');
		if (tooltipTarget) {
			const content = tooltipTarget.getAttribute('data-tooltip-content');
			showTooltip(tooltipTarget, content);
		}
	});

	document.addEventListener('mouseout', e => {
		const tooltipTarget = e.target.closest('[data-tooltip-content]');
		if (tooltipTarget) {
			hideTooltip();
		}
	});
	
	// Actualizar posición del tooltip cuando se desplace la página
	document.addEventListener('scroll', () => {
		if (activeTooltip && activeTooltip.classList.contains('visible')) {
			// Simplemente ocultamos el tooltip al desplazarnos
			hideTooltip();
		}
	}, true);

	// Cerrar tooltips al hacer clic en cualquier parte
	document.addEventListener('click', () => {
		hideTooltip();
	});

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
			// Ocultar tooltips cuando comience el arrastre
			hideTooltip();
			
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
			// Ocultar tooltips al hacer clic
			hideTooltip();
			
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
			// Ocultar tooltips al mostrar el menú contextual
			hideTooltip();
			
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

	// Precargamos la localización para reutilizarla en toda la extensión
	Localization.getInstance();

	// Crea el proveedor de vista
	const provider = new SideTabsPanelViewProvider(context.extensionUri, context);

	// Registramos el proveedor de vista
	const disposable = vscode.window.registerWebviewViewProvider(
		SideTabsPanelViewProvider.viewType,
		provider
	);
	context.subscriptions.push(disposable);

	// OPTIMIZACIÓN: No intentamos mostrar la vista automáticamente al inicio
	// para evitar sobrecargas. La vista se mostrará cuando el usuario
	// haga clic en el icono de la barra de actividad.

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
			await provider.preloadIconsInBackground(false);
		} catch (e) {
			// Ignorar errores en la precarga, no son críticos
		}
	})();
}