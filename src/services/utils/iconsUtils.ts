//· Utilidades para la gestión de iconos 
/// Resuelve el nombre lógico de icono y construye URL relativa

import * as vscode from 'vscode';
import { TabIconManager } from '../TabIconManager';

const iconManager = new TabIconManager();


/// Enum con los nombres de todos los SVG en assets/svg
export enum SvgAsset {
	Close = "close.svg",
	Error = "error.svg",
	Icon = "icon.svg",
	Info = "info.svg",
	Save = "save.svg",
	Warning = "warning.svg"
}

/// Determina el icono apropiado basado en el nombre de archivo y su extensión usando IconManager
async function getIconNameForFile(
	fileName: string,
	context: vscode.ExtensionContext,
	languageId?: string
): Promise<string | undefined> {
	await iconManager.buildIconMap(context);
	const iconMap = (iconManager as any)._iconMap as Record<string, string> | undefined;
	if (!iconMap) return undefined;

	const lowerFileName = fileName.toLowerCase();
	const ext = lowerFileName.split('.').pop() || '';
	const lang = languageId?.toLowerCase();

	return (
		iconMap[`name:${lowerFileName}`] ||
		(ext && iconMap[`ext:${ext}`]) ||
		(lang && iconMap[`lang:${lang}`]) ||
		iconMap['file']
	);
}

/// Obtiene la URL de un icono para un archivo dado su URI y nombre
async function getIconUrlForFile(
	resourceUri: vscode.Uri | undefined,
	fileName: string,
	context: vscode.ExtensionContext,
	webview?: vscode.Webview
): Promise<string> {

	//* Intenta determinar el tipo de lenguaje si tenemos un URI
	let languageId: string | undefined;
	if (resourceUri) {
		try {
			const doc = await vscode.workspace.openTextDocument(resourceUri);
			languageId = doc.languageId;
		} catch (error) {
			// Ignorar errores al abrir el documento
		}
	}

	//* Determina qué icono mostrar
	const iconName = await getIconNameForFile(fileName, context, languageId);

	//* Verifica si existe el archivo SVG específico, sino usar uno genérico
	const iconFileName = `${iconName}.svg`;

	if (webview) return webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'webview', 'svg', iconFileName)).toString();

	return iconFileName;
}

/// Elimina los mapas estáticos y actualiza el objeto exportado
const iconUtils = { getIconUrlForFile, getIconNameForFile };

/// Exporta el objeto de utilidades como por defecto para mantener compatibilidad con el código existente que lo importa.
export default iconUtils;
// Singleton para exponer las URIs de los SVG
export const SvgIconUris: Partial<Record<SvgAsset, string>> = {};

/// Inicializa las URIs de los SVG para el webview. Debe llamarse una sola vez tras tener context y webview.
export function initSvgIconUris(context: vscode.ExtensionContext, webview: vscode.Webview) {
	SvgIconUris[SvgAsset.Error] = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'webview', 'assets', 'svg', SvgAsset.Error)).toString();
	SvgIconUris[SvgAsset.Warning] = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'webview', 'assets', 'svg', SvgAsset.Warning)).toString();
	SvgIconUris[SvgAsset.Info] = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'webview', 'assets', 'svg', SvgAsset.Info)).toString();
	SvgIconUris[SvgAsset.Save] = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'webview', 'assets', 'svg', SvgAsset.Save)).toString();
	SvgIconUris[SvgAsset.Close] = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'webview', 'assets', 'svg', SvgAsset.Close)).toString();
	SvgIconUris[SvgAsset.Icon] = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'webview', 'assets', 'svg', SvgAsset.Icon)).toString();
}
