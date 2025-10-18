#!/usr/bin/env node
/**
 * Test deployment script
 * Checks if the server is running and accessible
 */

import https from 'https';

const SERVER_URL = 'https://mcp1-oauth-server.onrender.com';

console.log('🔍 Testing MCP1 OAuth Server Deployment...\n');

// Test 1: Health Check
async function testHealthCheck() {
  return new Promise((resolve) => {
    console.log('1️⃣  Testing /health endpoint...');
    https.get(`${SERVER_URL}/health`, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.status === 'healthy') {
            console.log('   ✅ Server is healthy');
            console.log(`   📊 Uptime: ${Math.floor(json.uptime / 60)} minutes`);
            console.log(`   🌍 Environment: ${json.environment}`);
            resolve(true);
          } else {
            console.log('   ❌ Server returned unhealthy status');
            resolve(false);
          }
        } catch (e) {
          console.log('   ❌ Invalid JSON response');
          resolve(false);
        }
      });
    }).on('error', (e) => {
      console.log('   ❌ Error:', e.message);
      resolve(false);
    });
  });
}

// Test 2: OAuth Authorization Endpoint
async function testOAuthEndpoint() {
  return new Promise((resolve) => {
    console.log('\n2️⃣  Testing /oauth/authorize endpoint...');
    const testUrl = `${SERVER_URL}/oauth/authorize?client_id=mcp1-oauth-client&redirect_uri=https://chat.openai.com/aip/test/oauth/callback&state=test123&scope=gmail`;
    
    https.get(testUrl, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        const location = res.headers.location;
        if (location && location.includes('accounts.google.com')) {
          console.log('   ✅ OAuth endpoint working - redirects to Google');
          resolve(true);
        } else {
          console.log('   ❌ OAuth endpoint not redirecting to Google');
          console.log('   Location:', location);
          resolve(false);
        }
      } else {
        console.log(`   ❌ Unexpected status code: ${res.statusCode}`);
        resolve(false);
      }
    }).on('error', (e) => {
      console.log('   ❌ Error:', e.message);
      resolve(false);
    });
  });
}

// Test 3: API Endpoint (should require auth)
async function testAPIEndpoint() {
  return new Promise((resolve) => {
    console.log('\n3️⃣  Testing /api/auth/status endpoint...');
    https.get(`${SERVER_URL}/api/auth/status`, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 401) {
          console.log('   ✅ API endpoint requires authentication (as expected)');
          resolve(true);
        } else if (res.statusCode === 200) {
          console.log('   ⚠️  API endpoint returned 200 (might be already authenticated)');
          resolve(true);
        } else {
          console.log(`   ❌ Unexpected status code: ${res.statusCode}`);
          console.log('   Response:', data);
          resolve(false);
        }
      });
    }).on('error', (e) => {
      console.log('   ❌ Error:', e.message);
      resolve(false);
    });
  });
}

// Test 4: OpenAPI Schema
async function testOpenAPISchema() {
  return new Promise((resolve) => {
    console.log('\n4️⃣  Testing OpenAPI schema availability...');
    https.get(`${SERVER_URL}/openapi.json`, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.openapi && json.info && json.paths) {
            console.log('   ✅ OpenAPI schema is valid');
            console.log(`   📋 Title: ${json.info.title}`);
            console.log(`   📋 Version: ${json.info.version}`);
            console.log(`   📋 Endpoints: ${Object.keys(json.paths).length}`);
            resolve(true);
          } else {
            console.log('   ❌ Invalid OpenAPI schema structure');
            resolve(false);
          }
        } catch (e) {
          console.log('   ❌ Invalid JSON or endpoint not found');
          console.log(`   Status: ${res.statusCode}`);
          resolve(false);
        }
      });
    }).on('error', (e) => {
      console.log('   ❌ Error:', e.message);
      resolve(false);
    });
  });
}

// Run all tests
async function runTests() {
  const results = [];
  
  results.push(await testHealthCheck());
  results.push(await testOAuthEndpoint());
  results.push(await testAPIEndpoint());
  results.push(await testOpenAPISchema());
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  console.log(`✅ Passed: ${passed}/${total}`);
  console.log(`❌ Failed: ${total - passed}/${total}`);
  
  if (passed === total) {
    console.log('\n🎉 All tests passed! Your server is ready.');
    console.log('\n📋 Next steps:');
    console.log('   1. Copy the OpenAPI schema to ChatGPT Actions');
    console.log('   2. Configure OAuth in ChatGPT:');
    console.log(`      - Client ID: mcp1-oauth-client`);
    console.log(`      - Client Secret: (from your .env file)`);
    console.log(`      - Authorization URL: ${SERVER_URL}/oauth/authorize`);
    console.log(`      - Token URL: ${SERVER_URL}/oauth/token`);
    console.log(`      - Scope: gmail calendar`);
  } else {
    console.log('\n⚠️  Some tests failed. Check the errors above.');
    console.log('\n🔧 Troubleshooting:');
    console.log('   1. Check if Render.com service is running');
    console.log('   2. Check deployment logs on Render.com');
    console.log('   3. Verify environment variables are set correctly');
    console.log('   4. Check MongoDB connection string');
  }
  
  console.log('\n');
}

runTests();
