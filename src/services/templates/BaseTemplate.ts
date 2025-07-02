// src/services/gui/BaseTemplate.ts
// Centralized base HTML template for the SideTabs webview
// Exports a function to generate the base HTML structure

interface WebviewBaseTemplateParams {
  uris: {
    mainStyle: string;
    codicons: string;
    mainScript: string;
    styles: {
      tabs: string;
      dragDrop: string;
      dragDropAnimation: string;
      tabComponents: string;
      diagnosis: string;
      diagnosisCompact: string;
      actions: string;
    };
    scripts?: {
      dragDropManager?: string;
    };
  };
  tabsHtml: string;
  fontSize: number;
  tabHeight: number;
}

/**
 * Generates the base HTML for the SideTabs webview.
 * @param params - All required URIs, tab HTML, and style values.
 * @returns The complete HTML string for the webview base.
 */
export function renderBaseTemplate(params: WebviewBaseTemplateParams): string {
  const { uris, tabsHtml, fontSize, tabHeight } = params;
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SideTabs</title>
    <link href="${uris.mainStyle}" rel="stylesheet" />
    <link href="${uris.codicons}" rel="stylesheet" />
    <link href="${uris.styles.tabs}" rel="stylesheet" />
    <link href="${uris.styles.dragDrop}" rel="stylesheet" />
    <link href="${uris.styles.dragDropAnimation}" rel="stylesheet" />
    <link href="${uris.styles.tabComponents}" rel="stylesheet" />
    <link href="${uris.styles.diagnosis}" rel="stylesheet" />
    <link href="${uris.styles.diagnosisCompact}" rel="stylesheet" />
    <link href="${uris.styles.actions}" rel="stylesheet" />
    <style>
      :root {
        --st-font-size: ${fontSize}px;
        --st-tab-height: ${tabHeight}px;
      }
    </style>
  </head>
  <body>
    <div id="tabs-container">
      ${tabsHtml}
    </div>
    ${uris.scripts?.dragDropManager ? `<script src="${uris.scripts.dragDropManager}"></script>` : ''}
    <script src="${uris.mainScript}"></script>
  </body>
</html>`;
}
