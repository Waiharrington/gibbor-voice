// Native fetch (Node 18+)
async function checkActivity() {
    try {
        const interactionsUrl = 'https://gibbor-voice-production.up.railway.app/history/messages?role=admin';

        console.log('Fetching all message history (Admin) from:', interactionsUrl);
        const response = await fetch(interactionsUrl);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
            console.error('Data is not an array:', data);
            return;
        }

        const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
        console.log('Checking activity since:', threeHoursAgo.toLocaleString());

        // Sort by time just in case
        data.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

        const recentMessages = data.filter(msg => new Date(msg.created_at) > threeHoursAgo);

        console.log('\n--- Activity Report (Last 3 Hours) ---');
        console.log(`Total Messages: ${recentMessages.length}`);

        const inbound = recentMessages.filter(m => m.direction === 'inbound').length;
        const outbound = recentMessages.filter(m => m.direction === 'outbound').length;

        console.log(`Inbound (User -> System): ${inbound}`);
        console.log(`Outbound (System -> User): ${outbound}`);

        if (recentMessages.length > 0) {
            console.log('\nLast message time:', new Date(recentMessages[recentMessages.length - 1].created_at).toLocaleString());
        }

    } catch (error) {
        console.error('Error fetching activity:', error);
    }
}

checkActivity();
