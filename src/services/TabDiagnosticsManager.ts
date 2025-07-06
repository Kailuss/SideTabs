import * as vscode from 'vscode';

// = Gestiona los diagnósticos (errores, warnings, etc.) de los archivos = 

export class TabDiagnosticsManager {

	/// Obtiene los diagnósticos de un archivo
	public async getDiagnostics(uri: vscode.Uri):
		Promise<{ errors: number, warnings: number, infos: number, hints: number, errorLines?: number[] }> {

		//* Verificar si el URI es válido
		const diagnostics = vscode.languages.getDiagnostics(uri);
		let errors = 0;
		let warnings = 0;
		let infos = 0;
		let hints = 0;

		//* Si no hay diagnósticos, retornar 0 en todas las categorías
		if (diagnostics.length === 0) {
			return { errors: 0, warnings: 0, infos: 0, hints: 0 };
		}

		//* Contar diagnósticos por tipo
		for (const alertMessage of diagnostics) {
			if (alertMessage.severity === vscode.DiagnosticSeverity.Error) {
				errors++;
			} else if (alertMessage.severity === vscode.DiagnosticSeverity.Warning) {
				warnings++;
			} else if (alertMessage.severity === vscode.DiagnosticSeverity.Information) {
				infos++;
			} else if (alertMessage.severity === vscode.DiagnosticSeverity.Hint) {
				hints++;
			}
		}
		return { errors, warnings, infos, hints }; // Retorna conteo de diagnósticos
	}

	/// Determina la clase CSS del label según los diagnósticos
	public getLabelClass(diagnostics: { errors: number, warnings: number, infos: number, hints: number }, isActive: boolean): string {
		if (diagnostics.errors > 0) {
			return 'label error';
		} else if (diagnostics.warnings > 0) {
			return 'label warning';
		} else if (diagnostics.infos > 0) {
			return 'label info';
		} else if (!isActive) {
			return 'label faded';
		}
		return 'label';
	}

	/// Genera actualizaciones de diagnósticos para todas las pestañas
	public async generateDiagnosticsUpdates(tabsInfo: any[]): Promise<any[]> {
		const diagnosticsUpdates = [];

		//* Procesar solo pestañas que tienen URI para diagnósticos
		for (const tabInfo of tabsInfo) {
			const { tab, uniqueId, group } = tabInfo;

			if (tab.input instanceof vscode.TabInputText) {
				//> Obtener información de diagnósticos
				const diagnostics = await this.getDiagnostics(tab.input.uri);
				const isActive = group.activeTab === tab;
				const labelClass = this.getLabelClass(diagnostics, isActive);

				//> Añadir a la lista de actualizaciones
				diagnosticsUpdates.push({
					uniqueId,
					diagnostics,
					labelClass
				});
			}
		}

		return diagnosticsUpdates; //- Retorna lista de actualizaciones de diagnósticos
	}

	/// Compara dos mapas de diagnósticos para detectar cambios
	public hasDiagnosticsChanged(currentMap: Map<string, any>, previousMap?: Map<string, any>): boolean {

		//* Si no hay mapa previo, hay cambios
		if (!previousMap) return true; //- Si no hay mapa previo, siempre hay cambios

		//* Verificar si cambió el número de entradas
		if (previousMap.size !== currentMap.size) return true; //- Si el número de entradas es diferente, hay cambios

		//* Comparar cada entrada
		for (const [uniqueId, diagnostics] of currentMap.entries()) {
			const prevDiagnostics = previousMap.get(uniqueId);

			//> Si no existía antes o los números han cambiado,
			if (!prevDiagnostics ||
				prevDiagnostics.errors !== diagnostics.errors ||
				prevDiagnostics.warnings !== diagnostics.warnings ||
				prevDiagnostics.infos !== diagnostics.infos ||
				prevDiagnostics.hints !== diagnostics.hints) {
				return true; //> hay cambios en los diagnósticos
			}
		}
		return false; //- No hay cambios en los diagnósticos
	}
}
