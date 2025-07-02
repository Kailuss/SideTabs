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
	diagnosisHtml?: string;
}

let errorIcon: string;
let warningIcon: string;
let infoIcon: string;

export async function initDiagnosisIcons(context: any, webview: any) {
	errorIcon = await iconUtils.getIconUrlForFile(undefined, 'error', context, webview);
	warningIcon = await iconUtils.getIconUrlForFile(undefined, 'warning', context, webview);
	infoIcon = await iconUtils.getIconUrlForFile(undefined, 'info', context, webview);
}

//· Genera el HTML para una pestaña con icono, nombre, ruta y diagnóstico 
export function renderTab({ uniqueId, iconPath, label, directory, isActive, isDirty, diagnosis, diagnosisLevel }: RenderTabOptions & { diagnosis?: { errors: number, warnings: number, infos: number }, diagnosisLevel?: 'error' | 'warning' | 'info' }): string {
	const filenameClass = diagnosisLevel ? `tab-filename ${diagnosisLevel}` : 'tab-filename';

	// Genera estilos en línea para mostrar los diagnósticos de forma más compacta
	const getInlineDiagnosisCount = (count: number, type: 'error' | 'warning' | 'info'): string => {
		if (count <= 0) return '';
		return `<span class="diagnosis-count ${type}" title="${count} ${type === 'error' ? 'errores' : type === 'warning' ? 'advertencias' : 'info'}">${count}</span>`;
	};

	// Diagnóstico compacto: N · W · I
	let diagnosisCompact = '';
	if (diagnosis) {
		const parts = [];
		if (diagnosis.errors > 0) parts.push(getInlineDiagnosisCount(diagnosis.errors, 'error'));
		if (diagnosis.warnings > 0) parts.push(getInlineDiagnosisCount(diagnosis.warnings, 'warning'));
		if (diagnosis.infos > 0) parts.push(getInlineDiagnosisCount(diagnosis.infos, 'info'));

		if (parts.length > 0) {
			diagnosisCompact = `<span class="diagnosis-compact">${parts.join('<span class="diagnosis-sep">|</span>')}</span>`;
		}
	}

	return `
    <div class="tab${isActive ? ' active' : ''}" data-unique-id="${uniqueId}">
      <div class="tab-content">
        <div class="tab-icon-container">
          <img src="${iconPath}" class="file-icon" alt="" />
        </div>
        <div class="tab-info-container">
          <div class="${filenameClass}">${label}${diagnosisCompact ? ' ' + diagnosisCompact : ''}</div>
          ${directory ? `<div class="tab-filepath">${directory}</div>` : ''}
        </div>
        <div class="tab-actions-container">
          ${isDirty ? `<div class="tab-dirty-indicator">${getInlineIcon('save')}</div>` : ''}
          <div class="tab-close-button">${getInlineIcon('close')}</div>
        </div>
      </div>
    </div>
  `;
}

//· Configura las opciones para renderizar diagnósticos de archivos 
export interface RenderDiagnosisOptions {
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

// Utilidad para obtener SVG inline como string (solo para iconos diagnosis)
function getInlineIcon(type: 'error' | 'warning' | 'info' | 'close' | 'save'): string {
	// Puedes optimizar esto cargando los SVG una sola vez y guardándolos en variables si lo prefieres
	if (type === 'error') {
		return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="diagnosis-svg error"><path d="M12,.2C5.5.2.2,5.5.2,12s5.3,11.8,11.8,11.8,11.8-5.3,11.8-11.8S18.5.2,12,.2ZM18.1,16.6l-1.5,1.5c-.3.3-.7.3-1,0l-3.6-3.6-3.6,3.6c-.3.3-.7.3-1,0l-1.5-1.4c-.3-.3-.3-.7,0-1l3.6-3.6-3.6-3.6c-.3-.3-.3-.7,0-1l1.5-1.5c.3-.3.7-.3,1,0l3.6,3.6,3.6-3.6c.3-.3.7-.3,1,0l1.5,1.4c.3.3.3.7,0,1l-3.6,3.6,3.6,3.6c.3.3.3.7,0,1Z" fill="currentColor"/></svg>`;
	}
	if (type === 'warning') {
		// SVG de warning (ajusta el contenido según tu warning.svg)
		return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="diagnosis-svg warning"><path
    d="M12,23.8c6.5,0,11.8-5.3,11.8-11.8S18.5.2,12,.2.2,5.5.2,12s5.3,11.8,11.8,11.8ZM14.2,19.2c0,.4-.3.7-.7.7h-3.1c-.4,0-.7-.3-.7-.7v-2.7c0-.4.3-.7.7-.7h3.1c.4,0,.7.3.7.7v2.7ZM9.8,4.8c0-.4.3-.7.7-.7h3.1c.4,0,.7.3.7.7v7.7c0,.4-.3.7-.7.7h-3.1c-.4,0-.7-.3-.7-.7v-7.7Z" fill="currentColor"/></svg>`;
	}
	if (type === 'info') {
		// SVG de info (ajusta el contenido según tu info.svg)
		return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="diagnosis-svg info"><path d="M12,.2C5.5.2.2,5.5.2,12s5.3,11.8,11.8,11.8,11.8-5.3,11.8-11.8S18.5.2,12,.2ZM9.8,4.8c0-.4.3-.7.7-.7h3.1c.4,0,.7.3.7.7v2.7c0,.4-.3.7-.7.7h-3.1c-.4,0-.7-.3-.7-.7v-2.7ZM14.2,19.2c0,.4-.3.7-.7.7h-3.1c-.4,0-.7-.3-.7-.7v-7.7c0-.4.3-.7.7-.7h3.1c.4,0,.7.3.7.7v7.7Z" fill="currentColor"/></svg>`;
	}
	if (type === 'close') {
		return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>`
	}
	if (type === 'save') {
		return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><circle class="tab-dirty-indicator" cx="12" cy="12" r="6" /></svg>`;
	}
	return '';
}

export function renderDiagnosis({ errors, warnings, infos }: RenderDiagnosisOptions): string {

	let diagnosisLevel: 'error' | 'warning' | 'info' | undefined = undefined;
	if (errors > 0) {
		diagnosisLevel = 'error';
	} else if (warnings > 0) {
		diagnosisLevel = 'warning';
	} else if (infos > 0) {
		diagnosisLevel = 'info';
	}

	let html = '';
	if (errors > 0) {
		html += `<span class="diagnosis-indicator" title="${errors} errores">
            ${getInlineIcon('error')}
            ${errors}
        </span>`;
	}
	if (warnings > 0) {
		html += `<span class="diagnosis-indicator" title="${warnings} advertencias">
            ${getInlineIcon('warning')}
            ${warnings}
        </span>`;
	}
	if (infos > 0) {
		html += `<span class="diagnosis-indicator" title="${infos} info">
            ${getInlineIcon('info')}
            ${infos}
        </span>`;
	}
	return html ? `<div class="diagnosis-row">${html}</div>` : '';
}
