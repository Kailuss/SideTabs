const vscode = acquireVsCodeApi();
let draggedTab = null;
let allTabs = [];
const tabContainer = document.getElementById('tabs-container') || document.body; // Usar tabs-container primero
let tooltipTimeout = null;
let activeTooltip = null;

// Inicializar cuando el DOM esté listo
function initializeTabs() {
	allTabs = Array.from(document.querySelectorAll('.tab'));
	console.log('[SideTabs] Initializing tabs. Found:', allTabs.length);
}

// Ejecutar cuando se carga el contenido
document.addEventListener('DOMContentLoaded', () => {
	console.log('[SideTabs] DOMContentLoaded event fired.');
	initializeTabs();
	initializeEventListeners();
});

// También ejecutar inmediatamente en caso de que el DOM ya esté listo
if (document.readyState === 'loading') {
	console.log('[SideTabs] Document is loading, waiting for DOMContentLoaded.');
	document.addEventListener('DOMContentLoaded', () => {
		console.log('[SideTabs] DOMContentLoaded event fired after loading state check.');
		initializeTabs();
		initializeEventListeners();
	});
} else if (document.readyState === 'interactive' || document.readyState === 'complete') {
	console.log('[SideTabs] Document already interactive or complete. Initializing now.');
	initializeTabs();
	initializeEventListeners();
}

