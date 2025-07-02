//· @module tabManager

//* Exporta el array de todas las pestañas
export let allTabs = [];

//* Exporta el contenedor principal de pestañas
export let tabContainer;

//* Estado privado del módulo
let tabElementsCache = new Map();
let lastActiveTabId = null;

/// Inicializa el gestor de pestañas recolectando los elementos del DOM
// @returns {Array} - Array con todas las pestañas encontradas

export function initializeTabManager() {
	//* Inicializa contenedor una sola vez
	tabContainer = document.getElementById('tabs-container') || document.body;
	//* Recolecta pestañas
	allTabs = Array.from(document.querySelectorAll('.tab'));
	//* Reconstruye caché de elementos
	rebuildTabCache();
	return allTabs;
}

/// Reconstruye la caché de elementos de pestaña para acceso rápido
function rebuildTabCache() {

	if (allTabs.length === 0) return; // Si no hay pestañas, sale
	tabElementsCache.clear(); // Limpia caché existente

	// Recolecta todas las pestañas y sus IDs únicos
	for (const tab of allTabs) {
		if (tab.dataset.uniqueId) {
			tabElementsCache.set(tab.dataset.uniqueId, tab);

			// Actualizar la última pestaña activa si corresponde
			if (tab.classList.contains('active')) {
				lastActiveTabId = tab.dataset.uniqueId;
			}
		}
	}
}

/// Actualiza visualmente la pestaña activa
export function updateActiveTab(activeTabId) {

	// Si no hay pestañas en caché, inicializa
	if (allTabs.length === 0) initializeTabManager();
	// Reconstruye la caché de elementos si es necesario
	if (tabElementsCache.size !== allTabs.length) rebuildTabCache();

	// Solo actualiza si la pestaña activa realmente cambió
	if (lastActiveTabId !== activeTabId) {
		// Quitar la clase 'active' de la pestaña anterior
		if (lastActiveTabId) {
			const prevTab = tabElementsCache.get(lastActiveTabId);
			if (prevTab) prevTab.classList.remove('active');
		}
		// Añadir la clase 'active' a la nueva pestaña activa
		if (activeTabId) {
			const newTab = tabElementsCache.get(activeTabId);
			if (newTab) newTab.classList.add('active');
		}
		lastActiveTabId = activeTabId;
	}
}

/// Invalida la caché de pestañas cuando el DOM se regenera
export function invalidateTabCache() {
	// Limpiar el array de pestañas y la caché
	allTabs = [];
	tabElementsCache.clear();
	lastActiveTabId = null;

	// Al invalidar la caché, es buena idea reinicializar
	// para asegurar una sincronización adecuada
	if (document.readyState === 'complete') {
		setTimeout(initializeTabManager, 0);
	}
}

console.log('[LoverTab] Módulo Tab Manager cargado.');
