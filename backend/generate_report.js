
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

/**
 * Parses a date string in DD/MM/YYYY format and returns Start and End UTC strings for that day in Vzla (UTC-4)
 */
function getVzlaDateRange(dateStr) {
    let targetDate;

    if (dateStr) {
        // Parse DD/MM/YYYY
        const parts = dateStr.split('/');
        if (parts.length === 3) {
            // JS Months are 0-indexed
            targetDate = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        } else {
            console.error("❌ Formato de fecha inválido. Use DD/MM/YYYY (ej: 09/02/2026)");
            process.exit(1);
        }
    } else {
        targetDate = new Date();
    }

    // Adjust for Venezuela (UTC-4)
    // 1. Set to midnight in local context (but we treat it as Vzla midnight)
    targetDate.setHours(0, 0, 0, 0);

    // 2. Conver to UTC. 
    // If it's 00:00 in Vzla, it's 04:00 in UTC.
    const startOfDayUTC = new Date(targetDate.getTime() + 4 * 60 * 60 * 1000);
    const endOfDayUTC = new Date(startOfDayUTC.getTime() + 24 * 60 * 60 * 1000 - 1);

    return {
        start: startOfDayUTC.toISOString(),
        end: endOfDayUTC.toISOString(),
        display: dateStr || targetDate.toLocaleDateString('es-VE')
    };
}

async function generateReport() {
    const inputDate = process.argv[2];
    const range = getVzlaDateRange(inputDate);

    console.log(`\n==========================================`);
    console.log(`📊 REPORTE DE ACTIVIDAD ALTA-VOZ`);
    console.log(`📅 Fecha: ${range.display}`);
    console.log(`⏳ Rango (UTC): ${range.start.split('T')[1].substring(0, 5)} a ${range.end.split('T')[1].substring(0, 5)}`);
    console.log(`==========================================\n`);

    // Fetch Data
    const { data: calls, error: callError } = await supabase
        .from('calls')
        .select('*')
        .gte('created_at', range.start)
        .lte('created_at', range.end);

    if (callError) {
        console.error("❌ Error al obtener llamadas:", callError.message);
        return;
    }

    const { data: messages } = await supabase
        .from('messages')
        .select('*')
        .gte('created_at', range.start)
        .lte('created_at', range.end);

    const { data: profiles } = await supabase.from('profiles').select('id, email, full_name');
    const profileMap = {};
    profiles?.forEach(p => profileMap[p.id] = p.full_name || p.email.split('@')[0]);

    // Metrics
    const stats = {
        total: calls?.length || 0,
        completed: 0,
        busy: 0,
        noAnswer: 0,
        failed: 0,
        totalDuration: 0,
        countWithDuration: 0
    };

    const agentStats = {};

    calls?.forEach(c => {
        // Global status
        if (c.status === 'completed') stats.completed++;
        else if (c.status === 'busy') stats.busy++;
        else if (c.status === 'no-answer') stats.noAnswer++;
        else stats.failed++;

        // Duration
        if (c.duration) {
            stats.totalDuration += c.duration;
            stats.countWithDuration++;
        }

        // Agent stats
        const agentName = profileMap[c.user_id] || 'Desconocido';
        if (!agentStats[agentName]) {
            agentStats[agentName] = { calls: 0, completed: 0, duration: 0 };
        }
        agentStats[agentName].calls++;
        if (c.status === 'completed') {
            agentStats[agentName].completed++;
            agentStats[agentName].duration += (c.duration || 0);
        }
    });

    // Output General
    const successRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
    const avgDuration = stats.countWithDuration > 0 ? Math.round(stats.totalDuration / stats.countWithDuration) : 0;

    console.log(`📈 RESUMEN GENERAL`);
    console.log(`------------------------------------------`);
    console.log(`📞 Total Llamadas:   ${stats.total}`);
    console.log(`✅ Completadas:      ${stats.completed} (${successRate}%)`);
    console.log(`⏳ Duración Prom:    ${Math.floor(avgDuration / 60)}m ${avgDuration % 60}s`);
    console.log(`💬 Mensajes:         ${messages?.length || 0}`);
    console.log(`------------------------------------------\n`);

    console.log(`👤 ACTIVIDAD POR AGENTE`);
    console.log(`------------------------------------------`);

    const sortedAgents = Object.entries(agentStats).sort((a, b) => b[1].calls - a[1].calls);

    if (sortedAgents.length === 0) {
        console.log("   No hay actividad registrada para esta fecha.");
    }

    sortedAgents.forEach(([name, data]) => {
        const agentAvg = data.completed > 0 ? Math.round(data.duration / data.completed) : 0;
        const agentSuccess = Math.round((data.completed / data.calls) * 100);

        console.log(`👉 ${name.padEnd(15)} | ${data.calls.toString().padEnd(3)} llamadas | ${agentSuccess}% éxito | Prom: ${agentAvg}s`);
    });

    console.log(`\n==========================================`);
}

generateReport();
