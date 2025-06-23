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

/**
 * Gestiona el orden personalizado y la lógica de las pestañas
 */
export class TabManager {
	private customOrder: string[] = [];

	/**
	 * Genera un identificador único para una pestaña basado en su URI y posición
	 */
	private generateUniqueId(tab: vscode.Tab, group: vscode.TabGroup): string {
		if (tab.input instanceof vscode.TabInputText) {
			// Para archivos de texto, usamos la URI completa
			return tab.input.uri.toString();
		} else if ((tab as any).input && (tab as any).input.uri) {
			// Para otros tipos de input que tengan URI
			return (tab as any).input.uri.toString();
		} else {
			// Para pestañas sin URI (como settings, etc.), usamos un ID estable basado en el label
			// Sin timestamp para evitar que reaparezcan tras cerrarse
			const tabIndex = group.tabs.indexOf(tab);
			return `${tab.label}#tab-${tabIndex}`;
		}
	}

	/**
	 * Obtiene todas las pestañas con metadatos adicionales
	 */
	public getAllTabsWithMetadata(): TabInfo[] {
		const tabGroups = vscode.window.tabGroups.all;
		const allTabs: TabInfo[] = [];

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

				const uniqueId = this.generateUniqueId(tab, group);
				allTabs.push({ tab, group, languageId, uniqueId });

				// Añadir al orden personalizado si no está (ahora usando uniqueId)
				if (!this.customOrder.includes(uniqueId)) {
					this.customOrder.push(uniqueId);
				}
			}
		}

		// Remover del orden personalizado las pestañas que ya no existen
		this.customOrder = this.customOrder.filter(uniqueId =>
			allTabs.some(item => item.uniqueId === uniqueId)
		);

		// Ordenar pestañas según el orden personalizado
		allTabs.sort((a, b) => {
			const indexA = this.customOrder.indexOf(a.uniqueId);
			const indexB = this.customOrder.indexOf(b.uniqueId);
			return indexA - indexB;
		});

		return allTabs;
	}

	/**
	 * Busca una pestaña por su uniqueId
	 */
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

	/**
	 * Mueve una pestaña en el orden personalizado
	 */
	public moveTab(sourceUniqueId: string, targetUniqueId?: string, position?: 'before' | 'after'): void {
		const sourceIndex = this.customOrder.indexOf(sourceUniqueId);
		if (sourceIndex === -1) return;

		// Remover la pestaña de su posición actual
		this.customOrder.splice(sourceIndex, 1);

		if (targetUniqueId && position) {
			// Nuevo sistema de drag & drop
			const targetIndex = this.customOrder.indexOf(targetUniqueId);
			if (targetIndex !== -1) {
				const newIndex = position === 'before' ? targetIndex : targetIndex + 1;
				this.customOrder.splice(newIndex, 0, sourceUniqueId);
			}
		} else {
			// Si no hay target, volver a insertar en la posición original
			this.customOrder.splice(sourceIndex, 0, sourceUniqueId);
		}
	}

	/**
	 * Obtiene el nombre del archivo de una pestaña
	 */
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

	/**
	 * Obtiene la ruta del directorio de una pestaña para mostrar
	 */
	public getDirectoryPath(tab: vscode.Tab): string {
		if (!(tab.input instanceof vscode.TabInputText)) {
			return '';
		}

		const uri = tab.input.uri;
		const path = require('path');

		// Obtener la ruta relativa al workspace
		let relativePath = '';
		if (vscode.workspace.workspaceFolders) {
			const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
			if (workspaceFolder) {
				relativePath = path.relative(workspaceFolder.uri.fsPath, path.dirname(uri.fsPath));
				if (relativePath) {
					return relativePath;
				}
			} else {
				// Si no está en ningún workspace, mostrar la ruta absoluta acortada
				const dirName = path.dirname(uri.fsPath);
				const parts = dirName.split(path.sep);
				if (parts.length > 2) {
					return path.join(parts[parts.length - 2], parts[parts.length - 1]);
				} else {
					return dirName;
				}
			}
		}

		return '';
	}

	/**
	 * Infiere el languageId por extensión de archivo si no está disponible
	 */
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
