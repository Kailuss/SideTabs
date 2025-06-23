import * as vscode from 'vscode';
import { Localization } from './localization/Localization';
import { SideTabsProvider } from './providers/SideTabsProvider';
import { CommandManager } from './managers/CommandManager';

/**
 * Función de activación de la extensión SideTabs
 * Inicializa todos los componentes y registra los proveedores y comandos
 */
export async function activate(context: vscode.ExtensionContext) {
	try {
		// Precargamos la localización para reutilizarla en toda la extensión
		Localization.getInstance();

		// Crear el proveedor de vista principal
		const provider = new SideTabsProvider(context.extensionUri);

		// Inicializar el proveedor con el contexto
		await provider.initialize(context);

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
		// Ya no es necesario precargar iconos, se manejan cuando se necesitan
		// y la función preloadIconsInBackground ya no existe
		console.log('[SideTabs] Iconos inicializados correctamente');
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