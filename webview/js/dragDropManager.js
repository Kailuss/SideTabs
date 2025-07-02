/**
 * Gestor de arrastrar y soltar para pestañas
 * Implementa una experiencia de drag & drop con animaciones fluidas
 * Basado en la lógica del TabDragManager
 */
const DragDropManager = {
	// Referencias y variables de estado
	tabContainer: null,
	allTabs: [],
	vscodeApi: null,
	// Variables para el arrastre
	isDragging: false,
	draggedTab: null,
	originalTabOrder: [], // Array de IDs (para compatibilidad con backend)
	tempTabStates: [], // Array de objetos con información completa de pestañas
	startY: 0,
	dragStarted: false,
	currentHoverTabId: null, // ID de la pestaña sobre la que está el cursor

	// Variables para animaciones
	animatingTabs: new Set(),
	animationDebounceTimer: null,
	lastOrderString: '', // Para detectar cambios reales

	// Configuración
	dragThreshold: 8,
	animationDuration: 200,
	standardTabHeight: 40, // Altura estándar de las pestañas

	/**
	 * Configura el sistema de arrastrar y soltar
	 * @param {HTMLElement} container - El contenedor de pestañas
	 * @param {Object} options - Opciones de configuración
	 */
	setupDragDrop(container, options = {}) {
		if (!container) return;

		// Limpiar configuración anterior si existe
		this.cleanup();

		// Establecer referencias
		this.tabContainer = container;
		this.vscodeApi = window.vscodeApi || (typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null);
		this.refreshTabsList();

		// Aplicar opciones personalizadas
		this.dragThreshold = 8;
		this.animationDuration = 200;

		// Configurar listener para mousedown en las pestañas
		this.tabContainer.addEventListener('mousedown', this.handleDragStart.bind(this));
		console.log(`[DragDropManager] Sistema de drag & drop inicializado con ${this.allTabs.length} pestañas`);

		// Devolver una función para limpiar los eventos si es necesario
		return this.cleanup.bind(this);
	},

	//#region 🔺 Actualiza la lista de pestañas
	/// Actualiza la lista de pestañas y recalcula dimensiones
	refreshTabsList() {
		this.allTabs = Array.from(this.tabContainer.querySelectorAll('.tab'));
	},

	/// Limpia los eventos y restaura el estado
	cleanup() {
		if (this.tabContainer) {
			this.tabContainer.removeEventListener('mousedown', this.handleDragStart.bind(this)); // Borrar el listener de inicio de arrastre
		}

		document.removeEventListener('mousemove', this.handleDragMove.bind(this)); // Borrar el listener de movimiento del ratón
		document.removeEventListener('mouseup', this.handleDragEnd.bind(this)); // Borrar el listener de finalización del arrastre

		this.resetState();
	},

	//#region 🔄 Reinicia estado
	/// Reinicia todas las variables de estado
	resetState() {
		this.isDragging = false;
		this.draggedTab = null;
		this.originalTabOrder = [];
		this.tempTabStates = [];
		this.dragStarted = false;
		this.currentHoverTabId = null;
		this.animatingTabs.clear();
		this.lastOrderString = '';
		if (this.animationDebounceTimer) {
			clearTimeout(this.animationDebounceTimer);
			this.animationDebounceTimer = null;
		}

		// Limpiar cualquier transformación visual residual en todas las pestañas
		if (this.tabContainer) {
			// Quitar la clase que deshabilita hover
			this.tabContainer.classList.remove('dragging-active');

			const allTabs = Array.from(this.tabContainer.querySelectorAll('.tab'));
			allTabs.forEach(tab => {
				// Remover transition primero para evitar animaciones no deseadas
				tab.style.transition = 'none';
				// Forzar un reflow para asegurar que se aplique
				tab.offsetHeight;
				// Limpiar todas las propiedades
				tab.style.transform = '';
				tab.style.opacity = '';
				tab.style.pointerEvents = '';
				// Finalmente remover la restricción de transition
				setTimeout(() => {
					tab.style.transition = '';
				}, 10);
			});
		}
	},
	//#endregion

	//#region 🔄 Guarda orden y posiciones
	/// Guarda el orden original y posiciones de las pestañas
	saveOriginalOrder() {
		// Mantener array de IDs para compatibilidad con backend
		this.originalTabOrder = Array.from(this.tabContainer.querySelectorAll('.tab'))
			.map(tab => tab.dataset.uniqueId);

		// Crear array de objetos con información completa
		this.tempTabStates = [];
		Array.from(this.tabContainer.querySelectorAll('.tab')).forEach((tab, index) => {
			const rect = tab.getBoundingClientRect();
			const tabState = {
				id: tab.dataset.uniqueId,
				originalIndex: index,    // Índice original fijo (nunca cambia)
				targetIndex: index,      // Índice objetivo en el nuevo orden
				top: rect.top,          // Posición original capturada
				height: rect.height,
				targetTop: rect.top,    // Posición objetivo calculada
				isAnimating: false,
				isDragged: false
			};
			this.tempTabStates.push(tabState);
		});

		// Inicializar string de comparación usando IDs del nuevo array
		this.lastOrderString = this.tempTabStates.map(state => state.id).join('|');

		console.log('[DragDropManager] Orden original y estados guardados:', this.tempTabStates);
	},
	//#endregion

	//#region ⚙️ Métodos de arrastre
	/// Recalcula las posiciones objetivo de todas las pestañas según el orden actual
	recalculateTargetPositions() {
		if (!this.tempTabStates || this.tempTabStates.length === 0) return;

		// Ordenar el array por targetIndex para calcular posiciones correctamente
		const sortedStates = [...this.tempTabStates].sort((a, b) => a.targetIndex - b.targetIndex);

		// Comenzar desde la posición original de la primera pestaña (la que tiene targetIndex 0)
		let accumulatedTop = this.tempTabStates[0].top;

		// Recalcular targetTop para cada pestaña según su targetIndex
		sortedStates.forEach((tabState) => {
			// Calcular nueva posición objetivo
			tabState.targetTop = accumulatedTop;

			// Acumular para la siguiente pestaña
			accumulatedTop += tabState.height;
		});

		console.log('[DragDropManager] Posiciones objetivo recalculadas:',
			sortedStates.map(s => `${s.id}[${s.targetIndex}]: ${s.targetTop}px`));
	},

	/// Elimina el elemento fantasma
	removeDragGhost() {
		if (this.dragGhost && this.dragGhost.parentNode) {
			this.dragGhost.parentNode.removeChild(this.dragGhost);
			this.dragGhost = null;
		}
	},

	/// Actualiza visualmente todas las pestañas según la lista temporal
	updateTabsVisualOrder() {
		//- Crea una cadena única para detectar cambios reales en el orden
		const currentOrderString = this.tempTabStates.map(state => state.id).join('|');

		//- Si no hay cambios reales en el orden, no hace nada
		if (currentOrderString === this.lastOrderString) return;

		//- Actualiza el último orden conocido
		this.lastOrderString = currentOrderString;

		//- Limpia timer anterior si existe
		if (this.animationDebounceTimer) clearTimeout(this.animationDebounceTimer);

		//- Aplicar cambios inmediatamente para la responsividad,
		// - con debounce ligero para evitar actualizaciones demasiado frecuentes
		this.animationDebounceTimer = setTimeout(() => {
			this.animateTabsToNewPositions();
		}, 12); // ~60fps, balance entre fluidez y rendimiento
	},
	//TODO: Anima las pestañas a sus nuevas posiciones sin reordenar el DOM
	animateTabsToNewPositions() {
		// Crear mapa de pestañas por ID para acceso rápido
		const tabsById = new Map();
		this.allTabs.forEach(tab => {
			tabsById.set(tab.dataset.uniqueId, tab);
		});

		console.log(`[DragDropManager] Animando pestañas hacia posiciones objetivo`);

		// Aplicar las transformaciones usando las posiciones objetivo ya calculadas
		this.tempTabStates.forEach((tabState) => {
			const tab = tabsById.get(tabState.id);
			if (!tab) return;

			// Calcular el desplazamiento desde la posición original hacia la objetivo
			const newDeltaY = tabState.targetTop - tabState.top;

			// Obtener el deltaY actual de la pestaña (si tiene transform)
			const currentTransform = tab.style.transform;
			const currentDeltaY = currentTransform.includes('translateY') ?
				parseFloat(currentTransform.match(/translateY\(([-\d.]+)px\)/)?.[1] || '0') : 0;

			console.log(`[DragDropManager] Pestaña ${tabState.id}: currentDeltaY ${currentDeltaY} -> targetDeltaY ${newDeltaY}px`);

			// Solo aplicar cambios si hay una diferencia significativa
			if (Math.abs(newDeltaY - currentDeltaY) > 0) {
				// Determinar si usar transición basado en la diferencia y si es primera vez
				const useTransition = !currentTransform.includes('translateY') || Math.abs(newDeltaY - currentDeltaY) > 5;

				if (useTransition && !tabState.isDragged) {
					// Solo aplicar transición a pestañas que no están siendo arrastradas
					tab.style.transition = `transform ${this.animationDuration}ms ease-out`;

					// Marcar como animando en el estado
					tabState.isAnimating = true;
					this.animatingTabs.add(tabState.id);
					console.log(`[DragDropManager] 🎬 Pestaña ${tabState.id} MARCADA como animando hacia ${tabState.targetTop}px (isAnimating: ${tabState.isAnimating})`);

					// Programar limpieza después de la animación
					setTimeout(() => {
						tabState.isAnimating = false;
						this.animatingTabs.delete(tabState.id);
						console.log(`[DragDropManager] ✅ Pestaña ${tabState.id} FINALIZÓ animación (isAnimating: ${tabState.isAnimating})`);
					}, this.animationDuration + 50);
				} else {
					// Para la pestaña arrastrada o movimientos pequeños, sin transición
					tab.style.transition = 'none';
				}

				// Aplicar la nueva transformación hacia la posición objetivo
				if (Math.abs(newDeltaY) > 1) {
					tab.style.transform = `translateY(${newDeltaY}px)`;
				} else {
					tab.style.transform = '';
				}

				// Si es la pestaña arrastrada, mantener estado especial
				if (tabState.isDragged) {
					tab.style.pointerEvents = 'none';
					console.log(`[DragDropManager] Pestaña arrastrada ${tabState.id} posicionada hacia objetivo sin transición`);
				}
			} else {
				// No hay cambio significativo, mantener estado actual
				if (tabState.isDragged) {
					tab.style.opacity = '1.0';
					tab.style.pointerEvents = 'none';
				}
			}
		});
	},

	/// Método opcional para animaciones más suaves con interpolación personalizada
	/// Permite animaciones más complejas como easing personalizado o animaciones por frames
	animateTabToTargetWithInterpolation(tabState, tab, options = {}) {
		const {
			duration = this.animationDuration,
			easing = 'ease-out',
			onUpdate = null,
			onComplete = null
		} = options;

		// Calcular desplazamiento objetivo
		const targetDeltaY = tabState.targetTop - tabState.top;

		// Obtener desplazamiento actual
		const currentTransform = tab.style.transform;
		const currentDeltaY = currentTransform.includes('translateY') ?
			parseFloat(currentTransform.match(/translateY\(([-\d.]+)px\)/)?.[1] || '0') : 0;

		// Si no hay diferencia significativa, no animar
		if (Math.abs(targetDeltaY - currentDeltaY) <= 1) {
			tab.style.transform = Math.abs(targetDeltaY) > 1 ? `translateY(${targetDeltaY}px)` : '';
			if (onComplete) onComplete(tabState, tab);
			return;
		}

		// Marcar como animando
		tabState.isAnimating = true;
		this.animatingTabs.add(tabState.id);

		// Configurar transición CSS
		tab.style.transition = `transform ${duration}ms ${easing}`;

		// Aplicar transformación
		tab.style.transform = Math.abs(targetDeltaY) > 1 ? `translateY(${targetDeltaY}px)` : '';

		// Callback durante la animación si se proporciona
		if (onUpdate) {
			const updateInterval = setInterval(() => {
				if (!tabState.isAnimating) {
					clearInterval(updateInterval);
					return;
				}
				onUpdate(tabState, tab);
			}, 16); // ~60fps
		}

		// Limpiar después de la animación
		setTimeout(() => {
			tabState.isAnimating = false;
			this.animatingTabs.delete(tabState.id);
			if (onComplete) onComplete(tabState, tab);
		}, duration + 50);
	},

	/**
	 * Maneja el inicio del proceso de arrastre
	 */
	handleDragStart(e) {
		this.draggedTab = e.target.closest('.tab');
		if (!this.draggedTab) return;

		// Si es un botón de cierre o un elemento interactivo, no iniciar arrastre
		if (e.target.closest('.tab-close-button') ||
			e.target.closest('.tab-interactive-element')) {
			return;
		}

		// Prevenir comportamiento predeterminado
		e.preventDefault();

		// Guardar el orden original de las pestañas y sus posiciones
		this.saveOriginalOrder();

		// Guardar posición inicial
		this.startY = e.clientY;

		// Inicializar el estado de arrastre (pero aún no activar visualmente)
		this.isDragging = true;
		this.dragStarted = false; // El arrastre real aún no ha comenzado

		// Agregar listener para movimiento y soltar
		document.addEventListener('mousemove', this.handleDragMove.bind(this));
		document.addEventListener('mouseup', this.handleDragEnd.bind(this));

		console.log('[DragDropManager] Posible arrastre de pestaña iniciado, esperando superar umbral');
	},

	/**
	 * Maneja el movimiento durante el arrastre
	 */
	handleDragMove(e) {
		if (!this.isDragging || !this.draggedTab) return;

		// Calcular distancia de movimiento
		const distance = Math.abs(e.clientY - this.startY);

		// Si el arrastre no ha comenzado, verificar si se supera el umbral
		if (!this.dragStarted) {
			if (distance >= this.dragThreshold) {
				this.dragStarted = true;

				// Marcar la pestaña arrastrada en los estados
				const draggedState = this.tempTabStates.find(state => state.id === this.draggedTab.dataset.uniqueId);
				if (draggedState) {
					draggedState.isDragged = true;
				}

				// Hacer la pestaña original semi-transparente pero visible en su posición
				this.draggedTab.style.opacity = '0.3';
				this.draggedTab.style.pointerEvents = 'none';

				// Añadir clase para deshabilitar hover en todas las pestañas durante el arrastre
				this.tabContainer.classList.add('dragging-active');

				console.log('[DragDropManager] Umbral superado, iniciando arrastre de pestaña:', this.draggedTab.dataset.uniqueId);
			} else {
				// No se ha superado el umbral, no hacer nada todavía
				return;
			}
		}

		//? A partir de aquí solo se ejecuta si dragStarted es true
		// Obtener la posición Y del cursor y actualizar la posición del fantasma
		const mouseY = e.clientY;

		// Obtener referencias actualizadas a todas las pestañas
		const allCurrentTabs = Array.from(this.tabContainer.querySelectorAll('.tab'));

		// Encontrar sobre qué pestaña está el cursor actualmente
		let hoverTabId = null;
		let insertPosition = -1;

		// Recorrer tempTabStates ordenado por targetIndex para detectar hover
		const sortedStates = [...this.tempTabStates].sort((a, b) => a.targetIndex - b.targetIndex);
		const draggedId = this.draggedTab.dataset.uniqueId;

		for (const tabState of sortedStates) {
			// Saltar la pestaña arrastrada
			if (tabState.id === draggedId) continue;

			// CLAVE: Excluir pestañas que están animándose para detección de hover
			if (tabState.isAnimating) {
				console.log(`[DragDropManager] ⏭️ Saltando detección en pestaña ${tabState.id} (animándose)`);
				continue;
			}

			const originalTabTop = tabState.top;
			const originalTabBottom = tabState.top + tabState.height;

			// Zona de detección de hover (toda la pestaña)
			if (mouseY >= originalTabTop && mouseY <= originalTabBottom) {
				hoverTabId = tabState.id;

				// Determinar posición de inserción basada en la mitad de la pestaña
				const tabCenter = originalTabTop + (tabState.height / 2);
				if (mouseY < tabCenter) {
					// Mitad superior: insertar antes de esta pestaña
					insertPosition = tabState.targetIndex;
				} else {
					// Mitad inferior: insertar después de esta pestaña
					insertPosition = tabState.targetIndex + 1;
				}

				console.log(`[DragDropManager] 🎯 Hover detectado en pestaña ${hoverTabId}, insertar en posición ${insertPosition}`);
				break;
			}
		}

		// Si no se detectó hover en ninguna pestaña, verificar límites del contenedor
		if (hoverTabId === null) {
			const firstState = sortedStates[0];
			const lastState = sortedStates[sortedStates.length - 1];

			if (firstState && mouseY < firstState.top) {
				insertPosition = 0; // Insertar al principio
				console.log(`[DragDropManager] 🔝 Cursor arriba del contenedor, insertar en posición 0`);
			} else if (lastState && mouseY > (lastState.top + lastState.height)) {
				insertPosition = sortedStates.length; // Insertar al final
				console.log(`[DragDropManager] 🔽 Cursor abajo del contenedor, insertar al final (posición ${insertPosition})`);
			}
		}

		// Solo reordenar si hay un cambio real y no estamos en la misma pestaña
		if (insertPosition !== -1 && hoverTabId !== this.currentHoverTabId) {
			this.currentHoverTabId = hoverTabId;

			// Ajustar posición de inserción para evitar índices fuera de rango
			const maxPosition = this.tempTabStates.length - 1;
			insertPosition = Math.max(0, Math.min(insertPosition, maxPosition));

			// Reordenar las pestañas
			if (this.reorderTabsForInsertion(draggedId, insertPosition)) {
				// Recalcular posiciones objetivo para todas las pestañas
				this.recalculateTargetPositions();

				// Actualizar visualmente
				this.updateTabsVisualOrder();
			}
		}
	},
	//#endregion

	/// Reordena las pestañas insertando la pestaña arrastrada en una nueva posición
	reorderTabsForInsertion(draggedId, insertPosition) {
		// Encontrar el estado de la pestaña arrastrada
		const draggedState = this.tempTabStates.find(state => state.id === draggedId);
		if (!draggedState) return false;

		const currentPosition = draggedState.targetIndex;

		// Si no hay cambio real de posición, no hacer nada
		if (currentPosition === insertPosition) return false;

		console.log(`[DragDropManager] Reordenando: mover ${draggedId} de posición ${currentPosition} a ${insertPosition}`);

		// Resetear todos los targetIndex
		this.tempTabStates.forEach(state => {
			if (state.id === draggedId) {
				// La pestaña arrastrada va a la nueva posición
				state.targetIndex = insertPosition;
			} else {
				// Las demás pestañas se ajustan según la inserción
				if (currentPosition < insertPosition) {
					// Moviendo hacia abajo: las pestañas entre current y insert se mueven hacia arriba
					if (state.targetIndex > currentPosition && state.targetIndex <= insertPosition) {
						state.targetIndex--;
					}
				} else {
					// Moviendo hacia arriba: las pestañas entre insert y current se mueven hacia abajo
					if (state.targetIndex >= insertPosition && state.targetIndex < currentPosition) {
						state.targetIndex++;
					}
				}
			}
		});

		console.log('[DragDropManager] Nuevo orden de targetIndex:',
			this.tempTabStates.map(s => `${s.id}:${s.targetIndex}`).join(', '));

		return true;
	},

	/// Crea un elemento fantasma de la pestaña arrastrada
	createDragGhost(draggedTab) {
		// Crear un elemento fantasma que sigue al cursor
		const ghost = draggedTab.cloneNode(true);
		ghost.classList.add('drag-ghost');
		ghost.style.position = 'fixed';
		ghost.style.pointerEvents = 'none';
		ghost.style.opacity = '0.8';
		ghost.style.transform = 'none';
		document.body.appendChild(ghost);

		return ghost;
	},

	/**
	 * Finaliza el orden de las pestañas reordenando físicamente el DOM
	 * Este método se ejecuta después de que las animaciones terminan
	 */
	finalizeTabOrder() {
		if (!this.tempTabStates || this.tempTabStates.length === 0) {
			console.log('[DragDropManager] No hay estados temporales para finalizar');
			return;
		}

		console.log('[DragDropManager] Iniciando finalización del orden. Estados temporales:', this.tempTabStates.map(s => s.id));

		// Función interna para ejecutar el reordenamiento
		const executeReordering = () => {
			try {
				console.log('[DragDropManager] Ejecutando reordenamiento del DOM');

				// Primero deshabilitar transiciones para evitar animaciones durante el reordenamiento
				const allTabs = Array.from(this.tabContainer.querySelectorAll('.tab'));
				allTabs.forEach(tab => {
					tab.style.transition = 'none';
				});

				// Forzar reflow para asegurar que se aplique
				this.tabContainer.offsetHeight;

				// Limpiar todas las transformaciones
				allTabs.forEach(tab => {
					tab.style.transform = '';
				});

				// Reordenar DOM usando un enfoque más robusto
				// Crear un fragmento temporal con el orden correcto
				const fragment = document.createDocumentFragment();

				// Recolectar todas las pestañas en el orden temporal deseado (ordenado por targetIndex)
				const orderedTabs = [];
				const sortedStates = [...this.tempTabStates].sort((a, b) => a.targetIndex - b.targetIndex);

				sortedStates.forEach(tabState => {
					const tab = this.tabContainer.querySelector(`[data-unique-id="${tabState.id}"]`);
					if (tab) {
						orderedTabs.push(tab);
					} else {
						console.warn(`[DragDropManager] No se encontró la pestaña con ID: ${tabState.id}`);
					}
				});

				// Verificar que tenemos todas las pestañas
				if (orderedTabs.length !== this.tempTabStates.length) {
					console.error(`[DragDropManager] Error: Se esperaban ${this.tempTabStates.length} pestañas pero se encontraron ${orderedTabs.length}`);
					return;
				}

				// Remover todas las pestañas del DOM y añadirlas al fragmento en el orden correcto
				orderedTabs.forEach(tab => {
					tab.parentNode.removeChild(tab);
					fragment.appendChild(tab);
				});

				// Añadir todas las pestañas ordenadas de vuelta al contenedor
				this.tabContainer.appendChild(fragment);

				const finalOrder = sortedStates.map(s => s.id);
				console.log('[DragDropManager] DOM reordenado correctamente usando fragmento');
				console.log('[DragDropManager] Orden final aplicado:', finalOrder);

				// Verificar que todas las pestañas siguen visibles
				const finalTabs = Array.from(this.tabContainer.querySelectorAll('.tab'));
				console.log(`[DragDropManager] Pestañas finales visibles: ${finalTabs.length}`);

				// Verificar que el orden en el DOM coincide con el orden temporal
				const domOrder = finalTabs.map(tab => tab.dataset.uniqueId);
				const orderMatches = JSON.stringify(domOrder) === JSON.stringify(finalOrder);
				console.log('[DragDropManager] Orden en DOM:', domOrder);
				console.log('[DragDropManager] Orden esperado:', finalOrder);
				console.log('[DragDropManager] ¿Orden correcto?', orderMatches);

				if (!orderMatches) {
					console.error('[DragDropManager] ERROR: El orden en DOM no coincide con el orden temporal');
				}

				// Restaurar transiciones después del reordenamiento
				setTimeout(() => {
					finalTabs.forEach(tab => {
						tab.style.transition = '';
					});
				}, 50);

			} catch (error) {
				console.error('[DragDropManager] Error al finalizar el orden de pestañas:', error);
				// En caso de error, intentar restaurar el estado
				this.restoreOriginalOrder();
			}
		};

		// Esperar a que todas las animaciones terminen, pero con fallback inmediato si no hay animaciones
		const hasAnimatingTabs = this.animatingTabs.size > 0;
		const maxAnimationTime = hasAnimatingTabs ? this.animationDuration + 50 : 50;

		console.log(`[DragDropManager] Esperando ${maxAnimationTime}ms antes de reordenar (animaciones activas: ${hasAnimatingTabs})`);

		setTimeout(executeReordering, maxAnimationTime);
	},

	/**
	 * Restaura el orden original en caso de error
	 */
	restoreOriginalOrder() {
		try {
			console.log('[DragDropManager] Restaurando orden original');

			// Limpiar transformaciones
			const allTabs = Array.from(this.tabContainer.querySelectorAll('.tab'));
			allTabs.forEach(tab => {
				tab.style.transform = '';
				tab.style.transition = '';
				tab.style.opacity = '';
				tab.style.pointerEvents = '';
			});

			// Restaurar orden original si está disponible
			if (this.originalTabOrder && this.originalTabOrder.length > 0) {
				this.originalTabOrder.forEach((tabId, index) => {
					const tab = this.tabContainer.querySelector(`[data-unique-id="${tabId}"]`);
					if (tab) {
						this.tabContainer.appendChild(tab);
					}
				});
			}

		} catch (error) {
			console.error('[DragDropManager] Error al restaurar orden original:', error);
		}
	},

	//#endregion

	//#region 🔚 Manejo del final del arrastre
	/// Maneja el final del arrastre
	handleDragEnd(e) {
		if (!this.isDragging) return;

		// Eliminar los event listeners primero
		document.removeEventListener('mousemove', this.handleDragMove.bind(this));
		document.removeEventListener('mouseup', this.handleDragEnd.bind(this));

		// Si el arrastre realmente comenzó (superó el umbral)
		if (this.dragStarted && this.draggedTab) {
			// Marcar la pestaña arrastrada como no arrastrada en los estados
			const draggedState = this.tempTabStates.find(state => state.id === this.draggedTab.dataset.uniqueId);
			if (draggedState) {
				draggedState.isDragged = false;
			}

			// Restaurar la pestaña original
			this.draggedTab.style.opacity = '';
			this.draggedTab.style.pointerEvents = '';

			// Quitar la clase que deshabilita hover
			this.tabContainer.classList.remove('dragging-active');

			// Obtener el nuevo orden final como array de IDs extraído de tempTabStates ordenado por targetIndex
			const sortedStates = [...this.tempTabStates].sort((a, b) => a.targetIndex - b.targetIndex);
			const newOrder = sortedStates.map(state => state.id);

			// Solo enviar si realmente hubo un cambio en el orden
			if (JSON.stringify(this.originalTabOrder) !== JSON.stringify(newOrder)) {
				console.log('[DragDropManager] Orden final:', newOrder);

				// Finalizar el orden visual (reordenar DOM después de animaciones)
				this.finalizeTabOrder();

				// Enviar mensaje al backend con el nuevo orden
				if (this.vscodeApi) {
					this.vscodeApi.postMessage({
						command: 'reorderTabs',
						order: newOrder,
						originalOrder: this.originalTabOrder
					});
				} else {
					console.warn('[DragDropManager] No se pudo enviar mensaje al backend: API de VS Code no disponible');
				}
			} else {
				console.log('[DragDropManager] No hubo cambios en el orden de las pestañas');

				// Limpiar cualquier transformación visual residual
				const allTabs = Array.from(this.tabContainer.querySelectorAll('.tab'));
				allTabs.forEach(tab => {
					tab.style.transform = '';
					tab.style.transition = '';
				});
			}
		} else {
			console.log('[DragDropManager] El arrastre no superó el umbral, tratando como un clic');
		}

		// Limpiar estado de arrastre
		this.resetState();
	}
};
//#endregion

// Exportar el gestor si estamos en un entorno con módulos
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
	module.exports = DragDropManager;
} else {
	window.DragDropManager = DragDropManager;
}
