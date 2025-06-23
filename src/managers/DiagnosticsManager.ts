import * as vscode from 'vscode';

/**
 * Gestiona los diagnósticos (errores, warnings, etc.) de los archivos
 */
export class DiagnosticsManager {
	/**
	 * Obtiene los problemas de un archivo
	 */
	public async getProblems(uri: vscode.Uri): Promise<{ errors: number, warnings: number, infos: number, hints: number, errorLines?: number[] }> {
		const diagnostics = vscode.languages.getDiagnostics(uri);
		let errors = 0;
		let warnings = 0;
		let infos = 0;
		let hints = 0;
		const errorLines: number[] = [];

		for (const diagnostic of diagnostics) {
			if (diagnostic.severity === vscode.DiagnosticSeverity.Error) {
				errors++;
				// Guardar las líneas con errores
				const errorLine = diagnostic.range.start.line + 1; // +1 para mostrar líneas en formato humano (1-indexed)
				if (!errorLines.includes(errorLine)) {
					errorLines.push(errorLine);
				}
			} else if (diagnostic.severity === vscode.DiagnosticSeverity.Warning) {
				warnings++;
			} else if (diagnostic.severity === vscode.DiagnosticSeverity.Information) {
				infos++;
			} else if (diagnostic.severity === vscode.DiagnosticSeverity.Hint) {
				hints++;
			}
		}

		// Ordenar las líneas de error
		errorLines.sort((a, b) => a - b);

		return { errors, warnings, infos, hints, errorLines };
	}

	/**
	 * Determina la clase CSS del label según los problemas
	 */
	public getLabelClass(problems: { errors: number, warnings: number, infos: number, hints: number }, isActive: boolean): string {
		if (problems.errors > 0) {
			return 'label error';
		} else if (problems.warnings > 0) {
			return 'label warning';
		} else if (problems.infos > 0) {
			return 'label info';
		} else if (!isActive) {
			return 'label faded';
		}
		return 'label';
	}

	/**
	 * Obtiene el texto del contador de problemas
	 */
	public getTotalProblems(problems: { errors: number, warnings: number, infos: number, hints: number }): string {
		// Solo contar errores, warnings e infos, ignorar hints completamente
		const totalProblems = problems.errors + problems.warnings + problems.infos;
		return totalProblems > 0 ? `${totalProblems}` : '';
	}
}
