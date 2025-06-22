import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Gestiona la carga y caché de iconos de archivos según el tema activo
 */
export class IconManager {
	private _iconCache: Map<string, string> = new Map();
	private _iconMap: Record<string, string> | undefined;
	private _iconThemeId: string | undefined;
	private _iconThemePath: string | undefined;
	private _iconThemeJson: any;
	private _iconPathCache: Map<string, string> = new Map();
	private _isPreloadingIcons: boolean = false;

	/**
	 * Construye el mapa de iconos según el tema activo
	 */
	public async buildIconMap(context: vscode.ExtensionContext): Promise<void> {
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

			const themeJson = JSON.parse(fs.readFileSync(themePath, 'utf8'));

			// Guardamos los datos del tema
			this._iconThemeId = iconTheme;
			this._iconThemePath = themePath;
			this._iconThemeJson = themeJson;

			// Construimos el mapa de iconos
			const iconMap: Record<string, string> = {};

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

	/**
	 * Obtiene el icono de un archivo como base64
	 */
	public async getFileIconAsBase64(fileName: string, context: vscode.ExtensionContext, languageId?: string): Promise<string | undefined> {
		try {
			// Verificar que tengamos el mapa de iconos
			if (!this._iconMap || !this._iconThemeJson) {
				await this.buildIconMap(context);
				if (!this._iconMap || !this._iconThemeJson) return undefined;
			}

			const themeJson = this._iconThemeJson;
			const fileNameLower = fileName.toLowerCase();
			const extName = fileNameLower.split('.').pop() || '';

			// Clave de caché para este archivo/lenguaje
			const cacheKey = `${fileNameLower}|${languageId || ''}`;

			// Verificar si ya tenemos la ruta en caché
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

			// Leer el archivo y convertir a base64
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

	/**
	 * Precarga iconos en segundo plano sin bloquear la UI
	 */
	public async preloadIconsInBackground(context: vscode.ExtensionContext, forceRefresh: boolean = false): Promise<void> {
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
								const iconBase64 = await this.getFileIconAsBase64(fileName, context, languageId);
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
			const batchSize = 5;
			for (let i = 0; i < iconPromises.length; i += batchSize) {
				const batch = iconPromises.slice(i, i + batchSize);
				await Promise.all(batch);
			}
		} finally {
			this._isPreloadingIcons = false;
		}
	}

	/**
	 * Obtiene un icono del caché
	 */
	public getCachedIcon(fileName: string, languageId?: string): string | undefined {
		const cacheKey = `${fileName.toLowerCase()}|${languageId || ''}`;
		return this._iconCache.get(cacheKey);
	}

	/**
	 * Limpia la caché de iconos
	 */
	public clearCache(): void {
		this._iconCache.clear();
		this._iconPathCache.clear();
	}
}
