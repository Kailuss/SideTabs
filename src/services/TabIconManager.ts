// = El backend solo maneja datos y lógica de mapeo, nunca rutas absolutas ni HTML. 
/// Construir y exponer el iconMap (solo datos, no rutas)

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Gestiona la carga y caché de iconos de archivos según el tema activo
 */
export class TabIconManager {
	private _iconCache: Map<string, string> = new Map();
	private _iconMap: Record<string, string> | undefined;
	private _iconThemeId: string | undefined;
	private _iconThemePath: string | undefined;
	private _iconThemeJson: any;
	private _iconPathCache: Map<string, string> = new Map();
	private _isPreloadingIcons: boolean = false;
	private _configListener: vscode.Disposable | undefined;

	/**
	 * Inicializa el manager de iconos y configura los listeners
	 * Debe llamarse una vez durante la activación de la extensión
	 */
	public initialize(context: vscode.ExtensionContext): void {
		// Configurar listener para cambios en el tema de iconos
		this._configListener = vscode.workspace.onDidChangeConfiguration(async e => {
			if (e.affectsConfiguration('workbench.iconTheme')) {
				//console.log(`[SideTabs] Detectado cambio en tema de iconos`);
				this.clearCache();
				await this.buildIconMap(context);
			}
		});

		// Registrar el listener para que se limpie al desactivar la extensión
		context.subscriptions.push(this._configListener);

		// Construir el mapa de iconos inicialmente
		this.buildIconMap(context).catch(err =>
			console.error('[SideTabs] Error al construir mapa de iconos inicial:', err)
		);
	}

	/**
	 * Construye el mapa de iconos según el tema activo
	 * @param context El contexto de la extensión
	 * @param forceRebuild Fuerza la reconstrucción incluso si el tema no ha cambiado
	 */
	public async buildIconMap(context: vscode.ExtensionContext, forceRebuild: boolean = false): Promise<void> {
		try {
			const config = vscode.workspace.getConfiguration();
			const iconTheme = config.get<string>('workbench.iconTheme');

			// Información de diagnóstico
			//console.log(`[SideTabs] Construyendo mapa de iconos... Tema actual: ${iconTheme || 'ninguno'}, Tema anterior: ${this._iconThemeId || 'ninguno'}, Forzar: ${forceRebuild}`);

			// Si no hay tema de iconos, usar iconos por defecto
			if (!iconTheme) {
				//console.log('[SideTabs] No hay tema de iconos configurado, se usarán iconos por defecto');
				this._iconMap = {};
				this._iconThemeId = '';
				return;
			}

			// Si ya tenemos el mapa construido para este tema y no se fuerza reconstrucción, salimos
			if (this._iconThemeId === iconTheme && this._iconMap && !forceRebuild) {
				//console.log(`[SideTabs] Mapa de iconos para tema ${iconTheme} ya está construido`);
				return;
			}

			//console.log(`[SideTabs] Construyendo mapa de iconos para tema ${iconTheme}...`);

			// Intentar cargar el tema especificado
			let ext = this.findIconThemeExtension(iconTheme);
			let themeJson: any = null;
			let themePath: string = '';
			let themeId = iconTheme;

			// Si no se encuentra el tema configurado, intentar con Seti como fallback
			if (!ext) {
				//console.log(`[SideTabs] ERROR: No se encontró extensión para tema de iconos ${iconTheme}`);
				//console.log(`[SideTabs] Intentando fallback a tema Seti...`);

				ext = this.findIconThemeExtension('vs-seti');
				themeId = 'vs-seti';

				if (!ext) {
					//console.log(`[SideTabs] ERROR: No se encontró el tema fallback Seti`);
					//console.log(`[SideTabs] Usando mapa de iconos vacío`);
					this._iconMap = {};
					this._iconThemeId = iconTheme; // Guardamos el ID para no intentar reconstruir constantemente
					return;
				}

				//console.log(`[SideTabs] Usando tema fallback: Seti`);
			}

			// Encontramos la contribución específica del tema
			const themeContribution = ext.packageJSON.contributes.iconThemes.find((t: any) => t.id === themeId);
			if (!themeContribution) {
				//console.log(`[SideTabs] ERROR: No se encontró contribución específica para tema ${themeId}`);
				this._iconMap = {};
				this._iconThemeId = iconTheme;
				return;
			}

			// Construimos la ruta al archivo JSON del tema
			themePath = path.join(ext.extensionPath, themeContribution.path);
			//console.log(`[SideTabs] Ruta al archivo de tema: ${themePath}`);

			if (!fs.existsSync(themePath)) {
				//console.log(`[SideTabs] ERROR: No existe el archivo de tema ${themePath}`);
				this._iconMap = {};
				this._iconThemeId = iconTheme;
				return;
			}

			// Leer y parsear el JSON del tema
			try {
				const themeContent = fs.readFileSync(themePath, 'utf8');
				themeJson = JSON.parse(themeContent);
				//console.log(`[SideTabs] JSON del tema cargado correctamente (${themeContent.length} bytes)`);
			} catch (err) {
				console.error(`[SideTabs] Error al parsear JSON del tema:`, err);
				this._iconMap = {};
				this._iconThemeId = iconTheme;
				return;
			}

			// Guardamos los datos del tema
			this._iconThemeId = iconTheme; // Mantenemos el ID original aunque usemos un fallback
			this._iconThemePath = themePath;
			this._iconThemeJson = themeJson;

			// Construimos el mapa de iconos
			const iconMap: Record<string, string> = {};

			// Mapear nombres de archivo a iconos
			if (themeJson.fileNames) {
				Object.entries(themeJson.fileNames).forEach(([name, value]) => {
					iconMap[`name:${name.toLowerCase()}`] = value as string;
				});
			}

			// Mapear extensiones a iconos
			if (themeJson.fileExtensions) {
				Object.entries(themeJson.fileExtensions).forEach(([ext, value]) => {
					const extLower = ext.toLowerCase();
					iconMap[`ext:${extLower}`] = value as string;
					// Log especial para extensiones JS y TS para diagnóstico
					if (extLower === 'js' || extLower === 'ts') {
						//console.log(`[SideTabs] Registrando extensión ${extLower} con valor ${value}`);
					}
				});
			}

			// Mapear lenguajes a iconos
			if (themeJson.languageIds) {
				Object.entries(themeJson.languageIds).forEach(([lang, value]) => {
					iconMap[`lang:${lang.toLowerCase()}`] = value as string;
				});
			}

			// Guardar el mapa completo
			this._iconMap = iconMap;
			//console.log(`[SideTabs] Mapa de iconos construido con ${Object.keys(iconMap).length} entradas`);

			// Imprimir algunas muestras para diagnóstico
			const mapSamples = Object.keys(iconMap).slice(0, 5);
			//console.log(`[SideTabs] Primeros 5 elementos del mapa:`, mapSamples.map(k => `${k} -> ${iconMap[k]}`));
		} catch (error) {
			console.error('[SideTabs] Error al construir mapa de iconos:', error);
			if (error instanceof Error) {
				console.error(`[SideTabs] Detalles: ${error.message}`);
				console.error(`[SideTabs] Stack: ${error.stack}`);
			}
			// Asegurar que tengamos un mapa aunque sea vacío
			this._iconMap = this._iconMap || {};
		}
	}

