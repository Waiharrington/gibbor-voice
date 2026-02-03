'use client';

import { AlertTriangle } from 'lucide-react';

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <html>
            <body>
                <div className="flex h-screen w-full flex-col items-center justify-center bg-gray-900 text-white p-4">
                    <div className="flex max-w-md flex-col items-center text-center">
                        <div className="mb-6 rounded-full bg-red-900/50 p-4">
                            <AlertTriangle className="h-12 w-12 text-red-500" />
                        </div>
                        <h2 className="mb-2 text-2xl font-bold">
                            Error Crítico del Sistema
                        </h2>
                        <p className="mb-8 text-gray-300">
                            La aplicación encontró un error crítico y no puede continuar.
                        </p>
                        <button
                            onClick={() => window.location.reload()}
                            className="rounded-lg bg-red-600 px-8 py-3 font-bold text-white transition-colors hover:bg-red-700"
                        >
                            Reiniciar Sistema
                        </button>
                    </div>
                </div>
            </body>
        </html>
    );
}
