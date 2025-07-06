// src/services/gui/BaseTemplate.ts
// Centralized base HTML template for the SideTabs webview
// Exports a function to generate the base HTML structure

interface WebviewBaseTemplateParams {
  uris: {
    mainStyle: string;
    mainScript: string;
    styles: {
      tabs: string;
      tabComponents: string;
      diagnostics: string;
      dragDropAnimation: string;
    };
    scripts: {
      dragDropManager: string;
      tabDataModel: string;
    };
  };
  tabsHtml: string;
  fontSize: number;
  tabHeight: number;
  cspSource: string;
}

/**
 * Generates the base HTML for the SideTabs webview.
 * @param params - All required URIs, tab HTML, and style values.
 * @returns The complete HTML string for the webview base.
 */
export function renderBaseTemplate(params: WebviewBaseTemplateParams): string {
  const { uris, tabsHtml, fontSize, tabHeight, cspSource } = params;
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SideTabs</title>
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} https: data:; script-src ${cspSource}; style-src ${cspSource} 'unsafe-inline';">
    <link href="${uris.mainStyle}" rel="stylesheet" />
    <link href="${uris.styles.tabs}" rel="stylesheet" />
    <link href="${uris.styles.tabComponents}" rel="stylesheet" />
    <link href="${uris.styles.diagnostics}" rel="stylesheet" />
    <link href="${uris.styles.dragDropAnimation}" rel="stylesheet" />
    <style>
      :root {
        --st-font-size: ${fontSize}px;
        --st-tab-height: ${tabHeight}px;
      }
    </style>
  </head>
  <body>
    <script>
      // Diagnóstico inmediato: ¿Se ejecuta JS en el webview?
      window._sidetabsWebviewBoot = true;
      console.log('[SideTabs DIAG] Webview JS booted');
      window.addEventListener('error', function(e) {
        console.error('[SideTabs DIAG] JS ERROR:', e.message, e.filename, e.lineno, e.colno, e.error);
        const diag = document.createElement('div');
        diag.style = 'background:#f14c4c;color:#fff;padding:8px;font-size:13px;z-index:9999;position:fixed;top:0;left:0;right:0';
        diag.textContent = '[SideTabs DIAG] JS ERROR: ' + e.message + ' (' + e.filename + ':' + e.lineno + ')';
        document.body.appendChild(diag);
      });
    </script>
    <div id="tabs-container">
      ${tabsHtml}
    </div>
    <script src="${uris.scripts.tabDataModel}"></script>
    <script src="${uris.scripts.dragDropManager}"></script>
    <script src="${uris.mainScript}"></script>
  </body>
</html>`;
}
