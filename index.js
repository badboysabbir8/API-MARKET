const express = require('express');
const app = express();
const port = 3000;
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Additional required libraries
const os = require('os');

// Initialize API endpoints from JSON file
const apiDataFile = 'apiEndpoints.json';
let apiEndpoints = [];

function readApiEndpointsFromFile() {
  fs.readFile(apiDataFile, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        console.error('File not found. Creating a new file...');
        saveApiEndpointsToFile();
      } else {
        console.error(err);
      }
      return;
    }
    try {
      apiEndpoints = JSON.parse(data.toString());
    } catch(e) {
      console.error('Error parsing JSON from file:', e);
    }
  });
}

function saveApiEndpointsToFile() {
  fs.writeFile(apiDataFile, JSON.stringify(apiEndpoints, null, 2), (err) => {
    if (err) return console.error('Error writing to file:', err);
    console.log('API data saved to file successfully.');
  });
}

readApiEndpointsFromFile();

function isValidHttpUrl(string) {
  let url;

  try {
    url = new URL(string);
  } catch (_) {
    return false;  
  }

  return url.protocol === "http:" || url.protocol === "https:";
}

function containsNonsense(text) {
  const nonsensePatterns = [/lorem ipsum/i, /foo pornhub/i, /test/i];
  return nonsensePatterns.some(pattern => pattern.test(text));
}

const banIpAddresses = new Set();

const uploadCooldownLimiter = rateLimit({
  windowMs: 30 * 1000, // Cooldown of 30 seconds
  max: 1, // limit each IP to 1 request per windowMs
  onLimitReached: (req, res) => {
    console.log(`Upload cooldown triggered for IP: ${req.ip}`);
  },
  handler: (req, res) => {
    console.log(`Upload attempt during cooldown by IP: ${req.ip}`);
    res.status(429).send('Upload cooldown in effect. Please wait 30 seconds before trying again.');
  },
  keyGenerator: (req) => {
    return req.ip;
  }
});

// Middleware to check if the IP is banned
const checkBanMiddleware = (req, res, next) => {
  if (banIpAddresses.has(req.ip)) {
    console.log(`Blocked request from banned IP: ${req.ip}`);
    return res.status(403).send('Your IP is banned.');
  }
  next();
};

app.use('/api/add', checkBanMiddleware, uploadCooldownLimiter);

app.post('/api/add', (req, res) => {
  const { name, description, link, ApiOwner } = req.body;

  if (!name || !description || !link || !ApiOwner) {
    return res.status(400).send({ error: 'All fields are required' });
  }

  if (!isValidHttpUrl(link) || containsNonsense(name) || containsNonsense(description)) {
    return res.status(400).send({ error: 'Invalid data provided' });
  }

  const ip = req.ip;
  const newApi = { name, description, link, ApiOwner, ip };
  apiEndpoints.push(newApi);
  saveApiEndpointsToFile();
  console.log(`Uploaded the endpoint '${link}' with IP address: ${ip}`);
  res.status(201).send({ message: 'New API endpoint added', newApi });
});

app.get('/market', (req, res) => {
  const searchQuery = req.query.search || '';
  const searchResults = apiEndpoints
    .filter(api =>
      api.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      api.description.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .map(api => ({
      name: api.name,
      link: api.link,
      description: api.description,
      ApiOwner: api.ApiOwner
    }));
  res.send(searchResults);
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});