// Usar la referencia compartida al API de VS Code
const vscode = window.vscodeApi || (window.vscodeApi = acquireVsCodeApi());

// Variables globales con nombres claros
let allTabs = [];
let tabContainer;
let dragDropCleanup = null; // Función para limpiar eventos de drag & drop

// Asegurar que los objetos globales están disponibles
window.tabsManager = window.tabsManager || {};
window.tabInteractions = window.tabInteractions || {};
window.sidetabsEventManager = window.sidetabsEventManager || {};

/// TabManager: gestión de pestañas
const TabManager = {
	initialize() {
		tabContainer = document.querySelector('#tabs-container');
		if (!tabContainer) {
			console.error('[LoverTab | sidetabs.js] No se encontró el contenedor de pestañas');
			return false;
		}
		this.rebuildTabCache();
		return true;
	},

	//* ✔ Reconstruye la caché de pestañas para acceso rápido y aplica estilos base
	//     Esto se llama al cargar el webview o cuando se actualiza el contenido de las
	rebuildTabCache() {
		allTabs = Array.from(document.querySelectorAll('.tab'));

		// Aplicar estilos base a todas las pestañas para transiciones suaves
		allTabs.forEach(tab => {
			// Los estilos base ahora se manejan en CSS para evitar conflictos
			// No aplicar transiciones aquí para evitar interferir con drag & drop
		});

		console.log(`[LoverTab | sidetabs.js] Cache de pestañas reconstruido. ${allTabs.length} pestañas encontradas.`);
	},

	//* ✔ Actualiza visualmente la pestaña activa
	updateActiveTab(activeTabId) {
		if (!activeTabId) return;
		allTabs.forEach(tab => tab.classList.remove('active'));
		const activeTab = document.querySelector(`.tab[data-unique-id="${activeTabId}"]`);
		if (activeTab) {
			activeTab.classList.add('active');
			activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		}
	},

	//* Determina el nivel de alerta más crítico (error > warning > info)
	getDiagnosisLevel(diagnosis) {
		if (!diagnosis) return undefined;
		if (diagnosis.errors > 0) return 'error';
		if (diagnosis.warnings > 0) return 'warning';
		if (diagnosis.infos > 0) return 'info';
		return undefined;
	},

	//* Actualiza solo la parte de diagnóstico compacto de una pestaña (basado en TabTemplates.ts)
	renderDiagnosis(diagnosis) {
		if (!diagnosis || (diagnosis.errors === 0 && diagnosis.warnings === 0 && diagnosis.infos === 0)) {
			return ''; // No hay diagnósticos para mostrar
		}

		// Implementación de getInlineDiagnosisCount, similar a TabTemplates.ts
		const getInlineDiagnosisCount = (count, type) => {
			if (count <= 0) return '';
			const title = type === 'error' ? 'errores' : type === 'warning' ? 'advertencias' : 'info';
			return `<span class="diagnosis-count ${type}" title="${count} ${title}">${count}</span>`;
		};

		// Genera las partes de diagnóstico
		const parts = [];
		if (diagnosis.errors > 0) parts.push(getInlineDiagnosisCount(diagnosis.errors, 'error'));
		if (diagnosis.warnings > 0) parts.push(getInlineDiagnosisCount(diagnosis.warnings, 'warning'));
		if (diagnosis.infos > 0) parts.push(getInlineDiagnosisCount(diagnosis.infos, 'info'));

		// Combina las partes con el separador
		if (parts.length > 0) {
			return parts.join('<span class="diagnosis-sep">|</span>');
		}
		return '';
	},

	updateCompactDiagnosis(tab, diagnosis) {
		if (!diagnosis) {
			console.log('[LoverTab | sidetabs.js] No hay diagnóstico proporcionado para actualizar');
			return;
		}

		// Determinar si hay algún diagnóstico a mostrar
		const hasDiagnosis = diagnosis.errors > 0 || diagnosis.warnings > 0 || diagnosis.infos > 0;

		//console.log('[LoverTab | sidetabs.js] Actualizando diagnóstico compacto:', diagnosis);

		// Encuentra el elemento del nombre de archivo
		const filename = tab.querySelector('.tab-filename');
		if (!filename) {
			console.log('[LoverTab | sidetabs.js] No se encontró el elemento filename en la pestaña');
			return;
		}

		// Determinar el nivel de diagnóstico para colorear el nombre del archivo
		const diagnosisLevel = this.getDiagnosisLevel(diagnosis);

		// Aplicar clase según el nivel de diagnóstico al filename
		// Primero eliminar todas las posibles clases de diagnóstico
		filename.classList.remove('error', 'warning', 'info');

		// Añadir la clase correspondiente al nivel más crítico si hay diagnósticos
		if (diagnosisLevel) {
			filename.classList.add(diagnosisLevel);
			console.log(`[LoverTab | sidetabs.js] Aplicando clase ${diagnosisLevel} al filename`);
		}

		// Encuentra o crea el contenedor de diagnóstico compacto
		let diagnosisContainer = tab.querySelector('.diagnosis-compact');

		if (!diagnosisContainer && hasDiagnosis) {
			console.log('[LoverTab | sidetabs.js] Creando nuevo contenedor diagnosis-compact');
			// Si no existe el contenedor y hay diagnósticos, crear uno nuevo después del nombre
			diagnosisContainer = document.createElement('span');
			diagnosisContainer.className = 'diagnosis-compact';
			filename.appendChild(document.createTextNode(' '));
			filename.appendChild(diagnosisContainer);
		}

		// Si tenemos un contenedor de diagnóstico, actualizarlo
		if (diagnosisContainer) {
			// Usar el mismo enfoque que renderDiagnosis en TabTemplates.ts
			const diagnosisHTML = this.renderDiagnosis(diagnosis);

			// Actualizar el contenido del diagnóstico
			if (diagnosisHTML) {
				diagnosisContainer.innerHTML = diagnosisHTML;
				diagnosisContainer.style.display = 'inline';
			} else {
				// Si no hay diagnósticos, ocultar el contenedor
				diagnosisContainer.style.display = 'none';
				diagnosisContainer.innerHTML = '';
			}
		}
	},

	//* Actualiza los diagnósticos para todas las pestañas
	updateDiagnosis(diagnosticUpdates) {
		if (!diagnosticUpdates || !Array.isArray(diagnosticUpdates)) {
			console.log('[LoverTab | sidetabs.js] No se proporcionaron actualizaciones de diagnóstico válidas');
			return;
		}

		// Procesar todas las actualizaciones de diagnóstico
		diagnosticUpdates.forEach(update => {
			if (!update || !update.uniqueId) {
				console.log('[LoverTab | sidetabs.js] Actualización de diagnóstico inválida:', update);
				return;
			}

			// Buscar la pestaña correspondiente
			const tab = document.querySelector(`.tab[data-unique-id="${update.uniqueId}"]`);
			if (!tab) {
				console.log(`[LoverTab | sidetabs.js] No se encontró la pestaña con ID: ${update.uniqueId}`);
				return;
			}

			// Actualizar el diagnóstico para esta pestaña
			this.updateCompactDiagnosis(tab, update.diagnosis || update.diagnostic);
		});
	},

	// Handlers centralizados para mensajes del backend
	messageHandlers: {
		updateActiveTab: (message) => TabManager.updateActiveTab(message.activeTabId),
		updateProblems: (message) => TabManager.updateDiagnosis(message.diagnostics),
		// Manejar ambos formatos para retrocompatibilidad
		updateDiagnosis: (message) => {
			console.log('[LoverTab | sidetabs.js] Recibida actualización de diagnósticos (comando updateDiagnosis):', message);
			if (message.updates && Array.isArray(message.updates)) {
				TabManager.updateDiagnosis(message.updates);
			} else if (message.diagnostics && Array.isArray(message.diagnostics)) {
				TabManager.updateDiagnosis(message.diagnostics);
			}
		},
		// Para retrocompatibilidad
		updateDiagnostics: (message) => {
			console.log('[LoverTab | sidetabs.js] Recibida actualización de diagnósticos (comando updateDiagnostics):', message);
			if (message.diagnostics && Array.isArray(message.diagnostics)) {
				TabManager.updateDiagnosis(message.diagnostics);
			} else if (message.updates && Array.isArray(message.updates)) {
				TabManager.updateDiagnosis(message.updates);
			}
		},
		updateTabsContent: (message) => {
			if (message.html) {
				tabContainer.innerHTML = message.html;
				TabManager.rebuildTabCache();
				EventHandler.setupDragDrop();
			}
		}
	}
};

