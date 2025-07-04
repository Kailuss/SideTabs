const { group } = require("console");

// Usar la referencia compartida al API de VS Code
const vscode = window.vscodeApi || (window.vscodeApi = acquireVsCodeApi());

// Variables globales con nombres claros
let allTabs = [];
let tabContainer;
let dragDropCleanup = null; // Función para limpiar eventos de drag & drop

// Asegurar que los objetos globales están disponibles
window.tabsManager = window.tabsManager || {};
window.tabInteractions = window.tabInteractions || {};

//#region 🔱 TabManager
/// TabManager: gestión de pestañas usando TabDataModel centralizado
const TabManager = {
	initialize() {
		tabContainer = document.querySelector('#tabs-container'); // Asegurarse de que el contenedor de pestañas existe
		if (!tabContainer) {
			console.error('[SideTabs | sidetabs.js] No se encontró el contenedor de pestañas');
			return false;
		}

		// Verificar que TabDataModel está disponible
		if (!window.tabDataModel) {
			console.error('[SideTabs | sidetabs.js] TabDataModel no está disponible');
			return false;
		}

		this.rebuildTabCache();
		return true;
	},

	//* ✔ Reconstruye la caché de pestañas y sincroniza con el modelo de datos
	rebuildTabCache() {
		allTabs = Array.from(document.querySelectorAll('.tab'));

		// Inicializar el modelo de datos desde el DOM
		if (window.tabDataModel && tabContainer) {
			window.tabDataModel.initializeFromDOM(tabContainer);
			console.log(`[SideTabs | sidetabs.js] TabDataModel sincronizado con ${allTabs.length} pestañas`);
		}

		// IMPORTANTE: Añadir listeners directamente a cada pestaña
		this.attachDirectEventListeners();

		console.log(`[SideTabs | sidetabs.js] Cache de pestañas reconstruido. ${allTabs.length} pestañas encontradas.`);
	},

	//#region 🟢 TabEventHandlers

	/// Adjunta eventos directamente a cada pestaña
	attachDirectEventListeners() {

		//* Crea handlers si no existen
		if (!this._boundDirectTabClick) {
			this._boundDirectTabClick = this.handleDirectTabClick.bind(this);
			this._boundDirectTabContextMenu = this.handleDirectTabContextMenu.bind(this);
			//console.log(`[SideTabs | sidetabs.js] Añadiendo listeners DIRECTOS a ${allTabs.length} pestañas individuales`);
		}

		//* Elimina listeners anteriores y añade nuevos a cada pestaña
		allTabs.forEach(tab => {
			// Limpia listeners anteriores por si acaso
			tab.removeEventListener('click', this._boundDirectTabClick);
			tab.removeEventListener('contextmenu', this._boundDirectTabContextMenu);

			// Añade nuevos listeners directos
			tab.addEventListener('click', this._boundDirectTabClick);
			tab.addEventListener('contextmenu', this._boundDirectTabContextMenu);

			// Fuerza pointer-events en la pestaña
			tab.style.pointerEvents = 'auto';

			// Marca la pestaña como que tiene listeners
			tab.dataset.hasListeners = 'true';
		});
	},

	/// Clic en pestañas Handler ✔
	handleDirectTabClick(e) {
		const tab = e.currentTarget; // El elemento al que se adjuntó el listener
		console.log(`[SideTabs] sidetabs: clic en pestaña: ${tab.dataset.uniqueId}`);

		//* Detener la propagación para evitar conflictos
		e.stopPropagation();

		//* Verificar si es el botón de cerrar
		if (e.target.closest('.tab-close-button')) {
			console.log(`[SideTabs] sidetabs: clic en botón cerrar de pestaña: ${tab.dataset.uniqueId}`);
			vscode.postMessage({
				command: 'tabClosed',
				uniqueId: tab.dataset.uniqueId
			});
			return;
		}

		//* Actualizar el estado visual y el modelo (desde UI)
		TabManager.updateActiveTab(tab.dataset.uniqueId, false);

		//* Notificar a VS Code
		vscode.postMessage({
			command: 'tabClicked',
			tab: tab

		});
	},

	/// Handler directo para menú contextual en pestañas individuales
	handleDirectTabContextMenu(e) {
		const tab = e.currentTarget; // El elemento al que se adjuntó el listener
		//console.log(`[SideTabs | sidetabs.js] MENÚ CONTEXTUAL DIRECTO en pestaña: ${tab.dataset.uniqueId}`);

		//* Prevenir el menú contextual predeterminado y la propagación
		e.preventDefault();
		e.stopPropagation();

		//* Notificar a VS Code
		vscode.postMessage({
			command: 'showContextMenu',
			uniqueId: tab.dataset.uniqueId,
			x: e.clientX,
			y: e.clientY
		});
	},

	//#endregion 🔀 TabEventHandlers

	//#region 🟠 Update Data
	//* ✔ Actualiza visualmente la pestaña activa usando el modelo de datos
	updateActiveTab(activeTabId, fromMessage = false) {
		console.log(`[SideTabs | sidetabs.js] Actualizando pestaña activa: ${activeTabId} (${fromMessage ? 'desde mensaje' : 'desde UI'})`);
		if (!activeTabId) {
			console.warn('[SideTabs | sidetabs.js] No se puede actualizar pestaña activa - ID inválido');
			return;
		}

		// Limpiar pestañas activas en el DOM
		const previousActive = document.querySelector('.tab.active');
		if (previousActive) {
			previousActive.classList.remove('active');
			console.log(`[SideTabs | sidetabs.js] Desactivando pestaña anterior: ${previousActive.dataset.uniqueId}`);
		}

		// Establecer nueva pestaña activa
		const activeTab = document.querySelector(`.tab[data-unique-id="${activeTabId}"]`);
		if (activeTab) {
			activeTab.classList.add('active');
			activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
			console.log(`[SideTabs | sidetabs.js] Activando nueva pestaña: ${activeTabId}`);
		} else {
			console.warn(`[SideTabs | sidetabs.js] No se encontró la pestaña con ID: ${activeTabId}`);
			return;
		}

		// Actualizar el modelo de datos si está disponible
		if (window.tabDataModel) {
			window.tabDataModel.setActiveTab(activeTabId);
			console.log(`[SideTabs | sidetabs.js] Modelo de datos actualizado con pestaña activa: ${activeTabId}`);
		}

		console.log(`[SideTabs | sidetabs.js] Pestaña activa actualizada y visible: ${activeTabId}`);
	},

	//* Determina el nivel de alerta más crítico (error > warning > info)
	getDiagnosticsLevel(diagnostics) {
		if (!diagnostics) return undefined;
		if (diagnostics.errors > 0) return 'error';
		if (diagnostics.warnings > 0) return 'warning';
		if (diagnostics.infos > 0) return 'info';
		return undefined;
	},

	//* Actualiza solo la parte de diagnóstico compacto de una pestaña (basado en TabTemplates.ts)
	renderDiagnostics(diagnostics) {
		if (!diagnostics || (diagnostics.errors === 0 && diagnostics.warnings === 0 && diagnostics.infos === 0)) {
			return ''; // No hay diagnósticos para mostrar
		}

		// Implementación de getInlineDiagnosticsCount, similar a TabTemplates.ts
		const getInlineDiagnosticsCount = (count, type) => {
			if (count <= 0) return '';
			const title = type === 'error' ? 'errores' : type === 'warning' ? 'advertencias' : 'info';
			return `<span class="diagnostics-count ${type}" title="${count} ${title}">${count}</span>`;
		};

		// Genera las partes de diagnóstico
		const parts = [];
		if (diagnostics.errors > 0) parts.push(getInlineDiagnosticsCount(diagnostics.errors, 'error'));
		if (diagnostics.warnings > 0) parts.push(getInlineDiagnosticsCount(diagnostics.warnings, 'warning'));
		if (diagnostics.infos > 0) parts.push(getInlineDiagnosticsCount(diagnostics.infos, 'info'));

		// Combina las partes con el separador
		if (parts.length > 0) {
			return parts.join('<span class="diagnostics-sep">|</span>');
		}
		return '';
	},

	updateCompactDiagnostics(tab, diagnostics) {
		if (!diagnostics) {
			console.log('[SideTabs | sidetabs.js] No hay diagnóstico proporcionado para actualizar');
			return;
		}

		// Determinar si hay algún diagnóstico a mostrar
		const hasDiagnostics = diagnostics.errors > 0 || diagnostics.warnings > 0 || diagnostics.infos > 0;

		// Actualizar el modelo de datos si está disponible
		if (window.tabDataModel && tab.dataset.uniqueId) {
			window.tabDataModel.updateTab(tab.dataset.uniqueId, {
				diagnostics: {
					errors: diagnostics.errors || 0,
					warnings: diagnostics.warnings || 0,
					infos: diagnostics.infos || 0
				}
			}, false);
		}

		// Encuentra el elemento del nombre de archivo
		const filename = tab.querySelector('.tab-filename');
		if (!filename) {
			console.log('[SideTabs | sidetabs.js] No se encontró el elemento filename en la pestaña');
			return;
		}

		// Determinar el nivel de diagnóstico para colorear el nombre del archivo
		const diagnosticsLevel = this.getDiagnosticsLevel(diagnostics);

		// Aplicar clase según el nivel de diagnóstico al filename
		// Primero eliminar todas las posibles clases de diagnóstico
		filename.classList.remove('error', 'warning', 'info');

		// Añadir la clase correspondiente al nivel más crítico si hay diagnósticos
		if (diagnosticsLevel) {
			filename.classList.add(diagnosticsLevel);
			console.log(`[SideTabs | sidetabs.js] Aplicando clase ${diagnosticsLevel} al filename`);
		}

		// Encuentra o crea el contenedor de diagnóstico compacto
		let diagnosticsContainer = tab.querySelector('.diagnostics-compact');

		if (!diagnosticsContainer && hasDiagnostics) {
			console.log('[SideTabs | sidetabs.js] Creando nuevo contenedor diagnostics-compact');
			// Si no existe el contenedor y hay diagnósticos, crear uno nuevo después del nombre
			diagnosticsContainer = document.createElement('span');
			diagnosticsContainer.className = 'diagnostics-compact';
			filename.appendChild(document.createTextNode(' '));
			filename.appendChild(diagnosticsContainer);
		}

		// Si tenemos un contenedor de diagnóstico, actualizarlo
		if (diagnosticsContainer) {
			// Usar el mismo enfoque que renderDiagnostics en TabTemplates.ts
			const diagnosticsHTML = this.renderDiagnostics(diagnostics);

			// Actualizar el contenido del diagnóstico
			if (diagnosticsHTML) {
				diagnosticsContainer.innerHTML = diagnosticsHTML;
				diagnosticsContainer.style.display = 'inline';
			} else {
				// Si no hay diagnósticos, ocultar el contenedor
				diagnosticsContainer.style.display = 'none';
				diagnosticsContainer.innerHTML = '';
			}
		}
	},

	//* Actualiza los diagnósticos para todas las pestañas
	updateDiagnostics(diagnosticUpdates) {
		if (!diagnosticUpdates || !Array.isArray(diagnosticUpdates)) {
			console.log('[SideTabs | sidetabs.js] No se proporcionaron actualizaciones de diagnóstico válidas');
			return;
		}

		// Procesar todas las actualizaciones de diagnóstico
		diagnosticUpdates.forEach(update => {
			if (!update || !update.uniqueId) {
				console.log('[SideTabs | sidetabs.js] Actualización de diagnóstico inválida:', update);
				return;
			}

			// Buscar la pestaña correspondiente
			const tab = document.querySelector(`.tab[data-unique-id="${update.uniqueId}"]`);
			if (!tab) {
				console.log(`[SideTabs | sidetabs.js] No se encontró la pestaña con ID: ${update.uniqueId}`);
				return;
			}

			// Actualizar el diagnóstico para esta pestaña
			this.updateCompactDiagnostics(tab, update.diagnostics || update.diagnostic);
		});

		// Sincronizar el modelo tras actualizar diagnósticos
		if (window.tabDataModel && tabContainer) {
			window.tabDataModel.syncWithDOM();
		}
	},

	//#endregion 🔄 Update Data

	//#region 🔄 Handlers centralizados
	// Handlers centralizados para mensajes del backend
	messageHandlers: {
		// Actualización de diagnósticos
		updateDiagnostics(message) {
			//console.log('[SideTabs | sidetabs.js] Actualizando diagnósticos:', message);
			if (!message.diagnostics || !tabContainer) return;

			// Recorrer cada pestaña afectada
			Object.entries(message.diagnostics).forEach(([tabId, diagnostics]) => {
				const tab = document.querySelector(`.tab[data-unique-id="${tabId}"]`);
				if (!tab) return;

				// Actualizar el modelo de datos
				if (window.tabDataModel) {
					window.tabDataModel.updateTabDiagnostics(tabId, diagnostics);
				}

				// Actualizar diagnósticos visuales
				const diagLevel = diagnostics.errors > 0 ? 'error' :
					diagnostics.warnings > 0 ? 'warning' :
						diagnostics.infos > 0 ? 'info' : '';

				// Limpiar clases anteriores
				tab.classList.remove('has-error', 'has-warning', 'has-info');
				if (diagLevel) {
					tab.classList.add(`has-${diagLevel}`);
				}

				// Actualizar contadores
				const diagContainer = tab.querySelector('.tab-diagnostics');
				if (diagContainer) {
					diagContainer.innerHTML = `
						${diagnostics.errors ? `<span class="diag-count error">${diagnostics.errors}</span>` : ''}
						${diagnostics.warnings ? `<span class="diag-count warning">${diagnostics.warnings}</span>` : ''}
						${diagnostics.infos ? `<span class="diag-count info">${diagnostics.infos}</span>` : ''}
					`;
				}
			});
		},

		// Refresco de pestañas (abierta/cerrada)
		updateTabs(message) {
			console.log('[SideTabs | sidetabs.js] Actualizando pestañas:', message);
			if (!message.tabs || !tabContainer) return;

			// Actualizar el modelo de datos primero
			if (window.tabDataModel) {
				window.tabDataModel.updateTabs(message.tabs);
			}

			// Actualizar DOM
			TabManager.rebuildTabCache();
		},

		// Actualización de estado de pestaña activa
		updateActiveTab(message) {
			if (!message.activeTabId || !tabContainer) {
				console.warn('[SideTabs | sidetabs.js] No se puede actualizar pestaña activa - datos inválidos del mensaje');
				return;
			}

			// Usar la función centralizada indicando que viene de un mensaje
			TabManager.updateActiveTab(message.activeTabId, true);
		},

		// Actualización de estado de archivo (guardado/modificado)
		updateTabState(message) {
			console.log('[SideTabs | sidetabs.js] Actualizando estado de pestaña:', message);
			if (!message.tabId || !tabContainer) return;

			const tab = document.querySelector(`.tab[data-unique-id="${message.tabId}"]`);
			if (!tab) return;

			// Actualizar el modelo de datos
			if (window.tabDataModel) {
				window.tabDataModel.updateTabState(message.tabId, message);
			}

			// Actualizar indicador de archivo modificado
			if (message.isDirty !== undefined) {
				const dirtyIndicator = tab.querySelector('.tab-dirty-indicator');
				if (dirtyIndicator) {
					dirtyIndicator.style.display = message.isDirty ? 'block' : 'none';
				}
			}
		}
	},

	setupMessageListener() {
		window.addEventListener('message', event => {
			const message = event.data;
			const command = message.type || message.command;
			console.log(`[SideTabs | sidetabs.js] Mensaje recibido:`, command, message);
			const handler = this.messageHandlers[command];
			if (handler) {
				handler(message);
			} else {
				console.log(`[SideTabs | sidetabs.js] Mensaje no manejado: ${command}`, message);
			}
		});
	},

	setupBasicEventListeners() {
		if (!tabContainer) {
			console.error('[SideTabs | sidetabs.js] No hay contenedor de pestañas para instalar listeners');
			return;
		}

		// Remover listeners anteriores para evitar duplicación
		this._removeAllEventListeners();

		// Crear handlers vinculados una sola vez y guardarlos como propiedad del objeto
		if (!this._boundHandleTabClick) {
			this._boundHandleTabClick = this.handleTabClick.bind(this);
			this._boundHandleContextMenu = this.handleContextMenu.bind(this);
		}

		// Instalar con los handlers vinculados
		tabContainer.addEventListener('click', this._boundHandleTabClick);
		tabContainer.addEventListener('contextmenu', this._boundHandleContextMenu);
		console.log('[SideTabs | sidetabs.js] Listeners de clic y menú contextual instalados en el contenedor de pestañas');

		this.setupDragDrop();
	},

	// Método para eliminar todos los listeners y evitar duplicados
	_removeAllEventListeners() {
		if (!tabContainer) return;

		// Remover listeners solo si existen los handlers vinculados
		if (this._boundHandleTabClick) {
			tabContainer.removeEventListener('click', this._boundHandleTabClick);
			tabContainer.removeEventListener('contextmenu', this._boundHandleContextMenu);
			console.log('[SideTabs | sidetabs.js] Listeners anteriores de clic y menú contextual eliminados');
		}
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
			console.log('[SideTabs | sidetabs.js] Usando el nuevo sistema DragDropManager');

			// Inicializar el sistema de drag & drop modular
			const dragDropManager = window.DragDropManager;
			dragDropCleanup = dragDropManager.setupDragDrop(tabContainer, {
				threshold: 8, // Umbral en píxeles para iniciar el arrastre
				animationDuration: 200 // Duración de la animación en milisegundos
			});

			if (dragDropCleanup) {
				console.log('[SideTabs | sidetabs.js] Sistema DragDropManager inicializado con éxito');
			} else {
				console.error('[SideTabs | sidetabs.js] Error al inicializar DragDropManager');
			}
		} else {
			console.warn('[SideTabs | sidetabs.js] DragDropManager no está disponible, no se habilitará el drag & drop');
		}
	},

	// handleTabClick(e) {
	// 	const tab = e.target.closest('.tab');
	// 	if (!tab) {
	// 		//console.log('[SideTabs | sidetabs.js] Clic detectado pero no en una pestaña');
	// 		return;
	// 	}

	// 	// Verificar el target del evento para depuración
	// 	//console.log(`[SideTabs | sidetabs.js] Clic en elemento: ${e.target.tagName}.${e.target.className}`);

	// 	const closeBtn = e.target.closest('.tab-close-button');
	// 	if (closeBtn) {
	// 		//console.log(`[SideTabs | sidetabs.js] Clic en botón cerrar de pestaña ${tab.dataset.uniqueId}`);
	// 		vscode.postMessage({
	// 			command: 'tabClosed',
	// 			uniqueId: tab.dataset.uniqueId
	// 		});
	// 		return;
	// 	}

	// 	// Prevenir eventos en elementos de diagnóstico que puedan interceptar el clic
	// 	if (e.target.closest('.diagnostics-count') || e.target.closest('.diagnostics-compact')) {
	// 		e.stopPropagation(); // Asegurar que el clic llegue a la pestaña
	// 	}

	// 	console.log(`[SideTabs | sidetabs.js] Pestaña clickeada: ${tab.dataset.uniqueId}`);

	// 	// Actualizar visualmente
	// 	allTabs.forEach(t => t.classList.remove('active'));
	// 	tab.classList.add('active');

	// 	// Actualizar en el modelo si está disponible
	// 	if (window.tabDataModel) {
	// 		window.tabDataModel.setActiveTab(tab.dataset.uniqueId);
	// 	}

	// 	// También notificar a VS Code
	// 	vscode.postMessage({
	// 		command: 'tabClicked',
	// 		uniqueId: tab.dataset.uniqueId
	// 	});
	// },

	handleContextMenu(e) {
		const tab = e.target.closest('.tab');
		if (!tab) {
			console.log('[SideTabs | sidetabs.js] Menú contextual detectado pero no en una pestaña');
			return;
		}

		console.log(`[SideTabs | sidetabs.js] Menú contextual en pestaña: ${tab.dataset.uniqueId}`);

		// Prevenir el menú contextual por defecto
		e.preventDefault();
		e.stopPropagation();

		// Prevenir eventos en elementos de diagnóstico que puedan interceptar el evento
		if (e.target.closest('.diagnostics-count') || e.target.closest('.diagnostics-compact')) {
			e.stopPropagation(); // Asegurar que el clic llegue a la pestaña
		}

		// Notificar a VS Code para mostrar el menú contextual
		vscode.postMessage({
			command: 'showContextMenu',
			uniqueId: tab.dataset.uniqueId,
			x: e.clientX,
			y: e.clientY
		});
	}
};
//#endregion 🔱 TabManager

