/**
 * Gestor de arrastrar y soltar para pestañas
 * Implementa una experiencia de drag & drop con animaciones fluidas
 * Usa el TabDataModel centralizado para gestión de datos
 */
window.DragDropManager = {
	// Referencias y variables de estado
	tabContainer: null,
	allTabs: [],
	vscodeApi: null,
	tabDataModel: null, // Referencia al modelo de datos centralizado

	// Listeners vinculados para añadir y quitar correctamente
	boundHandleDragMove: null,
	boundHandleDragEnd: null,

	// Variables para el arrastre
	isDragging: false,
	draggedTab: null,
	draggedTabId: null,
	startY: 0,
	dragStarted: false,
	currentHoverTabId: null, // ID de la pestaña sobre la que está el cursor

	// Variables para animaciones
	animationDebounceTimer: null,
	lastOrderString: '', // Para detectar cambios reales

	// Configuración
	dragThreshold: 8,
	animationDuration: 200,

	/**
	 * Configura el sistema de arrastrar y soltar
	 * @param {HTMLElement} container - El contenedor de pestañas
	 * @param {Object} options - Opciones de configuración
	 */
	setupDragDrop(container, options = {}) {
		if (!container) {
			console.error('[DragDropManager] No se proporcionó contenedor');
			return;
		}

		// Limpiar configuración anterior si existe
		this.cleanup();

		// Establecer referencias
		this.tabContainer = container;
		this.vscodeApi = window.vscodeApi || (typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null);
		this.tabDataModel = window.tabDataModel;

		if (!this.tabDataModel) {
			console.error('[DragDropManager] TabDataModel no está disponible');
			return;
		}

		if (!this.vscodeApi) {
			console.error('[DragDropManager] vscodeApi no está disponible');
			return;
		}

		// Crear y almacenar los listeners vinculados UNA SOLA VEZ
		this.boundHandleDragMove = this.handleDragMove.bind(this);
		this.boundHandleDragEnd = this.handleDragEnd.bind(this);

		// Inicializar el modelo desde el DOM
		this.tabDataModel.initializeFromDOM(container);

		// Suscribirse a cambios del modelo
		this.modelObserverCleanup = this.tabDataModel.addObserver(this.handleModelChange.bind(this));

		this.refreshTabsList();

		// Aplicar opciones personalizadas
		this.dragThreshold = options.threshold || 8;
		this.animationDuration = options.animationDuration || 200;

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

		// Limpiar suscripción al modelo
		if (this.modelObserverCleanup) {
			this.modelObserverCleanup();
			this.modelObserverCleanup = null;
		}

		this.resetState();
	},

	/**
	 * Maneja cambios en el modelo de datos
	 */
	handleModelChange(eventType, data, model) {
		switch (eventType) {
			case 'initialized':
				console.log('[DragDropManager] Modelo inicializado con', data.tabs.length, 'pestañas');
				break;
			case 'tabsReordered':
				console.log('[DragDropManager] Pestañas reordenadas en el modelo');
				break;
			case 'positionsRecalculated':
				// Solo actualizar visualmente si no estamos arrastrando
				if (!this.isDragging) {
					this.updateTabsVisualOrder();
				}
				break;
			default:
				// Otros eventos del modelo
				break;
		}
	},

	//#region 🔄 Reinicia estado
	/// Reinicia todas las variables de estado
	resetState() {
		this.isDragging = false;
		this.draggedTab = null;
		this.draggedTabId = null;
		this.dragStarted = false;
		this.currentHoverTabId = null;
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

		// Limpiar estados de animación en el modelo
		if (this.tabDataModel) {
			const allTabs = this.tabDataModel.getAllTabs();
			allTabs.forEach(tab => {
				if (tab.isAnimating || tab.isDragged) {
					this.tabDataModel.updateTab(tab.id, {
						isAnimating: false,
						isDragged: false
					}, false); // No notificar para evitar eventos en cascada
				}
			});
		}
	},
	//#endregion

	//#region 🔄 Métodos de inicialización
	/// Inicializa el estado para el arrastre usando el modelo de datos
	initializeDragState() {
		// Sincronizar el modelo con el DOM actual
		this.tabDataModel.syncWithDOM();

		// Actualizar el string de comparación usando el orden actual
		this.lastOrderString = this.tabDataModel.getCurrentOrder().join('|');

		console.log('[DragDropManager] Estado de arrastre inicializado usando TabDataModel');
		console.log('[DragDropManager] Pestañas en el modelo:', this.tabDataModel.debug());
	},
	//#endregion

	//#region ⚙️ Métodos de arrastre
	/// Recalcula las posiciones objetivo de todas las pestañas según el orden actual
	recalculateTargetPositions() {
		// Usar el método del modelo de datos
		this.tabDataModel.recalculateTargetPositions();

		const allTabs = this.tabDataModel.getAllTabs();
		console.log('[DragDropManager] Posiciones objetivo recalculadas via TabDataModel:',
			allTabs.map(tab => `${tab.id}[${tab.targetIndex}]: ${tab.targetTop}px`));
	},

	/// Elimina el elemento fantasma
	removeDragGhost() {
		if (this.dragGhost && this.dragGhost.parentNode) {
			this.dragGhost.parentNode.removeChild(this.dragGhost);
			this.dragGhost = null;
		}
	},

	/// Actualiza visualmente todas las pestañas según el modelo de datos
	updateTabsVisualOrder() {
		//- Crea una cadena única para detectar cambios reales en el orden
		const currentOrderString = this.tabDataModel.getCurrentOrder().join('|');

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
		// Obtener todas las pestañas del modelo
		const allTabs = this.tabDataModel.getAllTabs();

		// Crear mapa de pestañas por ID para acceso rápido
		const tabsById = new Map();
		this.allTabs.forEach(tab => {
			tabsById.set(tab.dataset.uniqueId, tab);
		});

		console.log(`[DragDropManager] Animando pestañas hacia posiciones objetivo usando TabDataModel`);

		// Aplicar las transformaciones usando las posiciones objetivo ya calculadas
		allTabs.forEach((tabData) => {
			const tab = tabsById.get(tabData.id);
			if (!tab) return;

			// Calcular el desplazamiento desde la posición original hacia la objetivo
			const newDeltaY = tabData.targetTop - tabData.top;

			// Obtener el deltaY actual de la pestaña (si tiene transform)
			const currentTransform = tab.style.transform;
			const currentDeltaY = currentTransform.includes('translateY') ?
				parseFloat(currentTransform.match(/translateY\(([-\d.]+)px\)/)?.[1] || '0') : 0;

			console.log(`[DragDropManager] Pestaña ${tabData.id}: currentDeltaY ${currentDeltaY} -> targetDeltaY ${newDeltaY}px`);

			// Solo aplicar cambios si hay una diferencia significativa
			if (Math.abs(newDeltaY - currentDeltaY) > 0) {
				// Determinar si usar transición basado en la diferencia y si es primera vez
				const useTransition = !currentTransform.includes('translateY') || Math.abs(newDeltaY - currentDeltaY) > 5;

				if (useTransition && !tabData.isDragged) {
					// Solo aplicar transición a pestañas que no están siendo arrastradas
					tab.style.transition = `transform ${this.animationDuration}ms ease-out`;

					// Marcar como animando en el modelo
					this.tabDataModel.updateTab(tabData.id, { isAnimating: true }, false);
					console.log(`[DragDropManager] 🎬 Pestaña ${tabData.id} MARCADA como animando hacia ${tabData.targetTop}px`);

					// Programar limpieza después de la animación
					setTimeout(() => {
						this.tabDataModel.updateTab(tabData.id, { isAnimating: false }, false);
						console.log(`[DragDropManager] ✅ Pestaña ${tabData.id} FINALIZÓ animación`);
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
				if (tabData.isDragged) {
					tab.style.pointerEvents = 'none';
					console.log(`[DragDropManager] Pestaña arrastrada ${tabData.id} posicionada hacia objetivo sin transición`);
				}
			} else {
				// No hay cambio significativo, mantener estado actual
				if (tabData.isDragged) {
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

		// Inicializar el estado usando el modelo de datos
		this.initializeDragState();

		// Guardar ID de la pestaña arrastrada
		this.draggedTabId = this.draggedTab.dataset.uniqueId;

		// Guardar posición inicial
		this.startY = e.clientY;

		// Inicializar el estado de arrastre (pero aún no activar visualmente)
		this.isDragging = true;
		this.dragStarted = false; // El arrastre real aún no ha comenzado

		// Agregar listener para movimiento y soltar usando las referencias guardadas
		document.addEventListener('mousemove', this.boundHandleDragMove);
		document.addEventListener('mouseup', this.boundHandleDragEnd);

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

				// Marcar la pestaña arrastrada en el modelo
				this.tabDataModel.updateTab(this.draggedTabId, { isDragged: true }, false);

				// Hacer la pestaña original semi-transparente pero visible en su posición
				this.draggedTab.style.opacity = '0.3';
				this.draggedTab.style.pointerEvents = 'none';

				// Añadir clase para deshabilitar hover en todas las pestañas durante el arrastre
				this.tabContainer.classList.add('dragging-active');

				console.log('[DragDropManager] Umbral superado, iniciando arrastre de pestaña:', this.draggedTabId);
			} else {
				// No se ha superado el umbral, no hacer nada todavía
				return;
			}
		}

		//? A partir de aquí solo se ejecuta si dragStarted es true
		// Obtener la posición Y del cursor y actualizar la posición del fantasma
		const mouseY = e.clientY;

		// Obtener referencias actualizadas a todas las pestañas
		const allCurrentTabs = Array.from(this.tabContainer.querySelectorAll('.tab'));		// Encontrar sobre qué pestaña está el cursor actualmente
		let hoverTabId = null;
		let insertPosition = -1;

		// Obtener pestañas ordenadas por targetIndex desde el modelo
		const allTabs = this.tabDataModel.getAllTabs();
		const sortedTabs = [...allTabs].sort((a, b) => a.targetIndex - b.targetIndex);

		for (const tabData of sortedTabs) {
			// Saltar la pestaña arrastrada
			if (tabData.id === this.draggedTabId) continue;

			// CLAVE: Excluir pestañas que están animándose para detección de hover
			if (tabData.isAnimating) {
				console.log(`[DragDropManager] ⏭️ Saltando detección en pestaña ${tabData.id} (animándose)`);
				continue;
			}

			const originalTabTop = tabData.top;
			const originalTabBottom = tabData.top + tabData.height;

			// Zona de detección de hover (toda la pestaña)
			if (mouseY >= originalTabTop && mouseY <= originalTabBottom) {
				hoverTabId = tabData.id;

				// Determinar posición de inserción basada en la mitad de la pestaña
				const tabCenter = originalTabTop + (tabData.height / 2);
				if (mouseY < tabCenter) {
					// Mitad superior: insertar antes de esta pestaña
					insertPosition = tabData.targetIndex;
				} else {
					// Mitad inferior: insertar después de esta pestaña
					insertPosition = tabData.targetIndex + 1;
				}

				console.log(`[DragDropManager] 🎯 Hover detectado en pestaña ${hoverTabId}, insertar en posición ${insertPosition}`);
				break;
			}
		}

		// Si no se detectó hover en ninguna pestaña, verificar límites del contenedor
		if (hoverTabId === null) {
			const firstTab = sortedTabs[0];
			const lastTab = sortedTabs[sortedTabs.length - 1];

			if (firstTab && mouseY < firstTab.top) {
				insertPosition = 0; // Insertar al principio
				console.log(`[DragDropManager] 🔝 Cursor arriba del contenedor, insertar en posición 0`);
			} else if (lastTab && mouseY > (lastTab.top + lastTab.height)) {
				insertPosition = sortedTabs.length; // Insertar al final
				console.log(`[DragDropManager] 🔽 Cursor abajo del contenedor, insertar al final (posición ${insertPosition})`);
			}
		}

		// Solo reordenar si hay un cambio real y no estamos en la misma pestaña
		if (insertPosition !== -1 && hoverTabId !== this.currentHoverTabId) {
			this.currentHoverTabId = hoverTabId;

			// Ajustar posición de inserción para evitar índices fuera de rango
			const maxPosition = allTabs.length - 1;
			insertPosition = Math.max(0, Math.min(insertPosition, maxPosition));

			// Reordenar las pestañas usando el método del modelo
			if (this.reorderTabsForInsertion(this.draggedTabId, insertPosition)) {
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
		// Obtener la pestaña arrastrada del modelo
		const draggedTab = this.tabDataModel.getTab(draggedId);
		if (!draggedTab) return false;

		const currentPosition = draggedTab.targetIndex;

		// Si no hay cambio real de posición, no hacer nada
		if (currentPosition === insertPosition) return false;

		console.log(`[DragDropManager] Reordenando: mover ${draggedId} de posición ${currentPosition} a ${insertPosition}`);

		// Obtener todas las pestañas del modelo
		const allTabs = this.tabDataModel.getAllTabs();

		// Actualizar targetIndex para todas las pestañas
		allTabs.forEach(tab => {
			if (tab.id === draggedId) {
				// La pestaña arrastrada va a la nueva posición
				this.tabDataModel.updateTab(tab.id, { targetIndex: insertPosition }, false);
			} else {
				// Las demás pestañas se ajustan según la inserción
				let newTargetIndex = tab.targetIndex;

				if (currentPosition < insertPosition) {
					// Moviendo hacia abajo: las pestañas entre current y insert se mueven hacia arriba
					if (tab.targetIndex > currentPosition && tab.targetIndex <= insertPosition) {
						newTargetIndex--;
					}
				} else {
					// Moviendo hacia arriba: las pestañas entre insert y current se mueven hacia abajo
					if (tab.targetIndex >= insertPosition && tab.targetIndex < currentPosition) {
						newTargetIndex++;
					}
				}

				// Solo actualizar si hay cambio
				if (newTargetIndex !== tab.targetIndex) {
					this.tabDataModel.updateTab(tab.id, { targetIndex: newTargetIndex }, false);
				}
			}
		});

		console.log('[DragDropManager] Nuevo orden de targetIndex:',
			allTabs.map(tab => `${tab.id}:${tab.targetIndex}`).join(', '));

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
		const allTabs = this.tabDataModel.getAllTabs();
		if (!allTabs || allTabs.length === 0) {
			console.log('[DragDropManager] No hay pestañas en el modelo para finalizar');
			return;
		}

		console.log('[DragDropManager] Iniciando finalización del orden usando TabDataModel');

		// Función interna para ejecutar el reordenamiento
		const executeReordering = () => {
			try {
				console.log('[DragDropManager] Ejecutando reordenamiento del DOM');

				// Primero deshabilitar transiciones para evitar animaciones durante el reordenamiento
				const domTabs = Array.from(this.tabContainer.querySelectorAll('.tab'));
				domTabs.forEach(tab => {
					tab.style.transition = 'none';
				});

				// Forzar reflow para asegurar que se aplique
				this.tabContainer.offsetHeight;

				// Limpiar todas las transformaciones
				domTabs.forEach(tab => {
					tab.style.transform = '';
				});

				// Reordenar DOM usando un enfoque más robusto
				// Crear un fragmento temporal con el orden correcto
				const fragment = document.createDocumentFragment();

				// Recolectar todas las pestañas en el orden objetivo (ordenado por targetIndex)
				const orderedDomTabs = [];
				const sortedTabs = [...allTabs].sort((a, b) => a.targetIndex - b.targetIndex);

				sortedTabs.forEach(tabData => {
					const domTab = this.tabContainer.querySelector(`[data-unique-id="${tabData.id}"]`);
					if (domTab) {
						orderedDomTabs.push(domTab);
					} else {
						console.warn(`[DragDropManager] No se encontró la pestaña con ID: ${tabData.id}`);
					}
				});

				// Verificar que tenemos todas las pestañas
				if (orderedDomTabs.length !== allTabs.length) {
					console.error(`[DragDropManager] Error: Se esperaban ${allTabs.length} pestañas pero se encontraron ${orderedDomTabs.length}`);
					return;
				}

				// Remover todas las pestañas del DOM y añadirlas al fragmento en el orden correcto
				orderedDomTabs.forEach(tab => {
					tab.parentNode.removeChild(tab);
					fragment.appendChild(tab);
				});

				// Añadir todas las pestañas ordenadas de vuelta al contenedor
				this.tabContainer.appendChild(fragment);

				// Actualizar el orden en el modelo para que coincida con el DOM
				const finalOrder = sortedTabs.map(tab => tab.id);
				this.tabDataModel.reorderTabs(finalOrder, false);

				console.log('[DragDropManager] DOM reordenado correctamente usando TabDataModel');
				console.log('[DragDropManager] Orden final aplicado:', finalOrder);

				// Verificar que todas las pestañas siguen visibles
				const finalDomTabs = Array.from(this.tabContainer.querySelectorAll('.tab'));
				console.log(`[DragDropManager] Pestañas finales visibles: ${finalDomTabs.length}`);

				// Verificar que el orden en el DOM coincide con el orden objetivo
				const domOrder = finalDomTabs.map(tab => tab.dataset.uniqueId);
				const orderMatches = JSON.stringify(domOrder) === JSON.stringify(finalOrder);
				console.log('[DragDropManager] Orden en DOM:', domOrder);
				console.log('[DragDropManager] Orden esperado:', finalOrder);
				console.log('[DragDropManager] ¿Orden correcto?', orderMatches);

				if (!orderMatches) {
					console.error('[DragDropManager] ERROR: El orden en DOM no coincide con el orden objetivo');
				}

				// Restaurar transiciones después del reordenamiento
				setTimeout(() => {
					finalDomTabs.forEach(tab => {
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
		const animatingTabs = allTabs.filter(tab => tab.isAnimating);
		const hasAnimatingTabs = animatingTabs.length > 0;
		const maxAnimationTime = hasAnimatingTabs ? this.animationDuration + 50 : 50;

		console.log(`[DragDropManager] Esperando ${maxAnimationTime}ms antes de reordenar (animaciones activas: ${hasAnimatingTabs})`);

		setTimeout(executeReordering, maxAnimationTime);
	},

	/**
	 * Restaura el orden original en caso de error
	 */
	restoreOriginalOrder() {
		try {
			console.log('[DragDropManager] Restaurando orden original usando TabDataModel');

			// Limpiar transformaciones
			const allDomTabs = Array.from(this.tabContainer.querySelectorAll('.tab'));
			allDomTabs.forEach(tab => {
				tab.style.transform = '';
				tab.style.transition = '';
				tab.style.opacity = '';
				tab.style.pointerEvents = '';
			});

			// El modelo mantendrá el orden original automáticamente si hay errores
			console.log('[DragDropManager] Orden original restaurado');

		} catch (error) {
			console.error('[DragDropManager] Error al restaurar orden original:', error);
		}
	},

	//#endregion

	//#region 🔚 Manejo del final del arrastre
	/// Maneja el final del arrastre
	handleDragEnd(e) {
		if (!this.isDragging) return;

		// Eliminar los event listeners usando las referencias guardadas
		document.removeEventListener('mousemove', this.boundHandleDragMove);
		document.removeEventListener('mouseup', this.boundHandleDragEnd);

		// Quitar la clase que deshabilita hover en todo el contenedor
		if (this.tabContainer) {
			this.tabContainer.classList.remove('dragging-active');
		}

		// Si el arrastre realmente comenzó (superó el umbral)
		if (this.dragStarted && this.draggedTab && this.draggedTabId) {
			// Marcar la pestaña arrastrada como no arrastrada en el modelo
			this.tabDataModel.updateTab(this.draggedTabId, { isDragged: false }, false);

			// Obtener el nuevo orden final desde el modelo
			const newOrder = this.tabDataModel.getTargetOrder();
			const originalOrder = this.tabDataModel.getCurrentOrder();

			// Solo enviar si realmente hubo un cambio en el orden
			if (JSON.stringify(originalOrder) !== JSON.stringify(newOrder)) {
				console.log('[DragDropManager] Orden final:', newOrder);

				// Finalizar el orden visual (reordenar DOM después de animaciones)
				this.finalizeTabOrder();

				// Enviar mensaje al backend con el nuevo orden
				if (this.vscodeApi) {
					this.vscodeApi.postMessage({
						command: 'reorderTabs',
						order: newOrder,
						originalOrder: originalOrder
					});
				} else {
					console.warn('[DragDropManager] No se pudo enviar mensaje al backend: API de VS Code no disponible');
				}
			} else {
				console.log('[DragDropManager] No hubo cambios en el orden de las pestañas');
			}
		} else {
			console.log('[DragDropManager] El arrastre no superó el umbral, tratando como un clic');
		}

		// Limpiar estado de arrastre de forma incondicional
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
