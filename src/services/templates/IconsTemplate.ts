/**
 * Genera el script de inicialización de iconos para la webview.
 * @param iconMap - El objeto mapa de iconos
 * @param fileIconMap - El objeto mapa de iconos de archivos
 * @returns La etiqueta HTML <script> como cadena
*/
// = Plantilla centralizada para el script de inicialización de iconos en la webview =
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
