/**
 *· TabDataModel - Modelo de datos centralizado para pestañas
 *
 * Este modelo maneja todas las pestañas como objetos ricos con propiedades
 * completas y métodos para manipular el estado de forma consistente.
 *
 * Reemplaza los arrays simples de IDs por un sistema orientado a objetos
 * que puede ser usado por cualquier manager (DragDrop, Tab, Event, etc.)
 */
class TabDataModel {
	constructor() {
		this.tabs = new Map(); // Map<string, TabObject> para acceso rápido por ID
		this.orderedTabs = []; // Array ordenado de referencias a objetos Tab
		this.observers = []; // Observadores para cambios en el modelo

		// Configuración
		this.defaultTabHeight = 40;

		console.log('[TabDataModel] Modelo de datos inicializado');
	}

	// = Clase interna para representar una pestaña individual
	static TabObject = class {
		constructor(data = {}) {
			//* Propiedades esenciales
			this.id = data.id || '';
			this.index = data.index || 0;
			this.targetIndex = data.targetIndex !== undefined ? data.targetIndex : data.index || 0;

			//* Propiedades de posición y dimensiones
			this.top = data.top || 0;
			this.height = data.height || 40;
			this.targetTop = data.targetTop !== undefined ? data.targetTop : data.top || 0;

			//* Estados de interacción
			this.isActive = data.isActive || false;
			this.isPinned = data.isPinned || false;
			this.isDragged = data.isDragged || false;
			this.isAnimating = data.isAnimating || false;
			this.isVisible = data.isVisible !== undefined ? data.isVisible : true;

			//* Propiedades del archivo/documento
			this.filename = data.filename || '';
			this.filepath = data.filepath || '';
			this.isDirty = data.isDirty || false;
			this.hasTodos = data.hasTodos || false;
			this.language = data.language || '';

			//* Diagnósticos/problemas
			this.diagnostics = data.diagnostics || {
				errors: 0,
				warnings: 0,
				infos: 0
			};

			//* Metadatos adicionales
			this.lastAccessed = data.lastAccessed || Date.now();
			this.createdAt = data.createdAt || Date.now();

			//* Referencia al elemento DOM (opcional, se puede obtener dinámicamente)
			this._domElement = null;
		}

		/// Obtiene el elemento DOM asociado a esta pestaña
		getDOMElement() {
			if (!this._domElement || !this._domElement.isConnected) {
				this._domElement = document.querySelector(`[data-unique-id="${this.id}"]`);
			}
			return this._domElement;
		}

		/// Actualiza las propiedades desde el DOM
		updateFromDOM() {
			const element = this.getDOMElement();
			if (element) {
				const rect = element.getBoundingClientRect();
				const containerRect = element.closest('#tabs-container')?.getBoundingClientRect();

				if (containerRect) {
					this.top = rect.top - containerRect.top;
					this.height = rect.height;
					// Solo actualizar targetTop si no está siendo animada
					if (!this.isAnimating) {
						this.targetTop = this.top;
					}
				}

				// Actualizar estados desde las clases CSS
				this.isActive = element.classList.contains('active');
				this.isDragged = element.classList.contains('dragging');
			}
		}

		/// Clona la pestaña con nuevas propiedades
		clone(overrides = {}) {
			return new TabDataModel.TabObject({
				...this,
				...overrides
			});
		}

		/// Verifica si la pestaña tiene problemas/diagnósticos
		hasProblems() {
			return this.diagnostics.errors > 0 || this.diagnostics.warnings > 0 || this.diagnostics.infos > 0;
		}

		/// Obtiene el nivel de problema más crítico
		getCriticalProblemLevel() {
			if (this.diagnostics.errors > 0) return 'error';
			if (this.diagnostics.warnings > 0) return 'warning';
			if (this.diagnostics.infos > 0) return 'info';
			return null;
		}

		/// Serializa la pestaña para envío al backend
		serialize() {
			return {
				id: this.id,
				index: this.index,
				targetIndex: this.targetIndex,
				isActive: this.isActive,
				isPinned: this.isPinned,
				filename: this.filename,
				filepath: this.filepath,
				isDirty: this.isDirty,
				language: this.language
			};
		}
	};

