
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function getDailyActivity() {
    console.log("Generando Reporte de Actividad del Día (H. Vzla)...");

    // TIMEZONE LOGIC for VENEZUELA (UTC-4)
    // We want "Today" in Venezuela.
    // e.g. If it's 22:00 UTC (18:00 Vzla), we want calls from 04:00 UTC (00:00 Vzla) today.

    const now = new Date();
    // Offset for Venezuela is -4 hours.
    // Create a date object for "Start of Day in Venezuela"
    // 1. Get current time in Vzla
    const vzlaTime = new Date(now.getTime() - 4 * 60 * 60 * 1000);
    // 2. Reset to midnight
    vzlaTime.setUTCHours(0, 0, 0, 0);
    // 3. Convert back to UTC to query database
    const startOfDayUTC = new Date(vzlaTime.getTime() + 4 * 60 * 60 * 1000).toISOString();

    console.log(`Filtro: Actividad desde ${startOfDayUTC} (00:00 Vzla)`);

    const { data: calls, error: callError } = await supabase
        .from('calls')
        .select('*')
        .gte('created_at', startOfDayUTC);

    if (callError) console.error("Call Error:", callError);

    const { data: messages } = await supabase
        .from('messages')
        .select('*')
        .gte('created_at', startOfDayUTC);

    const { data: profiles } = await supabase.from('profiles').select('id, email');
    const profileMap = {};
    profiles?.forEach(p => profileMap[p.id] = p.email);

    // --- METRICS & GROUPING ---
    const quality = {
        completed: 0, failed: 0, busy: 0, noAnswer: 0,
        shortCalls: 0, totalDuration: 0, countForAvg: 0
    };
    const agentStats = {};

    if (calls) {
        calls.forEach(c => {
            // Status
            if (c.status === 'completed') quality.completed++;
            else if (c.status === 'failed') quality.failed++;
            else if (c.status === 'busy') quality.busy++;
            else if (c.status === 'no-answer') quality.noAnswer++;

            // Duration
            if (c.duration) {
                quality.totalDuration += c.duration;
                quality.countForAvg++;
                if (c.duration < 10) quality.shortCalls++;
            }

            // Agent mapping
            let agentName = 'Sistema/Desconocido';
            if (c.user_id && profileMap[c.user_id]) {
                const parts = profileMap[c.user_id].split('@');
                agentName = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
            }

            if (!agentStats[agentName]) agentStats[agentName] = {
                calls: 0, completed: 0, totalDur: 0,
                recent: [] // Store recent calls for "The Loop"
            };

            agentStats[agentName].calls++;
            if (c.status === 'completed') {
                agentStats[agentName].completed++;
                if (c.duration) agentStats[agentName].totalDur += c.duration;
            }

            // Add to recent list
            agentStats[agentName].recent.push(c);
        });
    }

    const avgDuration = quality.countForAvg > 0 ? Math.round(quality.totalDuration / quality.countForAvg) : 0;
    const successRate = calls?.length > 0 ? Math.round((quality.completed / calls.length) * 100) : 0;

    // --- OUTPUT ---
    console.log(`\n=== REPORTE GENERAL (${startOfDayUTC.split('T')[0]}) ===`);
    console.log(`Llamadas: ${calls?.length || 0}  |  Mensajes: ${messages?.length || 0}`);
    console.log(`Tasa de Éxito: ${successRate}%`);
    console.log(`Duración Promedio: ${Math.floor(avgDuration / 60)}m ${avgDuration % 60}s`);

    console.log("\n--- DETALLE POR AGENTE (La Lupa 🔍) ---");

    // Sort agents by total calls
    const sortedAgents = Object.entries(agentStats).sort((a, b) => b[1].calls - a[1].calls);

    sortedAgents.forEach(([name, data]) => {
        const avg = data.completed > 0 ? Math.round(data.totalDur / data.completed) + 's' : '0s';

        console.log(`\n👤 ${name.toUpperCase()} (Total: ${data.calls} | Prom: ${avg})`);
        console.log("   Últimas 5 llamadas:");

        // Sort recent desc
        data.recent.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        data.recent.slice(0, 5).forEach(c => {
            // VZLA Time for display
            const date = new Date(c.created_at);
            const vzlaTime = new Date(date.getTime() - 4 * 60 * 60 * 1000).toISOString().substring(11, 19);

            let statusIcon = c.status === 'completed' ? '✅' : '❌';
            if (c.status === 'no-answer') statusIcon = '📞';
            if (c.status === 'busy') statusIcon = 'busy';

            console.log(`   ${vzlaTime} | ${statusIcon} ${c.status.padEnd(10)} | ${c.duration || 0}s | ${c.to}`);
        });
    });

}

getDailyActivity();
