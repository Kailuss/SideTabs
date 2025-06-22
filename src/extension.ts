import * as vscode from 'vscode';
import { Localization } from './localization';
import { SideTabsProvider } from './provider';
import { CommandManager } from './commands';

/**
 * Función de activación de la extensión SideTabs
 * Inicializa todos los componentes y registra los proveedores y comandos
 */
export function activate(context: vscode.ExtensionContext) {
	try {
		// Precargamos la localización para reutilizarla en toda la extensión
		Localization.getInstance();

		// Crear el proveedor de vista principal
		const provider = new SideTabsProvider(context.extensionUri, context);

		// Registrar el proveedor de vista
		const disposable = vscode.window.registerWebviewViewProvider(
			SideTabsProvider.viewType,
			provider,
			{
				webviewOptions: {
					retainContextWhenHidden: true
				}
			}
		);
		context.subscriptions.push(disposable);

		// Crear y registrar comandos
		const commandManager = new CommandManager();
		commandManager.setProvider(provider);
		commandManager.registerCommands(context);

		// Inicialización de iconos en segundo plano
		initializeIconsInBackground(provider);

	} catch (error) {
		console.error('[SideTabs] Error durante la activación:', error);
		vscode.window.showErrorMessage(`Error al activar SideTabs: ${error}`);
	}
}

/**
 * Inicializa la carga de iconos en segundo plano sin bloquear la activación
 */
async function initializeIconsInBackground(provider: SideTabsProvider): Promise<void> {
	try {
		// Precargar iconos para todas las pestañas abiertas
		await provider.preloadIconsInBackground(false);
	} catch (error) {
		// Ignorar errores en la precarga, no son críticos
	}
}

/**
 * Función de desactivación de la extensión
 */
export function deactivate() {
	// Cleanup si es necesario
}