//#region 🟡 EventHandler
/// EventHandler: gestión de eventos y mensajes
const EventHandler = {
	initialize() {
		this.setupMessageListener();
		this.setupBasicEventListeners();
		return true;
	},

	//* Configura el listener de mensajes del backend
	setupMessageListener() {
		window.addEventListener('message', event => {
			const message = event.data;
			const command = message.type || message.command;
			console.log(`[SideTabs | sidetabs.js] Mensaje recibido:`, command, message);
			const handler = this.messageHandlers[command];
			if (handler) {
				handler(message);
			} else {
				console.log(`[SideTabs | sidetabs.js] Mensaje no manejado: ${command}`, message);
			}
		});
	},

	//* Configura los listeners básicos de eventos
	setupBasicEventListeners() {
		if (!tabContainer) {
			console.error('[SideTabs | sidetabs.js] No hay contenedor de pestañas para instalar listeners');
			return;
		}

		// Remover listeners anteriores para evitar duplicación
		this._removeAllEventListeners();

		// Crear handlers vinculados una sola vez y guardarlos como propiedad del objeto
		if (!this._boundHandleTabClick) {
			this._boundHandleTabClick = this.handleTabClick.bind(this);
			this._boundHandleContextMenu = this.handleContextMenu.bind(this);
		}

		// Instalar con los handlers vinculados
		tabContainer.addEventListener('click', this._boundHandleTabClick);
		tabContainer.addEventListener('contextmenu', this._boundHandleContextMenu);
		console.log('[SideTabs | sidetabs.js] Listeners de clic y menú contextual instalados en el contenedor de pestañas');

		this.setupDragDrop();
	},

	//* Método para eliminar todos los listeners y evitar duplicados
	_removeAllEventListeners() {
		if (!tabContainer) return;

		// Remover listeners solo si existen los handlers vinculados
		if (this._boundHandleTabClick) {
			tabContainer.removeEventListener('click', this._boundHandleTabClick);
			tabContainer.removeEventListener('contextmenu', this._boundHandleContextMenu);
			console.log('[SideTabs | sidetabs.js] Listeners anteriores de clic y menú contextual eliminados');
		}
	},

	//#region 🟡 DragDrop
	setupDragDrop() {
		// Si no hay contenedor de pestañas, salimos
		if (!tabContainer) return;

		// Limpiar cualquier configuración anterior de drag & drop
		if (dragDropCleanup) {
			dragDropCleanup();
			dragDropCleanup = null;
		}		// Verificar si existe DragDropManager en el ámbito global
		if (window.DragDropManager) {
			console.log('[SideTabs | sidetabs.js] Usando el nuevo sistema DragDropManager');

			// Inicializar el sistema de drag & drop modular
			const dragDropManager = window.DragDropManager;
			dragDropCleanup = dragDropManager.setupDragDrop(tabContainer, {
				threshold: 8, // Umbral en píxeles para iniciar el arrastre
				animationDuration: 200 // Duración de la animación en milisegundos
			});

			if (dragDropCleanup) {
				console.log('[SideTabs | sidetabs.js] Sistema DragDropManager inicializado con éxito');
			} else {
				console.error('[SideTabs | sidetabs.js] Error al inicializar DragDropManager');
			}
		} else {
			console.warn('[SideTabs | sidetabs.js] DragDropManager no está disponible, no se habilitará el drag & drop');
		}
	},

	//#region 🟡 Msg Handlers
	//* Handlers para mensajes del backend
	messageHandlers: {
		//- Handler para diagnósticos
		updateDiagnostics: (message) => {
			console.log('[SideTabs | sidetabs.js] Recibida actualización de diagnósticos (comando updateDiagnostics):', message);
			if (Array.isArray(message.diagnostics)) {
				TabManager.updateDiagnostics(message.diagnostics);
			} else if (message.diagnostics && typeof message.diagnostics === 'object') {
				//? Formato objeto: { diagnostics: { tabId: { errors, warnings, infos } } }
				Object.entries(message.diagnostics).forEach(([tabId, diagnostics]) => {
					const tab = document.querySelector(`.tab[data-unique-id=\"${tabId}\"]`);
					if (tab) TabManager.updateCompactDiagnostics(tab, diagnostics);
				});
				if (window.tabDataModel && tabContainer) window.tabDataModel.syncWithDOM();
			} else if (Array.isArray(message.updates)) {
				TabManager.updateDiagnostics(message.updates);
			}
		},

		//- Handler para actualización de pestañas
		updateTabsContent: (message) => {
			if (message.html) {
				// Limpiar configuración de drag & drop antes de actualizar contenido
				if (dragDropCleanup) {
					dragDropCleanup();
					dragDropCleanup = null;
				}
				// Elimina listeners antes de actualizar el contenido
				EventHandler._removeAllEventListeners();
				// Actualiza contenido
				tabContainer.innerHTML = message.html;
				// Verifica que se haya actualizado correctamente
				const newTabCount = tabContainer.querySelectorAll('.tab').length;
				console.log(`[SideTabs | sidetabs.js] HTML actualizado. Nuevas pestañas: ${newTabCount}`);
				// IMPORTANTE: Añade un pequeño retraso para asegurar que el DOM esté actualizado
				setTimeout(() => {
					console.log('[SideTabs | sidetabs.js] Aplicando listeners después del timeout');

					//- Reconstruir caché primero (esto también añade listeners directos a las pestañas)
					TabManager.rebuildTabCache();
					//- Sincronizar el modelo con el DOM actualizado
					if (window.tabDataModel && tabContainer) {
						window.tabDataModel.syncWithDOM();
						console.log('[SideTabs | sidetabs.js] Modelo sincronizado después de actualizar HTML');
					}
					//- Reinstalar listeners después de que todo esté sincronizado
					EventHandler.setupBasicEventListeners();
					//- Llamada para añadir listeners a cada pestaña
					TabManager.attachDirectEventListeners();
					//- Reinicializar drag & drop al final
					EventHandler.setupDragDrop();
					// Verificación final
					//const tabsWithListeners = document.querySelectorAll('.tab[data-has-listeners="true"]').length;
					console.log('[SideTabs | sidetabs.js] Contenido de pestañas actualizado, modelo sincronizado y listeners reinstalados');
				}, 50); // Timeout para asegurar que el DOM se ha actualizado
			}
		}
	}
};

