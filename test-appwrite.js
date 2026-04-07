import { Client } from 'appwrite';

const client = new Client();

client
    .setEndpoint('https://cloud.appwrite.io/v1') // Replace with your Appwrite endpoint
    .setProject(''); // Replace with your project ID

// Ping the server using health check
fetch('https://cloud.appwrite.io/v1/health')
    .then(response => {
        if (response.ok) {
            console.log('Appwrite server is reachable. Status:', response.status);
            return response.json();
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
    })
    .then(data => {
        console.log('Health check response:', data);
    })
    .catch(error => {
        console.error('Failed to ping Appwrite server:', error.message);
    });