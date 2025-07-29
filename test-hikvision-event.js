#!/usr/bin/env node

/**
 * Test script để simulate Hikvision Event Notifications
 * Chạy: node test-hikvision-event.js [employeeCode] [similarity]
 */

const axios = require('axios');

// Cấu hình
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const ENDPOINT = '/api/attendance/hikvision-event';

// Lấy parameters từ command line
const employeeCode = process.argv[2] || '123456';
const similarity = parseInt(process.argv[3]) || Math.floor(Math.random() * 20) + 80; // 80-99
const employeeName = process.argv[4] || `Employee ${employeeCode}`;

// Tạo sample Hikvision event data
const createSampleEvent = (empCode, empName, sim) => {
    const now = new Date().toISOString();
    const deviceIP = "192.168.1.100";
    
    return {
        ipAddress: deviceIP,
        portNo: 80,
        protocol: "HTTP",
        macAddress: "00:12:34:56:78:90",
        channelID: 1,
        dateTime: now,
        activePostCount: 1,
        eventType: "faceSnapMatch",
        eventState: "active",
        EventNotificationAlert: {
            eventType: "faceSnapMatch",
            eventState: "active",
            eventDescription: "Face match successful",
            dateTime: now,
            ActivePost: [{
                channelID: 1,
                ipAddress: deviceIP,
                portNo: 80,
                protocol: "HTTP",
                macAddress: "00:12:34:56:78:90",
                dynChannelID: 1,
                UniversalUniqueID: `550e8400-e29b-41d4-a716-${Date.now()}`,
                faceLibType: "blackFD",
                FDID: "1",
                FPID: empCode,
                name: empName,
                type: "faceMatch",
                similarity: sim,
                templateID: `template_${empCode}`,
                dateTime: now
            }]
        }
    };
};

// Test function
async function testHikvisionEvent() {
    try {
        console.log('🚀 Testing Hikvision Event Notification...');
        console.log(`📍 Server: ${SERVER_URL}${ENDPOINT}`);
        console.log(`👤 Employee Code: ${employeeCode}`);
        console.log(`📛 Employee Name: ${employeeName}`);
        console.log(`📊 Similarity: ${similarity}%`);
        console.log('─'.repeat(50));

        const eventData = createSampleEvent(employeeCode, employeeName, similarity);
        
        console.log('📤 Sending event data:');
        console.log(JSON.stringify(eventData, null, 2));
        console.log('─'.repeat(50));

        const response = await axios.post(`${SERVER_URL}${ENDPOINT}`, eventData, {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Hikvision-Device/1.0'
            },
            timeout: 10000 // 10 seconds timeout
        });

        console.log('✅ Response received:');
        console.log(`Status: ${response.status} ${response.statusText}`);
        console.log('Data:', JSON.stringify(response.data, null, 2));
        
        if (response.data.status === 'success') {
            console.log('🎉 Event processed successfully!');
            console.log(`📊 Records processed: ${response.data.recordsProcessed}`);
            if (response.data.totalErrors > 0) {
                console.log(`⚠️  Errors: ${response.data.totalErrors}`);
            }
        } else {
            console.log('❌ Event processing failed');
        }

    } catch (error) {
        console.error('❌ Test failed:');
        
        if (error.response) {
            // Server responded with error
            console.error(`Status: ${error.response.status} ${error.response.statusText}`);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        } else if (error.request) {
            // Request was made but no response
            console.error('No response received from server');
            console.error('Check if server is running and accessible');
        } else {
            // Something else happened
            console.error('Error:', error.message);
        }
        
        process.exit(1);
    }
}

// Test multiple events
async function testMultipleEvents(count = 3) {
    console.log(`🔄 Testing ${count} sequential events...`);
    
    for (let i = 1; i <= count; i++) {
        const testEmpCode = `${employeeCode}${i.toString().padStart(2, '0')}`;
        const testEmpName = `${employeeName} ${i}`;
        const testSimilarity = Math.floor(Math.random() * 20) + 80;
        
        console.log(`\n📨 Event ${i}/${count}:`);
        
        try {
            const eventData = createSampleEvent(testEmpCode, testEmpName, testSimilarity);
            const response = await axios.post(`${SERVER_URL}${ENDPOINT}`, eventData, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 5000
            });
            
            console.log(`✅ Success - Employee: ${testEmpCode}, Similarity: ${testSimilarity}%`);
            
            // Delay between events
            await new Promise(resolve => setTimeout(resolve, 1000));
            
        } catch (error) {
            console.error(`❌ Failed for employee ${testEmpCode}:`, error.message);
        }
    }
}

// Show help
function showHelp() {
    console.log(`
Usage: node test-hikvision-event.js [employeeCode] [similarity] [employeeName]

Examples:
  node test-hikvision-event.js                    # Random data
  node test-hikvision-event.js 123456             # Specific employee code
  node test-hikvision-event.js 123456 95          # With similarity
  node test-hikvision-event.js 123456 95 "John"   # With name
  node test-hikvision-event.js --multiple 5       # Test 5 events
  node test-hikvision-event.js --help             # Show this help

Environment Variables:
  SERVER_URL    Server URL (default: http://localhost:3000)
`);
    process.exit(0);
}

// Main execution
async function main() {
    const args = process.argv.slice(2);
    
    if (args.includes('--help') || args.includes('-h')) {
        showHelp();
    }
    
    if (args.includes('--multiple')) {
        const countIndex = args.indexOf('--multiple') + 1;
        const count = parseInt(args[countIndex]) || 3;
        await testMultipleEvents(count);
    } else {
        await testHikvisionEvent();
    }
}

// Run the test
if (require.main === module) {
    main().catch(console.error);
} 