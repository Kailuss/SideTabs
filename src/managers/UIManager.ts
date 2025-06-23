import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TabInfo } from './TabManager';
import { Localization } from '../localization/Localization';
import { IconManager } from './IconManager';
import { DiagnosticsManager } from './DiagnosticsManager';

/// Genera el HTML y gestiona la UI del webview
export class UIManager {
	private iconManager: IconManager;
	private diagnosticsManager: DiagnosticsManager;

	constructor(iconManager: IconManager, diagnosticsManager: DiagnosticsManager) {
		this.iconManager = iconManager;
		this.diagnosticsManager = diagnosticsManager;
	}

	//* Genera un mensaje para actualizar solo el estado activo de las pestañas
	public generateActiveTabUpdateMessage(activeTabUniqueId: string | undefined): any {
		return {
			type: 'updateActiveTab',
			activeTabId: activeTabUniqueId
		};
	}

	//* Genera iconos SVG inline para tooltips de diagnósticos
	private getSvgIcon(type: 'error' | 'warning' | 'info'): string {
		const colorVar = {
			error: 'var(--vscode-editorError-foreground, #f14c4c)',
			warning: 'var(--vscode-editorWarning-foreground, #cca700)',
			info: 'var(--vscode-editorInfo-foreground, #3794ff)'
		};
		const svgMap = {
			error: `<svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' style='display:inline-block;vertical-align:-3px;'><path d='m15 9-6 6'/><path d='M2.586 16.726A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2h6.624a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586z'/><path d='m9 9 6 6'/></svg>`,
			warning: `<svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' style='display:inline-block;vertical-align:-3px;'><path d='m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3'/><path d='M12 9v4'/><path d='M12 17h.01'/></svg>`,
			info: `<svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' style='display:inline-block;vertical-align:-3px;'><circle cx='12' cy='12' r='10'/><path d='M12 16v-4'/><path d='M12 8h.01'/></svg>`
		};
		return `<span style='display:inline-flex;align-items:center;color:${colorVar[type]};vertical-align:middle;'>${svgMap[type]}</span>`;
	}

	//* Mejora el quebrado de líneas en rutas para tooltips
	private formatPathForTooltip(path: string): string {
		if (!path) return '';
		if (path.length <= 60) return path;
		const lastSlash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
		if (lastSlash > 0 && lastSlash < path.length - 1) {
			return path.slice(0, lastSlash + 1) + '<br>' + path.slice(lastSlash + 1);
		}
		return path;
	}

	/**
	 * Genera contenido de tooltip mejorado con iconos y líneas de error
	 */
	public generateEnhancedTooltip(tab: vscode.Tab, directoryPath: string, problems: any): string {
		// Ya no se generan tooltips
		return '';
	}

	/// Genera el HTML para todas las pestañas

	private async generateTabsHTML(
		allTabs: TabInfo[],
		context: vscode.ExtensionContext,
		showDirectoryPath: boolean,
		closeSvgInline: string,
		saveSvgBase64: string,
		fontSize: number
	): Promise<string> {
		let html = '';
		const localizationInstance = Localization.getInstance();
		const localize = (key: string, ...args: any[]) => localizationInstance.getLocaleString(key, ...args);

		for (const { tab, group, languageId, uniqueId } of allTabs) {
			const isActive = group.activeTab === tab;
			const label = tab.label;
			const isDirty = tab.isDirty;
			let directoryPath = '';

			if (showDirectoryPath && tab.input instanceof vscode.TabInputText) {
				const fsPath = tab.input.uri.fsPath;
				directoryPath = path.dirname(fsPath);
				const workspaceFolder = vscode.workspace.getWorkspaceFolder(tab.input.uri);
				if (workspaceFolder) {
					directoryPath = path.relative(workspaceFolder.uri.fsPath, directoryPath);
				}
			}

			let problems = null;
			if (tab.input instanceof vscode.TabInputText) {
				problems = await this.diagnosticsManager.getProblems(tab.input.uri);
			}
			// const totalProblemsText = problems ? this.diagnosticsManager.getTotalProblems(problems) : '';
			// No se genera tooltip
			// const tooltip = this.generateEnhancedTooltip(tab, directoryPath, problems);

			// Clases para el label
			const labelClass = `label ${problems && (problems.errors > 0 || problems.warnings > 0) ? 'has-problems' : ''}`;
			// Icon como base64
			const iconSrc = await this.iconManager.getFileIconAsBase64(tab.label, context, languageId);
			// Generar HTML de la pestaña
			const hasDiagnostics = problems && (problems.errors > 0 || problems.warnings > 0 || problems.infos > 0);

			let diagnosticsRowHtml = '';
			if (hasDiagnostics && problems) {
				const diagnosticsItems = [];

				if (problems.errors > 0) {
					const errorIcon = this.getSvgIcon('error');
					// Añadir el ícono de error y el conteo
					diagnosticsItems.push(`<div class="diagnostics-item">${errorIcon}<span style="margin-left:4px">${problems.errors}}</span></div>`);
				}

				if (problems.warnings > 0) {
					const warningIcon = this.getSvgIcon('warning');
					diagnosticsItems.push(`<div class="diagnostics-item">${warningIcon}<span style="margin-left:4px">${problems.warnings}</span></div>`);
				}

				if (problems.infos > 0) {
					const infoIcon = this.getSvgIcon('info');
					diagnosticsItems.push(`<div class="diagnostics-item">${infoIcon}<span style="margin-left:4px">${problems.infos}</span></div>`);
				}

				//Verificar si hay líneas de error disponibles
				/* 				const diagnosticUri = (tab.input instanceof vscode.TabInputText) ? tab.input.uri : undefined;
								let linesInfo = '';
								if (diagnosticUri) {
									const allDiagnostics = vscode.languages.getDiagnostics(diagnosticUri);
									if (allDiagnostics && allDiagnostics.length > 0) {
										const maxLines = 3;
										const errorLines = allDiagnostics
											.filter(d => d.severity === vscode.DiagnosticSeverity.Error)
											.map(d => d.range.start.line + 1);
				
										if (errorLines.length > 0) {
											const linesToShow = errorLines.slice(0, maxLines);
											const moreLines = errorLines.length > maxLines ? `, +${errorLines.length - maxLines} more` : '';
											linesInfo = `<div class="diagnostics-lines">Lines: ${linesToShow.join(', ')}${moreLines}</div>`;
										}
									}
								} */

				// Formato más compacto sin saltos de línea innecesarios
				diagnosticsRowHtml = `<div class="diagnostics-row">${diagnosticsItems.join('')}</div>`; // ${linesInfo}
			}

			// Añadir una clase cuando hay diagnósticos para styling adicional
			const hasIssuesClass = hasDiagnostics ? 'has-diagnostics' : '';

			// ${totalProblemsText ? `<span class="problems">${totalProblemsText}</span>` : ''}
			html += `<div class="tab ${isActive ? 'active' : ''} ${hasIssuesClass}" draggable="true"
				data-unique-id="${uniqueId}"
				data-language="${languageId || ''}">
				<div class="icon-container">
					${iconSrc ? `<img class="icon" src="${iconSrc}" alt="file icon" />` : '<div class="icon-placeholder"></div>'}
				</div>
				<div class="label-container">
					<span class="${labelClass}">${label}</span>
					${showDirectoryPath && directoryPath ? `<span class="directory">${directoryPath}</span>` : ''}
					${diagnosticsRowHtml}
				</div>
				<div class="tab-actions">
					${isDirty ? `<div class="save-icon"><img src="${saveSvgBase64}" style="width:18px;height:18px;display:block;"/></div>` : ''}
					<span class="close">${closeSvgInline}</span>
				</div>
				<div class="drop-indicator"></div>
			</div>`;
		}

		return html;
	}

