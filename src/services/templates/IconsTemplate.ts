// src/services/gui/IconsTemplate.ts
// Centralized template for the icon initialization script in the webview

/**
 * Generates the icon initialization script for the webview.
 * @param iconMap - The icon map object
 * @param fileIconMap - The file icon map object
 * @returns The HTML <script> tag as a string
 */
export function renderIconInitializationScript(iconMap: Record<string, string>, fileIconMap: Record<string, string>): string {
  return `
    <script>
    // Configurar el mapa de iconos para el cliente
    window.ICON_MAP = ${JSON.stringify(iconMap)};
    window.FILE_ICON_MAP = ${JSON.stringify(fileIconMap)};
    
    // Cuando el DOM esté listo, aplicar los iconos y clases
    window.addEventListener('DOMContentLoaded', async () => {
      try {
        // Esperar a que se inicialicen los iconos
        if (typeof window.vertab !== 'undefined' && window.vertab.icons) {
          if (window.vertab.icons.initialize) {
            await window.vertab.icons.initialize();
          } else if (window.vertab.icons.initializeFromMap) {
            await window.vertab.icons.initializeFromMap();
          }
          // console.log('Iconos inicializados correctamente');
        }
        // Evento personalizado para notificar que los iconos están listos
        window.dispatchEvent(new CustomEvent('icons-ready'));
      } catch (error) {
        console.error('Error loading icons:', error);
      }
    });
    </script>
  `;
}
