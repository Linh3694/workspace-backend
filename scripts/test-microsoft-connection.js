require('dotenv').config();
const { Client } = require('@microsoft/microsoft-graph-client');
const { ClientSecretCredential } = require('@azure/identity');

async function testMicrosoftConnection() {
  console.log('🔍 Testing Microsoft Graph API connection...');
  
  // Kiểm tra environment variables
  console.log('\n📋 Environment Variables:');
  console.log('TENANT_ID:', process.env.MICROSOFT_TENANT_ID ? '✅ Set' : '❌ Missing');
  console.log('CLIENT_ID:', process.env.MICROSOFT_CLIENT_ID ? '✅ Set' : '❌ Missing');
  console.log('CLIENT_SECRET:', process.env.MICROSOFT_CLIENT_SECRET ? '✅ Set' : '❌ Missing');
  
  if (!process.env.MICROSOFT_TENANT_ID || !process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_CLIENT_SECRET) {
    console.error('\n❌ Missing required environment variables!');
    return;
  }
  
  try {
    console.log('\n🔐 Initializing credentials...');
    const credential = new ClientSecretCredential(
      process.env.MICROSOFT_TENANT_ID,
      process.env.MICROSOFT_CLIENT_ID,
      process.env.MICROSOFT_CLIENT_SECRET
    );
    
    console.log('✅ Credentials initialized');
    
    console.log('\n🔑 Getting access token...');
    const token = await credential.getToken('https://graph.microsoft.com/.default');
    console.log('✅ Access token obtained');
    console.log('Token expires:', new Date(token.expiresOnTimestamp).toLocaleString());
    
    console.log('\n🌐 Initializing Graph client...');
    const graphClient = Client.initWithMiddleware({
      authProvider: {
        getAccessToken: async () => token.token
      }
    });
    
    console.log('✅ Graph client initialized');
    
    console.log('\n👥 Testing user list API...');
    const users = await graphClient.api('/users')
      .select('id,displayName,userPrincipalName,mail')
      .top(5)
      .get();
    
    console.log('✅ Successfully fetched users!');
    console.log(`Found ${users.value.length} users (showing first 5):`);
    
    users.value.forEach((user, index) => {
      console.log(`${index + 1}. ${user.displayName} (${user.userPrincipalName})`);
    });
    
    console.log('\n🎉 All tests passed! Microsoft Graph API is working correctly.');
    
  } catch (error) {
    console.error('\n❌ Error testing Microsoft connection:', error.message);
    
    if (error.message.includes('Insufficient privileges')) {
      console.log('\n💡 Solution:');
      console.log('1. Go to Azure Portal > App registrations');
      console.log('2. Select your app > API permissions');
      console.log('3. Add permissions: User.Read.All, Directory.Read.All');
      console.log('4. Click "Grant admin consent"');
    } else if (error.message.includes('unauthorized')) {
      console.log('\n💡 Solution:');
      console.log('1. Check your CLIENT_SECRET is correct and not expired');
      console.log('2. Verify TENANT_ID and CLIENT_ID are correct');
    }
  }
}

// Chạy test
testMicrosoftConnection(); 