import * as vscode from 'vscode';

/**
 * Clase para gestionar la localización de la extensión
 */
export class Localization {
	private static _instance: Localization;
	private _strings: { [key: string]: string } = {};

	private constructor() {
		this.loadCurrentLanguage();
	}

	public static getInstance(): Localization {
		if (!Localization._instance) {
			Localization._instance = new Localization();
		}
		return Localization._instance;
	}

	/**
	 * Obtiene un string localizado por su clave
	 */
	public static getString(key: string): string {
		return Localization.getInstance().getLocalizedString(key);
	}

	/**
	 * Obtiene un string localizado por su clave
	 */
	public getLocalizedString(key: string): string {
		return this._strings[key] || key;
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
		// Protección contra _strings undefined
		if (!this._strings) {
			this.loadCurrentLanguage();
		}

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
