import * as vscode from 'vscode';

//· Gestiona los diagnósticos (errores, warnings, etc.) de los archivos

export class DiagnosisManager {

	/// Obtiene los diagnósticos de un archivo
	public async getDiagnosis(uri: vscode.Uri):
		Promise<{ errors: number, warnings: number, infos: number, hints: number, errorLines?: number[] }> {

		const diagnosis = vscode.languages.getDiagnostics(uri);
		let errors = 0;
		let warnings = 0;
		let infos = 0;
		let hints = 0;

		for (const alert of diagnosis) {
			if (alert.severity === vscode.DiagnosticSeverity.Error) {
				errors++;
			} else if (alert.severity === vscode.DiagnosticSeverity.Warning) {
				warnings++;
			} else if (alert.severity === vscode.DiagnosticSeverity.Information) {
				infos++;
			} else if (alert.severity === vscode.DiagnosticSeverity.Hint) {
				hints++;
			}
		}

		return { errors, warnings, infos, hints };
	}

	/// Determina la clase CSS del label según los diagnósticos
	public getLabelClass(diagnosis: { errors: number, warnings: number, infos: number, hints: number }, isActive: boolean): string {
		if (diagnosis.errors > 0) {
			return 'label error';
		} else if (diagnosis.warnings > 0) {
			return 'label warning';
		} else if (diagnosis.infos > 0) {
			return 'label info';
		} else if (!isActive) {
			return 'label faded';
		}
		return 'label';
	}

	/// Genera actualizaciones de diagnósticos para todas las pestañas
	public async generateDiagnosisUpdates(tabsInfo: any[]): Promise<any[]> {
		const diagnosisUpdates = [];

		//* Procesar solo pestañas que tienen URI para diagnósticos
		for (const tabInfo of tabsInfo) {
			const { tab, uniqueId, group } = tabInfo;

			if (tab.input instanceof vscode.TabInputText) {
				// Obtener información de diagnósticos
				const diagnosis = await this.getDiagnosis(tab.input.uri);
				const isActive = group.activeTab === tab;
				const labelClass = this.getLabelClass(diagnosis, isActive);

				// Añadir a la lista de actualizaciones
				diagnosisUpdates.push({
					uniqueId,
					diagnosis, // Incluye la información de líneas de error
					labelClass
				});
			}
		}

		return diagnosisUpdates;
	}

	/// Compara dos mapas de diagnósticos para detectar cambios
	public hasDiagnosisChanged(currentMap: Map<string, any>, previousMap?: Map<string, any>): boolean {

		//* Si no hay mapa previo, hay cambios
		if (!previousMap) {
			return true;
		}

		//* Verificar si cambió el número de entradas
		if (previousMap.size !== currentMap.size) {
			return true;
		}

		//* Comparar cada entrada
		for (const [uniqueId, diagnosis] of currentMap.entries()) {
			const prevDiagnosis = previousMap.get(uniqueId);

			// Si no existía antes o los números han cambiado
			if (!prevDiagnosis ||
				prevDiagnosis.errors !== diagnosis.errors ||
				prevDiagnosis.warnings !== diagnosis.warnings ||
				prevDiagnosis.infos !== diagnosis.infos ||
				prevDiagnosis.hints !== diagnosis.hints) {
				return true;
			}
		}

		return false;
	}
}
