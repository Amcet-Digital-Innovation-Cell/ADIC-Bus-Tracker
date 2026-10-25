const http = require('http');

const data = JSON.stringify({
  student_id: 'TEST_STUDENT_999',
  student_name: 'Deepak Test',
  email: 'test_deepak999@amcet.edu',
  route_name: 'SOLINGHUR',
  stop_name: 'KODAIKKAL'
});

const req = http.request({
  hostname: 'localhost',
  port: 3001,
  path: '/api/students/register',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('STATUS:', res.statusCode);
    console.log('RESPONSE:', JSON.stringify(JSON.parse(body), null, 2));
  });
});

req.on('error', (e) => {
  console.error('ERROR:', e.message);
});

req.write(data);
req.end();
