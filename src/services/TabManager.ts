import * as vscode from 'vscode';

/**
 * Información de una pestaña con metadatos adicionales
 */
export interface TabInfo {
	tab: vscode.Tab;
	group: vscode.TabGroup;
	languageId?: string;
	uniqueId: string; // Identificador único para la pestaña
}

//· Gestiona el orden personalizado y la lógica de las pestañas

export class TabManager {
	private customOrder: string[] = [];

	/// Genera un identificador único para una pestaña basado en su URI y posición
	private generateUniqueId(tab: vscode.Tab, group: vscode.TabGroup): string {
		if (tab.input instanceof vscode.TabInputText) {
			//* Para archivos de texto, usamos la URI completa
			return tab.input.uri.toString();
		} else if ((tab as any).input && (tab as any).input.uri) {
			//* Para otros tipos de input que tengan URI
			return (tab as any).input.uri.toString();
		} else {
			//* Para pestañas sin URI (como settings, etc.), usamos un ID estable basado en el label
			// Sin timestamp para evitar que reaparezcan tras cerrarse
			const tabIndex = group.tabs.indexOf(tab);
			return `${tab.label}#tab-${tabIndex}`;
		}
	}

	/// Obtiene todas las pestañas con metadatos adicionales
	public getAllTabsWithMetadata(): TabInfo[] {
		const tabGroups = vscode.window.tabGroups.all;
		const allTabs: TabInfo[] = [];

		//* Recolecta información de cada pestaña
		for (const group of tabGroups) {
			for (const tab of group.tabs) {
				let languageId: string | undefined = undefined;
				// Si la pestaña es de tipo texto, obtenemos el languageId del documento
				// Si no, lo dejamos como undefined
				if (tab.input instanceof vscode.TabInputText) {
					const input = tab.input as vscode.TabInputText;
					const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === input.uri.toString());
					if (doc) {
						languageId = doc.languageId;
					}
				}

				// Generar un identificador único para la pestaña
				// Basado en su URI o label si no tiene URI
				const uniqueId = this.generateUniqueId(tab, group);
				allTabs.push({ tab, group, languageId, uniqueId });

				// Añadir al orden personalizado si no está (ahora usando uniqueId)
				if (!this.customOrder.includes(uniqueId)) {
					this.customOrder.push(uniqueId);
				}
			}
		}

		//* Borra del orden personalizado las pestañas que ya no existen
		this.customOrder = this.customOrder.filter(uniqueId =>
			allTabs.some(item => item.uniqueId === uniqueId)
		);

		//* Ordena las pestañas según el orden personalizado
		allTabs.sort((a, b) => {
			const indexA = this.customOrder.indexOf(a.uniqueId);
			const indexB = this.customOrder.indexOf(b.uniqueId);
			return indexA - indexB;
		});
		console.log('[TabManager] Tabs retornadas:', allTabs.map(t => t.uniqueId));
		return allTabs;
	}

	/// Busca una pestaña por su uniqueId
	public findTabByUniqueId(uniqueId: string): { tab: vscode.Tab; group: vscode.TabGroup } | null {
		const tabGroups = vscode.window.tabGroups.all;

		for (const group of tabGroups) {
			for (const tab of group.tabs) {
				const tabUniqueId = this.generateUniqueId(tab, group);
				if (tabUniqueId === uniqueId) {
					return { tab, group };
				}
			}
		}

		return null;
	}

	/// Mueve una pestaña en el orden personalizado
	public moveTab(sourceUniqueId: string, targetUniqueId?: string, position?: 'before' | 'after'): boolean {
		//* Validar IDs primero
		if (!sourceUniqueId) {
			console.error('[LoverTab] moveTab: sourceUniqueId is required');
			return false;
		}

		const sourceIndex = this.customOrder.indexOf(sourceUniqueId);
		if (sourceIndex === -1) {
			console.warn(`[LoverTab] No se encontró pestaña source con ID: ${sourceUniqueId}`);
			return false;
		}

		//* Guarda una copia temporal del orden actual para poder revertirlo en caso de error
		const previousOrder = [...this.customOrder];

		try {
			// Borra la pestaña de su posición actual
			this.customOrder.splice(sourceIndex, 1);

			// Si hay un target y una posición, mover la pestaña
			if (targetUniqueId && position) {
				// Nuevo sistema de drag & drop
				const targetIndex = this.customOrder.indexOf(targetUniqueId);
				if (targetIndex !== -1) {
					const newIndex = position === 'before' ? targetIndex : targetIndex + 1;

					// Validar que el nuevo índice esté dentro de los límites
					const validIndex = Math.min(Math.max(0, newIndex), this.customOrder.length);
					this.customOrder.splice(validIndex, 0, sourceUniqueId);

					console.log(`[LoverTab] Pestaña movida a posición ${position} de ${targetUniqueId} (índice ${validIndex})`);
					return true;
				} else {
					console.warn(`[LoverTab] No se encontró pestaña target con ID: ${targetUniqueId}`);
					// Si no existe el target, reinsertar en la posición original
					this.customOrder.splice(sourceIndex, 0, sourceUniqueId);
					return false;
				}
			} else {
				// Si no hay target, volver a insertar en la posición original
				this.customOrder.splice(sourceIndex, 0, sourceUniqueId);
				return false;
			}
		} catch (error) {
			// Restaurar el orden anterior en caso de error
			console.error('[LoverTab] Error al mover pestaña:', error);
			this.customOrder = previousOrder;
			return false;
		}
	}

	/// Valida y repara el orden personalizado, eliminando cualquier ID duplicado o inexistente
	public validateCustomOrder(): boolean {
		//* Obtener todas las pestañas actuales como referencia
		const allTabs = this.getAllTabsWithMetadata();
		const validIds = new Set(allTabs.map(tab => tab.uniqueId));

		//* Comprobar si hay duplicados o IDs inválidos
		const originalLength = this.customOrder.length;
		const uniqueIds = new Set<string>();

		//* Crear un nuevo array filtrado
		this.customOrder = this.customOrder.filter(id => {
			// Verificar si ya está en el conjunto (para evitar duplicados)
			if (uniqueIds.has(id)) {
				return false;
			}
			// Verificar si el ID es válido (existe en las pestañas actuales)
			if (validIds.has(id)) {
				uniqueIds.add(id);
				return true;
			}
			return false;
		});

		//* Añadir los IDs que faltan (pestañas nuevas)
		allTabs.forEach(tab => {
			if (!uniqueIds.has(tab.uniqueId)) {
				this.customOrder.push(tab.uniqueId);
			}
		});

		// Devolver si hubo algún cambio
		return this.customOrder.length !== originalLength;
	}

	/// Obtiene el nombre del archivo de una pestaña
	public getFileName(tab: vscode.Tab): string | undefined {
		if (tab.input instanceof vscode.TabInputText) {
			return tab.input.uri.path.split('/').pop() || '';
		} else if ((tab as any).input && (tab as any).input.uri) {
			try {
				return (tab as any).input.uri.path.split('/').pop() || '';
			} catch {
				return undefined;
			}
		}
		return undefined;
	}

	/// Infiere el languageId por extensión de archivo si no está disponible
	public inferLanguageId(fileName: string): string | undefined {
		const ext = fileName.split('.').pop()?.toLowerCase();
		if (!ext) return undefined;

		const conf = vscode.workspace.getConfiguration('files.associations');
		if (conf && conf[`.${ext}`]) {
			return conf[`.${ext}`];
		}

		return undefined;
	}
}
