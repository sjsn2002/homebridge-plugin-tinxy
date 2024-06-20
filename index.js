const axios = require('axios');

module.exports = (api) => {
  api.registerPlatform('HomebridgeTinxyPlatform', HomebridgeTinxyPlatform);
};

class HomebridgeTinxyPlatform {
  constructor(log, config, api) {
    this.log = log;
    this.config = config;
    this.api = api;
    this.accessoriesList = [];
    this.cachedAccessories = new Map();
    this.debug = config.debug || false;

    if (!this.config.apiToken) {
      this.log.error('API Token not provided.');
      return;
    }

    this.api.on('didFinishLaunching', () => {
      this.log('Homebridge Tinxy Platform finished launching');
      this.discoverDevices();
      this.startStatusUpdates();
    });
  }

  configureAccessory(accessory) {
    if (this.debug) this.log(`Configuring cached accessory: ${accessory.displayName}`);
    this.cachedAccessories.set(accessory.UUID, accessory);
  }

  async discoverDevices() {
    try {
      const response = await axios.get(this.config.apiBaseUrl, {
        headers: { 'Authorization': `Bearer ${this.config.apiToken}` }
      });

      const devices = response.data;

      if (this.debug) this.log(`Received devices: ${JSON.stringify(devices)}`);

      devices.forEach(device => {
        const accessory = new TinxyAccessory(this.log, device, this.api, this.config.apiToken, this.cachedAccessories, this.debug);
        const platformAccessories = accessory.getAccessories();
        platformAccessories.forEach(platformAccessory => {
          if (this.cachedAccessories.has(platformAccessory.UUID)) {
            this.api.updatePlatformAccessories([platformAccessory]);
          } else {
            this.accessoriesList.push(platformAccessory);
            this.api.registerPlatformAccessories('homebridge-plugin-tinxy', 'HomebridgeTinxyPlatform', [platformAccessory]);
          }
        });
      });

      if (this.debug) this.log(`Discovered ${devices.length} devices.`);
    } catch (error) {
      this.log('Failed to discover devices:', error);
    }
  }

  accessories(callback) {
    callback(Array.from(this.cachedAccessories.values()));
  }

  startStatusUpdates() {
    setInterval(() => {
      this.cachedAccessories.forEach(accessory => {
        const service = accessory.getService(this.api.hap.Service.Switch);
        if (service) {
          service.getCharacteristic(this.api.hap.Characteristic.On).getValue();
        }
      });
    }, 10000); // 10 seconds
  }
}

class TinxyAccessory {
  constructor(log, deviceConfig, api, apiToken, cachedAccessories, debug) {
    this.log = log;
    this.deviceConfig = deviceConfig;
    this.api = api;
    this.apiToken = apiToken;
    this.name = deviceConfig.name;
    this.accessories = [];
    this.cachedAccessories = cachedAccessories;
    this.debug = debug;

    if (!deviceConfig._id) {
      this.log.error('Device ID is missing:', deviceConfig);
      return;
    }

    if (deviceConfig.devices && deviceConfig.devices.length > 0) {
      deviceConfig.devices.forEach((switchName, index) => {
        const uuid = this.api.hap.uuid.generate(`${deviceConfig._id}-${index}`);
        const switchAccessory = this.cachedAccessories.get(uuid) || new this.api.platformAccessory(`${this.name} - ${switchName}`, uuid);
        const service = switchAccessory.getService(switchName) || switchAccessory.addService(this.api.hap.Service.Switch, switchName);
        service.getCharacteristic(this.api.hap.Characteristic.On)
          .on('set', (value, callback) => this.setOn(value, callback, index))
          .on('get', callback => this.getStatus(callback, index));
        this.accessories.push(switchAccessory);
      });
    } else {
      const uuid = this.api.hap.uuid.generate(deviceConfig._id);
      const singleSwitchAccessory = this.cachedAccessories.get(uuid) || new this.api.platformAccessory(this.name, uuid);
      const service = singleSwitchAccessory.getService(this.name) || singleSwitchAccessory.addService(this.api.hap.Service.Switch, this.name);
      service.getCharacteristic(this.api.hap.Characteristic.On)
        .on('set', (value, callback) => this.setOn(value, callback, 0))
        .on('get', callback => this.getStatus(callback, 0));
      this.accessories.push(singleSwitchAccessory);
    }
  }

  getAccessories() {
    return this.accessories;
  }

  async setOn(value, callback, switchIndex) {
    try {
      await axios.post(`https://backend.tinxy.in/v2/devices/${this.deviceConfig._id}/toggle`, {
        request: { state: value ? 1 : 0 },
        deviceNumber: switchIndex + 1 // Assuming deviceNumber starts at 1, adjust if necessary
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiToken}`
        }
      });
      if (this.debug) this.log(`Set ${this.name} - Switch ${switchIndex + 1} to ${value ? 'on' : 'off'}`);
      callback(null);
    } catch (error) {
      this.log(`Failed to set ${this.name} - Switch ${switchIndex + 1} to ${value ? 'on' : 'off'}: ${error}`);
      callback(error);
    }
  }

  async getStatus(callback, switchIndex) {
    try {
      const response = await axios.get(`https://backend.tinxy.in/v2/devices/${this.deviceConfig._id}/state`, {
        params: { deviceNumber: switchIndex + 1 },
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiToken}`
        }
      });
      const state = response.data.state.toLowerCase() === 'on';
      callback(null, state);
    } catch (error) {
      this.log(`Failed to get status of ${this.name} - Switch ${switchIndex + 1}: ${error}`);
      callback(error);
    }
  }
}