	/**
	 * Lee y procesa la plantilla HTML
	 */
	private async processTemplate(context: vscode.ExtensionContext, webview: vscode.Webview, fontSize: number, tabHeight: number, tabsHtml: string): Promise<string> {
		const templatePath = vscode.Uri.joinPath(context.extensionUri, 'media', 'sidetabs.html').fsPath;
		let template = fs.readFileSync(templatePath, 'utf8');

		// Generar el estilo dinámico
		const dynamicStyles = `
			:root {
				--tab-height: ${tabHeight}px;
				--font-size: ${fontSize}px;
				--directory-font-size: ${fontSize - 2}px;
				--problems-font-size: ${fontSize - 2}px;
			}
		`;

		// Reemplazar los placeholders
		const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'sidetabs.css')).toString();
		const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'sidetabs.js')).toString();

		// Debug: Verificar las URIs generadas
		console.log('CSS URI:', cssUri);
		console.log('JS URI:', jsUri);

		// Actualizar los atributos src y href con reemplazos más específicos
		template = template.replace('PLACEHOLDER_CSS_URI', cssUri);
		template = template.replace('PLACEHOLDER_JS_URI', jsUri);

		// Insertar los estilos dinámicos
		template = template.replace('/* Los estilos dinámicos se insertarán aquí */', dynamicStyles);

		// Insertar el contenido de las pestañas
		template = template.replace('PLACEHOLDER_TABS_CONTENT', tabsHtml);

		return template;
	}

	/**
	 * Genera el HTML completo para el webview
	 */
	public async generateHTML(webview: vscode.Webview, allTabs: TabInfo[], context: vscode.ExtensionContext): Promise<string> {
		const config = vscode.workspace.getConfiguration('sidetabs');
		const fontSize = config.get<number>('fontSize', 14);
		const tabHeight = config.get<number>('tabHeight', 40);
		const showDirectoryPath = config.get<boolean>('showDirectoryPath', true);

		const closeSvgInline = `<svg class="close-svg" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;
		const saveSvgBase64 = 'data:image/svg+xml;base64,PHN2ZyBpZD0iQ2FwYV8xIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZlcnNpb249IjEuMSIgdmlld0JveD0iMCAwIDI0IDI0Ij4KICA8ZGVmcz4KICAgIDxzdHlsZT4KICAgICAgLnN0MCB7CiAgICAgICAgZmlsbDogIzYyYTZmODsKICAgICAgfQogICAgPC9zdHlsZT4KICA8L2RlZnM+CiAgPGNpcmNsZSBjbGFzcz0ic3QwIiBjeD0iMTIiIGN5PSIxMiIgcj0iNiIvPgo8L3N2Zz4K';

		const tabsHtml = await this.generateTabsHTML(allTabs, context, showDirectoryPath, closeSvgInline, saveSvgBase64, fontSize);
		return this.processTemplate(context, webview, fontSize, tabHeight, tabsHtml);
	}
}
