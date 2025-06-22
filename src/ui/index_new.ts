import * as vscode from 'vscode';
import { TabInfo } from '../tabs';
import { Localization } from '../localization';
import { IconManager } from '../icons';
import { DiagnosticsManager } from '../diagnostics';

/**
 * Genera el HTML y gestiona la UI del webview
 */
export class UIManager {
	private iconManager: IconManager;
	private diagnosticsManager: DiagnosticsManager;

	constructor(iconManager: IconManager, diagnosticsManager: DiagnosticsManager) {
		this.iconManager = iconManager;
		this.diagnosticsManager = diagnosticsManager;
	}

	/**
	 * Genera un mensaje para actualizar solo el estado activo de las pestañas
	 */
	public generateActiveTabUpdateMessage(activeTabUniqueId: string | undefined): any {
		return {
			type: 'updateActiveTab',
			activeTabId: activeTabUniqueId
		};
	}

	/**
	 * Genera el HTML completo para el webview
	 */
	public async generateHTML(webview: vscode.Webview, allTabs: TabInfo[], context: vscode.ExtensionContext): Promise<string> {
		const config = vscode.workspace.getConfiguration('sidetabs');
		const fontSize = config.get<number>('fontSize', 14);
		const tabHeight = config.get<number>('tabHeight', 40);
		const showDirectoryPath = config.get<boolean>('showDirectoryPath', true);

		const localizationInstance = Localization.getInstance();
		const localize = (key: string, ...args: any[]) => localizationInstance.getLocaleString(key, ...args);

		// SVGs inline para iconos
		const closeSvgInline = `<svg class="close-svg" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;
		const saveSvgBase64 = 'data:image/svg+xml;base64,PHN2ZyBpZD0iQ2FwYV8xIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZlcnNpb249IjEuMSIgdmlld0JveD0iMCAwIDI0IDI0Ij4KICA8ZGVmcz4KICAgIDxzdHlsZT4KICAgICAgLnN0MCB7CiAgICAgICAgZmlsbDogIzYyYTZmODsKICAgICAgfQogICAgPC9zdHlsZT4KICA8L2RlZnM+CiAgPGNpcmNsZSBjbGFzcz0ic3QwIiBjeD0iMTIiIGN5PSIxMiIgcj0iNiIvPgo8L3N2Zz4K';

		let html = this.generateHtmlHeader(fontSize, tabHeight);
		html += await this.generateTabsHTML(allTabs, context, showDirectoryPath, closeSvgInline, saveSvgBase64, fontSize);
		html += this.generateJavaScript();
		html += '</body></html>';

		return html;
	}

	/**
	 * Genera la cabecera HTML con estilos CSS
	 */
	private generateHtmlHeader(fontSize: number, tabHeight: number): string {
		return `<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<title>Side Tabs Panel</title>
			<style>
			/* Estilos para tooltips personalizados con el estilo de VS Code */
			.vscode-tooltip {
			  background-color: var(--vscode-editorHoverWidget-background, #252526);
			  color: var(--vscode-editorHoverWidget-foreground, #cccccc);
			  border: 1px solid var(--vscode-editorHoverWidget-border, #454545);
			  border-radius: 4px;
			  padding: 6px 8px;
			  font-size: 12px;
			  max-width: 300px;
			  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
			  z-index: 1000;
			  white-space: normal;
			  line-height: 1.4;
			  position: fixed;
			  pointer-events: none;
			  opacity: 0;
			  visibility: hidden;
			  transition: opacity 0.15s ease-out, transform 0.15s ease-out, visibility 0.15s;
			  transform: translateY(4px);
			  font-family: var(--vscode-font-family);
			  overflow-wrap: break-word;
			  word-break: normal;
			}
			.vscode-tooltip.visible {
			  opacity: 1;
			  visibility: visible;
			  transform: translateY(0);
			}
			
			/* Hacer los elementos con tooltips más interactivos */
			[data-tooltip-content] {
			  position: relative;
			}
			
			/* Ocultar tooltips nativos del navegador */
			[data-tooltip-content]:hover::after {
			  content: none !important;
			}
			.file-icon { 
				display: inline-block; 
				vertical-align: middle; 
				flex-shrink: 0;
				pointer-events: none;
			}
			body { 
				font-family: var(--vscode-font-family); 
				margin: 0; 
				padding: 0; 
				background: var(--vscode-sideBar-background);
			}
			.tab { 
				display: flex; 
				align-items: center; 
				padding: 8px 12px; 
				border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border); 
				cursor: pointer;
				position: relative;
				user-select: none;
				min-height: ${tabHeight}px; /* Altura configurable */
				box-sizing: border-box;
				z-index: 1;
				border-left: 3px solid transparent;
			}
			.tab.dragging {
				opacity: 0.5;
				cursor: move;
			}
			/* Línea de inserción entre pestañas */
			.drop-indicator {
				position: absolute;
				left: 0;
				right: 0;
				height: 2px;
				background-color: var(--vscode-focusBorder);
				pointer-events: none !important;
				z-index: 2;
				display: none;
			}
			.tab.drag-over-top .drop-indicator {
				display: block;
				top: -1px;
			}
			.tab.drag-over-bottom .drop-indicator {
				display: block;
				bottom: -1px;
			}
			.tab.active { 
				background: var(--vscode-list-activeSelectionBackground); 
				color: var(--vscode-list-activeSelectionForeground);
				border-left: 3px solid var(--vscode-focusBorder);
				/* Sin transiciones para cambio instantáneo */
			}
			/* Sin transición para hover - completamente instantáneo */
			.tab:hover:not(.active) {
				background: var(--vscode-list-hoverBackground);
			}
			/* Estilo para la pestaña con menú contextual activo */
			.tab.contextmenu-active {
				background-color: var(--vscode-list-hoverBackground);
				outline: 1px solid var(--vscode-focusBorder);
			}
			.tab .label {
				flex: 1;
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
				color: var(--vscode-foreground);
				font-size: ${fontSize}px; /* Tamaño de fuente configurable */
			}
			.tab .directory {
				opacity: 0.6;
				font-size: ${fontSize - 2}px;
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
			}
			.tab .label.faded {
				color: var(--vscode-sideBarTitle-foreground, #888);
			}
			.tab .label.error {
				color: var(--vscode-errorForeground) !important;
			}
			.tab .label.warning {
				color: var(--vscode-list-warningForeground, var(--vscode-problemsWarningIcon-foreground, #cca700)) !important;
			}
			.tab .label.info {
				color: var(--vscode-notificationsInfoIcon-foreground, var(--vscode-problemsInfoIcon-foreground, #75beff)) !important;
			}
			.tab.active .label {
				color: var(--vscode-list-activeSelectionForeground, #fff);
			}
			.tab.active .label.error,
			.tab.active .label.warning,
			.tab.active .label.info {
				opacity: 1 !important;
			}
			.tab .problems {
				margin-left: 6px;
				font-weight: 500;
				font-size: ${Math.max(fontSize - 1, 12)}px; /* Ajustamos también el tamaño del contador */
			}
			.tab .tab-actions {
				margin-left: 8px;
				position: relative;
				width: 18px;
				height: 18px;
			}
			.tab .save-icon {
				display: flex;
				align-items: center;
				justify-content: center;
				position: absolute;
				top: 0;
				left: 0;
			}
			.tab .save-svg {
				stroke: var(--vscode-sideBarTitle-foreground, #888); /* Color faded en lugar de azul */
				width: 18px;
				height: 18px;
			}
			.tab .close {
				display: none;
				cursor: pointer;
				padding: 0;
				border-radius: 3px;
				background: transparent;
				opacity: 0.7;
				line-height: 1;
				vertical-align: middle;
				position: absolute;
				top: 0;
				left: 0;
				width: 100%;
				height: 100%;
				display: flex;
				align-items: center;
				justify-content: center;
				opacity: 0;
			}
			.tab .close-svg {
				width: 18px;
				height: 18px;
				display: block;
				background: none;
				border: none;
				padding: 0;
				margin: 0;
				stroke: var(--vscode-sideBarTitle-foreground, #888);
			}
			/* Cambio instantáneo entre iconos sin transiciones */
			.tab:hover .close {
				opacity: 1;
			}
			.tab:hover .save-icon {
				opacity: 0;
			}
			.tab .close:hover .close-svg {
				stroke: var(--vscode-list-activeSelectionForeground, #fff);
				/* Sin filtros que puedan causar parpadeo */
			}
			.tab .icon-container {
				position: relative;
				margin-right: 8px;
				width: 16px;
				height: 16px;
				flex-shrink: 0;
			}
			</style>
		</head>
		<body>`;
	}

	/**
	 * Genera el HTML para todas las pestañas
	 */
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

			// Extraer el directorio del archivo si corresponde
			let directoryPath = '';
			if (showDirectoryPath && tab.input instanceof vscode.TabInputText) {
				const uri = tab.input.uri;
				const path = require('path');
				// Obtener la ruta relativa al workspace
				let relativePath = '';
				if (vscode.workspace.workspaceFolders) {
					const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
					if (workspaceFolder) {
						relativePath = path.relative(workspaceFolder.uri.fsPath, path.dirname(uri.fsPath));
						if (relativePath) {
							directoryPath = relativePath;
						}
					} else {
						// Si no está en ningún workspace, mostrar la ruta absoluta acortada
						const dirName = path.dirname(uri.fsPath);
						const parts = dirName.split(path.sep);
						if (parts.length > 2) {
							directoryPath = path.join(parts[parts.length - 2], parts[parts.length - 1]);
						} else {
							directoryPath = dirName;
						}
					}
				}
			}

			// Generar icono
			let iconHtml = '<span class="codicon codicon-file"></span>';
			let fileName: string | undefined = undefined;
			if (tab.input instanceof vscode.TabInputText) {
				fileName = tab.input.uri.path.split('/').pop() || '';
			} else if ((tab as any).input && (tab as any).input.uri) {
				try {
					fileName = (tab as any).input.uri.path.split('/').pop() || '';
				} catch { }
			}
			if (fileName) {
				const iconBase64 = await this.iconManager.getFileIconAsBase64(fileName, context, languageId);
				if (iconBase64) {
					iconHtml = `<div class="icon-container">
						<div class="file-icon" style="width:16px;height:16px;background-image:url('${iconBase64}');background-size:contain;background-repeat:no-repeat;background-position:center;position:absolute;z-index:1;"></div>
					</div>`;
				}
			}

			// Determinar la clase del label y el texto de problemas
			let labelClass = isActive ? 'label' : 'label faded';
			let problemsText = '';
			let diagnosticsInfo = '';

			if (tab.input instanceof vscode.TabInputText) {
				const problems = await this.diagnosticsManager.getProblems(tab.input.uri);
				labelClass = this.diagnosticsManager.getLabelClass(problems, isActive);
				problemsText = this.diagnosticsManager.getProblemsText(problems);

				// Generar información detallada para el tooltip
				if (problems && (problems.errors > 0 || problems.warnings > 0 || problems.infos > 0)) {
					const diagnosticsLines = [];
					if (problems.errors > 0) diagnosticsLines.push(`<span style="color: var(--vscode-list-errorForeground);">🔴 ${problems.errors} error${problems.errors > 1 ? 's' : ''}</span>`);
					if (problems.warnings > 0) diagnosticsLines.push(`<span style="color: var(--vscode-list-warningForeground);">🟡 ${problems.warnings} warning${problems.warnings > 1 ? 's' : ''}</span>`);
					if (problems.infos > 0) diagnosticsLines.push(`<span style="color: var(--vscode-notificationsInfoIcon-foreground);">🔵 ${problems.infos} info${problems.infos > 1 ? 's' : ''}</span>`);
					diagnosticsInfo = '<br><br>' + diagnosticsLines.join('<br>');
				}
			} else if (!isActive) {
				labelClass = 'label faded';
			}

			// Crear tooltip con información completa
			const baseTooltip = directoryPath ? `${directoryPath}\\${label}` : label;
			const fullTooltip = baseTooltip + diagnosticsInfo;

			// Generar HTML de la pestaña
			html += `<div class="tab${isActive ? ' active' : ''}"
			data-unique-id="${uniqueId}"
			data-label="${label}"
			data-tooltip-content="${fullTooltip.replace(/"/g, '&quot;')}"
			draggable="true">
		<div class="click-layer"></div>
		${iconHtml}
		<span class="${labelClass}">
			${label}
			${problemsText ? `<span class="problems">${problemsText}</span>` : ''}
			${showDirectoryPath && directoryPath ? `<span class="directory"> • ${directoryPath}</span>` : ''}
		</span>
		<div class="tab-actions">
			${isDirty ? `<div class="save-icon" data-tooltip-content="${localize('unsavedChanges', 'Archivo con cambios sin guardar')}"><img src="${saveSvgBase64}" style="width:18px;height:18px;display:block;"/></div>` : ''}
			<span class="close" data-tooltip-content="${localize('closeTab', 'Cerrar pestaña')}">${closeSvgInline}</span>
		</div>
		<div class="drop-indicator"></div>
	</div>`;
		}

		return html;
	}

	/**
	 * Genera el JavaScript del webview
	 */
	private generateJavaScript(): string {
		return `<script>
	const vscode = acquireVsCodeApi();
	let draggedTab = null;
	let allTabs = Array.from(document.querySelectorAll('.tab'));
	const tabContainer = document.body; // Usar body como contenedor
	let tooltipTimeout = null;
	let activeTooltip = null;

	// Función para actualizar rápidamente el estado activo de las pestañas
	function updateActiveTab(activeTabId) {
		// Usar un cache de elementos para evitar búsquedas DOM repetidas
		if (!window.tabElementsCache) {
			window.tabElementsCache = new Map();
			allTabs.forEach(tab => {
				window.tabElementsCache.set(tab.dataset.uniqueId, tab);
			});
		}

		// Actualizar solo si es necesario y de forma completamente sincrónica
		if (window.lastActiveTabId !== activeTabId) {
			// Usar requestAnimationFrame para sincronizar con el repaint del navegador
			// pero ejecutar inmediatamente para máxima velocidad
			const updateClasses = () => {
				// Remover clase active del tab anterior si existe
				if (window.lastActiveTabId) {
					const prevTab = window.tabElementsCache.get(window.lastActiveTabId);
					if (prevTab) {
						prevTab.classList.remove('active');
					}
				}

				// Agregar clase active al nuevo tab activo si existe
				if (activeTabId) {
					const newTab = window.tabElementsCache.get(activeTabId);
					if (newTab) {
						newTab.classList.add('active');
					}
				}
			};

			// Ejecutar inmediatamente para máxima velocidad
			updateClasses();
			window.lastActiveTabId = activeTabId;
		}
	}

	// Función para invalidar cache cuando se regenera el DOM
	function invalidateTabCache() {
		window.tabElementsCache = null;
		window.lastActiveTabId = null;
	}

	// Listener para mensajes del extension host
	window.addEventListener('message', event => {
		const message = event.data;
		if (message.type === 'updateActiveTab') {
			updateActiveTab(message.activeTabId);
		}
	});

	// Invalidar cache al cargar nueva instancia del webview
	invalidateTabCache();
	
	// Actualizar referencia de allTabs
	allTabs = Array.from(document.querySelectorAll('.tab'));

	// Crear el elemento tooltip que se reutilizará
	function createTooltip() {
		if (document.querySelector('.vscode-tooltip')) {
			return document.querySelector('.vscode-tooltip');
		}
		const tooltip = document.createElement('div');
		tooltip.className = 'vscode-tooltip';
		document.body.appendChild(tooltip);
		return tooltip;
	}

	// Mostrar tooltip en posición específica
	function showTooltip(element, content) {
		// Cancelar cualquier tooltip pendiente
		if (tooltipTimeout) {
			clearTimeout(tooltipTimeout);
		}
		
		// Crear o reutilizar el elemento tooltip
		const tooltip = createTooltip();
		activeTooltip = tooltip;
		
		// Actualizar contenido (permitir HTML para diagnósticos)
		tooltip.innerHTML = content;
		
		// Posicionar el tooltip con delay más largo
		tooltipTimeout = setTimeout(() => {
			const rect = element.getBoundingClientRect();
			
			// Posicionar encima o debajo dependiendo del espacio disponible
			const spaceBelow = window.innerHeight - rect.bottom;
			const spaceAbove = rect.top;
			
			const tooltipHeight = tooltip.offsetHeight;
			
			let top, left;
			
			if (spaceBelow >= tooltipHeight || spaceBelow >= spaceAbove) {
				// Mostrar debajo
				top = rect.bottom + 5;
			} else {
				// Mostrar arriba
				top = rect.top - tooltipHeight - 5;
			}
			
			// Centrar horizontalmente
			left = rect.left + (rect.width / 2) - (tooltip.offsetWidth / 2);
			
			// Asegurar que no se salga de la ventana
			if (left < 5) left = 5;
			if (left + tooltip.offsetWidth > window.innerWidth - 5) {
				left = window.innerWidth - tooltip.offsetWidth - 5;
			}
			
			tooltip.style.top = top + 'px';
			tooltip.style.left = left + 'px';
			tooltip.classList.add('visible');
		}, 800); // Delay más largo para evitar tooltips accidentales
	}

	// Ocultar tooltip
	function hideTooltip() {
		if (tooltipTimeout) {
			clearTimeout(tooltipTimeout);
			tooltipTimeout = null;
		}
		
		if (activeTooltip) {
			activeTooltip.classList.remove('visible');
		}
	}

	// Aplicar tooltips a todos los elementos con data-tooltip-content
	document.addEventListener('mouseover', e => {
		const tooltipTarget = e.target.closest('[data-tooltip-content]');
		if (tooltipTarget) {
			const content = tooltipTarget.getAttribute('data-tooltip-content');
			showTooltip(tooltipTarget, content);
		}
	});

	// Solo ocultar tooltip cuando se sale de la pestaña completamente
	document.addEventListener('mouseout', e => {
		const tooltipTarget = e.target.closest('.tab');
		const relatedTarget = e.relatedTarget;
		
		// Solo ocultar si realmente salimos de la pestaña
		if (tooltipTarget && (!relatedTarget || !tooltipTarget.contains(relatedTarget))) {
			hideTooltip();
		}
	});
	
	// Actualizar posición del tooltip cuando se desplace la página
	document.addEventListener('scroll', () => {
		if (activeTooltip && activeTooltip.classList.contains('visible')) {
			// Simplemente ocultamos el tooltip al desplazarnos
			hideTooltip();
		}
	}, true);

	// Cerrar tooltips al hacer clic en cualquier parte
	document.addEventListener('click', () => {
		hideTooltip();
	});

	// Dragover global para evitar icono prohibido y parpadeo
	document.addEventListener('dragover', e => {
		e.preventDefault();
		e.dataTransfer.dropEffect = 'move';
	}, false);

	// Nuevo: dragover en el contenedor para highlight estable
	tabContainer.addEventListener('dragover', e => {
		if (!draggedTab) return;
		let target = document.elementFromPoint(e.clientX, e.clientY);
		while (target && !target.classList.contains('tab') && target !== tabContainer) {
			target = target.parentElement;
		}
		allTabs.forEach(t => t.classList.remove('drag-over-top', 'drag-over-bottom'));
		if (target && target.classList.contains('tab') && target !== draggedTab) {
			const idx = allTabs.indexOf(target);
			const rect = target.getBoundingClientRect();
			const midY = rect.top + rect.height / 2;
			const isLast = idx === allTabs.length - 1;
			const isAbove = e.clientY < midY;
			if (isLast && !isAbove) {
				target.classList.add('drag-over-bottom');
			} else {
				target.classList.add('drag-over-top');
			}
		}
	});

	// Asignar eventos drag & drop a cada tab
	allTabs.forEach(tab => {
		tab.addEventListener('dragstart', e => {
			// Ocultar tooltips cuando comience el arrastre
			hideTooltip();
			
			draggedTab = tab;
			tab.classList.add('dragging');
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', tab.dataset.uniqueId);
		});
		tab.addEventListener('dragend', e => {
			draggedTab = null;
			allTabs.forEach(t => t.classList.remove('dragging', 'drag-over-top', 'drag-over-bottom'));
		});
		tab.addEventListener('drop', e => {
			e.preventDefault();
			allTabs.forEach(t => t.classList.remove('drag-over-top', 'drag-over-bottom'));
			const sourceUniqueId = e.dataTransfer.getData('text/plain');
			const targetUniqueId = tab.dataset.uniqueId;
			let position = 'before';
			const rect = tab.getBoundingClientRect();
			const midY = rect.top + rect.height / 2;
			if (e.clientY > midY) position = 'after';
			if (sourceUniqueId && targetUniqueId && sourceUniqueId !== targetUniqueId) {
				vscode.postMessage({ command: 'move', uniqueId: sourceUniqueId, targetUniqueId, position });
			}
		});
		tab.addEventListener('dragleave', e => {
			tab.classList.remove('drag-over-top', 'drag-over-bottom');
		});

		// Click events para abrir/cerrar pestañas
		tab.addEventListener('click', e => {
			// Ocultar tooltips al hacer clic
			hideTooltip();
			
			e.stopPropagation();
			const closeBtn = e.target.closest('.close');
			if (closeBtn) {
				// Cierre instantáneo sin animación
				vscode.postMessage({ command: 'close', uniqueId: tab.dataset.uniqueId });
			} else if (e.target.classList.contains('click-layer') || !e.target.classList.contains('move-btn')) {
				vscode.postMessage({ command: 'focus', uniqueId: tab.dataset.uniqueId });
			}
		});
		
		// Menú contextual para las pestañas
		tab.addEventListener('contextmenu', e => {
			// Ocultar tooltips al mostrar el menú contextual
			hideTooltip();
			
			e.preventDefault();
			e.stopPropagation();
			
			// Marcar visualmente la tab actual antes de mostrar el menú contextual
			allTabs.forEach(t => t.classList.remove('contextmenu-active'));
			tab.classList.add('contextmenu-active');
			
			vscode.postMessage({ 
				command: 'showContextMenu', 
				uniqueId: tab.dataset.uniqueId,
				label: tab.dataset.label, // Mantenemos el label para mostrar en el menú
				x: e.clientX,  // Posición X del click
				y: e.clientY   // Posición Y del click
			});
			
			// Eliminar la marca visual después de un tiempo
			setTimeout(() => {
				tab.classList.remove('contextmenu-active');
			}, 1000);
		});
		
		// Específicamente asignar evento a clicklayer para garantizar el enfoque
		const clickLayer = tab.querySelector('.click-layer');
		if (clickLayer) {
			clickLayer.addEventListener('click', e => {
				e.stopPropagation();
				vscode.postMessage({ command: 'focus', uniqueId: tab.dataset.uniqueId });
			});
		}
	});
</script>`;
	}
}
