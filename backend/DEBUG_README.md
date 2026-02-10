
# Herramienta de Diagnóstico: debug_activity.js

Este script te permite ver la actividad de llamadas y mensajes de Hoy (Tiempo Real).

### ¿Cómo usarlo?

1. Abre una terminal en tu computadora.
2. Navega a la carpeta del backend:

   ```bash
   cd gibbor-voice/backend
   ```

3. Ejecuta el script:

   ```bash
   node debug_activity.js
   ```

### ¿Qué información te da?

- **Reporte General:** Total de llamadas y mensajes del día.
- **Calidad de Conexión:** Tasa de éxito, fallos de red y duración promedio.
- **Rendimiento por Agente:** Ranking de quién hace más llamadas y cuánto duran.
- **Análisis de Fallos:** Si hay una caída del sistema, te mostrará los minutos exactos donde fallaron las llamadas.
- **Detalle de Yaiher:** Imprime las últimas llamadas específicas de Yaiher para ver si se le caen.

---

**Nota:** Este script se conecta directamente a tu base de datos de producción (Supabase), por lo que siempre verás datos reales y actualizados.
