// Adjust the import path as needed based on your project structure.
// Example if 'iconsUtils' is in 'src/services/utils/iconsUtils.ts':
import iconUtils from '../utils/iconsUtils';

//· Plantillas centralizadas para la generación de HTML de pestañas, diagnósticos e iconos en SideTabs

export interface RenderTabOptions {
	uniqueId: string;
	iconPath: string;
	label: string;
	directory?: string;
	isActive: boolean;
	isDirty: boolean;
	diagnosticsHtml?: string;
}

let errorIcon: string;
let warningIcon: string;
let infoIcon: string;

export async function initDiagnosticsIcons(context: any, webview: any) {
	errorIcon = await iconUtils.getIconUrlForFile(undefined, 'error', context, webview);
	warningIcon = await iconUtils.getIconUrlForFile(undefined, 'warning', context, webview);
	infoIcon = await iconUtils.getIconUrlForFile(undefined, 'info', context, webview);
}

//· Genera el HTML para una pestaña con icono, nombre, ruta y diagnóstico 
export function renderTab({ uniqueId, iconPath, label, directory, isActive, isDirty, diagnostics, diagnosticsLevel }: RenderTabOptions & { diagnostics?: { errors: number, warnings: number, infos: number }, diagnosticsLevel?: 'error' | 'warning' | 'info' }): string {
	const filenameClass = diagnosticsLevel ? `tab-filename ${diagnosticsLevel}` : 'tab-filename';

	// Genera estilos en línea para mostrar los diagnósticos de forma más compacta
	const getInlineDiagnosticsCount = (count: number, type: 'error' | 'warning' | 'info'): string => {
		if (count <= 0) return '';
		return `<span class="diagnostics-count ${type}" title="${count} ${type === 'error' ? 'errores' : type === 'warning' ? 'advertencias' : 'info'}">${count}</span>`;
	};

	// Diagnóstico compacto: N · W · I
	let diagnosticsCompact = '';
	if (diagnostics) {
		const parts = [];
		if (diagnostics.errors > 0) parts.push(getInlineDiagnosticsCount(diagnostics.errors, 'error'));
		if (diagnostics.warnings > 0) parts.push(getInlineDiagnosticsCount(diagnostics.warnings, 'warning'));
		if (diagnostics.infos > 0) parts.push(getInlineDiagnosticsCount(diagnostics.infos, 'info'));

		if (parts.length > 0) {
			diagnosticsCompact = `<span class="diagnostics-count">${parts.join('<span class="diagnostics-sep">►</span>')}</span>`;
		}
	}

	return `
    <div class="tab${isActive ? ' active' : ''}" data-unique-id="${uniqueId}" data-tab-clickable="true" role="button" tabindex="0">
      <div class="tab-content" data-click-target="true">
        <div class="tab-icon-container" data-parent-id="${uniqueId}">
          <img src="${iconPath}" class="file-icon" alt="" />
        </div>
        <div class="tab-info-container" data-parent-id="${uniqueId}">
          <div class="${filenameClass}" data-parent-id="${uniqueId}">${label}${diagnosticsCompact ? ' ' + diagnosticsCompact : ''}</div>
          ${directory ? `<div class="tab-filepath" data-parent-id="${uniqueId}">${directory}</div>` : ''}
        </div>
        <div class="tab-actions-container" data-parent-id="${uniqueId}">
          ${isDirty ? `<div class="tab-dirty-indicator" data-parent-id="${uniqueId}">${getInlineIcon('save')}</div>` : ''}
          <div class="tab-close-button" data-parent-id="${uniqueId}">${getInlineIcon('close')}</div>
        </div>
      </div>
    </div>
  `;
}

//· Configura las opciones para renderizar diagnósticos de archivos 
export interface RenderDiagnosticsOptions {
	errors: number;
	warnings: number;
	infos: number;
	errorIcon?: string;
	warningIcon?: string;
	infoIcon?: string;
}

//· Genera el HTML para un icono de archivo 
export function renderIcon(iconPath: string, alt: string = '', className: string = 'file-icon'): string {
	return `<img src="${iconPath}" class="${className}" alt="${alt}" />`;
}