//#region Inicialización
//· Inicialización principal
function initialize() {
	console.log('[SideTabs | sidetabs.js] Iniciando aplicación...');
	const tabManagerReady = TabManager.initialize();
	if (!tabManagerReady) return;
	const eventHandlerReady = EventHandler.initialize();
	if (!eventHandlerReady) return;

	// IMPORTANTE: Aplicar listeners directos EXPLÍCITAMENTE
	TabManager.attachDirectEventListeners();

	// Forzar una segunda aplicación de listeners después de un breve retraso
	setTimeout(() => {
		console.log('[SideTabs | sidetabs.js] Verificando y reforzando listeners...');
		TabManager.attachDirectEventListeners();

		// Verificar que los eventos realmente funcionan
		const firstTab = document.querySelector('.tab');
		if (firstTab) {
			console.log(`[SideTabs | sidetabs.js] Primera pestaña encontrada: ${firstTab.dataset.uniqueId}`);
			console.log('[SideTabs | sidetabs.js] Propiedades pointer-events:',
				window.getComputedStyle(firstTab).pointerEvents);
		}
	}, 1000);

	console.log('[SideTabs | sidetabs.js] Inicialización completada con éxito');
}

/// Ejecutar inicialización cuando el DOM esté listo
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', initialize);
} else {
	initialize();
}