	/**
	 * Encuentra la extensión que provee un tema de iconos
	 */
	private findIconThemeExtension(themeId: string): vscode.Extension<any> | undefined {
		//console.log(`[SideTabs] Buscando extensión para tema ${themeId} entre ${vscode.extensions.all.length} extensiones`);

		return vscode.extensions.all.find(e => {
			try {
				const contributes = e.packageJSON.contributes;
				if (!contributes || !contributes.iconThemes) return false;

				const hasTheme = contributes.iconThemes.some((t: any) => t.id === themeId);
				if (hasTheme) {
					//console.log(`[SideTabs] Encontrada extensión para tema ${themeId}: ${e.id}`);
					return true;
				}
				return false;
			} catch (err) {
				//console.log(`[SideTabs] Error al evaluar extensión ${e.id}:`, err);
				return false;
			}
		});
	}

	/**
	 * Obtiene el icono de un archivo como base64
	 */
	public async getFileIconAsBase64(fileName: string, context: vscode.ExtensionContext, languageId?: string): Promise<string | undefined> {
		try {
			// Verificar que tengamos el mapa de iconos
			if (!this._iconMap || !this._iconThemeJson) {
				// Solo construir si no se ha inicializado aún
				if (!this._iconThemeId) {
					//console.log('[SideTabs] Construyendo mapa de iconos bajo demanda');
					await this.buildIconMap(context);
				}
				if (!this._iconMap || !this._iconThemeJson) {
					//console.log('[SideTabs] No se pudo construir el mapa de iconos');
					return undefined;
				}
			}

			const themeJson = this._iconThemeJson;
			const fileNameLower = fileName.toLowerCase();

			// Obtener la extensión correctamente
			// Para archivos como "archivo.min.js", debemos obtener "js" como extensión, no "min.js"
			const lastDotIndex = fileNameLower.lastIndexOf('.');
			const extName = lastDotIndex > 0 ? fileNameLower.substring(lastDotIndex + 1) : '';

			// Clave de caché para este archivo/lenguaje
			const cacheKey = `${fileNameLower}|${languageId || ''}`;
			//console.log(`[SideTabs] Buscando icono para ${fileName} (ext: "${extName}", lang: ${languageId || 'sin lenguaje'})`);

			// Verificar si ya tenemos la ruta en caché
			let iconPath = this._iconPathCache.get(cacheKey);

			if (!iconPath) {
				let iconId: string | undefined = undefined;

				// Estrategia de búsqueda optimizada con logs para diagnóstico
				// Intentar primero por nombre exacto del archivo
				if (this._iconMap[`name:${fileNameLower}`]) {
					iconId = this._iconMap[`name:${fileNameLower}`];
					//console.log(`[SideTabs] Encontrado icono por nombre exacto: ${iconId}`);
				}
				// Luego por extensión
				else if (extName && this._iconMap[`ext:${extName}`]) {
					iconId = this._iconMap[`ext:${extName}`];
					//console.log(`[SideTabs] Encontrado icono por extensión '${extName}': ${iconId}`);
				}
				// Finalmente por lenguaje
				else if (languageId && this._iconMap[`lang:${languageId.toLowerCase()}`]) {
					iconId = this._iconMap[`lang:${languageId.toLowerCase()}`];
					//console.log(`[SideTabs] Encontrado icono por lenguaje '${languageId}': ${iconId}`);
				}

				// Verificación específica para JS y TS
				// Verificación específica para JS, TS y otros lenguajes populares que puedan tener problemas
				if (!iconId) {
					// Establecer languageId basado en la extensión si no se proporcionó uno
					let inferredLanguageId = languageId;
					if (!inferredLanguageId) {
						// Mapeo común de extensiones a lenguajes
						const extensionToLanguageMap: Record<string, string> = {
							'js': 'javascript',
							'ts': 'typescript',
							'jsx': 'javascriptreact',
							'tsx': 'typescriptreact',
							'json': 'json',
							'md': 'markdown',
							'py': 'python',
							'html': 'html',
							'css': 'css'
						};

						inferredLanguageId = extensionToLanguageMap[extName];
						if (inferredLanguageId) {
							//console.log(`[SideTabs] LanguageId inferido para ${extName}: ${inferredLanguageId}`);
						}
					}

					// Intentar buscar por languageId inferido
					if (inferredLanguageId && this._iconMap[`lang:${inferredLanguageId.toLowerCase()}`]) {
						iconId = this._iconMap[`lang:${inferredLanguageId.toLowerCase()}`];
						//console.log(`[SideTabs] Encontrado icono usando languageId inferido ${inferredLanguageId}: ${iconId}`);
					}
					// Para JS/TS específicamente, usar un método dedicado
					else if (extName === 'js' || extName === 'ts' || extName === 'jsx' || extName === 'tsx') {
						const jstsIconId = this.getJavaScriptTypeScriptIconId(fileNameLower, extName);
						if (jstsIconId) {
							iconId = jstsIconId;
							//console.log(`[SideTabs] Encontrado icono específico para ${extName}: ${iconId}`);
						}
					}

					// Diagnóstico de claves disponibles
					if (!iconId && (extName === 'js' || extName === 'ts')) {
						//console.log(`[SideTabs] Diagnóstico de iconos para ${extName}...`);
						const allKeys = Object.keys(this._iconMap);
						const relevantKeys = allKeys.filter(k =>
							k.includes('javascript') ||
							k.includes('typescript') ||
							k.includes('js') ||
							k.includes('ts')
						);

						//console.log(`[SideTabs] Claves relevantes: ${relevantKeys.join(', ')}`);
					}
				}

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
					//console.log(`[SideTabs] No se encontró iconId para ${fileName}`);
					return undefined;
				}

				// Obtener la definición del icono
				const iconDef = themeJson.iconDefinitions[iconId];
				if (!iconDef) {
					//console.log(`[SideTabs] No se encontró definición de icono para ${iconId}`);
					return undefined;
				}

				// Obtener la ruta al icono
				iconPath = iconDef.iconPath || iconDef.path;
				if (!iconPath) {
					//console.log(`[SideTabs] No se encontró ruta de icono para ${iconId}`);
					return undefined;
				}

				// Guardar en caché para uso futuro
				this._iconPathCache.set(cacheKey, iconPath);
				//console.log(`[SideTabs] Encontrado iconPath para ${fileName}: ${iconPath}`);
			}

			// Construir la ruta absoluta al archivo de icono 
			const iconThemeDir = path.dirname(this._iconThemePath!);

			// Normalizar la ruta del icono para la plataforma actual
			let normalizedIconPath = iconPath;
			// En Windows, convertir separadores de ruta forward slash a backslash
			if (process.platform === 'win32') {
				normalizedIconPath = iconPath.replace(/\//g, path.sep);
			}

			// Resolver la ruta absoluta
			const absIconPath = path.resolve(iconThemeDir, normalizedIconPath);

			////console.log(`[SideTabs] Ruta absoluta al icono: ${absIconPath}`);
			////console.log(`[SideTabs] Ruta base del tema: ${iconThemeDir}`);
			////console.log(`[SideTabs] Ruta relativa del icono: ${normalizedIconPath}`);

			// Verificar que el archivo existe
			if (!fs.existsSync(absIconPath)) {
				////console.log(`[SideTabs] El archivo de icono no existe: ${absIconPath}`);

				// Intento alternativo: usar join en lugar de resolve
				const altPath = path.join(iconThemeDir, normalizedIconPath);
				////console.log(`[SideTabs] Intentando ruta alternativa: ${altPath}`);

				if (fs.existsSync(altPath)) {
					//console.log(`[SideTabs] Se encontró el icono en la ruta alternativa`);
					// Usar esta ruta alternativa
					return this.readIconAndConvertToBase64(altPath);
				}

				return undefined;
			}

			// Leer el archivo y convertir a base64
			return this.readIconAndConvertToBase64(absIconPath, fileName);
		} catch (e) {
			//console.error(`[SideTabs] Error al obtener icono para ${fileName}:`, e);
			// Mostrar más detalles del error para diagnóstico
			if (e instanceof Error) {
				//console.error(`[SideTabs] Detalles: ${e.message}`);
				//console.error(`[SideTabs] Stack: ${e.stack}`);
			}
			return undefined;
		}
	}