// Utilidad para obtener SVG inline como string (solo para iconos diagnostics)
function getInlineIcon(type: 'error' | 'warning' | 'info' | 'close' | 'save'): string {
	// Puedes optimizar esto cargando los SVG una sola vez y guardándolos en variables si lo prefieres
	if (type === 'error') {
		return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="diagnostics-svg error"><path d="M12,.2C5.5.2.2,5.5.2,12s5.3,11.8,11.8,11.8,11.8-5.3,11.8-11.8S18.5.2,12,.2ZM18.1,16.6l-1.5,1.5c-.3.3-.7.3-1,0l-3.6-3.6-3.6,3.6c-.3.3-.7.3-1,0l-1.5-1.4c-.3-.3-.3-.7,0-1l3.6-3.6-3.6-3.6c-.3-.3-.3-.7,0-1l1.5-1.5c.3-.3.7-.3,1,0l3.6,3.6,3.6-3.6c.3-.3.7-.3,1,0l1.5,1.4c.3.3.3.7,0,1l-3.6,3.6,3.6,3.6c.3.3.3.7,0,1Z" fill="currentColor"/></svg>`;
	}
	if (type === 'warning') {
		// SVG de warning (ajusta el contenido según tu warning.svg)
		return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="diagnostics-svg warning"><path
    d="M12,23.8c6.5,0,11.8-5.3,11.8-11.8S18.5.2,12,.2.2,5.5.2,12s5.3,11.8,11.8,11.8ZM14.2,19.2c0,.4-.3.7-.7.7h-3.1c-.4,0-.7-.3-.7-.7v-2.7c0-.4.3-.7.7-.7h3.1c.4,0,.7.3.7.7v2.7ZM9.8,4.8c0-.4.3-.7.7-.7h3.1c.4,0,.7.3.7.7v7.7c0,.4-.3.7-.7.7h-3.1c-.4,0-.7-.3-.7-.7v-7.7Z" fill="currentColor"/></svg>`;
	}
	if (type === 'info') {
		// SVG de info (ajusta el contenido según tu info.svg)
		return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="diagnostics-svg info"><path d="M12,.2C5.5.2.2,5.5.2,12s5.3,11.8,11.8,11.8,11.8-5.3,11.8-11.8S18.5.2,12,.2ZM9.8,4.8c0-.4.3-.7.7-.7h3.1c.4,0,.7.3.7.7v2.7c0,.4-.3.7-.7.7h-3.1c-.4,0-.7-.3-.7-.7v-2.7ZM14.2,19.2c0,.4-.3.7-.7.7h-3.1c-.4,0-.7-.3-.7-.7v-7.7c0-.4.3-.7.7-.7h3.1c.4,0,.7.3.7.7v7.7Z" fill="currentColor"/></svg>`;
	}
	if (type === 'close') {
		return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>`
	}
	if (type === 'save') {
		return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><circle class="tab-dirty-indicator" cx="12" cy="12" r="6" /></svg>`;
	}
	return '';
}

export function renderDiagnostics({ errors, warnings, infos }: RenderDiagnosticsOptions): string {

	let diagnosticsLevel: 'error' | 'warning' | 'info' | undefined = undefined;
	if (errors > 0) {
		diagnosticsLevel = 'error';
	} else if (warnings > 0) {
		diagnosticsLevel = 'warning';
	} else if (infos > 0) {
		diagnosticsLevel = 'info';
	}

	let html = '';
	if (errors > 0) {
		html += `<span class="diagnostics-indicator" title="${errors} errores">
            ${getInlineIcon('error')}
            ${errors}
        </span>`;
	}
	if (warnings > 0) {
		html += `<span class="diagnostics-indicator" title="${warnings} advertencias">
            ${getInlineIcon('warning')}
            ${warnings}
        </span>`;
	}
	if (infos > 0) {
		html += `<span class="diagnostics-indicator" title="${infos} info">
            ${getInlineIcon('info')}
            ${infos}
        </span>`;
	}
	return html ? `<div class="diagnostics-row">${html}</div>` : '';
}
