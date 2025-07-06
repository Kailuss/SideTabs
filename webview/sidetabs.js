// Usar la referencia compartida al API de VS Code
const vscode = window.vscodeApi || (window.vscodeApi = acquireVsCodeApi());

// Variables globales con nombres claros
let allTabs = [];
let tabContainer;
let dragDropCleanup = null; // Función para limpiar eventos de drag & drop

// Asegurar que los objetos globales están disponibles
window.tabsManager = window.tabsManager || {};
window.tabInteractions = window.tabInteractions || {};

//#region ⚪Inicialización

// = Inicialización principal = 

/// Esta función se ejecuta al cargar el script y prepara la aplicación
function initialize() {
	console.log('[SideTabs | sidetabs.js] Iniciando aplicación...');
	const tabManagerReady = TabManager.initialize();
	if (!tabManagerReady) return;
	const eventHandlerReady = EventHandler.initialize();
	if (!eventHandlerReady) return;

	//* IMPORTANTE: Aplicar listeners directos EXPLÍCITAMENTE
	TabManager.attachDirectEventListeners();

	//* Forzar una segunda aplicación de listeners después de un breve retraso
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

/// Ejecuta la inicialización cuando el DOM esté listo
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', initialize);
} else {
	initialize();
}


//#region ⚡ TabManager

// = TabManager = 
//- TabManager es responsable de manejar las pestañas, sus eventos y diagnósticos
//- Usando un modelo de datos centralizado para sincronizar el estado de las pestañas
const TabManager = {
	initialize() {
		tabContainer = document.querySelector('#tabs-container'); // Asegurarse de que el contenedor de pestañas existe
		if (!tabContainer) {
			console.error('[SideTabs | sidetabs.js] No se encontró el contenedor de pestañas');
			return false;
		}

		//* Verificar si TabDataModel está disponible
		if (!window.tabDataModel) {
			console.error('[SideTabs | sidetabs.js] TabDataModel no está disponible');
			return false;
		}

		this.rebuildTabCache();
		return true;
	},

	/// Reconstruye la caché de pestañas y sincroniza con el modelo de datos
	rebuildTabCache() {
		allTabs = Array.from(document.querySelectorAll('.tab'));

		//* Inicializa el modelo de datos desde el DOM
		if (window.tabDataModel && tabContainer) {
			window.tabDataModel.initializeFromDOM(tabContainer);
			console.log(`[SideTabs | sidetabs.js] TabDataModel sincronizado con ${allTabs.length} pestañas`);
		}

		//* IMPORTANTE: Añade listeners directamente a cada pestaña
		this.attachDirectEventListeners();

		console.log(`[SideTabs | sidetabs.js] Cache de pestañas reconstruido. ${allTabs.length} pestañas encontradas.`);
	},

	//#endregion

	//#region 🟢 Listeners pestañas

	/// Adjunta eventos directamente a cada pestaña
	attachDirectEventListeners() {

		//* Se asegura de que el contenedor de pestañas existe
		if (!tabContainer) {
			console.warn('[SideTabs] sidetabs.js: No se encontró el contenedor de pestañas para adjuntar listeners');
			return;
		}

		//* Crea handlers si no existen
		if (!this._boundDirectTabClick) {
			this._boundDirectTabClick = this.handleDirectTabClick.bind(this);
			this._boundDirectTabContextMenu = this.handleDirectTabContextMenu.bind(this);
			this._boundDirectTabClose = this.handleDirectTabClose.bind(this);
		}

		//* Elimina listeners anteriores y añade nuevos a cada pestaña
		allTabs.forEach(tab => {

			//> Limpia listeners anteriores por si acaso
			tab.removeEventListener('click', this._boundDirectTabClick);
			tab.removeEventListener('contextmenu', this._boundDirectTabContextMenu);
			tab.removeEventListener('close', this._boundDirectTabClose);

			//> Añade nuevos listeners directos
			tab.addEventListener('click', this._boundDirectTabClick);
			tab.addEventListener('contextmenu', this._boundDirectTabContextMenu);
			tab.addEventListener('close', this._boundDirectTabClose);

			//> Fuerza pointer-events en la pestaña
			tab.style.pointerEvents = 'auto';

			//> Marca la pestaña como que tiene listeners
			tab.dataset.hasListeners = 'true';

		});
		console.log(`[SideTabs | sidetabs.js] Listeners directos añadidos a ${allTabs.length} pestañas individuales`);
	},

	/// 🔒 Clic en pestañas Handler
	handleDirectTabClick(e) {

		const tab = e.currentTarget; //- El elemento al que se adjuntó el listener
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
			uniqueId: tab.dataset.uniqueId
		});
		//* Actualizar el modelo de datos si está disponible
		TabManager.updateActiveTab(tab.dataset.uniqueId, false);
	},

	/// 🔒 Handler directo para menú contextual en pestañas individuales
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

	/// 🔒 Handler directo para cerrar pestañas
	handleDirectTabClose(e) {

		const tab = e.currentTarget; // El elemento al que se adjuntó el listener
		console.log(`[SideTabs | sidetabs.js] Cierre de pestaña: ${tab.dataset.uniqueId}`);
		//* Detener la propagación para evitar conflictos
		e.stopPropagation();
		//* Notificar a VS Code
		vscode.postMessage({
			command: 'tabClosed',
			uniqueId: tab.dataset.uniqueId
		});
	},

	//#endregion

	//#region 🟠 Actualización y diagnóstico

	/// Actualiza visualmente la pestaña activa
	updateActiveTab(activeTabId, fromMessage = false) {

		//* Verifica que el ID de la pestaña activa es válido
		if (!activeTabId) return;
		//* Limpia pestañas activas en el DOM
		const previousActive = document.querySelector('.tab.active');
		if (previousActive) previousActive.classList.remove('active');
		//* Establece nueva pestaña activa
		const activeTab = document.querySelector(`.tab[data-unique-id="${activeTabId}"]`);
		if (activeTab) {
			activeTab.classList.add('active');
			activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		} else return;
		//* Actualiza el modelo de datos si está disponible
		if (window.tabDataModel) {
			window.tabDataModel.setActiveTab(activeTabId);
		}
		console.log(`[SideTabs | sidetabs.js] Pestaña activa actualizada y visible: ${activeTabId}`);
	},
	//#endregion

	//#region 🟤 Drag & drop

	//TODO: Configura el drag & drop para el contenedor de pestañas
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
	},
};

