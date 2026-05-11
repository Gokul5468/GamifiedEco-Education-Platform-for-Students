import http from 'http';

const storyId = '615198af-fb96-44a4-a5e3-c5dac776a574';
const data = JSON.stringify({ story_id: storyId });

const options = {
  hostname: 'localhost',
  port: 4000,
  path: '/api/stories/respect',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log('STATUS:', res.statusCode);
    console.log('BODY:', body);
  });
});

req.on('error', (e) => console.error('ERROR:', e.message));
req.write(data);
req.end();
