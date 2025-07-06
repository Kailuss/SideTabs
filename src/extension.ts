import * as vscode from 'vscode';
import { Localization } from './localization/Localization';
import { TabsProvider } from './providers/TabsProvider';
import { TabMenuManager } from './services/TabMenuManager';

/// Función de activación de SideTabs
//  Inicializa todos los componentes y registra los proveedores y comandos

export async function activate(context: vscode.ExtensionContext) {
	try {
		//* Precarga la localización para reutilizarla en toda la extensión
		Localization.getInstance();

		//* Crea el proveedor de vista principal
		const provider = new TabsProvider(context.extensionUri);

		//* Inicializa el proveedor con el contexto
		await provider.initialize(context);

		//* Inicializa iconos en segundo plano
		initializeIconsInBackground(provider);

		//* Registra el proveedor de vista
		const disposable = vscode.window.registerWebviewViewProvider(
			TabsProvider.viewType, provider, { webviewOptions: { retainContextWhenHidden: true } }
		);
		context.subscriptions.push(disposable);

		//* Crea y registra comandos
		const commandManager = new TabMenuManager();
		commandManager.setProvider(provider);
		commandManager.registerCommands(context);

	} catch (error) {
		console.error('[SideTabs] Error durante la activación:', error);
		vscode.window.showErrorMessage(`Error al activar SideTabs: ${error}`);
	}
}

/// Inicializa la carga de iconos en segundo plano sin bloquear la activación

async function initializeIconsInBackground(provider: TabsProvider): Promise<void> {
	try {
		//* Llama al método de precarga de iconos
		await provider.preloadIconsInBackground(false);
		console.log('[SideTabs] Iconos inicializados correctamente');
	} catch (error) {
		//* Ignorar errores en la precarga, no son críticos
		console.warn('[SideTabs] Error al precargar iconos:', error);
	}
}

/// Función de desactivación de la extensión

export function deactivate() {
	//* Cleanup no es necesario
}