	/**
	 * Método específico para verificar y corregir iconos de JavaScript y TypeScript
	 * @param fileName Nombre del archivo
	 * @param ext Extensión del archivo
	 */
	private getJavaScriptTypeScriptIconId(fileName: string, ext: string): string | undefined {
		if (!this._iconMap || !this._iconThemeJson) return undefined;

		// Mapeo específico de extensiones a languageIds según VS Code
		if (ext === 'js') {
			////console.log(`[SideTabs] Buscando icono específico para JavaScript`);
			// Intentar buscar por languageId en lugar de extensión
			return this._iconMap['lang:javascript'] || this._iconMap['ext:js'];
		} else if (ext === 'ts') {
			////console.log(`[SideTabs] Buscando icono específico para TypeScript`);
			return this._iconMap['lang:typescript'] || this._iconMap['ext:ts'];
		} else if (ext === 'jsx') {
			////console.log(`[SideTabs] Buscando icono específico para JSX`);
			return this._iconMap['lang:javascriptreact'] || this._iconMap['ext:jsx'];
		} else if (ext === 'tsx') {
			//	//console.log(`[SideTabs] Buscando icono específico para TSX`);
			return this._iconMap['lang:typescriptreact'] || this._iconMap['ext:tsx'];
		}

		return undefined;
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

	/**
	 * Lee un archivo de icono y lo convierte a base64
	 */
	private readIconAndConvertToBase64(iconPath: string, fileName?: string): string | undefined {
		try {
			if (!fs.existsSync(iconPath)) {
				//console.log(`[SideTabs] El archivo de icono no existe: ${iconPath}`);
				return undefined;
			}

			const fileData = fs.readFileSync(iconPath);
			const base64Data = fileData.toString('base64');
			const isSvg = iconPath.toLowerCase().endsWith('.svg');
			const mimeType = isSvg ? 'image/svg+xml' : 'image/png';
			const dataUri = `data:${mimeType};base64,${base64Data}`;

			if (fileName) {
				//console.log(`[SideTabs] Icono generado con éxito para ${fileName}`);
			} else {
				//console.log(`[SideTabs] Icono generado con éxito desde ${iconPath}`);
			}
			return dataUri;
		} catch (e) {
			console.error(`[SideTabs] Error al leer icono desde ${iconPath}:`, e);
			if (e instanceof Error) {
				console.error(`[SideTabs] Detalles: ${e.message}`);
			}
			return undefined;
		}
	}
}