	/// Inicializa el modelo desde el DOM actual
	initializeFromDOM(container) {
		this.clear();

		if (!container) {
			console.warn('[TabDataModel] No se proporcionó contenedor para inicializar');
			return false;
		}

		const tabElements = Array.from(container.querySelectorAll('.tab'));
		const containerRect = container.getBoundingClientRect();

		tabElements.forEach((element, index) => {
			const rect = element.getBoundingClientRect();
			const tabData = {
				id: element.dataset.uniqueId || `tab-${index}`,
				index: index,
				targetIndex: index,
				top: rect.top - containerRect.top,
				height: rect.height,
				isActive: element.classList.contains('active'),
				isDragged: element.classList.contains('dragging'),
				filename: element.querySelector('.tab-filename')?.textContent?.trim() || '',
				// Extraer más datos del DOM si están disponibles
			};

			tabData.targetTop = tabData.top;

			const tab = new TabDataModel.TabObject(tabData);
			tab._domElement = element; // Guardar referencia al DOM

			this.addTab(tab, false); // false = no notificar observadores aún
		});

		// Notificar una sola vez al final
		this.notifyObservers('initialized', { tabs: this.orderedTabs });

		console.log(`[TabDataModel] Inicializado con ${this.orderedTabs.length} pestañas desde DOM`);
		return true;
	}

	/*
	 / Establece una pestaña como activa por su ID
	   @param {string} tabId - El ID de la pestaña a activar
	   @returns {boolean} - Verdadero si se encontró y activó la pestaña
	 */
	setActiveTab(tabId) {
		if (!tabId || !this.tabs.has(tabId)) {
			console.warn(`[TabDataModel] No se puede activar la pestaña: ${tabId} - No existe`);
			return false;
		}

		let activated = false;

		// Desactivar todas las pestañas primero
		this.orderedTabs.forEach(tab => {
			const wasActive = tab.isActive;
			tab.isActive = (tab.id === tabId);

			if (tab.isActive && !wasActive) {
				activated = true;
				// Actualizar timestamp de último acceso
				tab.lastAccessed = Date.now();
				console.log(`[TabDataModel] Pestaña activada: ${tab.id}`);
			}
		});

		// Notificar cambio solo si hubo cambio real
		if (activated) {
			this.notifyObservers('tabActivated', {
				tabId,
				tab: this.tabs.get(tabId)
			});
		}

		return activated;
	}

	/// Añade una nueva pestaña al modelo
	addTab(tab, notify = true) {
		if (!(tab instanceof TabDataModel.TabObject)) {
			tab = new TabDataModel.TabObject(tab);
		}

		this.tabs.set(tab.id, tab);

		// Insertar en la posición correcta
		if (tab.index >= this.orderedTabs.length) {
			this.orderedTabs.push(tab);
		} else {
			this.orderedTabs.splice(tab.index, 0, tab);
			// Reindexar las pestañas siguientes
			this.reindexTabs();
		}

		if (notify) {
			this.notifyObservers('tabAdded', { tab });
		}

		return tab;
	}

	/// Elimina una pestaña del modelo
	removeTab(tabId, notify = true) {
		const tab = this.tabs.get(tabId);
		if (!tab) return false;

		this.tabs.delete(tabId);
		const index = this.orderedTabs.findIndex(t => t.id === tabId);
		if (index !== -1) {
			this.orderedTabs.splice(index, 1);
			this.reindexTabs();
		}

		if (notify) {
			this.notifyObservers('tabRemoved', { tab, oldIndex: index });
		}

		return true;
	}

	/// Obtiene una pestaña por ID
	getTab(tabId) {
		return this.tabs.get(tabId);
	}

	/// Obtiene una pestaña por índice
	getTabByIndex(index) {
		return this.orderedTabs[index];
	}

	/// Obtiene todas las pestañas como array ordenado
	getAllTabs() {
		return [...this.orderedTabs];
	}

	/// Obtiene todas las pestañas que coinciden con un filtro
	getTabsWhere(predicate) {
		return this.orderedTabs.filter(predicate);
	}

	/// Obtiene la pestaña activa
	getActiveTab() {
		return this.orderedTabs.find(tab => tab.isActive);
	}

	/// Obtiene pestañas con problemas/diagnósticos
	getTabsWithProblems() {
		return this.orderedTabs.filter(tab => tab.hasProblems());
	}

	/// Actualiza las propiedades de una pestaña
	updateTab(tabId, updates, notify = true) {
		const tab = this.tabs.get(tabId);
		if (!tab) return false;

		const oldData = { ...tab };
		Object.assign(tab, updates);

		// Si cambió el índice, reordenar
		if (updates.index !== undefined && updates.index !== oldData.index) {
			this.moveTabToIndex(tabId, updates.index, false);
		}

		if (notify) {
			this.notifyObservers('tabUpdated', { tab, oldData, updates });
		}

		return true;
	}

	/// Mueve una pestaña a un nuevo índice
	moveTabToIndex(tabId, newIndex, notify = true) {
		const tab = this.tabs.get(tabId);
		if (!tab) return false;

		const oldIndex = this.orderedTabs.findIndex(t => t.id === tabId);
		if (oldIndex === -1 || oldIndex === newIndex) return false;

		// Remover de la posición actual
		this.orderedTabs.splice(oldIndex, 1);

		// Insertar en la nueva posición
		this.orderedTabs.splice(newIndex, 0, tab);

		// Reindexar todas las pestañas
		this.reindexTabs();

		if (notify) {
			this.notifyObservers('tabMoved', { tab, oldIndex, newIndex });
		}

		return true;
	}

