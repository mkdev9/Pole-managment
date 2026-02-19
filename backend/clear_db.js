const { db } = require('./config/firebase');

async function clearDatabase() {
    if (!db) {
        console.error('❌ Firebase not initialized. Cannot clear database.');
        process.exit(1);
    }

    console.log('🗑️  Clearing Firebase database for fresh start...');

    try {
        // 1. Clear detailed pole sensor logs
        await db.ref('poles').remove();
        console.log('   ✅ Cleared /poles (sensor history)');

        // 2. Clear coordination system state
        await db.ref('coordination').remove();
        console.log('   ✅ Cleared /coordination (system state)');

        console.log('✨ Database wipe complete! Ready for real implementation.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error clearing database:', error);
        process.exit(1);
    }
}

clearDatabase();