/// Función para actualizar rápidamente el estado activo de las pestañas
function updateActiveTab(activeTabId) {
	// Reinicializar tabs si es necesario
	if (allTabs.length === 0) {
		initializeTabs();
	}

	// Usar un cache de elementos para evitar búsquedas DOM repetidas
	if (!window.tabElementsCache || allTabs.length !== window.tabElementsCache.size) {
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

/// Función para invalidar cache cuando se regenera el DOM
function invalidateTabCache() {
	window.tabElementsCache = null;
	window.lastActiveTabId = null;
}

/// Listener para mensajes del extension host
window.addEventListener('message', event => {
	const message = event.data;
	if (message.type === 'updateActiveTab') {
		updateActiveTab(message.activeTabId);
	} else if (message.command === 'updateDiagnostics') {
		updateDiagnostics(message.diagnostics);
	}
});

/// Función para actualizar solo los diagnósticos sin regenerar todo el HTML
/// Optimizada para reaccionar inmediatamente a los cambios
function updateDiagnostics(diagnosticsData) {
	console.log('[SideTabs] Actualizando diagnósticos en tiempo real para', diagnosticsData.length, 'pestañas');

	// Procesar inmediatamente cada pestaña con sus diagnósticos
	diagnosticsData.forEach(diagnostic => {
		const { uniqueId, problems, labelClass, problemsText, tooltipContent } = diagnostic;
		console.log('[SideTabs] Procesando pestaña:', uniqueId, 'con errores:', problems?.errors || 0);

		const tab = document.querySelector(`.tab[data-unique-id="${uniqueId}"]`);

		if (!tab) {
			console.warn('[SideTabs] Tab not found for uniqueId:', uniqueId);
			return;
		}

		// Actualizar inmediatamente el atributo data-tooltip-content si está disponible
		if (tooltipContent) {
			tab.setAttribute('data-tooltip-content', tooltipContent);
		}

		// Actualizar clase del label
		const labelElement = tab.querySelector('.label');
		if (labelElement) {
			// Preservar las clases que no son de diagnóstico
			const classesToKeep = Array.from(labelElement.classList)
				.filter(c => !['label', 'error', 'warning', 'info', 'faded'].includes(c));

			// Aplicar las nuevas clases
			labelElement.className = labelClass;

			// Restaurar las clases que queremos mantener
			classesToKeep.forEach(c => labelElement.classList.add(c));
		}

		// Eliminar el número total de problemas (problemsText) de la UI
		const problemsElement = tab.querySelector('.problems');
		if (problemsElement) problemsElement.remove();

		// Comprobar si tiene diagnósticos
		const hasDiagnostics = problems && (problems.errors > 0 || problems.warnings > 0 || problems.infos > 0);

		// Mostrar SIEMPRE la barra de diagnósticos, aunque no haya problemas
		let diagnosticsRow = tab.querySelector('.diagnostics-row');
		if (!diagnosticsRow) {
			const rowDiv = document.createElement('div');
			rowDiv.className = 'diagnostics-row';
			const labelContainer = tab.querySelector('.label-container');
			if (labelContainer) labelContainer.appendChild(rowDiv);
			diagnosticsRow = rowDiv;
		}

		// Construir el HTML de los items de diagnóstico (vacío si no hay problemas)
		const diagnosticsItems = [];
		if (problems.errors > 0) {
			diagnosticsItems.push(`<div class="diagnostics-item">
				<svg width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' style='color:var(--vscode-editorError-foreground, #f14c4c);display:inline-block;vertical-align:-1px;'>
					<path d='m15 9-6 6'/>
					<path d='M2.586 16.726A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2h6.624a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586z'/>
					<path d='m9 9 6 6'/>
				</svg>
			</div>`);
		}
		if (problems.warnings > 0) {
			diagnosticsItems.push(`<div class="diagnostics-item">
				<svg width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' style='color:var(--vscode-editorWarning-foreground, #cca700);display:inline-block;vertical-align:-1px;'>
					<path d='m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3'/>
					<path d='M12 9v4'/>
					<path d='M12 17h.01'/>
				</svg>
			</div>`);
		}
		if (problems.infos > 0) {
			diagnosticsItems.push(`<div class="diagnostics-item">
				<svg width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' style='color:var(--vscode-editorInfo-foreground);display:inline-block;vertical-align:-1px;'>
					<circle cx='12' cy='12' r='10'/>
					<path d='M12 16v-4'/>
					<path d='M12 8h.01'/>
				</svg>
			</div>`);
		}
		diagnosticsRow.innerHTML = diagnosticsItems.join('');

		// Eliminar la clase has-diagnostics si no hay problemas
		if (!hasDiagnostics) {
			tab.classList.remove('has-diagnostics');
		}
		// Si hay problemas, mantener la clase has-diagnostics
		else {
			tab.classList.add('has-diagnostics');
		}

		// Actualizar tooltip solo si es necesario
		if (tooltipContent) {
			tab.setAttribute('data-tooltip-content', encodeURIComponent(tooltipContent));
		}
	});
}

/// Invalidar cache al cargar nueva instancia del webview
invalidateTabCache();

/// Actualizar referencia de allTabs
allTabs = Array.from(document.querySelectorAll('.tab'));

//* Crear el elemento tooltip que se reutilizará
function createTooltip() {
	// Buscar un tooltip existente o crear uno nuevo
	let tooltip = document.querySelector('.vscode-tooltip');
	if (tooltip) {
		// Limpiar completamente las clases y estilos previos
		tooltip.className = 'vscode-tooltip';
		tooltip.removeAttribute('style');
		return tooltip;
	}
	tooltip = document.createElement('div');
	tooltip.className = 'vscode-tooltip';
	document.body.appendChild(tooltip);
	return tooltip;
}

/// Mostrar tooltip en posición específica
function showTooltip(element, content) {
	console.log('[SideTabs] showTooltip called for element:', element);
	console.log('[SideTabs] Raw encoded content from attribute:', content);
	if (tooltipTimeout) {
		clearTimeout(tooltipTimeout);
	}
	const tooltip = createTooltip();
	activeTooltip = tooltip;
	let htmlContent = '';
	try {
		htmlContent = decodeURIComponent(content);
	} catch (e) {
		console.error('[SideTabs] Error decoding tooltip content:', e);
		htmlContent = 'Error: Could not decode tooltip content.';
	}
	console.log('[SideTabs] Decoded HTML content:', htmlContent);
	tooltip.innerHTML = htmlContent;
	tooltip.style.display = 'block';
	tooltip.classList.add('visible');
	const rect = element.getBoundingClientRect();
	const tooltipHeight = tooltip.offsetHeight;
	const tooltipWidth = tooltip.offsetWidth;
	let top = rect.bottom + 4;
	let left = rect.left + (rect.width / 2) - (tooltipWidth / 2); // Centrado horizontal
	if (top + tooltipHeight > window.innerHeight) {
		top = rect.top - tooltipHeight - 4;
	}
	if (left + tooltipWidth > window.innerWidth) {
		left = window.innerWidth - tooltipWidth - 8;
	}
	if (left < 0) left = 8;
	tooltip.style.left = left + 'px';
	tooltip.style.top = top + 'px';
	console.log('[SideTabs] Tooltip should now be visible at', left, top);
}

function hideTooltip() {
	if (activeTooltip) {
		activeTooltip.style.display = 'none';
		activeTooltip.classList.remove('visible');
		activeTooltip = null;
	}
	if (tooltipTimeout) {
		clearTimeout(tooltipTimeout);
		tooltipTimeout = null;
	}
}

// Función unificada para inicializar todos los listeners usando delegación de eventos
function initializeEventListeners() {
	console.log('[SideTabs] Initializing event listeners on tab container.');

	tabContainer.addEventListener('mouseover', e => {
		const tab = e.target.closest('.tab');
		if (!tab) return;
		const content = tab.getAttribute('data-tooltip-content');
		if (content) {
			showTooltip(tab, content);
		}
	});

	tabContainer.addEventListener('mouseout', e => {
		const tab = e.target.closest('.tab');
		if (tab && !tab.contains(e.relatedTarget)) {
			hideTooltip();
		}
	});

	tabContainer.addEventListener('click', e => {
		hideTooltip();
		const tab = e.target.closest('.tab');
		if (!tab) return;

		e.stopPropagation();
		const closeBtn = e.target.closest('.close');
		if (closeBtn) {
			handleClose(tab);
		} else if (e.target.classList.contains('click-layer') || !e.target.classList.contains('move-btn')) {
			vscode.postMessage({ command: 'focus', uniqueId: tab.dataset.uniqueId });
		}
	});

	tabContainer.addEventListener('contextmenu', e => {
		hideTooltip();
		const tab = e.target.closest('.tab');
		if (!tab) return;

		e.preventDefault();
		e.stopPropagation();

		allTabs.forEach(t => t.classList.remove('contextmenu-active'));
		tab.classList.add('contextmenu-active');

		vscode.postMessage({
			command: 'showContextMenu',
			uniqueId: tab.dataset.uniqueId,
			label: tab.dataset.label,
			x: e.clientX,
			y: e.clientY
		});

		setTimeout(() => {
			tab.classList.remove('contextmenu-active');
		}, 1000);
	});

	tabContainer.addEventListener('dragstart', e => {
		const tab = e.target.closest('.tab');
		if (!tab) return;

		hideTooltip();
		draggedTab = tab;
		tab.classList.add('dragging');
		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData('text/plain', tab.dataset.uniqueId);
	});

	tabContainer.addEventListener('dragend', e => {
		if (!draggedTab) return;
		draggedTab.classList.remove('dragging');
		draggedTab = null;
		allTabs.forEach(t => t.classList.remove('drag-over-top', 'drag-over-bottom'));
	});

	tabContainer.addEventListener('drop', e => {
		const tab = e.target.closest('.tab');
		if (!tab || !draggedTab) return;

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
}

// Función de cierre refactorizada
function handleClose(tab) {
	const tabHeight = tab.offsetHeight;
	const tabIndex = allTabs.indexOf(tab);
	const tabsBelow = allTabs.filter((_, index) => index > tabIndex);

	tab.classList.add('closing');

	tabsBelow.forEach(otherTab => {
		otherTab.style.transition = 'none';
		otherTab.style.transform = `translateY(${tabHeight}px)`;
	});

	requestAnimationFrame(() => {
		tabsBelow.forEach(otherTab => {
			otherTab.style.transition = 'transform 0.25s ease-out';
			otherTab.style.transform = 'translateY(0)';
		});
	});

	setTimeout(() => {
		vscode.postMessage({ command: 'close', uniqueId: tab.dataset.uniqueId });
	}, 25);

	setTimeout(() => {
		tabsBelow.forEach(otherTab => {
			if (otherTab && otherTab.style) {
				otherTab.style.transition = '';
				otherTab.style.transform = '';
			}
		});
	}, 400);
}


/// Mostrar tooltip en mouseover inmediato
allTabs.forEach(tab => {
	tab.addEventListener('mouseover', (e) => {
		const content = tab.getAttribute('data-tooltip-content');
		if (content) {
			console.log('[SideTabs] mouseover: mostrando tooltip');
			showTooltip(tab, content);
		}
	});
});

tabContainer.addEventListener('mouseout', (e) => {
	const targetTab = e.target.closest('.tab');
	if (targetTab && !targetTab.contains(e.relatedTarget)) {
		console.log('[SideTabs] mouseout: ocultando tooltip');
		hideTooltip();
	}
});

/// Dragover global para evitar icono prohibido y parpadeo
document.addEventListener('dragover', e => {
	e.preventDefault();
	e.dataTransfer.dropEffect = 'move';
}, false);

/// Nuevo: dragover en el contenedor para highlight estable
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

/// Asignar eventos drag & drop a cada tab
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
			// Obtener la altura de la pestaña antes de cerrarla
			const tabHeight = tab.offsetHeight;

			// Obtener todas las pestañas que están debajo de la que se cierra
			const tabIndex = Array.from(allTabs).indexOf(tab);
			const tabsBelow = allTabs.filter((_, index) => index > tabIndex);

			// Marcar la pestaña como cerrándose para desaparición inmediata
			tab.classList.add('closing');

			// Preparar animación: mover las pestañas debajo hacia abajo primero
			tabsBelow.forEach(otherTab => {
				// Sin transición inicialmente - posición inmediata
				otherTab.style.transition = 'none';
				otherTab.style.transform = 'translateY(' + tabHeight + 'px)';
			});

			// Forzar un repaint
			document.body.offsetHeight;

			// Ahora configurar la transición y mover hacia la posición final
			tabsBelow.forEach(otherTab => {
				otherTab.style.transition = 'transform 0.25s ease-out';
				otherTab.style.transform = 'translateY(0)';
			});

			// Enviar comando de cierre con un pequeño delay
			setTimeout(() => {
				vscode.postMessage({ command: 'close', uniqueId: tab.dataset.uniqueId });
			}, 25);

			// Limpiar estilos después de la animación y regeneración del DOM
			setTimeout(() => {
				tabsBelow.forEach(otherTab => {
					if (otherTab.style) {
						otherTab.style.transition = '';
						otherTab.style.transform = '';
					}
				});
			}, 400);

		} else if (e.target.classList.contains('click-layer') || !e.target.classList.contains('move-btn')) {
			vscode.postMessage({ command: 'focus', uniqueId: tab.dataset.uniqueId });
		}
	});

	//* Menú contextual para las pestañas
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

	//* Específicamente asignar evento a clicklayer para garantizar el enfoque
	const clickLayer = tab.querySelector('.click-layer');
	if (clickLayer) {
		clickLayer.addEventListener('click', e => {
			e.stopPropagation();
			vscode.postMessage({ command: 'focus', uniqueId: tab.dataset.uniqueId });
		});
	}
});

// Función para reinicializar event listeners cuando se actualiza el contenido
function reinitializeEventListeners() {
	initializeTabs();

	// Reinicializar tooltips, drag and drop, etc.
	allTabs.forEach(tab => {
		// Verificar si ya tiene listeners para evitar duplicados
		if (!tab.hasAttribute('data-listeners-attached')) {
			tab.setAttribute('data-listeners-attached', 'true');

			// Event listeners para clicks, drag, etc. se reasignan aquí
			// (el código existente ya debería manejar esto)
		}
	});
}

// Observar cambios en el contenedor de tabs
if (tabContainer) {
	const observer = new MutationObserver((mutations) => {
		console.log('[SideTabs] DOM changed, re-initializing tabs.');
		// No es necesario re-atachar listeners gracias a la delegación,
		// solo necesitamos actualizar el cache de `allTabs`.
		initializeTabs();
		invalidateTabCache();
	});

	observer.observe(tabContainer, {
		childList: true, // Observar adición/eliminación de nodos hijos
		subtree: false // No es necesario observar sub-árboles de las pestañas
	});
}
console.log('[SideTabs] Script loaded.');