/// EventHandler: gestión de eventos y mensajes
const EventHandler = {
	initialize() {
		this.setupMessageListener();
		this.setupBasicEventListeners();
		return true;
	},

	setupMessageListener() {
		window.addEventListener('message', event => {
			const message = event.data;
			const command = message.type || message.command;
			console.log(`[LoverTab | sidetabs.js] Mensaje recibido:`, command, message);
			const handler = this.messageHandlers[command];
			if (handler) {
				handler(message);
			} else {
				console.log(`[LoverTab | sidetabs.js] Mensaje no manejado: ${command}`, message);
			}
		});
	},

	setupBasicEventListeners() {
		if (!tabContainer) return;
		tabContainer.addEventListener('click', this.handleTabClick);
		tabContainer.addEventListener('contextmenu', this.handleContextMenu);
		this.setupDragDrop();
	},
	//#region 🟢 setupDragDrop
	setupDragDrop() {
		// Si no hay contenedor de pestañas, salimos
		if (!tabContainer) return;

		// Limpiar cualquier configuración anterior de drag & drop
		if (dragDropCleanup) {
			dragDropCleanup();
			dragDropCleanup = null;
		}		// Verificar si existe DragDropManager en el ámbito global
		if (window.DragDropManager) {
			console.log('[LoverTab | sidetabs.js] Usando el nuevo sistema DragDropManager');

			// Inicializar el sistema de drag & drop modular
			const dragDropManager = window.DragDropManager;
			dragDropCleanup = dragDropManager.setupDragDrop(tabContainer, {
				threshold: 8, // Umbral en píxeles para iniciar el arrastre
				animationDuration: 200 // Duración de la animación en milisegundos
			});

			if (dragDropCleanup) {
				console.log('[LoverTab | sidetabs.js] Sistema DragDropManager inicializado con éxito');
			} else {
				console.error('[LoverTab | sidetabs.js] Error al inicializar DragDropManager');
			}
		} else {
			console.warn('[LoverTab | sidetabs.js] DragDropManager no está disponible, no se habilitará el drag & drop');
		}
	},

	handleTabClick(e) {
		const tab = e.target.closest('.tab');
		if (!tab) return;
		const closeBtn = e.target.closest('.tab-close-button');
		if (closeBtn) {
			vscode.postMessage({
				command: 'tabClosed',
				uniqueId: tab.dataset.uniqueId
			});
			return;
		}
		vscode.postMessage({
			command: 'tabClicked',
			uniqueId: tab.dataset.uniqueId
		});
	},

	handleContextMenu(e) {
		const tab = e.target.closest('.tab');
		if (!tab) return;
		e.preventDefault();
		vscode.postMessage({
			command: 'showContextMenu',
			uniqueId: tab.dataset.uniqueId,
			x: e.clientX,
			y: e.clientY
		});
	},

	// Handlers centralizados para mensajes del backend
	messageHandlers: {
		updateActiveTab: (message) => TabManager.updateActiveTab(message.activeTabId),
		updateProblems: (message) => TabManager.updateDiagnosis(message.diagnostics),
		// Manejar ambos formatos para retrocompatibilidad
		updateDiagnosis: (message) => {
			console.log('[LoverTab | sidetabs.js] Recibida actualización de diagnósticos (comando updateDiagnosis):', message);
			if (message.updates && Array.isArray(message.updates)) {
				TabManager.updateDiagnosis(message.updates);
			} else if (message.diagnostics && Array.isArray(message.diagnostics)) {
				TabManager.updateDiagnosis(message.diagnostics);
			}
		},
		// Para retrocompatibilidad
		updateDiagnostics: (message) => {
			console.log('[LoverTab | sidetabs.js] Recibida actualización de diagnósticos (comando updateDiagnostics):', message);
			if (message.diagnostics && Array.isArray(message.diagnostics)) {
				TabManager.updateDiagnosis(message.diagnostics);
			} else if (message.updates && Array.isArray(message.updates)) {
				TabManager.updateDiagnosis(message.updates);
			}
		},
		updateTabsContent: (message) => {
			if (message.html) {
				// Limpiar configuración de drag & drop antes de actualizar contenido
				if (dragDropCleanup) {
					dragDropCleanup();
					dragDropCleanup = null;
				}

				// Actualizar contenido
				tabContainer.innerHTML = message.html;

				// Reconstruir caché y reinicializar drag & drop
				TabManager.rebuildTabCache();
				EventHandler.setupDragDrop();

				console.log('[LoverTab | sidetabs.js] Contenido de pestañas actualizado y drag & drop reinicializado');
			}
		}
		// ...otros handlers
	}
};

//· Inicialización principal
function initialize() {
	console.log('[LoverTab | sidetabs.js] Iniciando aplicación...');
	const tabManagerReady = TabManager.initialize();
	if (!tabManagerReady) return;
	const eventHandlerReady = EventHandler.initialize();
	if (!eventHandlerReady) return;
	console.log('[LoverTab | sidetabs.js] Inicialización completada con éxito');
}

/// Ejecutar inicialización cuando el DOM esté listo
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', initialize);
} else {
	initialize();
}
