// Copyright Epic Games, Inc. All Rights Reserved.
const fs = require('fs');

/**
 * Initialize configuration by merging default config with config file
 * @param {string} configFile - Path to config file
 * @param {object} defaultConfig - Default configuration object
 * @returns {object} Merged configuration
 */
function init(configFile, defaultConfig) {
    let config = { ...defaultConfig };
    
    try {
        if (fs.existsSync(configFile)) {
            const fileConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'));
            config = { ...config, ...fileConfig };
        } else {
            console.log(`Config file ${configFile} not found, using default configuration`);
        }
    } catch (error) {
        console.error(`Error reading config file ${configFile}:`, error.message);
        console.log('Using default configuration');
    }
    
    return config;
}

module.exports = {
    init
};