	/// Reordena las pestañas según un nuevo array de IDs
	reorderTabs(newOrderIds, notify = true) {
		const newOrder = [];
		const oldOrder = [...this.orderedTabs];

		// Construir nuevo orden
		newOrderIds.forEach(id => {
			const tab = this.tabs.get(id);
			if (tab) {
				newOrder.push(tab);
			}
		});

		// Verificar que tenemos todas las pestañas
		if (newOrder.length !== this.orderedTabs.length) {
			console.error('[TabDataModel] Error en reordenamiento: número de pestañas no coincide');
			return false;
		}

		this.orderedTabs = newOrder;
		this.reindexTabs();

		if (notify) {
			this.notifyObservers('tabsReordered', { newOrder, oldOrder });
		}

		return true;
	}

	/// Recalcula las posiciones objetivo de todas las pestañas
	recalculateTargetPositions() {
		let accumulatedTop = this.orderedTabs[0]?.top || 0;

		this.orderedTabs.forEach(tab => {
			tab.targetTop = accumulatedTop;
			accumulatedTop += tab.height;
		});

		this.notifyObservers('positionsRecalculated', { tabs: this.orderedTabs });
	}

	/// Actualiza todas las pestañas desde el DOM
	syncWithDOM() {
		this.orderedTabs.forEach(tab => tab.updateFromDOM());
		this.notifyObservers('syncedWithDOM', { tabs: this.orderedTabs });
	}

	/// Reindica todas las pestañas según su posición en el array
	reindexTabs() {
		this.orderedTabs.forEach((tab, index) => {
			tab.index = index;
			if (tab.targetIndex === tab.index) {
				// Si no hay cambio de target, mantener sincronizado
				tab.targetIndex = index;
			}
		});
	}

	/// Obtiene el orden actual como array de IDs
	getCurrentOrder() {
		return this.orderedTabs.map(tab => tab.id);
	}

	/// Obtiene el orden objetivo como array de IDs
	getTargetOrder() {
		return [...this.orderedTabs]
			.sort((a, b) => a.targetIndex - b.targetIndex)
			.map(tab => tab.id);
	}

	/// Limpia todo el modelo
	clear() {
		this.tabs.clear();
		this.orderedTabs = [];
		this.notifyObservers('cleared', {});
	}

	/// Obtiene estadísticas del modelo
	getStats() {
		const totalTabs = this.orderedTabs.length;
		const activeTabs = this.orderedTabs.filter(t => t.isActive).length;
		const pinnedTabs = this.orderedTabs.filter(t => t.isPinned).length;
		const dirtyTabs = this.orderedTabs.filter(t => t.isDirty).length;
		const tabsWithProblems = this.getTabsWithProblems().length;
		const animatingTabs = this.orderedTabs.filter(t => t.isAnimating).length;

		return {
			totalTabs,
			activeTabs,
			pinnedTabs,
			dirtyTabs,
			tabsWithProblems,
			animatingTabs
		};
	}

	/**
	 * Registra un observador para cambios en el modelo
	 */
	addObserver(callback) {
		this.observers.push(callback);
		return () => {
			const index = this.observers.indexOf(callback);
			if (index > -1) {
				this.observers.splice(index, 1);
			}
		};
	}

	/**
	 * Notifica a todos los observadores sobre cambios
	 */
	notifyObservers(eventType, data) {
		this.observers.forEach(callback => {
			try {
				callback(eventType, data, this);
			} catch (error) {
				console.error('[TabDataModel] Error en observador:', error);
			}
		});
	}

	/**
	 * Exporta el modelo para debugging
	 */
	debug() {
		return {
			tabs: Array.from(this.tabs.entries()),
			orderedTabs: this.orderedTabs.map(t => ({ ...t })),
			stats: this.getStats(),
			currentOrder: this.getCurrentOrder(),
			targetOrder: this.getTargetOrder()
		};
	}
}

// Crear e inicializar la instancia global
window.tabDataModel = new TabDataModel();
console.log('[TabDataModel] Instancia global creada y expuesta como window.tabDataModel');

/**
 * Instancia global del modelo
 *//*
const tabDataModel = new TabDataModel();

// Exportar para usar en módulos
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
module.exports = { TabDataModel, tabDataModel };
} else {
window.TabDataModel = TabDataModel;
window.tabDataModel = tabDataModel;
}

console.log('[TabDataModel] Modelo de datos global inicializado');
*/