//#endregion

//#region 🟡 EventHandler

// = EventHandler: gestión de eventos y mensajes = 
const EventHandler = {
	initialize() {
		this.setupMessageListener();
		this.setupBasicEventListeners();
		return true;
	},

	/// Configura el listener de mensajes para recibir comandos desde VS Code

	setupMessageListener() {
		//* Se asegura de que el listener no se duplica
		window.addEventListener('message', event => {
			const message = event.data; //- El mensaje enviado desde VS Code
			const command = message.type || message.command; //- El comando del mensaje
			const handler = this.messageHandlers[command]; //- Busca un handler específico para el comando
			if (handler) {
				handler(message); //- Llama al handler correspondiente
			} else {
				//> Si no hay handler, se registra como mensaje no manejado
				console.warn(`[SideTabs | sidetabs.js] Mensaje no manejado: ${command}`, message);
			}
		});
	},

	/// Configura los listeners básicos de clic y menú contextual en el contenedor de pestañas

	setupBasicEventListeners() {

		//* Asegurarse de que el contenedor de pestañas existe
		if (!tabContainer) {
			console.error('[SideTabs | sidetabs.js] No hay contenedor de pestañas para instalar listeners');
			return;
		}
		//* Borra listeners anteriores para evitar duplicación
		this._removeAllEventListeners();
		//* Crea handlers vinculados una sola vez y guardarlos como propiedad del objeto
		if (!this._boundHandleTabClick) {
			this._boundHandleTabClick = TabManager.handleDirectTabClick.bind(TabManager);
			this._boundHandleContextMenu = this.handleContextMenu.bind(this);
		}
		//* Instala con los handlers vinculados
		tabContainer.addEventListener('click', this._boundHandleTabClick);
		tabContainer.addEventListener('contextmenu', this._boundHandleContextMenu);
		console.log('[SideTabs | sidetabs.js] Listeners de clic y menú contextual instalados en el contenedor de pestañas');
		//* Configura drag & drop
		this.setupDragDrop();
	},

	/// Método para eliminar todos los listeners y evitar duplicados
	_removeAllEventListeners() {
		if (!tabContainer) return;

		//* Borra listeners solo si existen handlers vinculados
		if (this._boundHandleTabClick) {
			tabContainer.removeEventListener('click', this._boundHandleTabClick);
			tabContainer.removeEventListener('contextmenu', this._boundHandleContextMenu);
			console.log('[SideTabs | sidetabs.js] Listeners anteriores de clic y menú contextual eliminados');
		}
	},

	/// Configura el drag & drop para el contenedor de pestañas
	setupDragDrop() {
		//* Si no hay contenedor de pestañas, salimos
		if (!tabContainer) return;

		//* Limpiar cualquier configuración anterior de drag & drop
		if (dragDropCleanup) {
			dragDropCleanup();
			dragDropCleanup = null;
		}		//> Verificar si existe DragDropManager en el ámbito global
		if (window.DragDropManager) {
			console.log('[SideTabs | sidetabs.js] Usando el nuevo sistema DragDropManager');

			//> Inicializar el sistema de drag & drop modular
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

	//#endregion

	//#region 🟡 Msg Handlers

	messageHandlers: {

		/// Handler para actualización de pestaña activa
		updateActiveTab: (message) => {
			console.log('[SideTabs | sidetabs.js] Actualizando pestaña activa:', message.activeTabId);
			if (message.activeTabId) {
				TabManager.updateActiveTab(message.activeTabId, true);
			}
		},

		/// Handler para actualización de pestañas
		/**
		* El método updateTabsContent actualiza el contenido HTML de las pestañas en la barra lateral de la extensión,
		* asegurándose de limpiar cualquier configuración previa de drag & drop y eliminar listeners antiguos antes de
		* reemplazar el HTML. Luego, tras un breve retraso para garantizar que el DOM esté actualizado, reconstruye
		* la caché de pestañas, sincroniza el modelo de datos con el nuevo DOM, reinstala todos los listeners necesarios
		* y vuelve a habilitar la funcionalidad de drag & drop, dejando el sistema listo y consistente para interactuar
		* con las nuevas pestañas. */
		updateTabsContent: (message) => {
			if (message.html) {
				//* Limpia configuración de drag & drop antes de actualizar contenido
				if (dragDropCleanup) {
					dragDropCleanup();
					dragDropCleanup = null;
				}
				//* Elimina listeners antes de actualizar el contenido
				EventHandler._removeAllEventListeners();
				//* Actualiza contenido
				tabContainer.innerHTML = message.html;
				//* Verifica que se haya actualizado correctamente
				const newTabCount = tabContainer.querySelectorAll('.tab').length;
				console.log(`[SideTabs | sidetabs.js] HTML actualizado. Nuevas pestañas: ${newTabCount}`);
				//* IMPORTANTE: Añade un pequeño retraso para asegurar que el DOM esté actualizado
				setTimeout(() => {
					console.log('[SideTabs | sidetabs.js] Aplicando listeners después del timeout');
					//> Reconstruir caché primero (esto también añade listeners directos a las pestañas)
					TabManager.rebuildTabCache();
					//> Sincronizar el modelo con el DOM actualizado
					if (window.tabDataModel && tabContainer) {
						window.tabDataModel.syncWithDOM();
						console.log('[SideTabs | sidetabs.js] Modelo sincronizado después de actualizar HTML');
					}
					//> Reinstalar listeners después de que todo esté sincronizado
					EventHandler.setupBasicEventListeners();
					//> Llamada para añadir listeners a cada pestaña
					TabManager.attachDirectEventListeners();
					//> Reinicializar drag & drop al final
					EventHandler.setupDragDrop();
					console.log('[SideTabs | sidetabs.js] Contenido de pestañas actualizado, modelo sincronizado y listeners reinstalados');
				}, 50); // Timeout para asegurar que el DOM se ha actualizado
			}
		}
	}
};
//#endregion