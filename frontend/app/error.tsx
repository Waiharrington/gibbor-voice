'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Log the error to an error reporting service
        console.error('Application Error:', error);
    }, [error]);

    return (
        <div className="flex h-screen w-full flex-col items-center justify-center bg-gray-50 p-4">
            <div className="flex max-w-md flex-col items-center text-center">
                <div className="mb-6 rounded-full bg-red-100 p-4">
                    <AlertTriangle className="h-10 w-10 text-red-600" />
                </div>
                <h2 className="mb-2 text-2xl font-bold text-gray-900">
                    Algo salió mal en el panel
                </h2>
                <p className="mb-8 text-gray-500">
                    Encontramos un error inesperado. Esto puede deberse a un problema de conexión o un fallo temporal.
                </p>
                <div className="flex gap-4">
                    <button
                        onClick={() => window.location.reload()} // Hard reload is safer for hydration errors
                        className="flex items-center gap-2 rounded-lg bg-gray-200 px-6 py-3 font-medium text-gray-800 transition-colors hover:bg-gray-300"
                    >
                        <RefreshCcw className="h-4 w-4" />
                        Recargar Página
                    </button>

                    <button
                        onClick={() => reset()} // Try to re-render the segment
                        className="rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700"
                    >
                        Reintentar
                    </button>
                </div>
                {error.digest && (
                    <p className="mt-8 text-xs text-gray-400 font-mono">
                        Error ID: {error.digest}
                    </p>
                )}
            </div>
        </div>
    );
}
